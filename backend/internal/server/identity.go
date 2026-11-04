package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
)

// Port of src/server/identity.ts. CLAUDE.md "Identity: name only" [rule]: ownership is by token,
// never by name; only sha256(token + pepper) is stored.

const (
	TokensCookie = "wm_tokens" // raw tokens of every name created on this phone (JSON array, max 5)
	ActiveCookie = "wm_active" // the raw token of the current identity
	cookieMaxAge = 365 * 24 * 60 * 60
)

// Jar reads the request's cookies and writes the response's, with the attributes the Next.js app used.
type Jar struct {
	W      http.ResponseWriter
	R      *http.Request
	Secure bool // NODE_ENV=production; Secure cookies are dropped over plain http (a phone on the LAN)
}

// Get is the cookie's value. Next.js wrote values with encodeURIComponent and read them back with
// decodeURIComponent, so cookies already on guests' phones decode the same way.
func (j Jar) Get(name string) (string, bool) {
	c, err := j.R.Cookie(name)
	if err != nil {
		return "", false
	}
	// decodeURIComponent throws on a bad escape or invalid UTF-8, and Next then skips the cookie.
	v, err := url.PathUnescape(c.Value)
	if err != nil || !utf8.ValidString(v) {
		return "", false
	}
	return v, true
}

// Set writes an httpOnly, SameSite=Lax cookie for a year. Go's net/http drops `"` and `,` from a raw
// value, which would break the JSON in wm_tokens: escape it as encodeURIComponent does. Our values
// are base64url tokens and JSON arrays of them, where QueryEscape and encodeURIComponent agree.
func (j Jar) Set(name, value string) {
	http.SetCookie(j.W, &http.Cookie{
		Name: name, Value: url.QueryEscape(value), Path: "/", MaxAge: cookieMaxAge,
		Expires:  time.Now().Add(cookieMaxAge * time.Second),
		HttpOnly: true, Secure: j.Secure, SameSite: http.SameSiteLaxMode,
	})
}

// Delete expires the cookie (Next.js: empty value, Expires in 1970).
func (j Jar) Delete(name string) {
	http.SetCookie(j.W, &http.Cookie{Name: name, Path: "/", MaxAge: -1, Expires: time.Unix(0, 0)})
}

// HashToken is what the guests table stores instead of the token.
func HashToken(token, pepper string) string {
	sum := sha256.Sum256([]byte(token + pepper))
	return hex.EncodeToString(sum[:])
}

// ReadTokens is the phone's tokens, or none when the cookie is missing or has been tampered with.
func ReadTokens(j Jar) []string {
	raw, _ := j.Get(TokensCookie)
	var tokens []string
	if json.Unmarshal([]byte(raw), &tokens) != nil || len(tokens) > domain.MaxNamesPerPhone {
		return nil
	}
	for _, t := range tokens {
		if t == "" {
			return nil
		}
	}
	return tokens
}

// KnownGuest is a name this phone holds a token for.
type KnownGuest struct {
	GuestID string `json:"guestId"`
	Name    string `json:"name"`
}

// Session is GET /api/session.
type Session struct {
	Active *KnownGuest  `json:"active"`
	Known  []KnownGuest `json:"known"`
}

type held struct {
	token string
	guest KnownGuest
}

// guestsOnThisPhone is the guests this phone holds a token for, in cookie order.
func (a *App) guestsOnThisPhone(ctx context.Context, j Jar) ([]held, error) {
	tokens := ReadTokens(j)
	if len(tokens) == 0 {
		return nil, nil
	}
	event, err := a.Event(ctx)
	if err != nil {
		return nil, err
	}
	hashes := make([]string, len(tokens))
	for i, t := range tokens {
		hashes[i] = HashToken(t, a.Env.DeviceTokenPepper)
	}
	rows, err := a.DB.Query(ctx, "select id, name, token_hash from guests where event_id = $1 and token_hash = any($2)", event.ID, hashes)
	if err != nil {
		return nil, fmt.Errorf("loading guests: %w", err)
	}
	byHash := map[string]KnownGuest{}
	for rows.Next() {
		var g KnownGuest
		var hash string
		if err := rows.Scan(&g.GuestID, &g.Name, &hash); err != nil {
			return nil, err
		}
		byHash[hash] = g
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("loading guests: %w", err)
	}
	var out []held
	for i, t := range tokens {
		if g, ok := byHash[hashes[i]]; ok {
			out = append(out, held{t, g})
		}
	}
	return out, nil
}

