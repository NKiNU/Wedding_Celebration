package server

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/testdb"
)

// Port of src/server/wall.test.ts, against the seed (supabase/seed.sql) and rows added with SQL.

const (
	seedAlbum   = "b0000000-0000-4000-8000-000000000001" // Nazrul, 5 photos
	seedVideo   = "b0000000-0000-4000-8000-000000000004" // Aminah
	seedWish    = "b0000000-0000-4000-8000-000000000002" // Siti
	seedHidden  = "b0000000-0000-4000-8000-000000000011" // Aisyah, hidden
	guestNazrul = "a0000000-0000-4000-8000-000000000001"
)

func exec(t *testing.T, a *App, sql string, args ...any) {
	t.Helper()
	if _, err := a.DB.Exec(context.Background(), sql, args...); err != nil {
		t.Fatal(err)
	}
}

// addWishes inserts n visible wishes of Nazrul all at the same instant, older than the seed.
func addWishes(t *testing.T, a *App, n int) {
	t.Helper()
	exec(t, a, `insert into posts (id, event_id, guest_id, type, wish_text, created_at)
	  select ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1, $2, 'wish', 'Congratulations!', '2020-01-01T00:00:00.123456+00'
	    from generate_series(1, $3::int) i`, testdb.EventID, guestNazrul, n)
}

func TestWallPageFirstPage(t *testing.T) {
	a := newApp(t, nil)
	res, err := a.WallPage(context.Background(), nil)
	if err != nil || len(res.Posts) != 10 || res.NextCursor != nil {
		t.Fatalf("%d posts, next %v, %v", len(res.Posts), res.NextCursor, err)
	}
	for _, p := range res.Posts {
		if p.ID == seedHidden {
			t.Fatal("hidden post on the wall")
		}
	}
	first := res.Posts[0]
	if first.ID != seedAlbum || first.Type != "album" || first.Author != "Nazrul" || first.GuestID != guestNazrul || len(first.Media) != 5 {
		t.Fatalf("%+v", first)
	}
	if !strings.HasSuffix(first.CreatedAt, "+00:00") {
		t.Fatalf("createdAt %q is not PostgREST's UTC text", first.CreatedAt)
	}
	for i, m := range first.Media { // album order and URL mapping
		base := "https://media.example.com/events/" + testdb.EventID + "/" + seedAlbum + "/" + string(rune('0'+i))
		if m.Kind != "image" || m.URL != base+".jpg" || *m.ThumbURL != base+"_thumb.jpg" || m.PosterURL != nil || m.DurationS != nil {
			t.Fatalf("media %d: %+v", i, m)
		}
	}
	wish := res.Posts[1]
	if wish.Type != "wish" || *wish.WishText == "" || wish.Caption != nil || wish.Media == nil || len(wish.Media) != 0 {
		t.Fatalf("%+v", wish)
	}
}

func TestVideoMedia(t *testing.T) {
	a := newApp(t, nil)
	p, err := a.Post(context.Background(), seedVideo)
	if err != nil || p == nil {
		t.Fatal(p, err)
	}
	m := p.Media[0]
	if m.Kind != "video" || m.ThumbURL != nil || !strings.HasSuffix(*m.PosterURL, "/0_poster.jpg") || m.DurationS == nil || *m.DurationS != 42 {
		t.Fatalf("%+v", m)
	}
	raw, _ := json.Marshal(p)
	if !strings.Contains(string(raw), `"durationS":42`) || !strings.Contains(string(raw), `"thumbUrl":null`) {
		t.Fatal(string(raw))
	}
}

func TestWallPageKeysetAcrossPages(t *testing.T) {
	a := newApp(t, nil)
	addWishes(t, a, 30) // 40 visible; the 30 new ones tie on created_at, so id breaks the tie
	ctx := context.Background()

	var all []WallPost
	var cursor *string
	for pages := 0; ; pages++ {
		res, err := a.WallPage(ctx, cursor)
		if err != nil {
			t.Fatal(err)
		}
		if pages == 0 && (len(res.Posts) != domain.PageSize || res.NextCursor == nil) {
			t.Fatalf("first page %d, next %v", len(res.Posts), res.NextCursor)
		}
		all = append(all, res.Posts...)
		if res.NextCursor == nil {
			break
		}
		cursor = res.NextCursor
		if pages > 5 {
			t.Fatal("never ends")
		}
	}
	seen := map[string]bool{}
	for _, p := range all {
		if seen[p.ID] {
			t.Fatalf("duplicate %s", p.ID)
		}
		seen[p.ID] = true
	}
	if len(all) != 40 {
		t.Fatalf("%d posts, want 40 with no gaps", len(all))
	}
	tail := all[10:] // the tied rows: id descending
	for i := 1; i < len(tail); i++ {
		if tail[i-1].CreatedAt != tail[i].CreatedAt || tail[i-1].ID <= tail[i].ID {
			t.Fatalf("tie order broken at %d: %s %s", i, tail[i-1].ID, tail[i].ID)
		}
	}
}

