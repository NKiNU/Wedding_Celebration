package server

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
)

// Port of src/server/wall.ts. Nullable fields are pointers so they encode as null, never omitted.

// WallMedia is one file of a post (src/lib/domain/posts.ts).
type WallMedia struct {
	Kind      string   `json:"kind"`
	URL       string   `json:"url"`
	ThumbURL  *string  `json:"thumbUrl"`
	PosterURL *string  `json:"posterUrl"`
	DurationS *float64 `json:"durationS"`
}

// WallPost is a post as the wall and the viewer show it.
type WallPost struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"`
	Caption   *string     `json:"caption"`
	WishText  *string     `json:"wishText"`
	CreatedAt string      `json:"createdAt"` // Postgres' own text: microseconds matter for the cursor
	GuestID   string      `json:"guestId"`
	Author    string      `json:"author"`
	Media     []WallMedia `json:"media"`
}

// WallCounts are the filter-pill counts.
type WallCounts struct {
	All    int `json:"all"`
	Photos int `json:"photos"`
	Videos int `json:"videos"`
	Wishes int `json:"wishes"`
}

// WallPageResult is one page of the wall.
type WallPageResult struct {
	Posts      []WallPost `json:"posts"`
	NextCursor *string    `json:"nextCursor"`
}

// created_at is PostgREST's text for the value (the pool pins TimeZone to UTC, see OpenDB).
const selectPosts = `select p.id, p.type::text, p.caption, p.wish_text, to_json(p.created_at)#>>'{}', p.guest_id, g.name,
  coalesce((select json_agg(json_build_object('kind', m.kind, 'path', m.path, 'thumb', m.thumb_path,
                                              'poster', m.poster_path, 'dur', m.duration_s::float8) order by m.position)
              from post_media m where m.post_id = p.id), '[]'::json)
  from posts p left join guests g on g.id = p.guest_id
 where p.event_id = $1 and p.hidden = false `

// visiblePosts runs selectPosts + extra (more conditions, then order/limit). The service role
// bypasses RLS, so `hidden = false` is asked for explicitly.
func (a *App) visiblePosts(ctx context.Context, what, extra string, args ...any) ([]WallPost, error) {
	event, err := a.Event(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, selectPosts+extra, append([]any{event.ID}, args...)...)
	if err != nil {
		return nil, fmt.Errorf("Loading %s failed: %w", what, err)
	}
	defer rows.Close()
	posts := []WallPost{}
	for rows.Next() {
		var p WallPost
		var author *string
		var media []byte
		if err := rows.Scan(&p.ID, &p.Type, &p.Caption, &p.WishText, &p.CreatedAt, &p.GuestID, &author, &media); err != nil {
			return nil, fmt.Errorf("Loading %s failed: %w", what, err)
		}
		p.Author = "Guest"
		if author != nil {
			p.Author = *author
		}
		var files []struct {
			Kind   string   `json:"kind"`
			Path   string   `json:"path"`
			Thumb  *string  `json:"thumb"`
			Poster *string  `json:"poster"`
			Dur    *float64 `json:"dur"`
		}
		if err := json.Unmarshal(media, &files); err != nil {
			return nil, fmt.Errorf("Loading %s failed: %w", what, err)
		}
		p.Media = make([]WallMedia, 0, len(files))
		for _, f := range files {
			kind := "image"
			if f.Kind == "video" {
				kind = "video"
			}
			p.Media = append(p.Media, WallMedia{Kind: kind, URL: *a.MediaURL(&f.Path), ThumbURL: a.MediaURL(f.Thumb), PosterURL: a.MediaURL(f.Poster), DurationS: f.Dur})
		}
		posts = append(posts, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("Loading %s failed: %w", what, err)
	}
	return posts, nil
}

// WallPage is one page of the wall, newest first. A nil cursor is the first page.
func (a *App) WallPage(ctx context.Context, cursor *string) (WallPageResult, error) {
	extra := fmt.Sprintf("order by p.created_at desc, p.id desc limit %d", domain.PageSize+1) // the extra row only tells us whether another page exists
	args := []any{}
	if cursor != nil {
		after := domain.DecodeCursor(*cursor)
		if after == nil {
			return WallPageResult{}, &httpx.AppError{Code: "invalid_cursor", Status: 400, Message: "That page link is not valid."}
		}
		extra = "and (p.created_at, p.id) < ($2::timestamptz, $3::uuid) " + extra
		args = append(args, after.CreatedAt, after.ID)
	}
	posts, err := a.visiblePosts(ctx, "the wall", extra, args...)
	if err != nil {
		return WallPageResult{}, err
	}
	res := WallPageResult{Posts: posts}
	if len(posts) > domain.PageSize {
		res.Posts = posts[:domain.PageSize]
		next := domain.EncodeCursor(res.Posts[domain.PageSize-1].CreatedAt, res.Posts[domain.PageSize-1].ID)
		res.NextCursor = &next
	}
	return res, nil
}

// LatestWishes are the newest visible wishes whatever else was posted since, for the ticker.
func (a *App) LatestWishes(ctx context.Context) ([]WallPost, error) {
	return a.visiblePosts(ctx, "the latest wishes", fmt.Sprintf("and p.type = 'wish' order by p.created_at desc, p.id desc limit %d", domain.TickerWishes))
}

// Post is one visible post for the viewer; nil when hidden, deleted or in another event.
func (a *App) Post(ctx context.Context, id string) (*WallPost, error) {
	posts, err := a.visiblePosts(ctx, "the post", "and p.id = $2 limit 1", id)
	if err != nil || len(posts) == 0 {
		return nil, err
	}
	return &posts[0], nil
}

// MyPosts are a guest's own visible posts, newest first.
// shortcut: the newest MyPostsMax only, add a cursor if a guest ever shares more than that.
func (a *App) MyPosts(ctx context.Context, guestID string) ([]WallPost, error) {
	return a.visiblePosts(ctx, "your posts", fmt.Sprintf("and p.guest_id = $2 order by p.created_at desc, p.id desc limit %d", domain.MyPostsMax), guestID)
}

// WallCounts are the filter-pill counts, computed by the database so they stay right past the loaded pages.
func (a *App) WallCounts(ctx context.Context) (WallCounts, error) {
	event, err := a.Event(ctx)
	if err != nil {
		return WallCounts{}, err
	}
	var c WallCounts
	rows, err := a.DB.Query(ctx, "select all_count, photos, videos, wishes from public.wall_counts($1)", event.ID)
	if err != nil {
		return c, fmt.Errorf("Loading wall counts failed: %w", err)
	}
	defer rows.Close()
	if rows.Next() {
		if err := rows.Scan(&c.All, &c.Photos, &c.Videos, &c.Wishes); err != nil {
			return WallCounts{}, fmt.Errorf("Loading wall counts failed: %w", err)
		}
	}
	if err := rows.Err(); err != nil {
		return WallCounts{}, fmt.Errorf("Loading wall counts failed: %w", err)
	}
	return c, nil
}
