package domain

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// Golden vectors come from the real TypeScript (`npm run golden`), so these tests prove parity.

type goldenCase struct {
	Input  json.RawMessage `json:"input"`
	Output json.RawMessage `json:"output"`
}

func load(t *testing.T, name string) []goldenCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "testdata", "golden", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []goldenCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatalf("%s: no cases", name)
	}
	return cases
}

func into[T any](t *testing.T, raw json.RawMessage) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	return v
}

// nullable reads a string-or-null output; null is "".
func nullable(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	if string(raw) == "null" {
		return ""
	}
	return into[string](t, raw)
}

// each runs fn over every case of a golden file, failing with the case input.
func each(t *testing.T, name string, fn func(c goldenCase) (got, want any)) {
	t.Helper()
	for _, c := range load(t, name) {
		if got, want := fn(c); !reflect.DeepEqual(got, want) {
			t.Errorf("%s %.200s: got %q, want %q", name, c.Input, got, want)
		}
	}
}

func TestLimits(t *testing.T) {
	ms := func(d time.Duration) float64 { return float64(d.Milliseconds()) }
	want := map[string]any{
		"MB": float64(MB), "MAX_PHOTOS": float64(MaxPhotos), "MAX_VIDEO_BYTES": float64(MaxVideoBytes), "MAX_VIDEO_SECONDS": float64(MaxVideoSeconds),
		"POSTS_PER_HOUR": float64(PostsPerHour), "BYTES_PER_HOUR": float64(BytesPerHour), "PAGE_SIZE": float64(PageSize), "TICKER_WISHES": float64(TickerWishes),
		"MY_POSTS_MAX": float64(MyPostsMax), "NAME_MIN": float64(NameMin), "NAME_MAX": float64(NameMax), "MAX_NAMES_PER_PHONE": float64(MaxNamesPerPhone),
		"MAX_PHOTO_BYTES": float64(MaxPhotoBytes), "MAX_AUX_IMAGE_BYTES": float64(MaxAuxImageBytes), "CAPTION_MAX": float64(CaptionMax),
		"WISH_MIN": float64(WishMin), "WISH_MAX": float64(WishMax), "INTENT_TTL_MS": ms(IntentTTL), "PRESIGN_EXPIRES_S": PresignExpires.Seconds(),
		"RATE_WINDOW_MS": ms(RateWindow),
		"IMAGE_MIMES":    []any{"image/jpeg"}, "VIDEO_MIMES": []any{"video/mp4", "video/quicktime", "video/webm"},
		"QR_MIMES": []any{"image/png", "image/jpeg"}, "MAX_QR_BYTES": float64(MaxQRBytes), "MONOGRAM_MIMES": []any{"image/png", "image/webp", "image/svg+xml"},
		"MAX_MONOGRAM_BYTES": float64(MaxMonogramBytes), "QR_FETCH_TIMEOUT_MS": ms(QRFetchTimeout), "ADMIN_SESSION_S": AdminSession.Seconds(),
		"ADMIN_LOGIN_MAX": float64(AdminLoginMax), "ADMIN_LOGIN_WINDOW_MS": ms(AdminLoginWindow), "GUEST_JOINS_PER_IP": float64(GuestJoinsPerIP),
		"GUEST_JOIN_WINDOW_MS": ms(GuestJoinWindow), "MAX_EVENT_MB": float64(MaxEventMB),
	}
	// The Go slices must match too, not only the literals above.
	got := map[string]any{"IMAGE_MIMES": toAny(ImageMimes), "VIDEO_MIMES": toAny(VideoMimes), "QR_MIMES": toAny(QRMimes), "MONOGRAM_MIMES": toAny(MonogramMimes)}
	cases := load(t, "limits")
	if len(cases) != len(want) {
		t.Errorf("limits.ts has %d exports, the port checks %d", len(cases), len(want))
	}
	for _, c := range cases {
		name := into[string](t, c.Input)
		w, ok := want[name]
		if !ok {
			t.Errorf("limits.ts exports %s, not ported", name)
			continue
		}
		if g, isList := got[name]; isList {
			w = g
		}
		if g := into[any](t, c.Output); !reflect.DeepEqual(g, w) {
			t.Errorf("%s: golden %v, Go %v", name, g, w)
		}
	}
}

func toAny(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}

