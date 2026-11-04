package server

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/r2"
	"github.com/nkinu/wedding_celebration/backend/internal/testdb"
)

// Port of the createWish and createMediaPost parts of src/server/posts.test.ts, against the real
// create_wish / create_post_from_intent and a fake R2.

const postID = "d0000000-0000-4000-8000-000000000001"

func K(name string) string { return "events/" + testdb.EventID + "/" + postID + "/" + name }

func sf(role string, position int, name, mime string, bytes int64) domain.StoredFile {
	return domain.StoredFile{UploadFile: domain.UploadFile{Role: role, Position: position, Mime: mime, Bytes: bytes}, Key: K(name)}
}

func photoFiles() []domain.StoredFile {
	f := []domain.StoredFile{
		sf("main", 0, "0.jpg", "image/jpeg", 2*domain.MB),
		sf("thumb", 0, "0_thumb.jpg", "image/jpeg", 30_000),
		sf("main", 1, "1.jpg", "image/jpeg", 1*domain.MB),
		sf("thumb", 1, "1_thumb.jpg", "image/jpeg", 20_000),
	}
	f[0].Width, f[0].Height = ptr(2048), ptr(1536)
	return f
}

func videoFiles() []domain.StoredFile {
	f := []domain.StoredFile{sf("main", 0, "0.mp4", "video/mp4", 20*domain.MB), sf("poster", 0, "0_poster.jpg", "image/jpeg", 9000)}
	f[0].Width, f[0].Height, f[0].DurationS = ptr(1280), ptr(720), ptr(24.0)
	return f
}

// insertIntent stores an intent as /api/uploads would; extra is SQL for the other columns ("expires_at = ...").
func insertIntent(t *testing.T, a *App, g Guest, files []domain.StoredFile, extra string) {
	t.Helper()
	raw, _ := json.Marshal(files)
	exec(t, a, "insert into upload_intents (post_id, event_id, guest_id, files, expires_at) values ($1, $2, $3, $4, now() + interval '1 hour')",
		postID, testdb.EventID, g.ID, string(raw))
	if extra != "" {
		exec(t, a, "update upload_intents set "+extra+" where post_id = $1", postID)
	}
}

func uploaded(fake *r2.Fake, files []domain.StoredFile) {
	for _, f := range files {
		fake.Objects[f.Key] = r2.FakeObject{Bytes: f.Bytes, Mime: f.Mime}
	}
}

func mediaSetup(t *testing.T, files []domain.StoredFile) (*App, *r2.Fake, Guest) {
	t.Helper()
	a, fake := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	insertIntent(t, a, g, files, "")
	uploaded(fake, files)
	return a, fake, g
}

type storedPost struct {
	Type    string          `json:"type"`
	Caption *string         `json:"caption"`
	Media   json.RawMessage `json:"media"`
}

