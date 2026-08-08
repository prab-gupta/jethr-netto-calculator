import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/**
 * The product font is a geometric grotesque with a double-storey "a" —
 * closest to General Sans / Satoshi, neither of which is on Google Fonts.
 * Plus Jakarta Sans is the same shape and self-hosts at build with no files
 * to source. Close enough that the resemblance carries.
 */
const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Simulatore netto — Jet HR",
  description:
    "Dalla RAL al netto in busta paga: proiezione annuale e mensile con il dettaglio di tutte le trattenute. Regole fiscali 2026.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full">
        {/* Base UI (not Radix) — the prop is `delay`, not `delayDuration`. */}
        <TooltipProvider delay={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
