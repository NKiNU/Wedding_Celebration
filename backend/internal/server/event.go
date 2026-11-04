package server

import "context"

// PublicEvent is GET /api/event: exactly the event fields the Next.js pages render (welcome
// screen, wall header, ThemeStyle). Not a new feature: the pages read these with getEvent() today.
// Never the raw QR key; the QR itself is served by /qr.
type PublicEvent struct {
	ID            string      `json:"id"`
	GroomName     string      `json:"groomName"`
	BrideName     string      `json:"brideName"`
	HeaderMessage *string     `json:"headerMessage"`
	MonogramURL   *string     `json:"monogramUrl"`
	UploadsOpen   bool        `json:"uploadsOpen"`
	QR            PublicQR    `json:"qr"`
	Fonts         PublicFonts `json:"fonts"`
}

// PublicQR is what the wall passes to the DuitNow QR drawer.
type PublicQR struct {
	Available   bool    `json:"available"`
	AccountName *string `json:"accountName"`
	Bank        *string `json:"bank"`
}

// PublicFonts are the raw font keys (null = default); the page's themeCss applies the defaults.
type PublicFonts struct {
	Names  *string `json:"names"`
	Wishes *string `json:"wishes"`
	Body   *string `json:"body"`
}

// PublicEvent is the event as the pages read it.
func (a *App) PublicEvent(ctx context.Context) (PublicEvent, error) {
	e, err := a.Event(ctx)
	if err != nil {
		return PublicEvent{}, err
	}
	return PublicEvent{
		ID: e.ID, GroomName: e.GroomName, BrideName: e.BrideName, HeaderMessage: e.HeaderMessage,
		MonogramURL: a.MediaURL(e.MonogramPath), UploadsOpen: e.UploadsOpen,
		QR:    PublicQR{Available: e.QRPath != nil, AccountName: e.QRAccountName, Bank: e.QRBank},
		Fonts: PublicFonts{Names: e.FontNames, Wishes: e.FontWishes, Body: e.FontBody},
	}, nil
}
