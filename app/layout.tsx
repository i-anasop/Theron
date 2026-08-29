import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Theron — Heat Safety Operations Agent",
  description:
    "An autonomous agent that plans its own FortyGuard API calls, baselines each worksite against its own " +
    "history, and reschedules shifts before crews are hurt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
