package server

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/r2"
	"github.com/nkinu/wedding_celebration/backend/internal/testdb"
)

// Port of src/server/uploads.test.ts, against the real create_upload_intent and a fake R2.

var bg = context.Background()

func newUploadApp(t *testing.T, over map[string]string) (*App, *r2.Fake) {
	t.Helper()
	a := newApp(t, over)
	fake := r2.NewFake(nil)
	a.R2 = fake
	return a, fake
}

// newGuest adds a guest with no posts, so its hourly allowance is whole.
func newGuest(t *testing.T, a *App, name string) Guest {
	t.Helper()
	g := Guest{Name: name, EventID: testdb.EventID}
	if err := a.DB.QueryRow(bg, "insert into guests (event_id, name, token_hash) values ($1, $2, $3) returning id",
		testdb.EventID, name, HashToken(name, "x")).Scan(&g.ID); err != nil {
		t.Fatal(err)
	}
	return g
}

func ptr[T any](v T) *T { return &v }

var photo = []domain.UploadFile{
	{Role: "main", Position: 0, Mime: "image/jpeg", Bytes: 2 * domain.MB, Width: ptr(2048), Height: ptr(1536)},
	{Role: "thumb", Position: 0, Mime: "image/jpeg", Bytes: 40_000},
}

type intentRow struct {
	files     []domain.StoredFile
	expires   time.Time
	cancelled *time.Time
	consumed  *time.Time
}

func loadIntent(t *testing.T, a *App, postID string) *intentRow {
	t.Helper()
	var raw []byte
	var r intentRow
	err := a.DB.QueryRow(bg, "select files, expires_at, cancelled_at, consumed_at from upload_intents where post_id = $1", postID).Scan(&raw, &r.expires, &r.cancelled, &r.consumed)
	if isNoRows(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &r.files); err != nil {
		t.Fatal(err)
	}
	return &r
}

func TestAssertUploadsOpen(t *testing.T) {
	if assertUploadsOpen(&Event{UploadsOpen: true}) != nil {
		t.Fatal("open")
	}
	appError(t, assertUploadsOpen(&Event{}), "uploads_closed", 403)
}

func TestLimitArgs(t *testing.T) {
	args := limitArgs()
	since := time.Since(args[0].(time.Time))
	if since < domain.RateWindow-time.Second || since > domain.RateWindow+time.Second || args[1] != domain.PostsPerHour || args[2] != int64(domain.BytesPerHour) {
		t.Fatal(args...)
	}
}

func TestStoredFilesOf(t *testing.T) {
	if f, err := storedFilesOf([]byte(`[{"role":"main","position":0,"mime":"image/jpeg","bytes":1,"key":"k"}]`)); err != nil || len(f) != 1 {
		t.Fatal(f, err)
	}
	if _, err := storedFilesOf([]byte(`[{"role":"main"}]`)); err == nil || !strings.Contains(err.Error(), "malformed") {
		t.Fatal(err)
	}
}

func TestCreateUploadIntent(t *testing.T) {
	a, fake := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	res, err := a.CreateUploadIntent(bg, g, photo)
	if err != nil {
		t.Fatal(err)
	}
	row := loadIntent(t, a, res.PostID)
	keys := []string{"events/" + testdb.EventID + "/" + res.PostID + "/0.jpg", "events/" + testdb.EventID + "/" + res.PostID + "/0_thumb.jpg"}
	if row == nil || len(row.files) != 2 || row.files[0].Key != keys[0] || row.files[1].Key != keys[1] || *row.files[0].Width != 2048 {
		t.Fatalf("%+v", row)
	}
	if ttl := time.Until(row.expires); ttl < domain.IntentTTL-5*time.Second || ttl > domain.IntentTTL {
		t.Fatal(ttl)
	}
	want := []r2.Presigned{{Key: keys[0], Mime: "image/jpeg", Bytes: 2 * domain.MB}, {Key: keys[1], Mime: "image/jpeg", Bytes: 40_000}}
	if len(fake.Presigned) != 2 || !(fake.Presigned[0] == want[0] && fake.Presigned[1] == want[1] || fake.Presigned[0] == want[1] && fake.Presigned[1] == want[0]) {
		t.Fatalf("%+v", fake.Presigned)
	}
	if jsonOf(res.Uploads) != `[{"role":"main","position":0,"url":"https://r2.test/`+keys[0]+`"},{"role":"thumb","position":0,"url":"https://r2.test/`+keys[1]+`"}]` {
		t.Fatal(jsonOf(res.Uploads))
	}
}

