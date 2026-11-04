package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/testdb"
)

// Port of src/server/identity.test.ts, against a real database built from the migrations.

func newApp(t *testing.T, over map[string]string) *App {
	t.Helper()
	pool := testdb.New(t)
	env, err := ParseEnv(valid(over))
	if err != nil {
		t.Fatal(err)
	}
	return &App{DB: pool, Env: env}
}

// phone keeps cookies between calls, like a browser.
type phone struct {
	cookies map[string]string // raw (escaped) values, as the browser stores them
	last    *httptest.ResponseRecorder
	secure  bool
}

func newPhone() *phone { return &phone{cookies: map[string]string{}} }

// jar is a Jar for one request; call done() afterwards to keep the cookies it set.
func (p *phone) jar() Jar {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	for k, v := range p.cookies {
		r.AddCookie(&http.Cookie{Name: k, Value: v})
	}
	p.last = httptest.NewRecorder()
	return Jar{W: p.last, R: r, Secure: p.secure}
}

func (p *phone) setCookies() []*http.Cookie {
	cs := (&http.Response{Header: p.last.Header()}).Cookies()
	for _, c := range cs {
		if c.MaxAge < 0 {
			delete(p.cookies, c.Name)
		} else {
			p.cookies[c.Name] = c.Value
		}
	}
	return cs
}

func (p *phone) join(t *testing.T, a *App, name string) (KnownGuest, error) {
	t.Helper()
	g, err := a.CreateGuest(context.Background(), name, p.jar())
	p.setCookies()
	return g, err
}

func appError(t *testing.T, err error, code string, status int) *httpx.AppError {
	t.Helper()
	var app *httpx.AppError
	if !errors.As(err, &app) || app.Code != code || app.Status != status {
		t.Fatalf("got %v, want %s %d", err, code, status)
	}
	return app
}

func TestCreateGuestStoresOnlyTheHash(t *testing.T) {
	a := newApp(t, nil)
	p := newPhone()
	g, err := a.CreateGuest(context.Background(), "Zara", p.jar())
	if err != nil || g.Name != "Zara" || g.GuestID == "" {
		t.Fatalf("%+v %v", g, err)
	}
	set := map[string]*http.Cookie{}
	for _, c := range p.setCookies() {
		set[c.Name] = c
	}
	for _, name := range []string{TokensCookie, ActiveCookie} {
		c := set[name]
		if c == nil || !c.HttpOnly || c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/" || c.MaxAge != 365*24*60*60 {
			t.Fatalf("%s: %+v", name, c)
		}
	}
	token := p.cookies[ActiveCookie]
	if len(token) != 43 { // 32 bytes, base64url without padding
		t.Fatalf("token %q", token)
	}
	var hash string
	if err := a.DB.QueryRow(context.Background(), "select token_hash from guests where id = $1", g.GuestID).Scan(&hash); err != nil || hash != HashToken(token, a.Env.DeviceTokenPepper) {
		t.Fatalf("hash %q %v", hash, err)
	}
	var raw int
	_ = a.DB.QueryRow(context.Background(), "select count(*) from guests where token_hash = $1 or name = $1", token).Scan(&raw)
	if raw != 0 {
		t.Fatal("the raw token is stored")
	}
	// wm_tokens is written the way Next.js wrote it (encodeURIComponent of the JSON).
	if want := "%5B%22" + token + "%22%5D"; p.cookies[TokensCookie] != want {
		t.Fatalf("wm_tokens %q, want %q", p.cookies[TokensCookie], want)
	}
}

func TestSecureCookiesInProductionOnly(t *testing.T) {
	a := newApp(t, map[string]string{"NODE_ENV": "production"})
	p := newPhone()
	p.secure = a.Env.Production
	if _, err := a.CreateGuest(context.Background(), "Zara", p.jar()); err != nil {
		t.Fatal(err)
	}
	for _, c := range p.setCookies() {
		if !c.Secure {
			t.Fatalf("%s is not Secure", c.Name)
		}
	}
}

func TestFiveNamesPerPhone(t *testing.T) {
	a := newApp(t, nil)
	p := newPhone()
	for _, n := range []string{"One", "Two", "Three", "Four", "Five", "Six"} {
		if _, err := p.join(t, a, n); err != nil {
			t.Fatal(err)
		}
	}
	s, err := a.GetSession(context.Background(), p.jar())
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, k := range s.Known {
		names = append(names, k.Name)
	}
	if strings.Join(names, ",") != "Two,Three,Four,Five,Six" || s.Active == nil || s.Active.Name != "Six" {
		t.Fatalf("%v active=%+v", names, s.Active)
	}
}

