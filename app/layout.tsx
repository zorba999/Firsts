import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { SmoothScroll } from "@/components/Motion";
import { Cursor, Footer, Nav, Preloader, Textures } from "@/components/Chrome";

// Archivo carries a width axis, which is what lets the display type go wide
// without a second family. JetBrains Mono does the HUD labelling.
const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FIRSTS — points-of-issue oracle for rare books",
  description:
    "Adjudicate whether a copy is a true first printing, point by point, on GenLayer. Validators re-derive every verdict; the score is deterministic; the certificate is on-chain.",
  openGraph: {
    title: "FIRSTS — points-of-issue oracle for rare books",
    description:
      "Point-by-point first-edition adjudication on GenLayer. Verifiable, appealable, permanent.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <WalletProvider>
          <Preloader />
          <Textures />
          <Cursor />
          <SmoothScroll>
            <Nav />
            <main style={{ paddingTop: "var(--nav-h)" }}>{children}</main>
            <Footer />
          </SmoothScroll>
        </WalletProvider>
      </body>
    </html>
  );
}
