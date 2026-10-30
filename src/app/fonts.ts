// Every catalogue font (src/lib/domain/fonts.ts) is declared here. next/font needs each call written out
// as literals and assigned to its own module-level const (no spreads, no loops).
// preload:false means a font is only downloaded when the page's CSS actually uses it.
// Variable families omit `weight` so one file serves every weight the UI asks for; wishes are italic,
// so serifs load the italic style. Lato ships only 400/700, the others' static fonts only 400.
import {
  Alex_Brush,
  Allura,
  Cormorant_Garamond,
  Dancing_Script,
  EB_Garamond,
  Great_Vibes,
  Inter,
  Lato,
  Libre_Baskerville,
  Lora,
  Montserrat,
  Nunito,
  Parisienne,
  Pinyon_Script,
  Playfair_Display,
  Poppins,
  Raleway,
  Sacramento,
} from "next/font/google";

const pinyon_script = Pinyon_Script({
  variable: "--font-pinyon-script",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
});
const great_vibes = Great_Vibes({
  variable: "--font-great-vibes",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
});
const dancing_script = Dancing_Script({
  variable: "--font-dancing-script",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const allura = Allura({
  variable: "--font-allura",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
});
const parisienne = Parisienne({
  variable: "--font-parisienne",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
});
const alex_brush = Alex_Brush({
  variable: "--font-alex-brush",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
});
const sacramento = Sacramento({
  variable: "--font-sacramento",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
});
const cormorant_garamond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});
const playfair_display = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});
const libre_baskerville = Libre_Baskerville({
  variable: "--font-libre-baskerville",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});
const eb_garamond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "500", "600"],
});
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "700"],
});
const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const fontClassNames = [
  pinyon_script.variable,
  great_vibes.variable,
  dancing_script.variable,
  allura.variable,
  parisienne.variable,
  alex_brush.variable,
  sacramento.variable,
  cormorant_garamond.variable,
  playfair_display.variable,
  lora.variable,
  libre_baskerville.variable,
  eb_garamond.variable,
  poppins.variable,
  montserrat.variable,
  inter.variable,
  nunito.variable,
  lato.variable,
  raleway.variable,
].join(" ");
