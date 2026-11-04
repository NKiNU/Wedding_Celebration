// Package testdb gives a test its own database built from the real migrations, so the services
// are tested against the SQL functions they call (rate_limit_hit, the unique name index, ...).
// Set WM_TEST_DATABASE_URL to a Postgres superuser URL (CI runs a postgres service); without it the
// database tests skip (and fail in CI, where CI is set).
package testdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EventID is the seed's event (supabase/seed.sql, slug "demo").
const EventID = "e0000000-0000-4000-8000-000000000001"

// New creates a fresh database (shim, migrations, seed), returns a pool on it and drops it after the test.
func New(t *testing.T) *pgxpool.Pool {
	t.Helper()
	admin := os.Getenv("WM_TEST_DATABASE_URL")
	if admin == "" {
		if os.Getenv("CI") != "" { // a broken CI config must not go green with the database tests off
			t.Fatal("WM_TEST_DATABASE_URL is not set in CI")
		}
		t.Skip("WM_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	name := "wm_" + hex.EncodeToString(b)

	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, "create database "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = conn.Exec(context.Background(), "drop database "+name+" with (force)")
		_ = conn.Close(context.Background())
	})

	u, err := url.Parse(admin)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	cfg, err := pgxpool.ParseConfig(u.String())
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["timezone"] = "UTC" // as OpenDB: createdAt text is PostgREST's
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	_, here, _, _ := runtime.Caller(0)
	repo := filepath.Join(filepath.Dir(here), "..", "..", "..")
	migrations, _ := filepath.Glob(filepath.Join(repo, "supabase", "migrations", "*.sql"))
	sort.Strings(migrations)
	files := append(append([]string{filepath.Join(repo, "backend", "testdata", "supabase-shim.sql")}, migrations...), filepath.Join(repo, "supabase", "seed.sql"))
	c, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Release()
	for _, f := range files {
		sql, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		// Whole files with several statements: the simple protocol, as psql runs them.
		if _, err := c.Conn().PgConn().Exec(ctx, string(sql)).ReadAll(); err != nil {
			t.Fatalf("%s: %v", filepath.Base(f), err)
		}
	}
	return pool
}
