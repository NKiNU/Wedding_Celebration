package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
)

// Port of createWish and createMediaPost in src/server/posts.ts.

// CreatedPost is POST /api/posts.
type CreatedPost struct {
	ID string `json:"id"`
}

// CreateWish posts a wish through the locked database function that also spends the hourly allowance.
func (a *App) CreateWish(ctx context.Context, guest Guest, wishText string) (CreatedPost, error) {
	event, err := a.Event(ctx)
	if err != nil {
		return CreatedPost{}, err
	}
	if err := assertUploadsOpen(event); err != nil {
		return CreatedPost{}, err
	}
	var id string
	err = a.DB.QueryRow(ctx, "select public.create_wish($1, $2, $3, $4, $5, $6)",
		append([]any{guest.EventID, guest.ID, wishText}, limitArgs()...)...).Scan(&id)
	if pgCode(err) == "PT429" {
		return CreatedPost{}, rateLimited()
	}
	if err != nil {
		return CreatedPost{}, fmt.Errorf("Creating the wish failed: %w", err)
	}
	return CreatedPost{ID: id}, nil
}

func baseType(mime string) string { return domain.JSLower(domain.JSTrim(strings.Split(mime, ";")[0])) }

func uploadIncomplete() error {
	return &httpx.AppError{Code: "upload_incomplete", Status: http.StatusBadRequest, Message: "Some files didn’t finish uploading. Please try again."}
}

func invalidMedia() error {
	return &httpx.AppError{Code: "invalid_media", Status: http.StatusBadRequest, Message: "Those files can’t be posted together."}
}

// assertUploaded: every file the intent declared must be in R2 with exactly the declared size and
// type, no header overrides, and the first bytes of what that type is (so a "JPEG" is a JPEG).
func (a *App) assertUploaded(ctx context.Context, files []domain.StoredFile) error {
	complete := make([]bool, len(files))
	g, gctx := errgroup.WithContext(ctx)
	for i, f := range files {
		g.Go(func() error {
			object, err := a.R2.Head(gctx, f.Key)
			if err != nil || object == nil || object.Overridden || object.Bytes != f.Bytes || baseType(object.Mime) != f.Mime {
				return err
			}
			start, found, err := a.R2.Peek(gctx, f.Key)
			complete[i] = found && domain.LooksLike(f.Mime, start)
			return err
		})
	}
	if err := g.Wait(); err != nil {
		return err
	}
	if slices.Contains(complete, false) {
		return uploadIncomplete()
	}
	return nil
}

// media is one post_media row as create_post_from_intent reads it, in the TypeScript's key order.
type media struct {
	Position   int      `json:"position"`
	Kind       string   `json:"kind"`
	Path       string   `json:"path"`
	ThumbPath  *string  `json:"thumb_path"`
	PosterPath *string  `json:"poster_path"`
	Width      *int     `json:"width"`
	Height     *int     `json:"height"`
	DurationS  *float64 `json:"duration_s"`
	Bytes      int64    `json:"bytes"`
	Mime       string   `json:"mime"`
}

// toMedia is one post_media row per main file, with the thumb or poster that belongs to its position.
func toMedia(files []domain.StoredFile) []media {
	keyOf := func(role string, position int) *string {
		i := slices.IndexFunc(files, func(f domain.StoredFile) bool { return f.Role == role && f.Position == position })
		if i < 0 {
			return nil
		}
		return &files[i].Key
	}
	var out []media
	for _, f := range files {
		if f.Role != "main" {
			continue
		}
		kind := "image"
		if strings.HasPrefix(f.Mime, "video/") {
			kind = "video"
		}
		out = append(out, media{
			Position: f.Position, Kind: kind, Path: f.Key, ThumbPath: keyOf("thumb", f.Position), PosterPath: keyOf("poster", f.Position),
			Width: f.Width, Height: f.Height, DurationS: f.DurationS, Bytes: f.Bytes, Mime: f.Mime,
		})
	}
	slices.SortStableFunc(out, func(x, y media) int { return x.Position - y.Position })
	return out
}

// expire: expired or cancelled, so free the objects now; the row stays (it still counts) for the sweep.
func (a *App) expire(ctx context.Context, files []domain.StoredFile) error {
	if err := a.R2.DeleteMany(context.WithoutCancel(ctx), keysOf(files)); err != nil {
		return err
	}
	return &httpx.AppError{Code: "intent_expired", Status: http.StatusGone, Message: "That took too long. Please choose your files again."}
}

// CreateMediaPost turns an upload intent into a post. The type comes from the verified files of
// the intent, never from the request, and a repeated submit (lost response, double tap) returns the same post.
func (a *App) CreateMediaPost(ctx context.Context, guest Guest, postID string, caption *string) (CreatedPost, error) {
	var raw []byte
	var consumed, cancelled *time.Time
	var expires time.Time
	err := a.DB.QueryRow(ctx, "select files, consumed_at, cancelled_at, expires_at from public.upload_intents where post_id = $1 and guest_id = $2",
		postID, guest.ID).Scan(&raw, &consumed, &cancelled, &expires)
	if isNoRows(err) {
		return CreatedPost{}, intentNotFound()
	}
	if err != nil {
		return CreatedPost{}, fmt.Errorf("Loading the upload intent failed: %w", err)
	}
	if consumed != nil {
		return CreatedPost{ID: postID}, nil
	}

	event, err := a.Event(ctx)
	if err != nil {
		return CreatedPost{}, err
	}
	if err := assertUploadsOpen(event); err != nil {
		return CreatedPost{}, err
	}
	files, err := storedFilesOf(raw)
	if err != nil {
		return CreatedPost{}, err
	}
	// A cancelled or expired intent can never become a post (the database says so too, below).
	if cancelled != nil || !expires.After(time.Now()) {
		return CreatedPost{}, a.expire(ctx, files)
	}
	if err := a.assertUploaded(ctx, files); err != nil {
		return CreatedPost{}, err
	}
	rows := toMedia(files)
	mimes := make([]string, len(rows))
	for i, m := range rows {
		mimes[i] = m.Mime
	}
	postType := domain.DerivePostType(mimes)
	if postType == "" {
		return CreatedPost{}, invalidMedia()
	}
	mediaJSON, err := json.Marshal(rows)
	if err != nil {
		return CreatedPost{}, err
	}

	_, err = a.DB.Exec(ctx, "select public.create_post_from_intent($1, $2, $3::public.post_type, $4, $5::jsonb)",
		postID, guest.ID, postType, caption, string(mediaJSON))
	// The function raises PTxxx codes (migration 0001).
	switch pgCode(err) {
	case "":
		if err == nil {
			return CreatedPost{ID: postID}, nil
		}
	case "PT409":
		return CreatedPost{ID: postID}, nil // a concurrent submit won; the post exists
	case "PT404":
		return CreatedPost{}, intentNotFound()
	case "PT410":
		return CreatedPost{}, a.expire(ctx, files)
	case "PT400":
		slog.Error("create_post_from_intent rejected media", "postId", postID, "err", err)
		return CreatedPost{}, invalidMedia()
	}
	// The objects stay: the failure may be transient, the client cancels, and the sweep is the backstop.
	return CreatedPost{}, fmt.Errorf("Creating the post failed: %w", err)
}
