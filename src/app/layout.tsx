import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Pinyon_Script, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const pinyon = Pinyon_Script({
  variable: "--font-pinyon",
  subsets: ["latin"],
  weight: "400",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Wedding Memories",
  description: "Share photos, videos and wishes from the wedding.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f4f3ef", // ponytail: mirrors --paper; single light theme, so no per-scheme pair
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-decor="on"
      className={`${poppins.variable} ${pinyon.variable} ${cormorant.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
