// Package server holds the services; env is the validated config (port of src/lib/validation.ts parseEnv).
package server

import (
	"errors"
	"net/url"
	"strconv"
	"strings"
)

// Defaults from src/lib/domain/limits.ts.
const (
	defaultGuestJoinsPerIP = 300
	defaultMaxEventMB      = 9 * 1024
)

// Env is the server config. The Next.js-only variables (anon key, service-role key) are not read here:
// the browser keeps using the anon key for Realtime, and Postgres is reached through DATABASE_URL (ADR 004).
type Env struct {
	DatabaseURL       string
	AdminPasscode     string
	DeviceTokenPepper string
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Bucket          string
	R2Endpoint        string // dev only; empty means unset
	R2Region          string
	MediaBaseURL      string // NEXT_PUBLIC_MEDIA_BASE_URL
	EventSlug         string
	CronSecret        string
	GuestJoinsPerIP   int
	MaxEventMB        int
	Production        bool // NODE_ENV=production: Secure cookies, no remote R2_ENDPOINT
}

// ParseEnv validates the variables, failing with every offending name in one error.
func ParseEnv(get func(string) string) (Env, error) {
	var bad []string
	str := func(name string, min int) string {
		v := get(name)
		if len([]rune(v)) < min { // zod counts UTF-16 units; secrets are ASCII in practice
			bad = append(bad, name)
		}
		return v
	}
	link := func(name string, optional bool) string {
		v := get(name)
		if v == "" && optional {
			return ""
		}
		if !isURL(v) {
			bad = append(bad, name)
		}
		return v
	}
	limit := func(name string, fallback int) int {
		v := get(name)
		if v == "" {
			return fallback
		}
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil || n <= 0 || n > 1_000_000 {
			bad = append(bad, name)
		}
		return n
	}

	e := Env{
		DatabaseURL:       str("DATABASE_URL", 1),
		AdminPasscode:     str("ADMIN_PASSCODE", 8),
		DeviceTokenPepper: str("DEVICE_TOKEN_PEPPER", 32),
		R2AccountID:       str("R2_ACCOUNT_ID", 1),
		R2AccessKeyID:     str("R2_ACCESS_KEY_ID", 1),
		R2SecretAccessKey: str("R2_SECRET_ACCESS_KEY", 1),
		R2Bucket:          str("R2_BUCKET", 1),
		R2Endpoint:        link("R2_ENDPOINT", true),
		R2Region:          get("R2_REGION"),
		MediaBaseURL:      link("NEXT_PUBLIC_MEDIA_BASE_URL", false),
		EventSlug:         str("EVENT_SLUG", 1),
		CronSecret:        str("CRON_SECRET", 16),
		GuestJoinsPerIP:   limit("GUEST_JOINS_PER_IP", defaultGuestJoinsPerIP),
		MaxEventMB:        limit("MAX_EVENT_MB", defaultMaxEventMB),
		Production:        get("NODE_ENV") == "production",
	}
	if e.R2Region == "" {
		e.R2Region = "auto"
	}
	if len(bad) > 0 {
		return Env{}, errors.New("Invalid environment: " + strings.Join(bad, ", "))
	}
	// The dev endpoint would send guest uploads to whatever store it names; production may only use this machine.
	if e.R2Endpoint != "" && e.Production && !isLoopback(e.R2Endpoint) {
		return Env{}, errors.New("Invalid environment: R2_ENDPOINT must not be set in production")
	}
	return e, nil
}

func isURL(v string) bool {
	u, err := url.Parse(v)
	return err == nil && u.Scheme != "" && u.Host != ""
}

func isLoopback(v string) bool {
	u, err := url.Parse(v)
	if err != nil {
		return false
	}
	switch u.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}
