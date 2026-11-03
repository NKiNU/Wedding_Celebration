package validation

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/nkinu/wedding_celebration/backend/internal/domain"
	"github.com/nkinu/wedding_celebration/backend/internal/httpx"
)

// Request bodies, as the route handlers use them. Unknown keys never get this far.
type (
	CreateGuest struct {
		Name string `json:"name"`
	}
	ActivateGuest struct {
		GuestID string `json:"guestId"`
	}
	CreateUpload struct {
		Files []domain.UploadFile `json:"files"`
	}
	// CreatePost is a wish (WishText) or the post an upload intent was issued for (PostID). A blank caption is nil.
	CreatePost struct {
		PostID   *string `json:"postId,omitempty"`
		Caption  *string `json:"caption"`
		WishText *string `json:"wishText,omitempty"`
	}
	AdminLogin struct {
		Passcode string `json:"passcode"`
	}
	// UpdateEvent holds the fields the admin sent; nil means unchanged.
	UpdateEvent struct {
		GroomName     *string `json:"groomName,omitempty"`
		BrideName     *string `json:"brideName,omitempty"`
		HeaderMessage *string `json:"headerMessage,omitempty"`
		QrAccountName *string `json:"qrAccountName,omitempty"`
		QrBank        *string `json:"qrBank,omitempty"`
		UploadsOpen   *bool   `json:"uploadsOpen,omitempty"`
		FontNames     *string `json:"fontNames,omitempty"`
		FontWishes    *string `json:"fontWishes,omitempty"`
		FontBody      *string `json:"fontBody,omitempty"`
	}
	// Presign is the QR or monogram image the admin is about to upload.
	Presign struct {
		Mime  string `json:"mime"`
		Bytes int64  `json:"bytes"`
	}
	// Confirm is the key the presign call returned, now uploaded.
	Confirm struct {
		Key string `json:"key"`
	}
	Hide struct {
		Hidden bool `json:"hidden"`
	}
)

// parse runs a schema over a body; the first issue becomes the 400.
func parse[T any](raw json.RawMessage, schema func(m map[string]any) (T, string)) (T, *httpx.AppError) {
	var zero T
	m, msg := object(decode(raw))
	if msg == "" {
		var out T
		if out, msg = schema(m); msg == "" {
			return out, nil
		}
	}
	return zero, httpx.Invalid(msg)
}

// CreateGuestBody is { name }: normalized, then 2 to 24 characters.
func CreateGuestBody(raw json.RawMessage) (CreateGuest, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (CreateGuest, string) {
		name, _, msg := str(m, "name", false)
		if msg != "" {
			return CreateGuest{}, msg
		}
		name = domain.NormalizeName(name)
		return CreateGuest{name}, domain.NameProblem(name)
	})
}

// ActivateGuestBody is { guestId }.
func ActivateGuestBody(raw json.RawMessage) (ActivateGuest, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (ActivateGuest, string) {
		id, _, msg := uuid(m, "guestId", false)
		return ActivateGuest{id}, msg
	})
}

// PostIDParam is the :id path parameter.
func PostIDParam(s string) (string, *httpx.AppError) {
	if !uuidRe.MatchString(s) {
		return "", httpx.Invalid("Invalid UUID")
	}
	return s, nil
}