func TestNameTakenSuggestsFreeNames(t *testing.T) {
	a := newApp(t, nil)
	if _, err := newPhone().join(t, a, "Ali 2"); err != nil { // the seed already has "Ali"
		t.Fatal(err)
	}
	p := newPhone()
	_, err := p.join(t, a, "ali")
	taken := appError(t, err, "name_taken", 409)
	if got := strings.Join(taken.Details["suggestions"].([]string), "|"); got != "ali & family|ali 3" || taken.Message != "“ali” is already used by another guest. Add something to make it yours." {
		t.Fatalf("%s / %s", got, taken.Message)
	}
	if len(p.cookies) != 0 {
		t.Fatalf("cookies were set: %v", p.cookies)
	}
}

func TestSameNameRaceHasOneWinner(t *testing.T) {
	a := newApp(t, nil)
	var wg sync.WaitGroup
	var mu sync.Mutex
	wins, taken := 0, 0
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := a.CreateGuest(context.Background(), "Zara", newPhone().jar())
			mu.Lock()
			defer mu.Unlock()
			var app *httpx.AppError
			switch {
			case err == nil:
				wins++
			case errors.As(err, &app) && app.Code == "name_taken":
				taken++
			default:
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if wins != 1 || taken != 19 {
		t.Fatalf("wins=%d taken=%d", wins, taken)
	}
}

func TestSessionAndSwitchName(t *testing.T) {
	a := newApp(t, nil)
	p := newPhone()
	if s, err := a.GetSession(context.Background(), p.jar()); err != nil || s.Active != nil || len(s.Known) != 0 {
		t.Fatalf("empty phone: %+v %v", s, err)
	}
	ali, _ := p.join(t, a, "Ali Baba")
	siti, _ := p.join(t, a, "Siti Nur")

	ClearActive(p.jar())
	p.setCookies()
	s, _ := a.GetSession(context.Background(), p.jar())
	if s.Active != nil || len(s.Known) != 2 {
		t.Fatalf("after Switch name: %+v", s)
	}

	_, err := a.ActivateGuest(context.Background(), "a0000000-0000-4000-8000-000000000003", p.jar()) // the seed's Ali
	appError(t, err, "unknown_guest", 403)
	g, err := a.ActivateGuest(context.Background(), ali.GuestID, p.jar())
	p.setCookies()
	if err != nil || g != ali {
		t.Fatalf("%+v %v", g, err)
	}
	if s, _ = a.GetSession(context.Background(), p.jar()); s.Active == nil || *s.Active != ali || s.Known[1] != siti {
		t.Fatalf("%+v", s)
	}
}

func TestTamperedCookies(t *testing.T) {
	a := newApp(t, nil)
	p := newPhone()
	if _, err := p.join(t, a, "Zara"); err != nil {
		t.Fatal(err)
	}
	token := p.cookies[ActiveCookie]
	for name, value := range map[string]string{
		"not JSON":    "%5Bnope",
		"not strings": "%5B1%5D",
		"empty token": "%5B%22%22%5D",
		"bad escape":  "%E0%A4%A",
		"bad UTF-8":   "%FF",
		"six tokens":  "%5B%22a%22%2C%22b%22%2C%22c%22%2C%22d%22%2C%22e%22%2C%22" + token + "%22%5D",
		"object":      "%7B%7D",
	} {
		p.cookies[TokensCookie] = value
		if s, err := a.GetSession(context.Background(), p.jar()); err != nil || s.Active != nil || len(s.Known) != 0 {
			t.Fatalf("%s: %+v %v", name, s, err)
		}
	}
	// An active token the phone does not hold in wm_tokens is not an identity on this screen.
	p.cookies[TokensCookie] = "%5B%5D"
	if s, _ := a.GetSession(context.Background(), p.jar()); s.Active != nil {
		t.Fatalf("%+v", s)
	}
}

func TestRequireGuest(t *testing.T) {
	a := newApp(t, nil)
	p := newPhone()
	_, err := a.RequireGuest(context.Background(), p.jar())
	appError(t, err, "no_session", 401)
	p.cookies[ActiveCookie] = "made-up"
	_, err = a.RequireGuest(context.Background(), p.jar())
	appError(t, err, "no_session", 401)

	zara, _ := p.join(t, a, "Zara")
	g, err := a.RequireGuest(context.Background(), p.jar())
	if err != nil || g.ID != zara.GuestID || g.Name != "Zara" || g.EventID != testdb.EventID {
		t.Fatalf("%+v %v", g, err)
	}
}

func TestThrottleGuestJoin(t *testing.T) {
	a := newApp(t, map[string]string{"GUEST_JOINS_PER_IP": "2"})
	from := func(ip string) http.Header { return http.Header{"X-Real-Ip": {ip}} }
	for i := 0; i < 2; i++ {
		if err := a.ThrottleGuestJoin(context.Background(), from("2001:db8:1:2::1")); err != nil {
			t.Fatal(err)
		}
	}
	// Same /64, another address: the same caller.
	err := a.ThrottleGuestJoin(context.Background(), from("2001:db8:1:2:ffff::9"))
	appError(t, err, "rate_limited", 429)
	if err := a.ThrottleGuestJoin(context.Background(), from("9.9.9.9")); err != nil {
		t.Fatalf("another address: %v", err)
	}
	var stored string
	_ = a.DB.QueryRow(context.Background(), "select key_hash from rate_attempts where scope = 'guest_join' limit 1").Scan(&stored)
	if strings.Contains(stored, "2001") || stored != IPHash("2001:db8:1:2::1", a.Env.DeviceTokenPepper) {
		t.Fatalf("stored key %q", stored)
	}
}

func TestEventIsLoadedOncePerRequest(t *testing.T) {
	a := newApp(t, nil)
	req := WithEventCache(context.Background())
	first, err := a.Event(req)
	if err != nil || first.GroomName == "" {
		t.Fatal(err)
	}
	if _, err := a.DB.Exec(context.Background(), "update events set groom_name = 'Changed'"); err != nil {
		t.Fatal(err)
	}
	if again, _ := a.Event(req); again.GroomName != first.GroomName {
		t.Fatal("reloaded within one request")
	}
	if next, _ := a.Event(WithEventCache(context.Background())); next.GroomName != "Changed" {
		t.Fatal("cached across requests")
	}
	a.Env.EventSlug = "missing"
	if _, err := a.Event(context.Background()); err == nil {
		t.Fatal("a missing event must fail")
	}
}

func TestOpenDB(t *testing.T) {
	if _, err := OpenDB(context.Background(), "::not a url"); err == nil {
		t.Fatal("bad URL accepted")
	}
	if _, err := OpenDB(context.Background(), "postgres://nobody@127.0.0.1:1/x?connect_timeout=1"); err == nil {
		t.Fatal("unreachable database accepted")
	}
	pool := testdb.New(t)
	if p, err := OpenDB(context.Background(), pool.Config().ConnString()); err != nil {
		t.Fatal(err)
	} else {
		p.Close()
	}
}

func TestDatabaseFailuresAreUnexpectedErrors(t *testing.T) {
	a := newApp(t, nil)
	p := newPhone()
	if _, err := p.join(t, a, "Zara"); err != nil {
		t.Fatal(err)
	}
	ev, _ := a.Event(context.Background())
	a.DB.Close()
	ctx := context.Background()
	cached := WithEventCache(ctx)
	cache := cached.Value(eventKey{}).(*eventCache)
	cache.ev = ev // the event is cached, so the services reach their own queries
	checks := map[string]error{}
	_, checks["session"] = a.GetSession(cached, p.jar())
	_, checks["activate"] = a.ActivateGuest(cached, "x", p.jar())
	_, checks["require"] = a.RequireGuest(cached, p.jar())
	_, checks["create"] = a.CreateGuest(cached, "Zara 2", p.jar())
	checks["throttle"] = a.ThrottleGuestJoin(cached, http.Header{})
	_, checks["event"] = a.PublicEvent(ctx)
	for name, err := range checks {
		var app *httpx.AppError
		if err == nil || errors.As(err, &app) {
			t.Fatalf("%s: %v, want an unexpected error", name, err)
		}
	}
	// No database at all: the 409 still answers, with unchecked suggestions (nameTakenError logs).
	taken := a.nameTakenError(ctx, testdb.EventID, "Ali")
	if strings.Join(taken.Details["suggestions"].([]string), "|") != "Ali 2|Ali & family" {
		t.Fatalf("%+v", taken.Details)
	}
}

func TestPublicEvent(t *testing.T) {
	a := newApp(t, map[string]string{"NEXT_PUBLIC_MEDIA_BASE_URL": "https://media.example.com/"})
	if _, err := a.DB.Exec(context.Background(), "update events set monogram_path = 'events/x/admin/monogram-1.png', qr_path = 'events/x/admin/qr-1.png', font_names = 'lora'"); err != nil {
		t.Fatal(err)
	}
	e, err := a.PublicEvent(context.Background())
	if err != nil || e.ID != testdb.EventID || e.MonogramURL == nil || *e.MonogramURL != "https://media.example.com/events/x/admin/monogram-1.png" ||
		!e.QR.Available || e.Fonts.Names == nil || *e.Fonts.Names != "lora" || e.Fonts.Body != nil {
		t.Fatalf("%+v %v", e, err)
	}
	if a.MediaURL(nil) != nil {
		t.Fatal("no key, no URL")
	}
}
