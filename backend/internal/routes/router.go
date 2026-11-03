// Package routes wires the gin engine. Route groups are added phase by phase (docs/superpowers/plans/2026-11-03-go-gin-backend.md).
package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/server"
)

// New builds the engine with the middleware every response needs.
func New(env server.Env) *gin.Engine {
	if env.Production {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.HandleMethodNotAllowed = true // 405 like Next.js; gin panics in this lookup while no route is registered (G0 only)
	r.RedirectTrailingSlash = false
	r.Use(httpx.Recovery(), httpx.SecurityHeaders(), httpx.CrossSiteGuard())
	return r
}
