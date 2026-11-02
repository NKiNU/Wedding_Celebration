import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
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
    <html lang="en" data-decor="on" className={fontClassNames}>
      <body>
        <Suspense>
          <ThemeStyle />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
