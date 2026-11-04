package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/server"
	"github.com/nkinu/wedding_celebration/backend/internal/validation"
)

// Ports of src/app/api/uploads, src/app/api/uploads/[postId] and the POST handler of src/app/api/posts.
func create(r *gin.Engine, app *server.App) {
	guest := func(c *gin.Context) (server.Guest, error) {
		return app.RequireGuest(c.Request.Context(), server.Jar{W: c.Writer, R: c.Request, Secure: app.Env.Production})
	}

	r.POST("/api/uploads", httpx.Handle(201, func(c *gin.Context) (any, error) {
		g, err := guest(c)
		if err != nil {
			return nil, err
		}
		body, bad := validation.CreateUploadBody(httpx.Body(c))
		if bad != nil {
			return nil, bad
		}
		return app.CreateUploadIntent(c.Request.Context(), g, body.Files)
	}))

	r.DELETE("/api/uploads/:postId", httpx.Handle(200, func(c *gin.Context) (any, error) {
		g, err := guest(c)
		if err != nil {
			return nil, err
		}
		id, bad := validation.PostIDParam(c.Param("postId"))
		if bad != nil {
			return nil, bad
		}
		return nil, app.CancelUploadIntent(c.Request.Context(), g, id)
	}))

	// A wish, or the media post an upload intent was issued for. The type is never read from the body.
	r.POST("/api/posts", httpx.Handle(201, func(c *gin.Context) (any, error) {
		g, err := guest(c)
		if err != nil {
			return nil, err
		}
		body, bad := validation.CreatePostBody(httpx.Body(c))
		if bad != nil {
			return nil, bad
		}
		if body.WishText == nil {
			return app.CreateMediaPost(c.Request.Context(), g, *body.PostID, body.Caption)
		}
		return app.CreateWish(c.Request.Context(), g, *body.WishText)
	}))
}
