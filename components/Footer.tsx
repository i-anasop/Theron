import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="site-foot">
      <div className="foot-in">
        <div>
          <div className="foot-brand">
            <Image src="/logo.png" alt="" width={28} height={28} />
            <strong style={{ fontWeight: 640, letterSpacing: "-.02em" }}>Theron</strong>
          </div>
          <p className="foot-note-sm">
            Autonomous heat-safety operations, built on FortyGuard&rsquo;s Temperature API. Thresholds
            reference OSHA&rsquo;s <em>proposed</em> heat injury and illness prevention standard &mdash; a
            proposed rule, not settled law.
          </p>
        </div>

        <div className="foot-links">
          <Link href="/console">Console</Link>
          <Link href="/method">Method</Link>
          <Link href="/impact">Impact</Link>
          <a href="https://github.com/i-anasop/Theron" target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
