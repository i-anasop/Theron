import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://theron-ops.vercel.app"),
  title: {
    default: "Theron — Autonomous Heat Safety for Outdoor Crews",
    template: "%s · Theron",
  },
  description:
    "Theron watches outdoor worksites for dangerous heat and, when a shift is unsafe, proves which " +
    "alternative window is safer and by how much — measured against the FortyGuard Temperature API, " +
    "never estimated.",
  openGraph: {
    title: "Theron — Autonomous Heat Safety for Outdoor Crews",
    description:
      "It doesn't recommend a shift change. It proves one — with every API call it made shown on the page.",
    images: ["/logo.png"],
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
