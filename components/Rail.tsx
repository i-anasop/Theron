"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Workspace navigation.
 *
 * A narrow icon rail that expands to page names — names only. A description
 * under each item turns a wayfinder into something you have to read, and the
 * rail is glanced at, not studied.
 *
 * The two controls at the foot stay icon-only at every width: they are
 * chrome, not destinations, and giving them the same visual weight as the
 * pages would flatten the hierarchy the rail exists to create.
 */

const NAV = [
  {
    href: "/app",
    label: "Ask",
    icon: (
      <>
        <circle cx="12" cy="12" r="2.6" />
        <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4" />
        <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" />
      </>
    ),
  },
  {
    href: "/app/sites",
    label: "Monitor",
    icon: <path d="M3 12.5h4l2.5-6 4 12 2.5-6h5" />,
  },
  {
    href: "/app/impact",
    label: "Impact",
    icon: (
      <>
        <path d="M6 3.5h8L18.5 8v12.5H6V3.5Z" />
        <path d="M14 3.5V8h4.5" />
        <path d="M9.2 16.5v-2.8M12 16.5v-5M14.8 16.5v-1.6" />
      </>
    ),
  },
  {
    href: "/app/history",
    label: "Trail",
    icon: (
      <>
        <path d="M3.6 9.2A9 9 0 1 1 3 12" />
        <path d="M3.2 4.4v4.8h4.8" />
        <path d="M12 7.6V12l3.2 2" />
      </>
    ),
  },
];

export default function Rail() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem("theron.rail") === "1");
    } catch {
      /* storage unavailable — collapsed is a fine default */
    }
    setReady(true);
  }, []);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem("theron.rail", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside className={`rail ${open ? "open" : ""} ${ready ? "ready" : ""}`}>
      <Link href="/" className="rail-mark" aria-label="Theron home">
        <Image src="/logo.png" alt="" width={34} height={34} />
        <span className="rail-mark-name">Theron</span>
      </Link>

      <nav className="rail-nav" aria-label="Workspace">
        {NAV.map((n) => {
          const on = n.href === "/app" ? path === "/app" : path?.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`rail-item ${on ? "on" : ""}`} title={n.label}>
              <span className="rail-ico" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {n.icon}
                </svg>
              </span>
              <span className="rail-text">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="rail-foot">
        <a
          href="https://github.com/i-anasop/Theron"
          target="_blank"
          rel="noreferrer noopener"
          className="rail-mini"
          aria-label="Source on GitHub"
          title="Source on GitHub"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.93.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
          </svg>
        </a>

        <button
          className="rail-mini rail-toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          title={open ? "Collapse" : "Expand"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
            <path d="M9.8 4.5v15" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