func TestFonts(t *testing.T) {
	for _, c := range load(t, "fonts") {
		switch in := into[any](t, c.Input).(type) {
		case string:
			if in == "keys" {
				if got := toAny(fontKeys); !reflect.DeepEqual(got, into[any](t, c.Output)) {
					t.Errorf("font keys differ: %v", got)
				}
			} else if got := into[map[string]string](t, c.Output); len(got) != len(DefaultFonts) || got["names"] != DefaultFonts[FontNames] || got["wishes"] != DefaultFonts[FontWishes] || got["body"] != DefaultFonts[FontBody] {
				t.Errorf("defaults differ: %v", got)
			}
		case map[string]any:
			key, _ := in["key"].(string) // null reads as unset
			if in["fn"] == "isFontKey" {
				if got := IsFontKey(key); got != into[bool](t, c.Output) {
					t.Errorf("isFontKey(%q) = %v", key, got)
				}
			} else if got := FontOrDefault(FontRole(in["role"].(string)), key); got != into[string](t, c.Output) {
				t.Errorf("fontOrDefault(%v, %q) = %q", in["role"], key, got)
			}
		}
	}
}

func TestAddToken(t *testing.T) {
	type in struct {
		Tokens []string `json:"tokens"`
		Token  string   `json:"token"`
	}
	each(t, "add-token", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		return AddToken(i.Tokens, i.Token), into[[]string](t, c.Output)
	})
	before := []string{"a", "b"}
	AddToken(before, "c")
	if !reflect.DeepEqual(before, []string{"a", "b"}) {
		t.Error("AddToken changed its input")
	}
}

// normalizeExceptions are the only inputs where Go may differ from Node, with Go's output: Go's JSON decoder
// turns a lone surrogate escape into U+FFFD, while JS joins a high and a low surrogate that only meet once
// an invisible character between them is stripped.
var normalizeExceptions = map[string]string{"\uFFFD\u200b\uFFFD": "\uFFFD\uFFFD"}

func TestNormalizeName(t *testing.T) {
	for _, name := range []string{"normalize-name", "normalize-pairs"} {
		for _, c := range load(t, name) {
			in, want := into[string](t, c.Input), into[string](t, c.Output)
			got := NormalizeName(in)
			if g, ok := normalizeExceptions[in]; ok {
				want = g
			}
			if got != want {
				t.Errorf("%s %.200q: got %q, want %q", name, in, got, want)
			}
		}
	}
}

// The whole code point range, so a Unicode version gap between Go's x/text and Node's ICU shows up.
func TestNormalizeSweep(t *testing.T) {
	changed := map[int]bool{}
	for _, c := range load(t, "normalize-sweep") {
		cp := into[int](t, c.Input)
		changed[cp] = true
		s := "a" + string(rune(cp)) + "b"
		if got, want := NormalizeName(s), into[string](t, c.Output); got != want {
			t.Errorf("U+%04X: got %q, want %q", cp, got, want)
		}
	}
	for cp := 0; cp <= 0x10ffff; cp++ {
		if cp >= 0xd800 && cp <= 0xdfff || changed[cp] {
			continue
		}
		if s := "a" + string(rune(cp)) + "b"; NormalizeName(s) != s {
			t.Errorf("U+%04X: Go changes it, Node does not", cp)
		}
	}
}

func TestJSLower(t *testing.T) {
	each(t, "lower-strings", func(c goldenCase) (any, any) {
		return JSLower(into[string](t, c.Input)), into[string](t, c.Output)
	})
	changed := map[int]bool{}
	for _, c := range load(t, "lower-sweep") {
		cp := into[int](t, c.Input)
		changed[cp] = true
		if got, want := JSLower(string(rune(cp))), into[string](t, c.Output); got != want {
			t.Errorf("U+%04X: got %q, want %q", cp, got, want)
		}
	}
	for cp := 0; cp <= 0x10ffff; cp++ {
		if cp >= 0xd800 && cp <= 0xdfff || changed[cp] {
			continue
		}
		if s := string(rune(cp)); JSLower(s) != s {
			t.Errorf("U+%04X: Go lower-cases it, Node does not", cp)
		}
	}
}

func TestNameProblem(t *testing.T) {
	each(t, "name-problem", func(c goldenCase) (any, any) {
		return NameProblem(into[string](t, c.Input)), nullable(t, c.Output)
	})
}

