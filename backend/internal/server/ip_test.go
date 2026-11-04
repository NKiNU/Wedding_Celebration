package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Port of src/server/ip.test.ts, plus the golden vectors from the real bucketOf / clientIp.

func golden[T any](t *testing.T, name string) []struct {
	Input  T       `json:"input"`
	Output *string `json:"output"`
} {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "testdata", "golden", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input  T       `json:"input"`
		Output *string `json:"output"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil || len(cases) == 0 {
		t.Fatalf("%s: %d cases, %v", name, len(cases), err)
	}
	return cases
}

func TestBucketOfGolden(t *testing.T) {
	for _, c := range golden[string](t, "bucket-of") {
		if got := BucketOf(c.Input); got != *c.Output {
			t.Fatalf("BucketOf(%q) = %q, want %q", c.Input, got, *c.Output)
		}
	}
}

func TestClientIPGolden(t *testing.T) {
	for _, c := range golden[map[string]string](t, "client-ip") {
		h := http.Header{}
		for k, v := range c.Input {
			h.Set(k, strings.Trim(v, " \t")) // the HTTP parser trims header values, like Headers does
		}
		got, ok := ClientIP(h)
		if want := c.Output; (want == nil) == ok || (want != nil && got != *want) {
			t.Fatalf("ClientIP(%v) = %q %v, want %v", c.Input, got, ok, want)
		}
	}
}

func TestIPHash(t *testing.T) {
	const pepper = "pppppppppppppppppppppppppppppppp"
	h := IPHash("9.9.9.9", pepper)
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(h) || h != IPHash("9.9.9.9", pepper) || h == IPHash("9.9.9.8", pepper) {
		t.Fatal("not a stable hash of the address")
	}
	if IPHash("2001:db8:1:2:aaaa::1", pepper) != IPHash("2001:db8:1:2:bbbb::9", pepper) || IPHash("2001:db8:1:3::1", pepper) == IPHash("2001:db8:1:2::1", pepper) {
		t.Fatal("an IPv6 /64 is one bucket")
	}
	if IPHash("", pepper) != IPHash("unknown", pepper) {
		t.Fatal("no address shares the unknown bucket")
	}
}
