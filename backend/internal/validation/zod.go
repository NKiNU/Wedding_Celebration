// Package validation is the port of src/lib/validation.ts. Every function takes the raw JSON body (the
// bytes, or null when the body was missing or not JSON) and returns a typed value, or the AppError for
// the FIRST issue zod would report: fields in schema order, unknown keys dropped, object-level rules
// only once every field passed. The messages are zod 4's own.
package validation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
)

// decode reads the body as JavaScript's JSON.parse would; anything that is not one JSON value is null (nil).
func decode(raw json.RawMessage) any {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber() // 1.0 and 1e2 are integers in JS, so the digits are parsed as a float64 later
	var v any
	if dec.Decode(&v) != nil || dec.Decode(new(any)) != io.EOF {
		return nil
	}
	return v
}

// kind is what zod calls the type it received.
func kind(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	case json.Number:
		if f := toFloat(x); math.IsInf(f, 1) {
			return "Infinity"
		} else if math.IsInf(f, -1) {
			return "-Infinity"
		}
	}
	return "number"
}

// toFloat is JS Number(text): out of range becomes +-Infinity.
func toFloat(n json.Number) float64 {
	f, _ := strconv.ParseFloat(string(n), 64) // an ErrRange still returns +-Inf
	return f
}

func expected(want string, v any, present bool) string {
	if !present {
		return fmt.Sprintf("Invalid input: expected %s, received undefined", want)
	}
	return fmt.Sprintf("Invalid input: expected %s, received %s", want, kind(v))
}

// object checks the body is an object.
func object(v any) (map[string]any, string) {
	m, ok := v.(map[string]any)
	if !ok {
		return nil, expected("object", v, true)
	}
	return m, ""
}

// str reads a string field. optional: an absent key is fine (but null is not).
func str(m map[string]any, key string, optional bool) (s string, set bool, msg string) {
	v, present := m[key]
	if !present && optional {
		return "", false, ""
	}
	s, ok := v.(string)
	if !ok {
		return "", false, expected("string", v, present)
	}
	return s, true, ""
}

func tooBig(what string, max int) string {
	return fmt.Sprintf("Too big: expected %s to have <=%d characters", what, max)
}

// maxLen is zod's .max(n) on a string. zod 4.6 counts code points (older 4.x counted UTF-16 units);
// the golden vectors pin whichever the installed zod does.
func maxLen(s string, n int) string {
	if domain.CodePoints(s) > n {
		return tooBig("string", n)
	}
	return ""
}

func minLen1(s string) string {
	if s == "" {
		return "Too small: expected string to have >=1 characters"
	}
	return ""
}

// first is the earliest non-empty message.
func first(msgs ...string) string {
	for _, m := range msgs {
		if m != "" {
			return m
		}
	}
	return ""
}

// num reads a number field (any finite value; ints are checked by intMsg).
func num(m map[string]any, key string, optional bool) (f float64, set bool, msg string) {
	v, present := m[key]
	if !present && optional {
		return 0, false, ""
	}
	n, ok := v.(json.Number)
	if !ok {
		return 0, false, expected("number", v, present)
	}
	if f = toFloat(n); math.IsInf(f, 0) {
		return 0, false, expected("number", v, true)
	}
	return f, true, ""
}

const maxSafe = 9007199254740991

// intMsg is z.int(): a whole number inside the safe range.
func intMsg(f float64) string {
	switch {
	case f != math.Trunc(f):
		return "Invalid input: expected int, received number"
	case f > maxSafe:
		return fmt.Sprintf("Too big: expected int to be <=%d", int64(maxSafe))
	case f < -maxSafe:
		return fmt.Sprintf("Too small: expected int to be >=-%d", int64(maxSafe))
	}
	return ""
}

func positive(f float64) string {
	if f <= 0 {
		return "Too small: expected number to be >0"
	}
	return ""
}

func atLeast0(f float64) string {
	if f < 0 {
		return "Too small: expected number to be >=0"
	}
	return ""
}

func atMost(f float64, n int64) string {
	if f > float64(n) {
		return fmt.Sprintf("Too big: expected number to be <=%d", n)
	}
	return ""
}

// boolean reads a bool field.
func boolean(m map[string]any, key string, optional bool) (b bool, set bool, msg string) {
	v, present := m[key]
	if !present && optional {
		return false, false, ""
	}
	b, ok := v.(bool)
	if !ok {
		return false, false, expected("boolean", v, present)
	}
	return b, true, ""
}

// zod's z.uuid(): any RFC 9562 version, plus the nil and max UUIDs.
var uuidRe = regexp.MustCompile(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$`)

// uuid reads a z.uuid() field.
func uuid(m map[string]any, key string, optional bool) (s string, set bool, msg string) {
	s, set, msg = str(m, key, optional)
	if set && !uuidRe.MatchString(s) {
		return "", false, "Invalid UUID"
	}
	return s, set, msg
}
