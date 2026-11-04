package routes

import (
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"

	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
	"github.com/nkinu/wedding_celebration/backend/internal/server"
	"github.com/nkinu/wedding_celebration/backend/internal/validation"
)

// Ports of the GET handlers of src/app/api/posts, src/app/api/me/posts and the viewer page's getPost().
func wall(r *gin.Engine, app *server.App) {
	r.GET("/api/posts", httpx.Handle(200, func(c *gin.Context) (any, error) {
		ctx := c.Request.Context()
		// Absent = first page; present, even empty, = that page (an empty cursor is invalid_cursor).
		raw, has := c.GetQuery("cursor")
		var cursor *string
		if has {
			cursor = &raw
		}
		var page server.WallPageResult
		var counts *server.WallCounts
		var wishes []server.WallPost
		g, gctx := errgroup.WithContext(ctx)
		g.Go(func() (err error) { page, err = app.WallPage(gctx, cursor); return })
		if !has {
			g.Go(func() error {
				c, err := app.WallCounts(gctx)
				counts = &c
				return err
			})
			g.Go(func() (err error) { wishes, err = app.LatestWishes(gctx); return })
		}
		if err := g.Wait(); err != nil {
			return nil, err
		}
		// A struct, not gin.H, so the keys come out in the TypeScript's order.
		return struct {
			Posts      []server.WallPost  `json:"posts"`
			NextCursor *string            `json:"nextCursor"`
			Counts     *server.WallCounts `json:"counts"`
			Wishes     []server.WallPost  `json:"wishes"`
		}{page.Posts, page.NextCursor, counts, wishes}, nil
	}))

	r.GET("/api/me/posts", httpx.Handle(200, func(c *gin.Context) (any, error) {
		ctx := c.Request.Context()
		guest, err := app.RequireGuest(ctx, server.Jar{W: c.Writer, R: c.Request, Secure: app.Env.Production})
		if err != nil {
			return nil, err
		}
		return app.MyPosts(ctx, guest.ID)
	}))

	r.GET("/api/posts/:id", httpx.Handle(200, func(c *gin.Context) (any, error) {
		id, bad := validation.PostIDParam(c.Param("id"))
		if bad != nil {
			return nil, bad
		}
		post, err := app.Post(c.Request.Context(), id)
		if err != nil {
			return nil, err
		}
		if post == nil {
			return nil, &httpx.AppError{Code: "post_not_found", Status: 404, Message: "That post is already gone."}
		}
		return post, nil
	}))
}
