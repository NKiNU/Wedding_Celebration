package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/nkinu/wedding_celebration/backend/internal/server"
)

func TestNewAppliesTheGuards(t *testing.T) {
	r := New(server.Env{})
	r.POST("/api/x", func(c *gin.Context) { c.Status(204) })

	req := httptest.NewRequest(http.MethodPost, "/api/x", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 403 || w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("cross-site POST: %d %v", w.Code, w.Header())
	}

	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/x", nil))
	if w.Code != 405 {
		t.Fatalf("wrong method: %d", w.Code)
	}
}
