package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nkinu/wedding_celebration/backend/internal/server"
	"github.com/nkinu/wedding_celebration/backend/internal/testdb"
)

// HTTP-level checks of the identity routes: status codes, envelope, cookies, and the order of
// validation and throttling. The rules themselves are tested in internal/server.

func init() { gin.SetMode(gin.TestMode) }

func newRouter(t *testing.T, over map[string]string) *gin.Engine {
	r, _ := newRouterDB(t, over)
	return r
}

func newRouterDB(t *testing.T, over map[string]string) (*gin.Engine, *pgxpool.Pool) {
	t.Helper()
	get := func(k string) string {
		if v, ok := over[k]; ok {
			return v
		}
		return map[string]string{
			"DATABASE_URL": "postgres://unused", "ADMIN_PASSCODE": "letmein-123", "DEVICE_TOKEN_PEPPER": strings.Repeat("p", 32),
			"R2_ACCOUNT_ID": "acct", "R2_ACCESS_KEY_ID": "key", "R2_SECRET_ACCESS_KEY": "secret", "R2_BUCKET": "wedding",
			"NEXT_PUBLIC_MEDIA_BASE_URL": "https://media.example.com", "EVENT_SLUG": "demo", "CRON_SECRET": strings.Repeat("c", 16), "NODE_ENV": "development",
		}[k]
	}
	env, err := server.ParseEnv(get)
	if err != nil {
		t.Fatal(err)
	}
	pool := testdb.New(t)
	return New(&server.App{DB: pool, Env: env}), pool
}

type browser struct {
	t       *testing.T
	r       *gin.Engine
	cookies map[string]string
	ip      string
}

type reply struct {
	status  int
	body    map[string]any
	cookies []*http.Cookie
}

func (b *browser) call(method, path, body string) reply {
	b.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.Header.Set("X-Real-Ip", b.ip)
	for k, v := range b.cookies {
		req.AddCookie(&http.Cookie{Name: k, Value: v})
	}
	w := httptest.NewRecorder()
	b.r.ServeHTTP(w, req)
	res := reply{status: w.Code, cookies: w.Result().Cookies()}
	for _, c := range res.cookies {
		if c.MaxAge < 0 {
			delete(b.cookies, c.Name)
		} else {
			b.cookies[c.Name] = c.Value
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res.body); err != nil {
		b.t.Fatalf("%s %s: %q is not JSON", method, path, w.Body.String())
	}
	return res
}

func jsonOf(v any) string { b, _ := json.Marshal(v); return string(b) }

func TestJoinAndSession(t *testing.T) {
	b := &browser{t: t, r: newRouter(t, nil), cookies: map[string]string{}, ip: "9.9.9.9"}

	if res := b.call("GET", "/api/session", ""); res.status != 200 || jsonOf(res.body) != `{"data":{"active":null,"known":[]},"ok":true}` {
		t.Fatalf("empty session: %d %v", res.status, res.body)
	}

	res := b.call("POST", "/api/guests", `{"name":"  Zara   Binti  "}`)
	data, _ := res.body["data"].(map[string]any)
	if res.status != 201 || data["name"] != "Zara Binti" || len(res.cookies) != 2 {
		t.Fatalf("join: %d %v %v", res.status, res.body, res.cookies)
	}
	zara := jsonOf(data)

	if res := b.call("GET", "/api/session", ""); jsonOf(res.body["data"]) != `{"active":`+zara+`,"known":[`+zara+`]}` {
		t.Fatalf("session: %v", res.body)
	}

	if res := b.call("POST", "/api/guests", `{"name":"ALI"}`); res.status != 409 || jsonOf(res.body) != `{"error":{"code":"name_taken","details":{"suggestions":["ALI 2","ALI \u0026 family"]},"message":"“ALI” is already used by another guest. Add something to make it yours."},"ok":false}` {
		t.Fatalf("taken: %d %s", res.status, jsonOf(res.body))
	}

	if res := b.call("DELETE", "/api/session", ""); res.status != 200 || jsonOf(res.body) != `{"data":null,"ok":true}` {
		t.Fatalf("switch name: %d %v", res.status, res.body)
	}
	if res := b.call("GET", "/api/session", ""); jsonOf(res.body["data"]) != `{"active":null,"known":[`+zara+`]}` {
		t.Fatalf("after switch: %v", res.body)
	}

	guestID := data["guestId"].(string)
	if res := b.call("POST", "/api/session", `{"guestId":"a0000000-0000-4000-8000-000000000003"}`); res.status != 403 || res.body["error"].(map[string]any)["code"] != "unknown_guest" {
		t.Fatalf("foreign guest: %d %v", res.status, res.body)
	}
	if res := b.call("POST", "/api/session", `{"guestId":"nope"}`); res.status != 400 || res.body["error"].(map[string]any)["code"] != "invalid_input" {
		t.Fatalf("bad id: %d %v", res.status, res.body)
	}
	if res := b.call("POST", "/api/session", `{"guestId":"`+guestID+`"}`); res.status != 200 || jsonOf(res.body["data"]) != zara {
		t.Fatalf("continue as: %d %v", res.status, res.body)
	}
}

func TestInvalidNamesDoNotCountAgainstTheThrottle(t *testing.T) {
	b := &browser{t: t, r: newRouter(t, map[string]string{"GUEST_JOINS_PER_IP": "1"}), cookies: map[string]string{}, ip: "9.9.9.9"}
	for _, body := range []string{`{"name":"A"}`, `nope`, `{}`} {
		if res := b.call("POST", "/api/guests", body); res.status != 400 {
			t.Fatalf("%s: %d", body, res.status)
		}
	}
	if res := b.call("POST", "/api/guests", `{"name":"Zara"}`); res.status != 201 {
		t.Fatalf("first real join: %d %v", res.status, res.body)
	}
	if res := b.call("POST", "/api/guests", `{"name":"Zara 2"}`); res.status != 429 || res.body["error"].(map[string]any)["code"] != "rate_limited" {
		t.Fatalf("second join: %d %v", res.status, res.body)
	}
}

func TestPublicEventRoute(t *testing.T) {
	b := &browser{t: t, r: newRouter(t, nil), cookies: map[string]string{}}
	res := b.call("GET", "/api/event", "")
	data := res.body["data"].(map[string]any)
	if res.status != 200 || data["id"] != testdb.EventID || jsonOf(data["fonts"]) != `{"body":null,"names":null,"wishes":null}` || data["qr"] == nil {
		t.Fatalf("%d %v", res.status, res.body)
	}
	for _, leak := range []string{"qr_path", "qrPath", "slug", "token"} {
		if strings.Contains(jsonOf(res.body), leak) {
			t.Fatalf("leaks %s: %v", leak, res.body)
		}
	}
}

func TestGuards(t *testing.T) {
	r := newRouter(t, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/guests", strings.NewReader(`{"name":"Zara"}`))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 403 || w.Header().Get("X-Content-Type-Options") != "nosniff" || len(w.Result().Cookies()) != 0 {
		t.Fatalf("cross-site POST: %d %v", w.Code, w.Header())
	}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/api/session", nil))
	if w.Code != 405 {
		t.Fatalf("wrong method: %d", w.Code)
	}
}
