import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { FONT_GATE_MS, fontGate } from "@/lib/fontGate";
import { fontClassNames } from "./fonts";
import { ThemeStyle } from "./ThemeStyle";

export const metadata: Metadata = {
  title: "Wedding Memories",
  description: "Share photos, videos and wishes from the wedding.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#5e1e2b", // mirrors --paper; single light theme, so no per-scheme pair
  colorScheme: "only light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-fonts: the inline script flips it to "ready" before React hydrates, hence suppressHydrationWarning.
    <html lang="en" data-decor="on" data-fonts="loading" className={fontClassNames} suppressHydrationWarning>
      <head>
        {/* Text shows as skeleton bars until the chosen fonts load (max 2.5 s): no fallback-font flash. */}
        <script dangerouslySetInnerHTML={{ __html: `(${fontGate.toString()})(document,${FONT_GATE_MS})` }} />
        <noscript>
          <style>{`[data-fonts] .bone{color:inherit!important;background:none!important;animation:none!important}`}</style>
        </noscript>
      </head>
      <body>
        <Suspense>
          <ThemeStyle />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
