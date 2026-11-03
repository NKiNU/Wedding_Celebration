package domain

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"
)

// The cursor ends up in a keyset query, so decoding is strict: only a Postgres-style timestamp and a
// UUID get through (src/lib/domain/posts.ts).
var (
	timestampRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$`)
	uuidRe      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

// Cursor is a decoded keyset position.
type Cursor struct {
	CreatedAt string
	ID        string
}

// EncodeCursor is base64url without padding of the JSON ["<createdAt>","<id>"].
func EncodeCursor(createdAt, id string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode([]string{createdAt, id}) // two strings cannot fail
	return base64.RawURLEncoding.EncodeToString(bytes.TrimSuffix(buf.Bytes(), []byte("\n")))
}

// DecodeCursor returns nil for anything that is not a cursor EncodeCursor could have made. The base64
// step follows atob (what the TypeScript uses): either alphabet, ASCII whitespace ignored, padding optional.
func DecodeCursor(cursor string) *Cursor {
	s := strings.NewReplacer("-", "+", "_", "/").Replace(cursor)
	s = strings.NewReplacer("\t", "", "\n", "", "\f", "", "\r", "", " ", "").Replace(s)
	if len(s)%4 == 0 {
		s = strings.TrimSuffix(strings.TrimSuffix(s, "="), "=")
	}
	if len(s)%4 == 1 || strings.ContainsFunc(s, notBase64) {
		return nil
	}
	raw, err := base64.RawStdEncoding.DecodeString(s)
	if err != nil {
		return nil
	}
	var parsed []any
	if json.Unmarshal(raw, &parsed) != nil || len(parsed) != 2 {
		return nil
	}
	createdAt, ok1 := parsed[0].(string)
	id, ok2 := parsed[1].(string)
	if !ok1 || !ok2 || !timestampRe.MatchString(createdAt) || !uuidRe.MatchString(id) {
		return nil
	}
	return &Cursor{CreatedAt: createdAt, ID: id}
}

func notBase64(r rune) bool {
	return !(r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '+' || r == '/')
}