func TestOtherEventExcludedAndMissingAuthor(t *testing.T) {
	a := newApp(t, nil)
	exec(t, a, `insert into events (id, slug, groom_name, bride_name) values ('e0000000-0000-4000-8000-000000000002', 'other', 'G', 'B')`)
	exec(t, a, `insert into guests (id, event_id, name, token_hash) values ('a0000000-0000-4000-8000-000000000099', 'e0000000-0000-4000-8000-000000000002', 'Zed', repeat('9', 64))`)
	exec(t, a, `insert into posts (id, event_id, guest_id, type, wish_text) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000099', 'wish', 'Elsewhere')`)
	res, err := a.WallPage(context.Background(), nil)
	if err != nil || len(res.Posts) != 10 {
		t.Fatalf("%d posts, %v", len(res.Posts), err)
	}
	if p, err := a.Post(context.Background(), "d0000000-0000-4000-8000-000000000001"); p != nil || err != nil {
		t.Fatalf("other event's post: %v %v", p, err)
	}
	// guest_id is not null, so the "Guest" fallback is only reachable by dropping the foreign key.
	exec(t, a, `alter table posts drop constraint posts_guest_id_fkey`)
	exec(t, a, `update posts set guest_id = 'a0000000-0000-4000-8000-0000000000ff' where id = $1`, seedWish)
	p, err := a.Post(context.Background(), seedWish)
	if err != nil || p.Author != "Guest" {
		t.Fatalf("%+v %v", p, err)
	}
}

func TestWallPageRejectsBadCursors(t *testing.T) {
	a := newApp(t, nil)
	for _, c := range []string{"garbage", ""} {
		_, err := a.WallPage(context.Background(), &c)
		appError(t, err, "invalid_cursor", 400)
	}
}

func TestLatestWishes(t *testing.T) {
	a := newApp(t, nil)
	wishes, err := a.LatestWishes(context.Background())
	if err != nil || len(wishes) != domain.TickerWishes {
		t.Fatalf("%d, %v", len(wishes), err)
	}
	for _, w := range wishes {
		if w.Type != "wish" {
			t.Fatalf("%+v", w)
		}
	}
	if wishes[0].ID != seedWish {
		t.Fatalf("newest wish is %s", wishes[0].ID)
	}
}

func TestPost(t *testing.T) {
	a := newApp(t, nil)
	ctx := context.Background()
	if p, err := a.Post(ctx, seedAlbum); err != nil || p == nil || p.Author != "Nazrul" || len(p.Media) != 5 {
		t.Fatalf("%+v %v", p, err)
	}
	for _, id := range []string{seedHidden, "b0000000-0000-4000-8000-0000000000ff"} {
		if p, err := a.Post(ctx, id); p != nil || err != nil {
			t.Fatalf("%s: %v %v", id, p, err)
		}
	}
}

func TestMyPosts(t *testing.T) {
	a := newApp(t, nil)
	ctx := context.Background()
	mine, err := a.MyPosts(ctx, guestNazrul) // posts 1 and 10
	if err != nil || len(mine) != 2 || mine[0].ID != seedAlbum {
		t.Fatalf("%v %v", mine, err)
	}
	if none, err := a.MyPosts(ctx, "a0000000-0000-4000-8000-000000000010"); err != nil || none == nil || len(none) != 0 { // Aisyah: only a hidden post
		t.Fatalf("%v %v", none, err)
	}
	addWishes(t, a, domain.MyPostsMax+5)
	if capped, _ := a.MyPosts(ctx, guestNazrul); len(capped) != domain.MyPostsMax {
		t.Fatalf("%d", len(capped))
	}
}

func TestWallCounts(t *testing.T) {
	a := newApp(t, nil)
	got, err := a.WallCounts(context.Background())
	if err != nil || got != (WallCounts{All: 10, Photos: 4, Videos: 1, Wishes: 5}) {
		t.Fatalf("%+v %v", got, err)
	}
	// An event with no posts: the function returns one row of zeros.
	exec(t, a, `update posts set hidden = true`)
	if got, err := a.WallCounts(context.Background()); err != nil || got != (WallCounts{}) {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestWallDatabaseFailure(t *testing.T) {
	a := newApp(t, nil)
	ctx := WithEventCache(context.Background())
	if _, err := a.Event(ctx); err != nil {
		t.Fatal(err)
	}
	a.DB.Close()
	if _, err := a.WallPage(ctx, nil); err == nil || !strings.HasPrefix(err.Error(), "Loading the wall failed") {
		t.Fatal(err)
	}
	if _, err := a.WallCounts(ctx); err == nil || !strings.HasPrefix(err.Error(), "Loading wall counts failed") {
		t.Fatal(err)
	}
	if _, err := a.LatestWishes(ctx); err == nil || !strings.HasPrefix(err.Error(), "Loading the latest wishes failed") {
		t.Fatal(err)
	}
	if _, err := a.Post(ctx, testdb.EventID); err == nil || !strings.HasPrefix(err.Error(), "Loading the post failed") {
		t.Fatal(err)
	}
	if _, err := a.MyPosts(ctx, testdb.EventID); err == nil || !strings.HasPrefix(err.Error(), "Loading your posts failed") {
		t.Fatal(err)
	}
}
