import Link from "next/link";
import Image from "next/image";
import Footer from "@/components/Footer";

/**
 * Public chrome.
 *
 * The top bar carries exactly two destinations. Anything more turns the home
 * page into a menu, and the one thing a visitor should do here is start.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand">
            <Image src="/logo.png" alt="" width={32} height={32} priority />
            <span className="brand-name">Theron</span>
          </Link>

          <div className="topbar-actions">
            <a
              href="https://github.com/i-anasop/Theron"
              target="_blank"
              rel="noreferrer noopener"
              className="icon-btn"
              aria-label="Source on GitHub"
              title="Source on GitHub"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="19" height="19" aria-hidden>
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.93.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
            </a>

            <Link href="/app" className="btn">
              Let&rsquo;s Start
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden>
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>
      <Footer />
    </>
  );
}
