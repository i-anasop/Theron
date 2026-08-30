"use client";

import { useEffect, useState } from "react";

/**
 * Sticky section navigation with scroll-spy.
 *
 * Tracks whichever heading is nearest the top of the viewport rather than
 * whichever is merely intersecting — with short sections, plain intersection
 * lights up two or three entries at once and the reader loses their place.
 */

export interface DocsSection {
  id: string;
  label: string;
}

export default function DocsNav({ sections }: { sections: DocsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const onScroll = () => {
      let best = sections[0]?.id ?? "";
      let bestTop = Infinity;

      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        // Prefer the last heading that has passed the reading line (~120px).
        if (top <= 130 && Math.abs(top - 130) < bestTop) {
          bestTop = Math.abs(top - 130);
          best = s.id;
        }
      }
      setActive(best);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  return (
    <nav className="docsnav" aria-label="Sections">
      <span className="label docsnav-title">On this page</span>
      <ol>
        {sections.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className={active === s.id ? "on" : ""}>
              <span className="docsnav-n">{String(i + 1).padStart(2, "0")}</span>
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
