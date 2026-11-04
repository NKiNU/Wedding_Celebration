package server

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/validation"
)

// Port of src/server/uploads.ts (docs/adr/003-upload-intents.md).

// assertUploadsOpen: every write path refuses while the admin has closed uploads.
func assertUploadsOpen(e *Event) error {
	if !e.UploadsOpen {
		return &httpx.AppError{Code: "uploads_closed", Status: http.StatusForbidden, Message: "Sharing is closed for now. Thank you for being part of today!"}
	}
	return nil
}

// limitArgs is the hourly allowance (p_since, p_max_posts, p_max_bytes), enforced by the database
// function that also spends it (migration 0002): check and insert share one transaction under a
// per-guest lock, so parallel requests cannot all see an empty allowance. Intents count while
// unexpired (TTL = window), posted or cancelled or not, so uploads in flight count and neither a
// cancel nor a delete frees quota.
// ponytail: per guest, not per phone; Phase 6 caps how many guests one phone can create.
func limitArgs() []any {
	return []any{time.Now().Add(-domain.RateWindow), domain.PostsPerHour, int64(domain.BytesPerHour)}
}

func rateLimited() error {
	return &httpx.AppError{Code: "rate_limited", Status: http.StatusTooManyRequests, Message: "You’ve shared a lot in the last hour. Please try again a little later."}
}

// storedFilesOf is the `files` of an intent row. A malformed row is our bug, so it is a 500, not a guest's 400.
func storedFilesOf(raw []byte) ([]domain.StoredFile, error) {
	files, err := validation.StoredFiles(raw)
	if err != nil {
		return nil, errors.New("Stored upload files are malformed")
	}
	return files, nil
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b) // never fails (crypto/rand)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// Upload is one presigned PUT of an intent.
type Upload struct {
	Role     string `json:"role"`
	Position int    `json:"position"`
	URL      string `json:"url"`
}

// UploadIntent is POST /api/uploads.
type UploadIntent struct {
	PostID  string   `json:"postId"`
	Uploads []Upload `json:"uploads"`
}

// CreateUploadIntent reserves a post id and keys for these (validated) files and returns one
// presigned PUT URL per file. The client never picks a key, and each URL accepts exactly the
// declared type and size.
func (a *App) CreateUploadIntent(ctx context.Context, guest Guest, files []domain.UploadFile) (UploadIntent, error) {
	event, err := a.Event(ctx)
	if err != nil {
		return UploadIntent{}, err
	}
	if err := assertUploadsOpen(event); err != nil {
		return UploadIntent{}, err
	}

	postID := newUUID()
	stored := make([]domain.StoredFile, len(files))
	for i, f := range files {
		key, err := domain.MediaKey(event.ID, postID, f)
		if err != nil {
			return UploadIntent{}, err
		}
		stored[i] = domain.StoredFile{UploadFile: f, Key: key}
	}
	filesJSON, err := json.Marshal(stored)
	if err != nil {
		return UploadIntent{}, err
	}
	args := append([]any{postID, event.ID, guest.ID, string(filesJSON), time.Now().Add(domain.IntentTTL)}, limitArgs()...)
	// The whole event's stored media, so it stays inside the R2 free tier (migration 0005).
	args = append(args, int64(a.Env.MaxEventMB)*domain.MB)
	_, err = a.DB.Exec(ctx, "select public.create_upload_intent($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)", args...)
	switch pgCode(err) {
	case "":
	case "PT429":
		return UploadIntent{}, rateLimited()
	case "PT507":
		return UploadIntent{}, &httpx.AppError{Code: "storage_full", Status: http.StatusInsufficientStorage, Message: "The photo space for this wedding is full. You can still send a wish."}
	}
	if err != nil {
		return UploadIntent{}, fmt.Errorf("Creating the upload intent failed: %w", err)
	}

	uploads := make([]Upload, len(stored))
	g, gctx := errgroup.WithContext(ctx)
	for i, f := range stored {
		g.Go(func() error {
			url, err := a.R2.PresignPut(gctx, f.Key, f.Mime, f.Bytes)
			uploads[i] = Upload{Role: f.Role, Position: f.Position, URL: url}
			return err
		})
	}
	if err := g.Wait(); err != nil {
		// No URL was handed out, so an intent nobody can use must not keep counting against the guest.
		_, _ = a.DB.Exec(context.WithoutCancel(ctx), "delete from public.upload_intents where post_id = $1", postID)
		return UploadIntent{}, err
	}
	return UploadIntent{PostID: postID, Uploads: uploads}, nil
}

func intentNotFound() error {
	return &httpx.AppError{Code: "intent_not_found", Status: http.StatusNotFound, Message: "We couldn’t find that upload."}
}

// CancelUploadIntent is the client's cleanup after a failed upload. The intent is marked cancelled
// by one atomic update that only matches an unconsumed row, so a post committed after a lost
// response keeps its files and one still being committed fails with "expired" instead of pointing
// at deleted objects. The row stays as a tombstone: it keeps counting against the hour, and the
// sweep removes the objects again once its presigned URLs are dead (a URL can re-create a deleted file).
func (a *App) CancelUploadIntent(ctx context.Context, guest Guest, postID string) error {
	var raw []byte
	err := a.DB.QueryRow(ctx, `update public.upload_intents set cancelled_at = $3
	   where post_id = $1 and guest_id = $2 and consumed_at is null and cancelled_at is null
	   returning files`, postID, guest.ID, time.Now()).Scan(&raw)
	if isNoRows(err) {
		var consumed *time.Time
		err := a.DB.QueryRow(ctx, "select consumed_at from public.upload_intents where post_id = $1 and guest_id = $2", postID, guest.ID).Scan(&consumed)
		switch {
		case isNoRows(err):
			return intentNotFound()
		case err != nil:
			return fmt.Errorf("Loading the upload intent failed: %w", err)
		case consumed != nil:
			return &httpx.AppError{Code: "already_posted", Status: http.StatusConflict, Message: "That post is already on the wall."}
		}
		return nil // cancelled before: cancelling twice is fine
	}
	if err != nil {
		return fmt.Errorf("Cancelling the upload failed: %w", err)
	}
	files, err := storedFilesOf(raw)
	if err != nil {
		return err
	}
	// Best effort: the sweep deletes them again whether or not this works. A dropped connection must not stop it (Node finished the handler regardless).
	if err := a.R2.DeleteMany(context.WithoutCancel(ctx), keysOf(files)); err != nil {
		slog.Error("Deleting cancelled upload objects failed", "postId", postID, "err", err)
	}
	return nil
}

func keysOf(files []domain.StoredFile) []string {
	keys := make([]string, len(files))
	for i, f := range files {
		keys[i] = f.Key
	}
	return keys
}
