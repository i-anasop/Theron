"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/console", label: "Console" },
  { href: "/method", label: "Method" },
  { href: "/impact", label: "Impact" },
];

export default function Nav() {
  const path = usePathname();

  return (
    <nav className="nav">
      <div className="nav-in">
        <Link href="/" className="brand">
          <Image src="/logo.png" alt="" width={32} height={32} priority />
          <span className="brand-name">Theron</span>
        </Link>

        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={path?.startsWith(l.href) ? "on" : ""}>
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/i-anasop/Theron"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Source on GitHub"
          >
            Source
          </a>
        </div>
      </div>
    </nav>
  );
}
