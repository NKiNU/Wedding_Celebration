package server

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
)

// ClientIP is who is calling, for the throttles. Only a header our own reverse proxy sets can be
// trusted: X-Real-IP (it replaces whatever the client sent), else the LAST X-Forwarded-For entry,
// the one the proxy appended. Never gin's ClientIP: a client could pick a new value on every try.
// ok is false when neither gives an address (an empty X-Real-IP still counts, as `??` keeps "").
func ClientIP(h http.Header) (ip string, ok bool) {
	if v := h.Values("X-Real-Ip"); len(v) > 0 {
		return strings.Join(v, ", "), true // Headers.get joins repeated headers
	}
	parts := strings.Split(strings.Join(h.Values("X-Forwarded-For"), ", "), ",")
	for i := len(parts) - 1; i >= 0; i-- {
		if p := domain.JSTrim(parts[i]); p != "" {
			return p, true
		}
	}
	return "", false
}

// IPHash is the caller's address, hashed: enough to throttle without keeping an IP.
func IPHash(address, pepper string) string {
	if address == "" {
		address = "unknown"
	}
	sum := sha256.Sum256([]byte(BucketOf(address) + ":" + pepper))
	return hex.EncodeToString(sum[:])
}

var mappedV4 = regexp.MustCompile(`^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$`)

// BucketOf is the throttle bucket of an address: an IPv4 address itself, or the first four groups
// of the expanded IPv6 address (a user owns a whole /64). A string-for-string port of bucketOf in
// src/server/ip.ts, junk included (golden: bucket-of.json), so rows written by either backend
// count for the same caller.
func BucketOf(ip string) string {
	address := domain.JSLower(domain.JSTrim(ip))
	address = strings.TrimPrefix(address, "[")
	address = strings.TrimSuffix(address, "]")
	address, _, _ = strings.Cut(address, "%")
	if !strings.Contains(address, ":") {
		return address
	}
	mapped := address
	if strings.HasPrefix(mapped, "::") { // replace(/^::/, "0:")
		mapped = "0:" + mapped[2:]
	}
	if m := mappedV4.FindStringSubmatch(mapped); m != nil {
		return m[1]
	}
	halves := strings.Split(address, "::")
	var left, right []string
	if halves[0] != "" {
		left = strings.Split(halves[0], ":")
	}
	groups := left
	if len(halves) > 1 {
		if halves[1] != "" {
			right = strings.Split(halves[1], ":")
		}
		groups = append(append([]string{}, left...), make([]string, max(0, 8-len(left)-len(right)))...)
		for i := len(left); i < len(groups); i++ {
			groups[i] = "0"
		}
		groups = append(groups, right...)
	}
	if len(groups) > 4 {
		groups = groups[:4]
	}
	out := make([]string, len(groups))
	for i, g := range groups {
		out[i] = stripLeadingZeros(g)
	}
	return strings.Join(out, ":")
}

// stripLeadingZeros is g.replace(/^0+(?=.)/, ""): leading zeros go, but the lookahead needs one
// more character that is not a JS line terminator, so "000" keeps "0" and "0\n" stays.
func stripLeadingZeros(g string) string {
	k := len(g) - len(strings.TrimLeft(g, "0"))
	if k == 0 {
		return g
	}
	if rest := g[k:]; rest == "" || isLineTerminator(rest) {
		k--
	}
	return g[k:]
}

func isLineTerminator(s string) bool {
	return strings.HasPrefix(s, "\n") || strings.HasPrefix(s, "\r") || strings.HasPrefix(s, " ") || strings.HasPrefix(s, " ")
}