func loadPost(t *testing.T, a *App) *storedPost {
	t.Helper()
	var p storedPost
	err := a.DB.QueryRow(bg, `select type::text, caption, coalesce((select jsonb_agg(jsonb_build_object('position', position, 'kind', kind, 'path', path,
	    'thumb_path', thumb_path, 'poster_path', poster_path, 'width', width, 'height', height, 'duration_s', duration_s, 'bytes', bytes, 'mime', mime) order by position)
	    from post_media where post_id = p.id), '[]')::text from posts p where id = $1`, postID).Scan(&p.Type, &p.Caption, &p.Media)
	if isNoRows(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	return &p
}

func compact(s string) string { return strings.Join(strings.Fields(s), "") }

func TestCreateWish(t *testing.T) {
	a, _ := newUploadApp(t, nil)
	g := newGuest(t, a, "Zul")
	res, err := a.CreateWish(bg, g, "Selamat pengantin baru!")
	if err != nil || len(res.ID) != 36 {
		t.Fatal(res, err)
	}
	var text, typ string
	if err := a.DB.QueryRow(bg, "select wish_text, type::text from posts where id = $1 and guest_id = $2", res.ID, g.ID).Scan(&text, &typ); err != nil || text != "Selamat pengantin baru!" || typ != "wish" {
		t.Fatal(text, typ, err)
	}

	exec(t, a, "update events set uploads_open = false")
	_, err = a.CreateWish(WithEventCache(bg), g, "Congratulations")
	appError(t, err, "uploads_closed", 403)
	exec(t, a, "update events set uploads_open = true")

	for range domain.PostsPerHour - 1 {
		if _, err := a.CreateWish(bg, g, "Congratulations"); err != nil {
			t.Fatal(err)
		}
	}
	_, err = a.CreateWish(bg, g, "Congratulations")
	appError(t, err, "rate_limited", 429)

	if _, err := a.CreateWish(bg, Guest{ID: "00000000-0000-4000-8000-000000000000", EventID: testdb.EventID}, "Congratulations"); err == nil || !strings.Contains(err.Error(), "Creating the wish failed") {
		t.Fatal("any other database error fails loudly", err)
	}
}

func TestCreateMediaPostAlbum(t *testing.T) {
	a, _, g := mediaSetup(t, photoFiles())
	res, err := a.CreateMediaPost(bg, g, postID, ptr("Akad nikah"))
	if err != nil || res.ID != postID {
		t.Fatal(res, err)
	}
	p := loadPost(t, a)
	want := `[{"position":0,"kind":"image","path":"` + K("0.jpg") + `","thumb_path":"` + K("0_thumb.jpg") + `","poster_path":null,"width":2048,"height":1536,"duration_s":null,"bytes":2097152,"mime":"image/jpeg"},
	  {"position":1,"kind":"image","path":"` + K("1.jpg") + `","thumb_path":"` + K("1_thumb.jpg") + `","poster_path":null,"width":null,"height":null,"duration_s":null,"bytes":1048576,"mime":"image/jpeg"}]`
	if p.Type != "album" || *p.Caption != "Akad nikah" || !sameJSON(p.Media, want) {
		t.Fatalf("%s %v %s", p.Type, p.Caption, p.Media)
	}
	if row := loadIntent(t, a, postID); row.consumed == nil {
		t.Fatal("the intent is consumed")
	}
}

func sameJSON(got json.RawMessage, want string) bool {
	var g, w any
	_ = json.Unmarshal(got, &g)
	_ = json.Unmarshal([]byte(compact(want)), &w)
	gj, _ := json.Marshal(g)
	wj, _ := json.Marshal(w)
	return string(gj) == string(wj)
}

func TestCreateMediaPostVideo(t *testing.T) {
	a, _, g := mediaSetup(t, videoFiles())
	if _, err := a.CreateMediaPost(bg, g, postID, nil); err != nil {
		t.Fatal(err)
	}
	p := loadPost(t, a)
	want := `[{"position":0,"kind":"video","path":"` + K("0.mp4") + `","thumb_path":null,"poster_path":"` + K("0_poster.jpg") + `","width":1280,"height":720,"duration_s":24,"bytes":20971520,"mime":"video/mp4"}]`
	if p.Type != "video" || p.Caption != nil || !sameJSON(p.Media, want) {
		t.Fatalf("%s %s", p.Type, p.Media)
	}
}

func TestCreateMediaPostTypeFromTheIntent(t *testing.T) {
	a, _, g := mediaSetup(t, photoFiles()[:2])
	if _, err := a.CreateMediaPost(bg, g, postID, nil); err != nil || loadPost(t, a).Type != "photo" {
		t.Fatal(err)
	}
}

func TestCreateMediaPostNotThisGuests(t *testing.T) {
	a, _, _ := mediaSetup(t, photoFiles())
	_, err := a.CreateMediaPost(bg, newGuest(t, a, "Yana"), postID, nil)
	appError(t, err, "intent_not_found", 404)
}

func TestCreateMediaPostReplay(t *testing.T) {
	a, fake, g := mediaSetup(t, photoFiles())
	if _, err := a.CreateMediaPost(bg, g, postID, nil); err != nil {
		t.Fatal(err)
	}
	clear(fake.Objects) // a replay touches neither R2 nor the function
	exec(t, a, "update events set uploads_open = false")
	if res, err := a.CreateMediaPost(bg, g, postID, nil); err != nil || res.ID != postID {
		t.Fatal(res, err)
	}
}

func TestCreateMediaPostConcurrentSubmits(t *testing.T) {
	a, _, g := mediaSetup(t, photoFiles())
	var wg sync.WaitGroup
	errs := make([]error, 5)
	for i := range errs {
		wg.Go(func() { _, errs[i] = a.CreateMediaPost(bg, g, postID, nil) })
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var n int
	_ = a.DB.QueryRow(bg, "select count(*) from post_media where post_id = $1", postID).Scan(&n)
	if n != 2 {
		t.Fatal(n)
	}
}

func TestCreateMediaPostClosed(t *testing.T) {
	a, _, g := mediaSetup(t, photoFiles())
	exec(t, a, "update events set uploads_open = false")
	_, err := a.CreateMediaPost(bg, g, postID, nil)
	appError(t, err, "uploads_closed", 403)
}

func TestCreateMediaPostIncomplete(t *testing.T) {
	jpeg := r2.FakeObject{Bytes: 2 * domain.MB, Mime: "image/jpeg"}
	cases := map[string]func(map[string]r2.FakeObject){
		"never arrived": func(o map[string]r2.FakeObject) { delete(o, K("1_thumb.jpg")) },
		"other size":    func(o map[string]r2.FakeObject) { o[K("0.jpg")] = r2.FakeObject{Bytes: 5, Mime: "image/jpeg"} },
		"other type": func(o map[string]r2.FakeObject) {
			o[K("0.jpg")] = r2.FakeObject{Bytes: 2 * domain.MB, Mime: "text/html"}
		},
		"overridden": func(o map[string]r2.FakeObject) { j := jpeg; j.Overridden = true; o[K("0.jpg")] = j },
		"not a jpeg": func(o map[string]r2.FakeObject) {
			j := jpeg
			j.Start = []byte("<html>not a jpeg</html>")
			o[K("0.jpg")] = j
		},
	}
	for name, change := range cases {
		a, fake, g := mediaSetup(t, photoFiles())
		change(fake.Objects)
		_, err := a.CreateMediaPost(bg, g, postID, nil)
		if app := appError(t, err, "upload_incomplete", 400); app.Message != "Some files didn’t finish uploading. Please try again." || loadPost(t, a) != nil {
			t.Fatal(name)
		}
	}
}

func TestCreateMediaPostContentTypeParameters(t *testing.T) {
	a, fake, g := mediaSetup(t, photoFiles())
	fake.Objects[K("0.jpg")] = r2.FakeObject{Bytes: 2 * domain.MB, Mime: "Image/JPEG; charset=binary"}
	if _, err := a.CreateMediaPost(bg, g, postID, nil); err != nil {
		t.Fatal(err)
	}
}

func TestCreateMediaPostExpiredOrCancelled(t *testing.T) {
	for _, extra := range []string{"cancelled_at = now()", "expires_at = now() - interval '1 second'"} {
		a, fake := newUploadApp(t, nil)
		g := newGuest(t, a, "Zul")
		insertIntent(t, a, g, photoFiles(), extra)
		_, err := a.CreateMediaPost(bg, g, postID, nil)
		// The objects go now (nothing was uploaded here, so nothing was checked); the row stays and still counts.
		if app := appError(t, err, "intent_expired", 410); app.Message != "That took too long. Please choose your files again." || len(fake.Deleted) != 4 || loadIntent(t, a, postID) == nil {
			t.Fatal(extra, fake.Deleted)
		}
	}
}

// changedMidPost changes the database while the files are checked, so create_post_from_intent sees it.
func changedMidPost(t *testing.T, sql string) (*App, *r2.Fake, Guest, error) {
	t.Helper()
	a, fake, g := mediaSetup(t, photoFiles())
	var once sync.Once
	fake.OnHead = func(string) { once.Do(func() { exec(t, a, sql, postID) }) }
	_, err := a.CreateMediaPost(bg, g, postID, nil)
	return a, fake, g, err
}

func TestCreateMediaPostDatabaseRefusals(t *testing.T) {
	// PT410: cancelled after the check. The objects go, the tombstone stays.
	a, fake, _, err := changedMidPost(t, "update upload_intents set cancelled_at = now() where post_id = $1")
	if appError(t, err, "intent_expired", 410); len(fake.Deleted) != 4 || loadIntent(t, a, postID) == nil {
		t.Fatal(fake.Deleted)
	}
	// PT404: the intent went away.
	_, _, _, err = changedMidPost(t, "delete from upload_intents where post_id = $1")
	appError(t, err, "intent_not_found", 404)
	// PT400: the media no longer matches the intent's keys.
	_, _, _, err = changedMidPost(t, `update upload_intents set files = '[{"role":"main","position":0,"mime":"image/jpeg","bytes":1,"key":"other"}]' where post_id = $1`)
	appError(t, err, "invalid_media", 400)
	// PT409: a concurrent submit won.
	_, _, _, err = changedMidPost(t, "update upload_intents set consumed_at = now() where post_id = $1")
	if err != nil {
		t.Fatal(err)
	}
	// Anything else fails loudly and keeps the objects.
	_, fake, _, err = changedMidPost(t, "insert into posts (id, event_id, guest_id, type, wish_text) select $1, event_id, guest_id, 'wish', 'taken' from upload_intents where post_id = $1")
	if err == nil || !strings.Contains(err.Error(), "Creating the post failed") || len(fake.Objects) != 4 {
		t.Fatal(err)
	}
}

func TestCreateMediaPostInvalidMedia(t *testing.T) {
	odd := []domain.StoredFile{sf("main", 0, "0.mp4", "video/mp4", 10), sf("main", 1, "1.mp4", "video/mp4", 10)} // two videos
	a, _, g := mediaSetup(t, odd)
	_, err := a.CreateMediaPost(bg, g, postID, nil)
	appError(t, err, "invalid_media", 400)
}

func TestCreateMediaPostR2Failures(t *testing.T) {
	a, fake, g := mediaSetup(t, photoFiles())
	exec(t, a, "update upload_intents set files = '[{\"role\":\"main\"}]' where post_id = $1", postID)
	if _, err := a.CreateMediaPost(bg, g, postID, nil); err == nil || !strings.Contains(err.Error(), "malformed") {
		t.Fatal(err)
	}
	exec(t, a, "update upload_intents set cancelled_at = now(), files = $2 where post_id = $1", postID, jsonOf(photoFiles()))
	fake.DeleteErr = errBoom
	if _, err := a.CreateMediaPost(bg, g, postID, nil); err != errBoom {
		t.Fatal("an expired intent whose objects cannot be freed is a plain failure", err)
	}
	// R2 itself failing while the files are checked is a plain failure too.
	exec(t, a, "update upload_intents set cancelled_at = null where post_id = $1", postID)
	a.R2 = r2.New(r2.Config{Endpoint: "http://127.0.0.1:1", Bucket: "wedding", Region: "auto", AccessKeyID: "k", SecretAccessKey: "s"})
	if _, err := a.CreateMediaPost(bg, g, postID, nil); err == nil || errors.As(err, new(*httpx.AppError)) {
		t.Fatal(err)
	}
}

var errBoom = errors.New("boom")
