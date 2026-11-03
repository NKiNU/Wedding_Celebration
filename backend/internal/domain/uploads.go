package domain

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

// UploadFile is what the client declares for each file it wants to upload. Role is "main", "thumb"
// or "poster". Sizes are signed into the URL.
type UploadFile struct {
	Role      string   `json:"role"`
	Position  int      `json:"position"`
	Mime      string   `json:"mime"`
	Bytes     int64    `json:"bytes"`
	Width     *int     `json:"width,omitempty"`
	Height    *int     `json:"height,omitempty"`
	DurationS *float64 `json:"durationS,omitempty"`
}

// StoredFile is an UploadFile once the server has chosen its R2 key.
type StoredFile struct {
	UploadFile
	Key string `json:"key"`
}

const jpeg = "image/jpeg"

func isImage(mime string) bool { return slices.Contains(ImageMimes, mime) }
func isVideo(mime string) bool { return slices.Contains(VideoMimes, mime) }

// DerivePostType is the post type from the verified main files ("photo", "album", "video"), or ""
// when they make no valid post. Never from anything the client calls its type.
func DerivePostType(mimes []string) string {
	if len(mimes) == 0 {
		return ""
	}
	if slices.IndexFunc(mimes, func(m string) bool { return !isImage(m) }) < 0 {
		switch {
		case len(mimes) == 1:
			return "photo"
		case len(mimes) <= MaxPhotos:
			return "album"
		}
		return ""
	}
	if len(mimes) == 1 && isVideo(mimes[0]) {
		return "video"
	}
	return ""
}

