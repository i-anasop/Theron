import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./workspace.css";
import "./home.css";
import "./hero3d.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://theron-ops.vercel.app"),
  title: {
    default: "Theron — Autonomous Heat Safety for Outdoor Crews",
    template: "%s · Theron",
  },
  description:
    "Theron checks how hot each worksite will actually get, decides whether the scheduled shift is safe, " +
    "and proves which alternative window is safer and by how much.",
  openGraph: {
    title: "Theron — Autonomous Heat Safety for Outdoor Crews",
    description: "Know if your crew can work today. Measured, not estimated.",
    images: ["/logo.png"],
    type: "website",
  },
};

/** Root shell only. Each zone supplies its own chrome. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
