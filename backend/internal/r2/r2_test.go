package r2

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Port of src/server/r2.test.ts. httptest servers stand in for R2.

var ctx = context.Background()

func client(endpoint, region string) *Client {
	return New(Config{Endpoint: endpoint, AccountID: "acct", Bucket: "wedding", AccessKeyID: "key", SecretAccessKey: "secret", Region: region})
}

func TestPresignGolden(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "testdata", "golden", "presign.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input struct {
			Endpoint string `json:"endpoint"`
			Region   string `json:"region"`
			Datetime string `json:"datetime"`
			Key      string `json:"key"`
			Mime     string `json:"mime"`
			Bytes    int64  `json:"bytes"`
		} `json:"input"`
		Output string `json:"output"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil || len(cases) == 0 {
		t.Fatal(err)
	}
	for _, c := range cases {
		in := c.Input
		at, err := time.Parse("20060102T150405Z", in.Datetime)
		if err != nil {
			t.Fatal(err)
		}
		r := New(Config{Endpoint: in.Endpoint, AccountID: "acct", Bucket: "wedding", AccessKeyID: "AKIDEXAMPLE", SecretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", Region: in.Region})
		r.now = func() time.Time { return at }
		got, err := r.PresignPut(ctx, in.Key, in.Mime, in.Bytes)
		if err != nil {
			t.Fatal(err)
		}
		// aws4fetch keeps the query in insertion order, the Go signer sorts it: same parameters, same signature.
		g, _ := url.Parse(got)
		w, _ := url.Parse(c.Output)
		if g.Scheme+g.Host+g.EscapedPath() != w.Scheme+w.Host+w.EscapedPath() || !reflect.DeepEqual(g.Query(), w.Query()) {
			t.Errorf("%+v\n got %s\nwant %s", in, got, c.Output)
		}
		if g.Query().Get("X-Amz-SignedHeaders") != "content-length;content-type;host" {
			t.Errorf("signed headers %q", g.Query().Get("X-Amz-SignedHeaders"))
		}
	}
}

func sigOf(t *testing.T, r *Client, key, mime string, n int64) string {
	t.Helper()
	got, err := r.PresignPut(ctx, key, mime, n)
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(got)
	return u.Query().Get("X-Amz-Signature")
}

func TestPresignPut(t *testing.T) {
	r := client("", "auto")
	r.now = func() time.Time { return time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC) }
	got, _ := r.PresignPut(ctx, "events/e1/p1/0.jpg", "image/jpeg", 1234)
	u, _ := url.Parse(got)
	q := u.Query()
	if u.Host != "acct.r2.cloudflarestorage.com" || u.Path != "/wedding/events/e1/p1/0.jpg" || q.Get("X-Amz-Expires") != "900" ||
		q.Get("X-Amz-SignedHeaders") != "content-length;content-type;host" || len(q.Get("X-Amz-Signature")) != 64 {
		t.Fatal(got)
	}
	// Size and type are in the signature, so R2 refuses a PUT that differs from the intent.
	base := sigOf(t, r, "k", "image/jpeg", 10)
	if base == sigOf(t, r, "k", "image/jpeg", 11) || base == sigOf(t, r, "k", "video/mp4", 10) {
		t.Fatal("size or type is not signed")
	}

	dev := client("http://127.0.0.1:54321/storage/v1/s3/", "local")
	got, _ = dev.PresignPut(ctx, "k.jpg", "image/jpeg", 1)
	u, _ = url.Parse(got)
	if u.Scheme+"://"+u.Host+u.Path != "http://127.0.0.1:54321/storage/v1/s3/wedding/k.jpg" || !strings.HasSuffix(u.Query().Get("X-Amz-Credential"), "/local/s3/aws4_request") {
		t.Fatal(got)
	}
}

// fakeR2 answers each request with the next handler (the last one repeats) and counts the calls.
func fakeR2(t *testing.T, handlers ...http.HandlerFunc) (*Client, *atomic.Int32, chan *http.Request) {
	t.Helper()
	var calls atomic.Int32
	seen := make(chan *http.Request, 16)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i := int(calls.Add(1)) - 1
		seen <- r
		handlers[min(i, len(handlers)-1)](w, r)
	}))
	t.Cleanup(srv.Close)
	return client(srv.URL, "auto"), &calls, seen
}

func status(code int, header ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		for i := 0; i+1 < len(header); i += 2 {
			w.Header().Set(header[i], header[i+1])
		}
		w.WriteHeader(code)
	}
}

func body(code int, b []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(code); _, _ = w.Write(b) }
}

func TestHead(t *testing.T) {
	r, calls, seen := fakeR2(t, status(200, "Content-Length", "42", "Content-Type", "image/jpeg"))
	o, err := r.Head(ctx, "k")
	if err != nil || *o != (Object{Bytes: 42, Mime: "image/jpeg"}) || calls.Load() != 1 {
		t.Fatalf("%+v %v %d", o, err, calls.Load())
	}
	req := <-seen
	if req.Method != "HEAD" || req.URL.Path != "/wedding/k" || !strings.Contains(req.Header.Get("Authorization"), "SignedHeaders=host;x-amz-content-sha256;x-amz-date") {
		t.Fatalf("%s %s %q", req.Method, req.URL.Path, req.Header.Get("Authorization"))
	}
}

func TestHeadFlagsOverrides(t *testing.T) {
	for _, h := range []string{"Content-Disposition", "Content-Encoding"} {
		v := map[string]string{"Content-Disposition": "attachment", "Content-Encoding": "gzip"}[h]
		r, _, _ := fakeR2(t, status(200, "Content-Length", "1", "Content-Type", "image/jpeg", h, v))
		if o, err := r.Head(ctx, "k"); err != nil || !o.Overridden {
			t.Fatalf("%s: %+v %v", h, o, err)
		}
	}
}

func TestHeadMissingAndFailures(t *testing.T) {
	r, _, _ := fakeR2(t, status(404))
	if o, err := r.Head(ctx, "k"); o != nil || err != nil {
		t.Fatal(o, err)
	}
	r, calls, _ := fakeR2(t, status(500))
	if _, err := r.Head(ctx, "k"); err == nil || !strings.Contains(err.Error(), "500") || calls.Load() != 2 {
		t.Fatalf("%v, %d calls", err, calls.Load()) // one retry, then the failure
	}
	r, calls, _ = fakeR2(t, status(503), status(200, "Content-Length", "1"))
	if o, err := r.Head(ctx, "k"); err != nil || o.Bytes != 1 || calls.Load() != 2 {
		t.Fatal(o, err)
	}
	r, calls, _ = fakeR2(t, status(403))
	if _, err := r.Head(ctx, "k"); err == nil || calls.Load() != 1 {
		t.Fatal("4xx is not retried", err)
	}
}

func TestDeleteMany(t *testing.T) {
	r, calls, seen := fakeR2(t, status(404))
	if err := r.DeleteMany(ctx, []string{"a", "b"}); err != nil || calls.Load() != 2 {
		t.Fatal(err, calls.Load())
	}
	if (<-seen).Method != "DELETE" {
		t.Fatal("not a DELETE")
	}
	r, _, _ = fakeR2(t, status(204), status(403))
	if err := r.DeleteMany(ctx, []string{"a", "b"}); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatal(err)
	}
	if err := client("http://127.0.0.1:1", "auto").DeleteMany(ctx, []string{"a"}); err == nil {
		t.Fatal("a refused connection must fail")
	}
}

func TestPurgeIsAPlaceholder(t *testing.T) {
	r, calls, _ := fakeR2(t, status(500))
	if err := r.Purge(ctx, []string{"a"}); err != nil || calls.Load() != 0 {
		t.Fatal(err)
	}
}

func seq(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte(i)
	}
	return b
}

func TestPeek(t *testing.T) {
	r, _, seen := fakeR2(t, body(206, seq(16)))
	start, found, err := r.Peek(ctx, "k")
	if err != nil || !found || !bytes.Equal(start, seq(16)) {
		t.Fatal(start, found, err)
	}
	if got := (<-seen).Header.Get("Range"); got != "bytes=0-15" {
		t.Fatal(got)
	}
	r, _, _ = fakeR2(t, body(206, seq(4)))
	if start, _, _ := r.Peek(ctx, "k"); len(start) != 4 {
		t.Fatal("a file shorter than 16 bytes is fine", start)
	}
}

func TestPeekMissingAndFailures(t *testing.T) {
	r, _, _ := fakeR2(t, status(404))
	if start, found, err := r.Peek(ctx, "k"); start != nil || found || err != nil {
		t.Fatal(start, found, err)
	}
	r, _, _ = fakeR2(t, status(403))
	if _, _, err := r.Peek(ctx, "k"); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatal(err)
	}
	r, _, _ = fakeR2(t, body(200, seq(5000)))
	if _, _, err := r.Peek(ctx, "k"); err == nil || !strings.Contains(err.Error(), "ignored the Range") {
		t.Fatal(err)
	}
}

// chunked writes parts with flushes and no Content-Length.
func chunked(parts ...int) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		for _, n := range parts {
			_, _ = w.Write(bytes.Repeat([]byte{1}, n))
			w.(http.Flusher).Flush()
		}
	}
}

func TestRead(t *testing.T) {
	r, _, _ := fakeR2(t, body(200, []byte{1, 2, 3}))
	if b, found, err := r.Read(ctx, "k", 10); err != nil || !found || !bytes.Equal(b, []byte{1, 2, 3}) {
		t.Fatal(b, found, err)
	}
	r, _, _ = fakeR2(t, status(404))
	if b, found, err := r.Read(ctx, "k", 10); b != nil || found || err != nil {
		t.Fatal(b, found, err)
	}
	r, _, _ = fakeR2(t, status(403))
	if _, _, err := r.Read(ctx, "k", 10); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatal(err)
	}
}

func TestReadRefusesOversize(t *testing.T) {
	r, _, _ := fakeR2(t, body(200, make([]byte, 20))) // with Content-Length: 20
	if _, _, err := r.Read(ctx, "k", 10); err == nil || !strings.Contains(err.Error(), "larger than 10") {
		t.Fatal(err)
	}
	r, _, _ = fakeR2(t, chunked(6, 6))
	if _, _, err := r.Read(ctx, "k", 10); err == nil || !strings.Contains(err.Error(), "larger than 10") {
		t.Fatal(err)
	}
	r, _, _ = fakeR2(t, chunked(4, 4))
	if b, _, err := r.Read(ctx, "k", 10); err != nil || len(b) != 8 {
		t.Fatal(b, err)
	}
}

func TestDefaultsAndTimeout(t *testing.T) {
	if got := client("", "auto").objectURL("a/b.jpg"); got != "https://acct.r2.cloudflarestorage.com/wedding/a/b.jpg" {
		t.Fatal(got)
	}
	if client("", "auto").http.Timeout == 0 {
		t.Fatal("a request must not hang")
	}
	r, _, _ := fakeR2(t, status(500))
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := r.Head(cancelled, "k"); err == nil {
		t.Fatal("a cancelled request must fail")
	}
}

func TestFake(t *testing.T) {
	f := NewFake(map[string]FakeObject{"q": {Bytes: 3, Mime: "image/gif", Body: []byte{1, 2, 3}}})
	if b, found, err := f.Read(ctx, "q", 3); !found || err != nil || len(b) != 3 {
		t.Fatal(b, found, err)
	}
	if _, _, err := f.Read(ctx, "q", 2); err == nil {
		t.Fatal("over the cap")
	}
	if _, found, _ := f.Read(ctx, "missing", 2); found {
		t.Fatal("missing")
	}
	if start, _, _ := f.Peek(ctx, "q"); start[0] != 0 {
		t.Fatal("an unknown type starts with no signature", start)
	}
	if err := f.Purge(ctx, []string{"q"}); err != nil || len(f.Purged) != 1 {
		t.Fatal(f.Purged)
	}
}