var (
	mediaExt    = map[string]string{"image/jpeg": "jpg", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"}
	qrExt       = map[string]string{"image/png": "png", "image/jpeg": "jpg"}
	monogramExt = map[string]string{"image/png": "png", "image/webp": "webp", "image/svg+xml": "svg"}
)

func noExt(mime string) error { return errors.New("No extension for " + mime) }

// MediaKey is events/{event}/{post}/{position}.{ext}, {position}_thumb.jpg or {position}_poster.jpg.
func MediaKey(eventID, postID string, f UploadFile) (string, error) {
	base := fmt.Sprintf("events/%s/%s/%d", eventID, postID, f.Position)
	switch f.Role {
	case "thumb":
		return base + "_thumb.jpg", nil
	case "poster":
		return base + "_poster.jpg", nil
	}
	ext, ok := mediaExt[f.Mime]
	if !ok {
		return "", noExt(f.Mime)
	}
	return base + "." + ext, nil
}

// QrKey is events/{event}/admin/qr-{id}.{ext}: the DuitNow QR the admin uploads.
func QrKey(eventID, id, mime string) (string, error) {
	ext, ok := qrExt[mime]
	if !ok {
		return "", noExt(mime)
	}
	return fmt.Sprintf("events/%s/admin/qr-%s.%s", eventID, id, ext), nil
}

// MonogramKey is events/{event}/admin/monogram-{id}.{ext}.
func MonogramKey(eventID, id, mime string) (string, error) {
	ext, ok := monogramExt[mime]
	if !ok {
		return "", noExt(mime)
	}
	return fmt.Sprintf("events/%s/admin/monogram-%s.%s", eventID, id, ext), nil
}

// MonogramMime is the monogram's type from its key's extension (the whole key when it has no dot,
// like the TypeScript's slice).
func MonogramMime(key string) (string, bool) {
	ext := key[strings.LastIndex(key, ".")+1:]
	for _, mime := range MonogramMimes {
		if monogramExt[mime] == ext {
			return mime, true
		}
	}
	return "", false
}

// QrProblem is why this file cannot be the QR, or "".
func QrProblem(mime string, bytes int64) string {
	if !slices.Contains(QRMimes, mime) {
		return "The QR must be a PNG or JPEG image."
	}
	if bytes > MaxQRBytes {
		return "The QR image must be under 2 MB."
	}
	return ""
}

// MonogramProblem is why this file cannot be the monogram, or "".
func MonogramProblem(mime string, bytes int64) string {
	if !slices.Contains(MonogramMimes, mime) {
		return "The monogram must be a PNG, WebP or SVG image."
	}
	if bytes > MaxMonogramBytes {
		return "The monogram image must be under 1 MB."
	}
	return ""
}

const (
	// NotSVG is the message for a file that is not an SVG image at all.
	NotSVG    = "That file is not an SVG image."
	svgUnsafe = "That SVG contains something that isn’t allowed."
)

// jsWS stands in for JS \s. ponytail: Go's (?i) folds a bit wider than JS's (ſ matches s, the Kelvin
// sign matches k), so a few exotic spellings are rejected that JS would let through; the scan only
// ever rejects more, never less.
const jsWS = `[` + JSSpaceClass + `]`

var svgForbidden = []*regexp.Regexp{
	regexp.MustCompile(`(?i)<(?:[\w.-]+:)?script`),
	regexp.MustCompile(`(?i)[` + JSSpaceClass + `"'/]on\w+` + jsWS + `*=`),
	regexp.MustCompile(`(?i)<(?:[\w.-]+:)?foreignObject`),
	regexp.MustCompile(`&#`), // character references can spell out `https:` or `javascript:`
	regexp.MustCompile(`(?i)javascript:`),
	regexp.MustCompile(`(?i)<!ENTITY`),
	regexp.MustCompile(`(?i)@import`),
	regexp.MustCompile(`(?i)(?:href` + jsWS + `*=|url\()` + jsWS + `*(?:["']` + jsWS + `*)?(?:https?:|//)`),
}

// Explicit classes, not (?i), so that <ſvg does not count as an svg element (it does not in JS).
var (
	svgOpen     = regexp.MustCompile(`<[sS][vV][gG]`)
	xmlEncoding = regexp.MustCompile(`(?i)^` + jsWS + `*<\?xml[^>]*` + jsWS + `encoding` + jsWS + `*=` + jsWS + `*["']([^"']*)["']`)
)

// SvgProblem scans SVG text for script or remote loads, or "" when it passes. A substring scan, not an
// XML parser; the file is also served as an image, where browsers run no script.
func SvgProblem(text string) string {
	if !svgOpen.MatchString(text) {
		return NotSVG
	}
	for _, rule := range svgForbidden {
		if rule.MatchString(text) {
			return svgUnsafe
		}
	}
	return ""
}

// SvgBytesProblem is SvgProblem on raw bytes. Only strict UTF-8 is scanned: a NUL, an ESC (ISO-2022
// escapes can split `<scr` + ESC(B + `ipt` past the scan) or a declared non-UTF-8 encoding makes the
// text unsafe. Binary that is not UTF-8 text at all (a renamed PNG) is NotSVG.
func SvgBytesProblem(b []byte) string {
	if !utf8.Valid(b) {
		return NotSVG
	}
	text := string(bytes.TrimPrefix(b, []byte("\xEF\xBB\xBF"))) // TextDecoder drops one leading BOM
	switch {
	case strings.Contains(text, "\x00"):
		return NotSVG
	case strings.Contains(text, "\x1b"):
		return svgUnsafe
	}
	if m := xmlEncoding.FindStringSubmatch(text); m != nil && strings.ToLower(JSTrim(m[1])) != "utf-8" {
		return svgUnsafe
	}
	return SvgProblem(text)
}

var quicktimeAtoms = []string{"ftyp", "moov", "mdat", "wide", "free", "skip"}

// LooksLike: the first bytes of a stored file must match its declared type, so arbitrary bytes cannot
// be served from the media domain as a photo or a video. start is at least the first 12 bytes.
func LooksLike(mime string, start []byte) bool {
	at := func(i int) int { // -1 past the end, like an undefined byte
		if i < len(start) {
			return int(start[i])
		}
		return -1
	}
	text := func(from, n int) string {
		from = min(from, len(start))
		return string(start[from:min(from+n, len(start))])
	}
	switch mime {
	case "image/jpeg":
		return at(0) == 0xff && at(1) == 0xd8 && at(2) == 0xff
	case "image/png":
		return at(0) == 0x89 && at(1) == 0x50 && at(2) == 0x4e && at(3) == 0x47
	case "image/webp":
		return text(0, 4) == "RIFF" && text(8, 4) == "WEBP"
	case "video/mp4":
		return text(4, 4) == "ftyp"
	case "video/quicktime":
		return slices.Contains(quicktimeAtoms, text(4, 4)) // a QuickTime file need not start with ftyp
	case "video/webm":
		return at(0) == 0x1a && at(1) == 0x45 && at(2) == 0xdf && at(3) == 0xa3
	}
	return false
}

func positionsOk(files []UploadFile, n int) bool {
	for _, f := range files {
		if f.Position < 0 || f.Position >= n {
			return false
		}
		dup := 0
		for _, o := range files {
			if o.Position == f.Position {
				dup++
			}
		}
		if dup != 1 {
			return false
		}
	}
	return true
}

// UploadProblem is why this set of files cannot become a post, or "".
func UploadProblem(files []UploadFile) string {
	var mains, thumbs, posters []UploadFile
	for _, f := range files {
		switch f.Role {
		case "main":
			mains = append(mains, f)
		case "thumb":
			thumbs = append(thumbs, f)
		case "poster":
			posters = append(posters, f)
		}
	}
	if len(mains) == 0 {
		return "Choose at least one photo or a video."
	}
	unsupported := slices.ContainsFunc(mains, func(m UploadFile) bool { return !isImage(m.Mime) && !isVideo(m.Mime) })
	for _, f := range slices.Concat(thumbs, posters) {
		unsupported = unsupported || f.Mime != jpeg
	}
	if unsupported {
		return "That file type isn’t supported."
	}
	var videos []UploadFile
	for _, m := range mains {
		if isVideo(m.Mime) {
			videos = append(videos, m)
		}
	}
	if len(videos) > 0 && len(videos) < len(mains) {
		return "Post photos or a video, not both."
	}

	if len(videos) > 0 {
		switch {
		case len(videos) > 1:
			return "Only one video per post."
		case videos[0].Position != 0 || slices.ContainsFunc(posters, func(p UploadFile) bool { return p.Position != 0 }):
			return "Files are out of order."
		case len(thumbs) > 0:
			return "A video can’t have a photo thumbnail."
		case len(posters) > 1:
			return "A video takes at most one poster."
		case videos[0].Bytes > MaxVideoBytes || slices.ContainsFunc(posters, func(p UploadFile) bool { return p.Bytes > MaxAuxImageBytes }):
			return "A file is too large."
		}
		if d := videos[0].DurationS; d == nil || *d > MaxVideoSeconds {
			return fmt.Sprintf("Videos can be up to %d seconds.", MaxVideoSeconds)
		}
		return ""
	}

	switch {
	case len(mains) > MaxPhotos:
		return fmt.Sprintf("Up to %d photos per post.", MaxPhotos)
	case len(posters) > 0:
		return "Photos don’t take a poster."
	case !positionsOk(mains, len(mains)):
		return "Photos are out of order."
	case len(thumbs) != len(mains) || !positionsOk(thumbs, len(thumbs)):
		return "Every photo needs one thumbnail."
	case slices.ContainsFunc(mains, func(m UploadFile) bool { return m.Bytes > MaxPhotoBytes }) ||
		slices.ContainsFunc(thumbs, func(t UploadFile) bool { return t.Bytes > MaxAuxImageBytes }):
		return "A file is too large."
	}
	return ""
}
