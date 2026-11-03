// Command server is the Wedding Memories API. It listens on loopback only: the reverse proxy
// sends it /api/* and /qr and everything else to Next.js (docs/adr/005-go-backend.md).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nkinu/wedding_celebration/backend/internal/routes"
	"github.com/nkinu/wedding_celebration/backend/internal/server"
)

const addr = "127.0.0.1:8080"

func main() {
	env, err := server.ParseEnv(os.Getenv)
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
	srv := &http.Server{Addr: addr, Handler: routes.New(env), ReadHeaderTimeout: 10 * time.Second}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		<-ctx.Done()
		// Long uploads go straight to R2, so a short drain is enough for API calls in flight.
		shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	slog.Info("listening", "addr", addr)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
	<-drained // ListenAndServe returns as soon as Shutdown starts; wait for the requests in flight
}
