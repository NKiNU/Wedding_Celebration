// Package httpx is the port of src/server/http.ts: the ApiResult envelope, AppError, the
// cross-site guard, plus the security headers of next.config.ts and the request body cap.
package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// AppError is a failure the client should see: a status, a stable code and a safe message.
type AppError struct {
	Code    string
	Status  int
	Message string
	Details map[string]any
}

func (e *AppError) Error() string { return e.Code + ": " + e.Message }

// Invalid is a validation failure (zod's 400 invalid_input with the first issue's message).
func Invalid(message string) *AppError {
	return &AppError{Code: "invalid_input", Status: http.StatusBadRequest, Message: message}
}

type apiError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func fail(c *gin.Context, status int, e apiError) {
	c.AbortWithStatusJSON(status, gin.H{"ok": false, "error": e})
}

func internal(c *gin.Context) {
	fail(c, http.StatusInternalServerError, apiError{Code: "internal", Message: "Something went wrong. Please try again."})
}

// Handle runs a handler body and maps its result or failure to the envelope.
func Handle(status int, run func(c *gin.Context) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, err := run(c)
		var app *AppError
		switch {
		case err == nil:
			c.JSON(status, gin.H{"ok": true, "data": data})
		case errors.As(err, &app):
			fail(c, app.Status, apiError{Code: app.Code, Message: app.Message, Details: app.Details})
		default:
			slog.Error("Unhandled API error", "err", err, "path", c.FullPath())
			internal(c)
		}
	}
}

// Recovery answers a panic with the same 500 envelope as any other unexpected error.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, rec any) {
		slog.Error("Unhandled API panic", "panic", rec, "path", c.FullPath())
		internal(c)
	})
}

// CrossSiteGuard refuses non-read requests from another site. Route handlers get no CSRF
// protection for free, and a cross-site form post can carry valid JSON. Browsers label every
// request; non-browser callers send neither header and pass.
func CrossSiteGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead && isCrossSite(c.Request) {
			fail(c, http.StatusForbidden, apiError{Code: "forbidden", Message: "Cross-site requests are not allowed."})
		}
	}
}

func isCrossSite(r *http.Request) bool {
	if site := r.Header.Values("Sec-Fetch-Site"); len(site) > 0 {
		return site[0] != "same-origin" && site[0] != "none"
	}
	origin := r.Header.Values("Origin")
	if len(origin) == 0 {
		return false
	}
	// Behind a TLS-terminating proxy the request is http while the browser's Origin says https,
	// so the scheme comes from the X-Forwarded-Proto the proxy sets (the first hop).
	scheme := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0])
	if scheme == "" {
		scheme = "http"
		if r.TLS != nil {
			scheme = "https"
		}
	}
	u, err := url.Parse(origin[0])
	if err != nil || u.Scheme == "" || u.Host == "" { // an opaque Origin ("null")
		return true
	}
	return !strings.EqualFold(u.Scheme+"://"+u.Host, scheme+"://"+r.Host)
}

// SecurityHeaders are the headers next.config.ts sets on every response.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'")
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
	}
}

// MaxBodyBytes caps a JSON body; no real request is near it (the largest is 20 file descriptors).
const MaxBodyBytes = 1 << 20

// Body is the request body as JSON, or `null` when it is missing, not JSON or over the cap
// (Next's `req.json().catch(() => null)`), so validation answers it like any wrong input.
func Body(c *gin.Context) json.RawMessage {
	raw, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, MaxBodyBytes))
	if err != nil || !json.Valid(raw) {
		return json.RawMessage("null")
	}
	return raw
}
