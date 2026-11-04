package routes

import (
	"context"
	"strings"
	"testing"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
)

// HTTP-level checks of the wall reads; the queries themselves are tested in internal/server.

func TestWallPosts(t *testing.T) {
	r, pool := newRouterDB(t, nil)
	b := &browser{t: t, r: r, cookies: map[string]string{}}

	res := b.call("GET", "/api/posts", "")
	data, _ := res.body["data"].(map[string]any)
	counts, _ := data["counts"].(map[string]any)
	if res.status != 200 || len(data["posts"].([]any)) != 10 || data["nextCursor"] != nil || counts["all"] != 10.0 || counts["photos"] != 4.0 || len(data["wishes"].([]any)) != 5 {
		t.Fatalf("%d %v", res.status, res.body)
	}
	post := data["posts"].([]any)[0].(map[string]any)
	if !strings.HasSuffix(post["createdAt"].(string), "+00:00") || len(post["media"].([]any)) != 5 {
		t.Fatalf("%v", post)
	}

	// Raw JSON: nulls and empty arrays are present, never omitted.
	raw := jsonOf(res.body)
	for _, want := range []string{`"nextCursor":null`, `"caption":null`, `"media":[]`, `"posterUrl":null`} {
		if !strings.Contains(raw, want) {
			t.Fatalf("%s missing from %s", want, raw)
		}
	}

	// A bad or empty cursor is a 400 before any query.
	for _, q := range []string{"?cursor=", "?cursor=garbage"} {
		res = b.call("GET", "/api/posts"+q, "")
		if e, _ := res.body["error"].(map[string]any); res.status != 400 || e["code"] != "invalid_cursor" {
			t.Fatalf("%s: %d %v", q, res.status, res.body)
		}
	}

	// Next pages carry no counts or wishes and the cursor round-trips.
	if _, err := pool.Exec(context.Background(), `insert into posts (id, event_id, guest_id, type, wish_text, created_at)
	  select ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'wish', 'Congratulations!', '2020-01-01T00:00:00.123456+00'
	    from generate_series(1, 20) i`); err != nil {
		t.Fatal(err)
	}
	res = b.call("GET", "/api/posts", "")
	data, _ = res.body["data"].(map[string]any)
	next, _ := data["nextCursor"].(string)
	if len(data["posts"].([]any)) != domain.PageSize || next == "" {
		t.Fatalf("%v", res.body)
	}
	res = b.call("GET", "/api/posts?cursor="+next, "")
	data, _ = res.body["data"].(map[string]any)
	v, hasCounts := data["counts"]
	w, hasWishes := data["wishes"]
	if res.status != 200 || len(data["posts"].([]any)) != 6 || data["nextCursor"] != nil || !hasCounts || v != nil || !hasWishes || w != nil {
		t.Fatalf("%d %v", res.status, res.body)
	}
}

func TestMyPostsRoute(t *testing.T) {
	r, pool := newRouterDB(t, nil)
	b := &browser{t: t, r: r, cookies: map[string]string{}, ip: "9.9.9.9"}

	if res := b.call("GET", "/api/me/posts", ""); res.status != 401 {
		t.Fatalf("%d %v", res.status, res.body)
	}
	res := b.call("POST", "/api/guests", `{"name":"Zara"}`)
	id := res.body["data"].(map[string]any)["guestId"].(string)
	if res = b.call("GET", "/api/me/posts", ""); res.status != 200 || jsonOf(res.body) != `{"data":[],"ok":true}` {
		t.Fatalf("%d %v", res.status, res.body)
	}
	if _, err := pool.Exec(context.Background(), `insert into posts (event_id, guest_id, type, wish_text) values ('e0000000-0000-4000-8000-000000000001', $1, 'wish', 'Selamat!')`, id); err != nil {
		t.Fatal(err)
	}
	res = b.call("GET", "/api/me/posts", "")
	list, _ := res.body["data"].([]any)
	if res.status != 200 || len(list) != 1 || list[0].(map[string]any)["author"] != "Zara" {
		t.Fatalf("%d %v", res.status, res.body)
	}
}

func TestPostRoute(t *testing.T) {
	b := &browser{t: t, r: newRouter(t, nil), cookies: map[string]string{}}

	res := b.call("GET", "/api/posts/b0000000-0000-4000-8000-000000000001", "")
	if d, _ := res.body["data"].(map[string]any); res.status != 200 || d["type"] != "album" {
		t.Fatalf("%d %v", res.status, res.body)
	}
	for path, want := range map[string]struct {
		status int
		code   string
	}{
		"/api/posts/not-a-uuid":                           {400, "invalid_input"},
		"/api/posts/b0000000-0000-4000-8000-000000000011": {404, "post_not_found"}, // hidden
		"/api/posts/b0000000-0000-4000-8000-0000000000ff": {404, "post_not_found"},
	} {
		res = b.call("GET", path, "")
		if e, _ := res.body["error"].(map[string]any); res.status != want.status || e["code"] != want.code {
			t.Fatalf("%s: %d %v", path, res.status, res.body)
		}
	}
}
