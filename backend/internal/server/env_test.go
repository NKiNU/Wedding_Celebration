package server

import (
	"strings"
	"testing"
)

// valid mirrors tests/fixtures/env.ts, with DATABASE_URL in place of the service-role key.
func valid(over map[string]string) func(string) string {
	m := map[string]string{
		"DATABASE_URL":               "postgres://postgres:postgres@127.0.0.1:54322/postgres",
		"ADMIN_PASSCODE":             "letmein-123",
		"DEVICE_TOKEN_PEPPER":        strings.Repeat("p", 32),
		"R2_ACCOUNT_ID":              "acct",
		"R2_ACCESS_KEY_ID":           "key",
		"R2_SECRET_ACCESS_KEY":       "secret",
		"R2_BUCKET":                  "wedding",
		"NEXT_PUBLIC_MEDIA_BASE_URL": "https://media.example.com",
		"EVENT_SLUG":                 "demo",
		"CRON_SECRET":                strings.Repeat("c", 16),
	}
	for k, v := range over {
		m[k] = v
	}
	return func(k string) string { return m[k] }
}

func mustFail(t *testing.T, over map[string]string, want string) {
	t.Helper()
	if _, err := ParseEnv(valid(over)); err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("ParseEnv(%v) error = %v, want it to name %s", over, err, want)
	}
}

func TestParseEnvValid(t *testing.T) {
	e, err := ParseEnv(valid(nil))
	if err != nil {
		t.Fatal(err)
	}
	if e.EventSlug != "demo" || e.R2Region != "auto" || e.GuestJoinsPerIP != 300 || e.MaxEventMB != 9216 || e.Production {
		t.Fatalf("unexpected %+v", e)
	}
}

func TestParseEnvRefusesBadValues(t *testing.T) {
	mustFail(t, map[string]string{"ADMIN_PASSCODE": ""}, "ADMIN_PASSCODE")
	mustFail(t, map[string]string{"ADMIN_PASSCODE": "1234567"}, "ADMIN_PASSCODE")
	mustFail(t, map[string]string{"DEVICE_TOKEN_PEPPER": "short"}, "DEVICE_TOKEN_PEPPER")
	mustFail(t, map[string]string{"NEXT_PUBLIC_MEDIA_BASE_URL": "nope"}, "NEXT_PUBLIC_MEDIA_BASE_URL")
	mustFail(t, map[string]string{"CRON_SECRET": "short"}, "CRON_SECRET")
	mustFail(t, map[string]string{"DATABASE_URL": ""}, "DATABASE_URL")
	mustFail(t, map[string]string{"R2_ENDPOINT": "not a url"}, "R2_ENDPOINT")
	// every offending name, in one error
	mustFail(t, map[string]string{"R2_BUCKET": "", "EVENT_SLUG": ""}, "R2_BUCKET, EVENT_SLUG")
}

func TestParseEnvEmptyMeansUnset(t *testing.T) {
	e, err := ParseEnv(valid(map[string]string{"R2_ENDPOINT": "", "R2_REGION": "", "MAX_EVENT_MB": ""}))
	if err != nil || e.R2Endpoint != "" || e.R2Region != "auto" || e.MaxEventMB != 9216 {
		t.Fatalf("got %+v, %v", e, err)
	}
}

func TestParseEnvLimits(t *testing.T) {
	e, err := ParseEnv(valid(map[string]string{"GUEST_JOINS_PER_IP": "5000"}))
	if err != nil || e.GuestJoinsPerIP != 5000 {
		t.Fatalf("got %+v, %v", e, err)
	}
	for _, bad := range []string{"0", "-1", "1.5", "lots", "99999999999"} {
		mustFail(t, map[string]string{"GUEST_JOINS_PER_IP": bad}, "GUEST_JOINS_PER_IP")
	}
}

func TestParseEnvDevEndpoint(t *testing.T) {
	remote := "https://store.example.com/s3"
	if e, err := ParseEnv(valid(map[string]string{"R2_ENDPOINT": remote, "NODE_ENV": "development"})); err != nil || e.R2Endpoint != remote {
		t.Fatalf("outside production: %+v, %v", e, err)
	}
	mustFail(t, map[string]string{"R2_ENDPOINT": remote, "NODE_ENV": "production"}, "R2_ENDPOINT")
	for _, local := range []string{"http://127.0.0.1:54321/storage/v1/s3", "http://localhost:9000", "http://[::1]:9000"} {
		e, err := ParseEnv(valid(map[string]string{"R2_ENDPOINT": local, "NODE_ENV": "production"}))
		if err != nil || e.R2Endpoint != local || !e.Production {
			t.Fatalf("loopback %s in production: %+v, %v", local, e, err)
		}
	}
}
