package domain

import (
	"strings"
	"unicode/utf8"
)

// IsJSSpace reports whether r is in the set JavaScript's \s, trim() and the zod .trim() use. It is
// not unicode.IsSpace (that has U+0085, lacks U+FEFF) and not Go's ASCII-only regexp \s.
func IsJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// JSSpaceClass is the same set as a regexp class body (no brackets), for the SVG scan.
const JSSpaceClass = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

// JSTrim is String.prototype.trim.
func JSTrim(s string) string { return strings.TrimFunc(s, IsJSSpace) }

// CodePoints is [...s].length. (A lone surrogate escape decodes to U+FFFD in Go, still one code point.)
func CodePoints(s string) int { return utf8.RuneCountInString(s) }