// file reads one entry of `files`. stored is the looser shape of the DB column: no size or duration
// maxima (an intent stored under older, larger limits must still parse), plus the key.
func file(v any, stored bool) (domain.StoredFile, string) {
	var f domain.StoredFile
	m, msg := object(v)
	if msg != "" {
		return f, msg
	}
	role, _, msg := str(m, "role", false)
	if msg != "" || !slices.Contains([]string{"main", "thumb", "poster"}, role) {
		return f, `Invalid option: expected one of "main"|"thumb"|"poster"`
	}
	f.Role = role

	position, _, msg := num(m, "position", false)
	if msg = first(msg, intMsg(position), atLeast0(position)); msg == "" && !stored {
		msg = atMost(position, domain.MaxPhotos-1)
	}
	if msg != "" {
		return f, msg
	}
	f.Position = int(position)

	if f.Mime, _, msg = str(m, "mime", false); msg == "" && !stored {
		msg = maxLen(f.Mime, 100)
	}
	if msg != "" {
		return f, msg
	}

	bytes, _, msg := num(m, "bytes", false)
	if msg = first(msg, intMsg(bytes), positive(bytes)); msg == "" && !stored {
		msg = atMost(bytes, domain.MaxVideoBytes)
	}
	if msg != "" {
		return f, msg
	}
	f.Bytes = int64(bytes)

	if stored {
		if f.Key, _, msg = str(m, "key", false); msg == "" {
			msg = minLen1(f.Key)
		}
		if msg != "" {
			return f, msg
		}
	}

	for _, d := range []struct {
		key string
		dst **int
	}{{"width", &f.Width}, {"height", &f.Height}} {
		n, set, msg := num(m, d.key, true)
		if set {
			msg = first(intMsg(n), positive(n))
			if msg == "" && !stored {
				msg = atMost(n, 20_000)
			}
			i := int(n)
			*d.dst = &i
		}
		if msg != "" {
			return f, msg
		}
	}

	n, set, msg := num(m, "durationS", true)
	if set {
		if msg = positive(n); msg == "" && !stored {
			msg = atMost(n, domain.MaxVideoSeconds)
		}
		f.DurationS = &n
	}
	return f, msg
}

// CreateUploadBody is POST /api/uploads { files }: 1 to 20 files that can become a post. Keys and the post type are the server's.
func CreateUploadBody(raw json.RawMessage) (CreateUpload, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (CreateUpload, string) {
		list, ok := m["files"].([]any)
		if !ok {
			_, present := m["files"]
			return CreateUpload{}, expected("array", m["files"], present)
		}
		// zod reports the array's length before its elements (the golden vectors pin this).
		switch {
		case len(list) < 1:
			return CreateUpload{}, "Too small: expected array to have >=1 items"
		case len(list) > domain.MaxPhotos*2:
			return CreateUpload{}, fmt.Sprintf("Too big: expected array to have <=%d items", domain.MaxPhotos*2)
		}
		files := make([]domain.UploadFile, 0, len(list))
		for _, v := range list {
			f, msg := file(v, false)
			if msg != "" {
				return CreateUpload{}, msg
			}
			files = append(files, f.UploadFile)
		}
		return CreateUpload{files}, domain.UploadProblem(files)
	})
}

// StoredFiles parses the `files` column of an upload intent. The error text is the first zod issue.
func StoredFiles(raw json.RawMessage) ([]domain.StoredFile, error) {
	list, ok := decode(raw).([]any)
	if !ok {
		return nil, errors.New(expected("array", decode(raw), true))
	}
	out := make([]domain.StoredFile, 0, len(list))
	for _, v := range list {
		f, msg := file(v, true)
		if msg != "" {
			return nil, errors.New(msg)
		}
		out = append(out, f)
	}
	return out, nil
}

// CreatePostBody is POST /api/posts: a wish, or the post an upload intent was issued for. Never a type or author.
func CreatePostBody(raw json.RawMessage) (CreatePost, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (CreatePost, string) {
		var p CreatePost
		id, set, msg := uuid(m, "postId", true)
		if msg != "" {
			return p, msg
		}
		if set {
			p.PostID = &id
		}

		c, set, msg := str(m, "caption", true)
		if c = domain.JSTrim(c); msg == "" && set {
			msg = maxLen(c, domain.CaptionMax)
			if msg != "" {
				msg = fmt.Sprintf("Captions can be up to %d characters.", domain.CaptionMax)
			}
		}
		if msg != "" {
			return p, msg
		}
		if c != "" {
			p.Caption = &c
		}

		w, set, msg := str(m, "wishText", true)
		if w = domain.JSTrim(w); msg == "" && set {
			// Code points, like Postgres char_length: two emoji are 4 UTF-16 units but 2 characters.
			switch n := domain.CodePoints(w); {
			case n < domain.WishMin:
				msg = fmt.Sprintf("A wish needs at least %d characters.", domain.WishMin)
			case n > domain.WishMax:
				msg = fmt.Sprintf("A wish can be up to %d characters.", domain.WishMax)
			}
			p.WishText = &w
		}
		if msg == "" && (p.PostID == nil) == (p.WishText == nil) {
			msg = "Send a wish or a post."
		}
		return p, msg
	})
}

