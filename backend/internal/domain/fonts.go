package domain

// FontRole is one of the three places the admin can choose a font for.
type FontRole string

const (
	FontNames  FontRole = "names"
	FontWishes FontRole = "wishes"
	FontBody   FontRole = "body"
)

// fontKeys are the curated Google Fonts (src/lib/domain/fonts.ts FONT_OPTIONS keys).
var fontKeys = []string{
	"pinyon-script", "great-vibes", "dancing-script", "allura", "parisienne", "alex-brush", "sacramento",
	"cormorant-garamond", "playfair-display", "lora", "libre-baskerville", "eb-garamond",
	"poppins", "montserrat", "inter", "nunito", "lato", "raleway",
}

// DefaultFonts is the font each role falls back to.
var DefaultFonts = map[FontRole]string{
	FontNames:  "pinyon-script",
	FontWishes: "cormorant-garamond",
	FontBody:   "poppins",
}

// IsFontKey reports whether key is in the catalogue.
func IsFontKey(key string) bool {
	for _, k := range fontKeys {
		if k == key {
			return true
		}
	}
	return false
}

// FontOrDefault is key when it is a catalogue key (an empty key means unset), else the role's default.
func FontOrDefault(role FontRole, key string) string {
	if IsFontKey(key) {
		return key
	}
	return DefaultFonts[role]
}
