import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

// DESIGN.md §1: IBM Plex Sans for UI, IBM Plex Mono for numbers, codes,
// metadata and labels. §2 restricts the interior to two weights (400/500);
// 600 is reserved for panel heads and metrics.
const sans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Küsimustik",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="et" className={cn("font-sans", sans.variable, mono.variable)}>
      <body>{children}</body>
    </html>
  );
}
