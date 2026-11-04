package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
)

// The wall (GET /api/posts) has no limit on purpose: every phone refetches it on each new post, so
// a venue sharing one address would freeze its own live wall.

// LongestWindow is the longest throttle window: the hourly sweep keeps rate-limit rows this long.
const LongestWindow = domain.GuestJoinWindow

// ThrottleGuestJoin counts one new name from this caller's address and refuses it over the limit.
// rate_limit_hit (migration 0005) counts and inserts under one lock, by the database clock. Fails
// closed: if the count cannot be recorded, the request fails.
func (a *App) ThrottleGuestJoin(ctx context.Context, h http.Header) error {
	ip, _ := ClientIP(h)
	_, err := a.DB.Exec(ctx, "select public.rate_limit_hit($1, $2, $3, $4)",
		"guest_join", IPHash(ip, a.Env.DeviceTokenPepper), int(domain.GuestJoinWindow.Seconds()), a.Env.GuestJoinsPerIP)
	if pgCode(err) == "PT429" {
		return &httpx.AppError{Code: "rate_limited", Status: http.StatusTooManyRequests,
			Message: "Lots of new names from this network just now. Please wait a few minutes and try again."}
	}
	if err != nil {
		return fmt.Errorf("recording the request: %w", err)
	}
	return nil
}