// GetSession is who this phone is, and every name it can continue as.
func (a *App) GetSession(ctx context.Context, j Jar) (Session, error) {
	all, err := a.guestsOnThisPhone(ctx, j)
	if err != nil {
		return Session{}, err
	}
	activeToken, hasActive := j.Get(ActiveCookie)
	s := Session{Known: []KnownGuest{}}
	for _, h := range all {
		if s.Active == nil && hasActive && h.token == activeToken {
			g := h.guest
			s.Active = &g
		}
		s.Known = append(s.Known, h.guest)
	}
	return s, nil
}

// escapeLike makes a name a literal ILIKE prefix.
var escapeLike = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace

func (a *App) nameTakenError(ctx context.Context, eventID, name string) *httpx.AppError {
	// Every suggestion starts with the name, so a prefix match finds all that could be taken.
	taken := map[string]bool{}
	rows, err := a.DB.Query(ctx, "select name from guests where event_id = $1 and name ilike $2 limit 200", eventID, escapeLike(name)+"%")
	if err == nil {
		for rows.Next() {
			var n string
			if err = rows.Scan(&n); err != nil {
				break
			}
			taken[domain.JSLower(n)] = true
		}
		rows.Close()
		if err == nil {
			err = rows.Err()
		}
	}
	// The 409 matters more than perfect suggestions: if the lookup fails, offer them unchecked.
	if err != nil {
		slog.Error("Loading taken names failed", "err", err)
	}
	return &httpx.AppError{
		Code: "name_taken", Status: http.StatusConflict,
		Message: "“" + name + "” is already used by another guest. Add something to make it yours.",
		Details: map[string]any{"suggestions": domain.SuggestNames(name, taken)},
	}
}

// CreateGuest creates a guest from an already validated name and signs this phone in as them.
func (a *App) CreateGuest(ctx context.Context, name string, j Jar) (KnownGuest, error) {
	event, err := a.Event(ctx)
	if err != nil {
		return KnownGuest{}, err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return KnownGuest{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	var g KnownGuest
	err = a.DB.QueryRow(ctx, "insert into guests (event_id, name, token_hash) values ($1, $2, $3) returning id, name",
		event.ID, name, HashToken(token, a.Env.DeviceTokenPepper)).Scan(&g.GuestID, &g.Name)
	if pgCode(err) == "23505" {
		return KnownGuest{}, a.nameTakenError(ctx, event.ID, name)
	}
	if err != nil {
		return KnownGuest{}, fmt.Errorf("creating guest: %w", err)
	}
	tokens, _ := json.Marshal(domain.AddToken(ReadTokens(j), token))
	j.Set(TokensCookie, string(tokens))
	j.Set(ActiveCookie, token)
	return g, nil
}

// Guest is the guest behind a request.
type Guest struct {
	ID      string
	Name    string
	EventID string
}

// RequireGuest is the guest behind this request. Every write goes through here.
func (a *App) RequireGuest(ctx context.Context, j Jar) (Guest, error) {
	noSession := &httpx.AppError{Code: "no_session", Status: http.StatusUnauthorized, Message: "Please enter your name again."}
	token, ok := j.Get(ActiveCookie)
	if !ok || token == "" {
		return Guest{}, noSession
	}
	event, err := a.Event(ctx)
	if err != nil {
		return Guest{}, err
	}
	g := Guest{EventID: event.ID}
	err = a.DB.QueryRow(ctx, "select id, name from guests where event_id = $1 and token_hash = $2",
		event.ID, HashToken(token, a.Env.DeviceTokenPepper)).Scan(&g.ID, &g.Name)
	if err != nil {
		if isNoRows(err) {
			return Guest{}, noSession
		}
		return Guest{}, fmt.Errorf("loading the guest: %w", err)
	}
	return g, nil
}

// ActivateGuest is "Continue as X": only a guest this phone holds a token for can become active.
func (a *App) ActivateGuest(ctx context.Context, guestID string, j Jar) (KnownGuest, error) {
	all, err := a.guestsOnThisPhone(ctx, j)
	if err != nil {
		return KnownGuest{}, err
	}
	for _, h := range all {
		if h.guest.GuestID == guestID {
			j.Set(ActiveCookie, h.token)
			return h.guest, nil
		}
	}
	return KnownGuest{}, &httpx.AppError{Code: "unknown_guest", Status: http.StatusForbidden, Message: "This phone doesn’t remember that name."}
}

// ClearActive is "Switch name": the guest, their posts and their token stay.
func ClearActive(j Jar) { j.Delete(ActiveCookie) }
