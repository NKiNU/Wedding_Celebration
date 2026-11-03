// Package domain is the port of src/lib/domain: pure rules, no I/O.
package domain

import "time"

// MB is one mebibyte.
const MB = 1024 * 1024

const (
	MaxPhotos        = 10
	MaxVideoBytes    = 80 * MB
	MaxVideoSeconds  = 30
	PostsPerHour     = 30
	BytesPerHour     = 200 * MB
	PageSize         = 24
	TickerWishes     = 5   // the newest wishes the wall header rotates through
	MyPostsMax       = 100 // the Me drawer lists the newest of a guest's own posts
	NameMin          = 2
	NameMax          = 24
	MaxNamesPerPhone = 5

	MaxPhotoBytes    = 15 * MB
	MaxAuxImageBytes = 1 * MB // a thumbnail or a video poster
	CaptionMax       = 120
	WishMin          = 3
	WishMax          = 300

	IntentTTL      = 60 * time.Minute // long enough for a full-size video on slow 3G
	PresignExpires = 15 * time.Minute
	RateWindow     = 60 * time.Minute

	MaxQRBytes       = 2 * MB
	MaxMonogramBytes = 1 * MB
	QRFetchTimeout   = 10 * time.Second

	AdminSession     = 24 * time.Hour
	AdminLoginMax    = 5 // wrong passcodes per IP per window
	AdminLoginWindow = 15 * time.Minute

	// Defaults; GUEST_JOINS_PER_IP and MAX_EVENT_MB can override them (server/env.go).
	GuestJoinsPerIP = 300
	GuestJoinWindow = 10 * time.Minute
	MaxEventMB      = 9 * 1024
)

var (
	ImageMimes    = []string{"image/jpeg"} // the client always re-encodes to JPEG
	VideoMimes    = []string{"video/mp4", "video/quicktime", "video/webm"}
	QRMimes       = []string{"image/png", "image/jpeg"}
	MonogramMimes = []string{"image/png", "image/webp", "image/svg+xml"}
)
