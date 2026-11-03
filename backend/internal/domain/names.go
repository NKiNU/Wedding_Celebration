package domain

import (
	"fmt"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// NormalizeName: NFKC, drop control, format and default-ignorable characters (zero-width, bidi
// overrides, fillers; tab, LF and CR stay for the whitespace collapse), collapse JS whitespace, trim.
//
// ponytail: x/text v0.34 (the newest that builds with Go 1.24) clips its composition keys to 16 bits, so a
// code point above U+FFFF followed by a combining mark can compose with a wrong BMP partner; fixed in
// x/text v0.43 (needs Go 1.26). Bump it with go.mod and drop the exception in golden_test.go.
func NormalizeName(raw string) string {
	var b strings.Builder
	space := false
	for _, r := range norm.NFKC.String(patchRunes(raw, nfkcPatch)) {
		switch {
		case r != '\t' && r != '\n' && r != '\r' && unicode.Is(invisible, r):
		case IsJSSpace(r):
			space = true
		default:
			if space {
				b.WriteByte(' ')
				space = false
			}
			b.WriteRune(r)
		}
	}
	// Whitespace at either end is dropped (the trim), so it is only written between two characters.
	return strings.TrimLeft(b.String(), " ")
}

// NameProblem is a user-facing reason the (already normalized) name is unusable, or "" when it is fine.
func NameProblem(name string) string {
	switch n := CodePoints(name); {
	case n < NameMin:
		return fmt.Sprintf("Please enter at least %d characters.", NameMin)
	case n > NameMax:
		return fmt.Sprintf("Names can be up to %d characters.", NameMax)
	}
	return ""
}

// SuggestNames returns up to two free alternatives to a taken name. taken holds JSLower-ed names.
func SuggestNames(name string, taken map[string]bool) []string {
	out := []string{}
	for _, c := range []string{name + " 2", name + " & family", name + " 3", name + " 4"} {
		if CodePoints(c) <= NameMax && !taken[JSLower(c)] {
			out = append(out, c)
		}
	}
	if len(out) > 2 {
		out = out[:2]
	}
	return out
}

// JSLower is String.prototype.toLowerCase: Go's simple mapping plus the two things the full Unicode
// mapping adds in a locale-free call, U+0130 -> "i̇" and the final sigma.
func JSLower(s string) string {
	rs := []rune(s)
	var b strings.Builder
	for i, r := range rs {
		switch {
		case lowerPatch[r] != "":
			b.WriteString(lowerPatch[r])
		case r == 0x130:
			b.WriteString("i̇")
		case r == 'Σ' && finalSigma(rs, i):
			b.WriteRune('ς')
		default:
			b.WriteRune(unicode.ToLower(r))
		}
	}
	return b.String()
}

// finalSigma is the Final_Sigma context: a cased letter before (skipping case-ignorable characters)
// and none after.
func finalSigma(rs []rune, i int) bool {
	j := i - 1
	for j >= 0 && unicode.Is(caseIgnorable, rs[j]) {
		j--
	}
	if j < 0 || !unicode.Is(cased, rs[j]) {
		return false
	}
	for k := i + 1; k < len(rs); k++ {
		if unicode.Is(caseIgnorable, rs[k]) {
			continue
		}
		return !unicode.Is(cased, rs[k])
	}
	return true
}

// patchRunes swaps the code points Go's Unicode 15 tables do not know for what Node's newer tables say
// (zz_generated_tables.go). The replacements are final (ASCII), so doing it before NFKC is the same.
func patchRunes(s string, patch map[rune]string) string {
	var b strings.Builder
	for _, r := range s {
		if p, ok := patch[r]; ok {
			b.WriteString(p)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}