// AdminLoginBody is { passcode }: 1 to 200 characters.
func AdminLoginBody(raw json.RawMessage) (AdminLogin, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (AdminLogin, string) {
		s, _, msg := str(m, "passcode", false)
		return AdminLogin{s}, first(msg, minLen1(s), maxLen(s, 200))
	})
}

// UpdateEventBody is PATCH /api/admin/event: any subset of the editable fields; at least one.
func UpdateEventBody(raw json.RawMessage) (UpdateEvent, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (UpdateEvent, string) {
		var u UpdateEvent
		text := func(key string, max int, required bool, dst **string) string {
			s, set, msg := str(m, key, true)
			if s = domain.JSTrim(s); set && msg == "" {
				msg = maxLen(s, max)
				if required && msg == "" {
					msg = minLen1(s)
				}
				*dst = &s
			}
			return msg
		}
		font := func(key string, dst **string) string {
			s, set, msg := str(m, key, true)
			if set {
				if !domain.IsFontKey(s) {
					msg = "Choose one of the listed fonts."
				}
				*dst = &s
			}
			return msg
		}
		open, set, msg := boolean(m, "uploadsOpen", true)
		if set {
			u.UploadsOpen = &open
		}
		// Shape order: names, header, QR account and bank, uploadsOpen, then the three fonts.
		msg = first(
			text("groomName", 40, true, &u.GroomName), text("brideName", 40, true, &u.BrideName),
			text("headerMessage", 120, false, &u.HeaderMessage), text("qrAccountName", 80, false, &u.QrAccountName),
			text("qrBank", 60, false, &u.QrBank), msg,
			font("fontNames", &u.FontNames), font("fontWishes", &u.FontWishes), font("fontBody", &u.FontBody),
		)
		if msg == "" && u == (UpdateEvent{}) {
			msg = "Nothing to change."
		}
		return u, msg
	})
}

// presign is the QR and monogram upload request; problem is qrProblem or monogramProblem.
func presign(raw json.RawMessage, problem func(mime string, bytes int64) string) (Presign, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (Presign, string) {
		mime, _, msg := str(m, "mime", false)
		msg = first(msg, maxLen(mime, 100))
		if msg != "" {
			return Presign{}, msg
		}
		n, _, msg := num(m, "bytes", false)
		if msg = first(msg, intMsg(n), positive(n)); msg != "" {
			return Presign{}, msg
		}
		return Presign{mime, int64(n)}, problem(mime, int64(n))
	})
}

// QrPresignBody is POST /api/admin/qr { mime, bytes }.
func QrPresignBody(raw json.RawMessage) (Presign, *httpx.AppError) {
	return presign(raw, domain.QrProblem)
}

// MonogramPresignBody is POST /api/admin/monogram { mime, bytes }.
func MonogramPresignBody(raw json.RawMessage) (Presign, *httpx.AppError) {
	return presign(raw, domain.MonogramProblem)
}

func confirm(raw json.RawMessage) (Confirm, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (Confirm, string) {
		key, _, msg := str(m, "key", false)
		return Confirm{key}, first(msg, minLen1(key), maxLen(key, 200))
	})
}

// QrConfirmBody is PUT /api/admin/qr { key }.
func QrConfirmBody(raw json.RawMessage) (Confirm, *httpx.AppError) { return confirm(raw) }

// MonogramConfirmBody is PUT /api/admin/monogram { key }.
func MonogramConfirmBody(raw json.RawMessage) (Confirm, *httpx.AppError) { return confirm(raw) }

// HideBody is { hidden }.
func HideBody(raw json.RawMessage) (Hide, *httpx.AppError) {
	return parse(raw, func(m map[string]any) (Hide, string) {
		h, _, msg := boolean(m, "hidden", false)
		return Hide{h}, msg
	})
}
