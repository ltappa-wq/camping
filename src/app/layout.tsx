import type { Metadata } from "next";
import { DM_Serif_Display, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Public-flow design (Phase 6a design pass) leans on three families:
// Inter for body, DM Serif Display for headlines, JetBrains Mono for codes.
// Each is exposed as a CSS variable so Tailwind's font-{sans,serif,mono}
// utilities map to the right family without per-page boilerplate.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Camping",
  description: "Campsite booking platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
