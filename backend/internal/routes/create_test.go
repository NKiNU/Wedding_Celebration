package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/r2"
)

// HTTP-level checks of the create routes. The rules themselves are tested in internal/server.

const photoBody = `{"files":[{"role":"main","position":0,"mime":"image/jpeg","bytes":2048,"width":10,"height":10},{"role":"thumb","position":0,"mime":"image/jpeg","bytes":100}]}`

func errCode(res reply) any { e, _ := res.body["error"].(map[string]any); return e["code"] }

func TestCreateRoutesNeedASession(t *testing.T) {
	b := &browser{t: t, r: newRouter(t, nil), cookies: map[string]string{}, ip: "9.9.9.9"}
	for _, c := range [][3]string{
		{"POST", "/api/uploads", photoBody}, {"DELETE", "/api/uploads/b0000000-0000-4000-8000-000000000001", ""}, {"POST", "/api/posts", `{"wishText":"Congratulations"}`},
		{"POST", "/api/uploads", "nope"}, // the session comes before the body, as in route.ts
	} {
		if res := b.call(c[0], c[1], c[2]); res.status != 401 || errCode(res) != "no_session" {
			t.Fatalf("%v: %d %v", c, res.status, res.body)
		}
	}
	req := httptest.NewRequest(http.MethodPost, "/api/posts", strings.NewReader(`{"wishText":"Congratulations"}`))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	b.r.ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatalf("cross-site: %d", w.Code)
	}
}

func TestUploadAndPost(t *testing.T) {
	app := newTestApp(t, nil)
	fake := app.R2.(*r2.Fake)
	b := &browser{t: t, r: New(app), cookies: map[string]string{}, ip: "9.9.9.9"}
	if res := b.call("POST", "/api/guests", `{"name":"Zara"}`); res.status != 201 {
		t.Fatal(res.body)
	}

	if res := b.call("POST", "/api/uploads", `{"files":[{"role":"main","position":0,"mime":"image/jpeg","bytes":2048}]}`); res.status != 400 ||
		jsonOf(res.body) != `{"error":{"code":"invalid_input","message":"Every photo needs one thumbnail."},"ok":false}` {
		t.Fatalf("invalid set: %d %v", res.status, res.body)
	}

	res := b.call("POST", "/api/uploads", photoBody)
	data, _ := res.body["data"].(map[string]any)
	postID, _ := data["postId"].(string)
	if res.status != 201 || len(postID) != 36 || len(data["uploads"].([]any)) != 2 {
		t.Fatalf("upload: %d %v", res.status, res.body)
	}
	for _, p := range fake.Presigned {
		fake.Objects[p.Key] = r2.FakeObject{Bytes: p.Bytes, Mime: p.Mime}
	}

	// The client's `type` is ignored (unknown keys are stripped); the server derives "photo".
	for range 2 { // a replay answers with the same post
		res = b.call("POST", "/api/posts", `{"postId":"`+postID+`","caption":" Akad ","type":"video"}`)
		if res.status != 201 || jsonOf(res.body) != `{"data":{"id":"`+postID+`"},"ok":true}` {
			t.Fatalf("post: %d %v", res.status, res.body)
		}
	}
	var typ, caption string
	if err := app.DB.QueryRow(t.Context(), "select type::text, caption from posts where id = $1", postID).Scan(&typ, &caption); err != nil || typ != "photo" || caption != "Akad" {
		t.Fatal(typ, caption, err)
	}

	if res := b.call("DELETE", "/api/uploads/"+postID, ""); res.status != 409 || errCode(res) != "already_posted" {
		t.Fatalf("cancel posted: %d %v", res.status, res.body)
	}
	if res := b.call("DELETE", "/api/uploads/nope", ""); res.status != 400 || errCode(res) != "invalid_input" {
		t.Fatalf("bad id: %d %v", res.status, res.body)
	}
	res = b.call("POST", "/api/uploads", photoBody)
	other := res.body["data"].(map[string]any)["postId"].(string)
	if res := b.call("DELETE", "/api/uploads/"+other, ""); res.status != 200 || jsonOf(res.body) != `{"data":null,"ok":true}` {
		t.Fatalf("cancel: %d %v", res.status, res.body)
	}
	if res := b.call("POST", "/api/posts", `{"postId":"`+other+`"}`); res.status != 410 || errCode(res) != "intent_expired" {
		t.Fatalf("post cancelled: %d %v", res.status, res.body)
	}
	if res := b.call("POST", "/api/posts", `{"postId":"b0000000-0000-4000-8000-0000000000ff"}`); res.status != 404 || errCode(res) != "intent_not_found" {
		t.Fatalf("forged intent: %d %v", res.status, res.body)
	}
}

func TestWishRoute(t *testing.T) {
	b := &browser{t: t, r: newRouter(t, nil), cookies: map[string]string{}, ip: "9.9.9.9"}
	b.call("POST", "/api/guests", `{"name":"Zara"}`)
	if res := b.call("POST", "/api/posts", `{}`); res.status != 400 || res.body["error"].(map[string]any)["message"] != "Send a wish or a post." {
		t.Fatalf("neither: %d %v", res.status, res.body)
	}
	for i := range domain.PostsPerHour + 1 {
		res := b.call("POST", "/api/posts", `{"wishText":"Selamat pengantin baru!","type":"photo"}`)
		if i < domain.PostsPerHour && (res.status != 201 || len(res.body["data"].(map[string]any)["id"].(string)) != 36) {
			t.Fatalf("wish %d: %d %v", i, res.status, res.body)
		}
		if i == domain.PostsPerHour && (res.status != 429 || errCode(res) != "rate_limited") {
			t.Fatalf("31st: %d %v", res.status, res.body)
		}
	}
}
