package server

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// App holds what every service needs. The pool connects as a role that bypasses RLS (ADR 004),
// so every query states its event and visibility rules itself.
type App struct {
	DB  *pgxpool.Pool
	Env Env
}

// OpenDB connects and checks the connection, so a wrong DATABASE_URL fails at start, not on the first guest.
func OpenDB(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL: %w", err)
	}
	ping, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(ping); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connecting to Postgres: %w", err)
	}
	return pool, nil
}

// pgCode is the SQLSTATE of a database error ("23505", or the migrations' own "PT429"...), or "".
func pgCode(err error) string {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		return pg.Code
	}
	return ""
}

func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// Event is the events row this deployment serves (docs/adr/002). Nullable columns are pointers.
type Event struct {
	ID            string
	GroomName     string
	BrideName     string
	HeaderMessage *string
	UploadsOpen   bool
	QRPath        *string
	QRAccountName *string
	QRBank        *string
	FontNames     *string
	FontWishes    *string
	FontBody      *string
	MonogramPath  *string
}

// EventColumns is every column the app reads from events, in Event's field order.
const EventColumns = "id, groom_name, bride_name, header_message, uploads_open, qr_path, qr_account_name, qr_bank, font_names, font_wishes, font_body, monogram_path"

// Fields are scan targets for EventColumns.
func (e *Event) Fields() []any {
	return []any{&e.ID, &e.GroomName, &e.BrideName, &e.HeaderMessage, &e.UploadsOpen, &e.QRPath, &e.QRAccountName, &e.QRBank, &e.FontNames, &e.FontWishes, &e.FontBody, &e.MonogramPath}
}

type eventKey struct{}

type eventCache struct {
	mu sync.Mutex
	ev *Event
}

// WithEventCache gives a request its own event cache: loaded once per request (React `cache` in
// the Next.js app), never across requests, so an admin edit shows on the next load.
func WithEventCache(ctx context.Context) context.Context {
	return context.WithValue(ctx, eventKey{}, &eventCache{})
}

// Event loads this deployment's event, once per request when the context carries a cache.
func (a *App) Event(ctx context.Context) (*Event, error) {
	cache, _ := ctx.Value(eventKey{}).(*eventCache)
	if cache != nil {
		cache.mu.Lock()
		defer cache.mu.Unlock()
		if cache.ev != nil {
			return cache.ev, nil
		}
	}
	var e Event
	err := a.DB.QueryRow(ctx, "select "+EventColumns+" from events where slug = $1", a.Env.EventSlug).Scan(e.Fields()...)
	if err != nil {
		return nil, fmt.Errorf("event %q not found: %w", a.Env.EventSlug, err)
	}
	if cache != nil {
		cache.ev = &e
	}
	return &e, nil
}

// MediaURL is the public URL of a stored key, or nil for none.
func (a *App) MediaURL(key *string) *string {
	if key == nil {
		return nil
	}
	base := a.Env.MediaBaseURL
	if len(base) > 0 && base[len(base)-1] == '/' { // one slash, like replace(/\/$/, "")
		base = base[:len(base)-1]
	}
	u := base + "/" + *key
	return &u
}
