// Package routes wires the gin engine. Route groups are added phase by phase (docs/superpowers/plans/2026-11-03-go-gin-backend.md).
package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/server"
)

// New builds the engine with the middleware every response needs and every route.
func New(app *server.App) *gin.Engine {
	if app.Env.Production {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.HandleMethodNotAllowed = true // 405 like Next.js
	r.RedirectTrailingSlash = false
	r.Use(httpx.Recovery(), httpx.SecurityHeaders(), httpx.CrossSiteGuard(), eventPerRequest)
	identity(r, app)
	wall(r, app)
	create(r, app)
	return r
}

// eventPerRequest gives each request its own event cache (server.WithEventCache).
func eventPerRequest(c *gin.Context) {
	c.Request = c.Request.WithContext(server.WithEventCache(c.Request.Context()))
}
