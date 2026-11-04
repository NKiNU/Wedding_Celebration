package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/server"
	"github.com/nkinu/wedding_celebration/backend/internal/validation"
)

// Ports of src/app/api/guests, src/app/api/session and the getEvent() read of the pages.
func identity(r *gin.Engine, app *server.App) {
	jar := func(c *gin.Context) server.Jar {
		return server.Jar{W: c.Writer, R: c.Request, Secure: app.Env.Production}
	}

	// The body is validated before the throttle counts the request, as in route.ts.
	r.POST("/api/guests", httpx.Handle(201, func(c *gin.Context) (any, error) {
		body, bad := validation.CreateGuestBody(httpx.Body(c))
		if bad != nil {
			return nil, bad
		}
		if err := app.ThrottleGuestJoin(c.Request.Context(), c.Request.Header); err != nil {
			return nil, err
		}
		return app.CreateGuest(c.Request.Context(), body.Name, jar(c))
	}))

	r.GET("/api/session", httpx.Handle(200, func(c *gin.Context) (any, error) {
		return app.GetSession(c.Request.Context(), jar(c))
	}))

	r.POST("/api/session", httpx.Handle(200, func(c *gin.Context) (any, error) {
		body, bad := validation.ActivateGuestBody(httpx.Body(c))
		if bad != nil {
			return nil, bad
		}
		return app.ActivateGuest(c.Request.Context(), body.GuestID, jar(c))
	}))

	r.DELETE("/api/session", httpx.Handle(200, func(c *gin.Context) (any, error) {
		server.ClearActive(jar(c))
		return nil, nil
	}))

	r.GET("/api/event", httpx.Handle(200, func(c *gin.Context) (any, error) {
		return app.PublicEvent(c.Request.Context())
	}))
}