func TestSuggestNames(t *testing.T) {
	type in struct {
		Name  string   `json:"name"`
		Taken []string `json:"taken"`
	}
	each(t, "suggest-names", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		taken := map[string]bool{}
		for _, n := range i.Taken {
			taken[n] = true
		}
		return SuggestNames(i.Name, taken), into[[]string](t, c.Output)
	})
}

func TestDerivePostType(t *testing.T) {
	each(t, "derive-post-type", func(c goldenCase) (any, any) {
		return DerivePostType(into[[]string](t, c.Input)), nullable(t, c.Output)
	})
}

func TestUploadProblem(t *testing.T) {
	each(t, "upload-problem", func(c goldenCase) (any, any) {
		return UploadProblem(into[[]UploadFile](t, c.Input)), nullable(t, c.Output)
	})
}

type keyOut struct {
	Ok    bool   `json:"ok"`
	Value string `json:"value"`
}

// keyed compares a (key, error) result with {ok, value}.
func keyed(t *testing.T, c goldenCase, key string, err error) (any, any) {
	t.Helper()
	w := into[keyOut](t, c.Output)
	return keyOut{err == nil, key}, w
}

func TestKeys(t *testing.T) {
	type in struct {
		EventID  string `json:"eventId"`
		PostID   string `json:"postId"`
		ID       string `json:"id"`
		Role     string `json:"role"`
		Position int    `json:"position"`
		Mime     string `json:"mime"`
	}
	each(t, "media-key", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		k, err := MediaKey(i.EventID, i.PostID, UploadFile{Role: i.Role, Position: i.Position, Mime: i.Mime})
		return keyed(t, c, k, err)
	})
	each(t, "qr-key", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		k, err := QrKey(i.EventID, i.ID, i.Mime)
		return keyed(t, c, k, err)
	})
	each(t, "monogram-key", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		k, err := MonogramKey(i.EventID, i.ID, i.Mime)
		return keyed(t, c, k, err)
	})
	each(t, "monogram-mime", func(c goldenCase) (any, any) {
		m, _ := MonogramMime(into[string](t, c.Input))
		return m, nullable(t, c.Output)
	})
	if _, ok := MonogramMime("x.gif"); ok {
		t.Error("gif is not a monogram")
	}
}

func TestProblems(t *testing.T) {
	type in struct {
		Mime  string `json:"mime"`
		Bytes int64  `json:"bytes"`
	}
	each(t, "qr-problem", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		return QrProblem(i.Mime, i.Bytes), nullable(t, c.Output)
	})
	each(t, "monogram-problem", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		return MonogramProblem(i.Mime, i.Bytes), nullable(t, c.Output)
	})
}

func TestLooksLike(t *testing.T) {
	type in struct {
		Mime  string `json:"mime"`
		Start string `json:"start"`
	}
	each(t, "looks-like", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		b, err := hex.DecodeString(i.Start)
		if err != nil {
			t.Fatal(err)
		}
		return LooksLike(i.Mime, b), into[bool](t, c.Output)
	})
}

func TestSvg(t *testing.T) {
	each(t, "svg-problem", func(c goldenCase) (any, any) {
		return SvgProblem(into[string](t, c.Input)), nullable(t, c.Output)
	})
	each(t, "svg-bytes-problem", func(c goldenCase) (any, any) {
		b, err := hex.DecodeString(into[string](t, c.Input))
		if err != nil {
			t.Fatal(err)
		}
		return SvgBytesProblem(b), nullable(t, c.Output)
	})
}

func TestCursor(t *testing.T) {
	type in struct {
		CreatedAt string `json:"createdAt"`
		ID        string `json:"id"`
	}
	each(t, "cursor-encode", func(c goldenCase) (any, any) {
		i := into[in](t, c.Input)
		return EncodeCursor(i.CreatedAt, i.ID), into[string](t, c.Output)
	})
	each(t, "cursor-decode", func(c goldenCase) (any, any) {
		var want *Cursor
		if string(c.Output) != "null" {
			w := into[in](t, c.Output)
			want = &Cursor{CreatedAt: w.CreatedAt, ID: w.ID}
		}
		return DecodeCursor(into[string](t, c.Input)), want
	})
}
