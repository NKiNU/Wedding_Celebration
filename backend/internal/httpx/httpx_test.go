package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.TestMode) }

// Port of src/server/http.test.ts.

type result struct {
	status int
	body   map[string]any
	ran    bool
}

func serve(t *testing.T, req *http.Request, status int, run func(*gin.Context) (any, error)) result {
	t.Helper()
	r := gin.New()
	r.Use(Recovery(), SecurityHeaders(), CrossSiteGuard())
	ran := false
	h := Handle(status, func(c *gin.Context) (any, error) { ran = true; return run(c) })
	r.Any("/api/x", h)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not JSON: %v", w.Body.String(), err)
	}
	return result{w.Code, body, ran}
}

func post(headers map[string]string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "https://wedding.example/api/x", strings.NewReader("{}"))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return req
}

func done(*gin.Context) (any, error) { return "done", nil }

func jsonOf(v any) string { b, _ := json.Marshal(v); return string(b) }

func TestEnvelope(t *testing.T) {
	ok := serve(t, post(nil), 201, func(*gin.Context) (any, error) { return map[string]int{"id": 1}, nil })
	if ok.status != 201 || jsonOf(ok.body) != `{"data":{"id":1},"ok":true}` {
		t.Fatalf("ok: %d %v", ok.status, ok.body)
	}

	none := serve(t, post(nil), 200, func(*gin.Context) (any, error) { return nil, nil })
	if jsonOf(none.body) != `{"data":null,"ok":true}` {
		t.Fatalf("null data: %v", none.body)
	}

	taken := serve(t, post(nil), 200, func(*gin.Context) (any, error) {
		return nil, &AppError{"name_taken", 409, "Taken.", map[string]any{"suggestions": []string{"Ali 2"}}}
	})
	if taken.status != 409 || jsonOf(taken.body) != `{"error":{"code":"name_taken","details":{"suggestions":["Ali 2"]},"message":"Taken."},"ok":false}` {
		t.Fatalf("app error: %d %v", taken.status, taken.body)
	}

	short := serve(t, post(nil), 200, func(*gin.Context) (any, error) { return nil, Invalid("Too short.") })
	if short.status != 400 || jsonOf(short.body) != `{"error":{"code":"invalid_input","message":"Too short."},"ok":false}` {
		t.Fatalf("invalid: %d %v", short.status, short.body)
	}
}

func TestUnexpectedErrorsAreHidden(t *testing.T) {
	for name, run := range map[string]func(*gin.Context) (any, error){
		"error": func(*gin.Context) (any, error) { return nil, errors.New("connection string leaked") },
		"panic": func(*gin.Context) (any, error) { panic("connection string leaked") },
	} {
		res := serve(t, post(nil), 200, run)
		if res.status != 500 || strings.Contains(jsonOf(res.body), "leaked") || res.body["error"].(map[string]any)["code"] != "internal" {
			t.Fatalf("%s: %d %v", name, res.status, res.body)
		}
	}
}

func TestCrossSiteRefused(t *testing.T) {
	for name, h := range map[string]map[string]string{
		"cross-site fetch":  {"Sec-Fetch-Site": "cross-site"},
		"sibling subdomain": {"Sec-Fetch-Site": "same-site"},
		"foreign Origin":    {"Origin": "https://evil.example"},
		"opaque Origin":     {"Origin": "null"},
	} {
		res := serve(t, post(h), 200, done)
		if res.status != 403 || res.ran || res.body["error"].(map[string]any)["code"] != "forbidden" {
			t.Fatalf("%s: %d ran=%v", name, res.status, res.ran)
		}
	}
}

func TestCrossSiteAllowed(t *testing.T) {
	for name, h := range map[string]map[string]string{
		"same-origin":     {"Sec-Fetch-Site": "same-origin"},
		"typed URL":       {"Sec-Fetch-Site": "none"},
		"matching Origin": {"Origin": "https://wedding.example"},
		"no headers":      {},
	} {
		req := post(h)
		req.Header.Set("X-Forwarded-Proto", "https") // httptest requests carry no TLS
		if res := serve(t, req, 200, done); res.status != 200 || !res.ran {
			t.Fatalf("%s: %d", name, res.status)
		}
	}
}

func TestCrossSiteSchemeFromProxy(t *testing.T) {
	behindProxy := func(origin, proto string) int {
		req := httptest.NewRequest(http.MethodPost, "http://wedding.example/api/x", nil)
		req.Header.Set("Origin", origin)
		if proto != "" {
			req.Header.Set("X-Forwarded-Proto", proto)
		}
		return serve(t, req, 200, done).status
	}
	for _, tc := range []struct {
		origin, proto string
		want          int
	}{
		{"https://wedding.example", "https", 200},
		{"https://wedding.example", "https, http", 200}, // the first hop
		{"https://evil.example", "https", 403},
		{"http://wedding.example", "https", 403}, // wrong scheme
		{"https://wedding.example", "", 403},     // proxy sent no scheme: fail closed
	} {
		if got := behindProxy(tc.origin, tc.proto); got != tc.want {
			t.Fatalf("%+v: got %d", tc, got)
		}
	}
}

func TestReadsAreNotGuarded(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "https://wedding.example/api/x", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	if res := serve(t, req, 200, done); res.status != 200 {
		t.Fatalf("got %d", res.status)
	}
}

func TestSecurityHeaders(t *testing.T) {
	r := gin.New()
	r.Use(SecurityHeaders())
	r.GET("/x", func(c *gin.Context) { c.Status(204) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
	if w.Header().Get("X-Frame-Options") != "DENY" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatalf("headers: %v", w.Header())
	}
}

func TestBody(t *testing.T) {
	read := func(body string) string {
		var got string
		serve(t, httptest.NewRequest(http.MethodPost, "/api/x", strings.NewReader(body)), 200, func(c *gin.Context) (any, error) {
			got = string(Body(c))
			return nil, nil
		})
		return got
	}
	if got := read(`{"name":"Ali"}`); got != `{"name":"Ali"}` {
		t.Fatalf("valid: %s", got)
	}
	for name, body := range map[string]string{
		"empty":    "",
		"not JSON": "{name",
		"too big":  `"` + strings.Repeat("a", MaxBodyBytes) + `"`,
	} {
		if got := read(body); got != "null" {
			t.Fatalf("%s: %s", name, got)
		}
	}
}