func jsonOf(v any) string { b, _ := json.Marshal(v); return string(b) }

func countIntents(t *testing.T, a *App) int {
	t.Helper()
	var n int
	if err := a.DB.QueryRow(bg, "select count(*) from upload_intents").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestCreateUploadIntentRefusals(t *testing.T) {
	a, fake := newUploadApp(t, map[string]string{"MAX_EVENT_MB": "3"})
	g := newGuest(t, a, "Zul")
	before := countIntents(t, a)

	exec(t, a, "update events set uploads_open = false")
	_, err := a.CreateUploadIntent(bg, g, photo)
	appError(t, err, "uploads_closed", 403)
	exec(t, a, "update events set uploads_open = true")

	if _, err := a.CreateUploadIntent(bg, Guest{ID: "00000000-0000-4000-8000-000000000000", EventID: testdb.EventID}, photo); err == nil ||
		!strings.Contains(err.Error(), "Creating the upload intent failed") {
		t.Fatal("any other database error fails loudly", err)
	}

	// The event cap counts posted media only: 2 MB posted + 2 MB more is over 3 MB.
	first, err := a.CreateUploadIntent(bg, g, photo)
	if err != nil {
		t.Fatal(err)
	}
	exec(t, a, "update upload_intents set consumed_at = now() where post_id = $1", first.PostID)
	exec(t, a, "insert into posts (id, event_id, guest_id, type) values ($1, $2, $3, 'photo')", first.PostID, testdb.EventID, g.ID)
	presigned := len(fake.Presigned)
	_, err = a.CreateUploadIntent(bg, g, photo)
	app := appError(t, err, "storage_full", 507)
	if app.Message != "The photo space for this wedding is full. You can still send a wish." || len(fake.Presigned) != presigned || countIntents(t, a) != before+1 {
		t.Fatal(app.Message, len(fake.Presigned))
	}

}

func TestCreateUploadIntentHourlyAllowance(t *testing.T) {
	a, fake := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	small := []domain.UploadFile{{Role: "main", Position: 0, Mime: "image/jpeg", Bytes: 10}, {Role: "thumb", Position: 0, Mime: "image/jpeg", Bytes: 10}}
	// 42 parallel requests: the per-guest lock lets exactly 30 through.
	var wg sync.WaitGroup
	var mu sync.Mutex
	codes := map[string]int{}
	for range 42 {
		wg.Go(func() {
			_, err := a.CreateUploadIntent(bg, g, small)
			code := "ok"
			var app *httpx.AppError
			if errors.As(err, &app) {
				code = app.Code + " " + app.Message
			} else if err != nil {
				code = err.Error()
			}
			mu.Lock()
			codes[code]++
			mu.Unlock()
		})
	}
	wg.Wait()
	if codes["ok"] != domain.PostsPerHour || codes["rate_limited You’ve shared a lot in the last hour. Please try again a little later."] != 12 || len(fake.Presigned) != 60 {
		t.Fatalf("%v, %d presigned", codes, len(fake.Presigned))
	}
}

func TestCreateUploadIntentDropsTheIntentWhenPresigningFails(t *testing.T) {
	a, fake := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	fake.PresignErr = errors.New("no keys")
	before := countIntents(t, a)
	if _, err := a.CreateUploadIntent(bg, g, photo); err == nil || err.Error() != "no keys" {
		t.Fatal(err)
	}
	if countIntents(t, a) != before {
		t.Fatal("the intent was kept")
	}
}

func TestCreateUploadIntentNeedsAKnownType(t *testing.T) {
	a, _ := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	if _, err := a.CreateUploadIntent(bg, g, []domain.UploadFile{{Role: "main", Mime: "image/gif", Bytes: 1}}); err == nil {
		t.Fatal("no extension for an unvalidated type")
	}
}

func TestCancelUploadIntent(t *testing.T) {
	a, fake := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	res, _ := a.CreateUploadIntent(bg, g, photo)
	if err := a.CancelUploadIntent(bg, g, res.PostID); err != nil {
		t.Fatal(err)
	}
	row := loadIntent(t, a, res.PostID)
	if row == nil || row.cancelled == nil || len(fake.Deleted) != 2 || fake.Deleted[0] != row.files[0].Key || fake.Deleted[1] != row.files[1].Key {
		t.Fatalf("the row stays as a tombstone and its objects go: %+v %v", row, fake.Deleted)
	}
	// Cancelling twice is fine, and deletes nothing more.
	if err := a.CancelUploadIntent(bg, g, res.PostID); err != nil || len(fake.Deleted) != 2 {
		t.Fatal(err, fake.Deleted)
	}
	// Someone else's intent is not found.
	other := newGuest(t, a, "Yana")
	appError(t, a.CancelUploadIntent(bg, other, res.PostID), "intent_not_found", 404)
	appError(t, a.CancelUploadIntent(bg, g, "b0000000-0000-4000-8000-0000000000ff"), "intent_not_found", 404)
}

func TestCancelUploadIntentRefusesOncePosted(t *testing.T) {
	a, fake := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	res, _ := a.CreateUploadIntent(bg, g, photo)
	exec(t, a, "update upload_intents set consumed_at = now() where post_id = $1", res.PostID)
	app := appError(t, a.CancelUploadIntent(bg, g, res.PostID), "already_posted", 409)
	if app.Message != "That post is already on the wall." || len(fake.Deleted) != 0 {
		t.Fatal(app.Message, fake.Deleted)
	}
}

func TestCancelUploadIntentSurvivesR2Failure(t *testing.T) {
	a, fake := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	res, _ := a.CreateUploadIntent(bg, g, photo)
	fake.DeleteErr = errors.New("r2 down")
	if err := a.CancelUploadIntent(bg, g, res.PostID); err != nil {
		t.Fatal("the sweep removes the objects later", err)
	}
	// A malformed row is a server fault.
	exec(t, a, "update upload_intents set cancelled_at = null, files = '[{\"role\":\"main\"}]' where post_id = $1", res.PostID)
	if err := a.CancelUploadIntent(bg, g, res.PostID); err == nil || !strings.Contains(err.Error(), "malformed") {
		t.Fatal(err)
	}
}

func TestUploadDatabaseFailures(t *testing.T) {
	a, _ := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	ev, _ := a.Event(bg)
	a.DB.Close()
	cached := WithEventCache(bg)
	cached.Value(eventKey{}).(*eventCache).ev = ev
	if err := a.CancelUploadIntent(cached, g, "b0000000-0000-4000-8000-000000000001"); err == nil || !strings.Contains(err.Error(), "Cancelling the upload failed") {
		t.Fatal(err)
	}
	if _, err := a.CreateMediaPost(cached, g, "b0000000-0000-4000-8000-000000000001", nil); err == nil || !strings.Contains(err.Error(), "Loading the upload intent failed") {
		t.Fatal(err)
	}
	for _, err := range []error{
		func() error { _, err := a.CreateUploadIntent(bg, g, photo); return err }(),
		func() error { _, err := a.CreateWish(bg, g, "Congratulations"); return err }(),
	} {
		if err == nil {
			t.Fatal("no event without a database")
		}
	}
}
