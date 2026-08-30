import { Fragment, type ReactNode } from "react";

/**
 * A small Markdown renderer for model output.
 *
 * Builds React elements directly rather than setting innerHTML. The text comes
 * from a language model, so it is untrusted by construction — going through
 * React's element tree means nothing in it can ever be interpreted as markup,
 * without needing a sanitiser to be correct.
 *
 * Deliberately partial. It covers what the agent actually emits — headings,
 * bullets, numbered lists, bold, italic, inline code — and renders anything
 * else as plain text rather than guessing.
 */

/** Inline spans: **bold**, *italic*, _italic_, `code`. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-i${i++}`;

    if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={`p${k++}`}>{inline(para.join(" "), `p${k}`)}</p>);
    para = [];
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, n) => <li key={n}>{inline(it, `l${k}-${n}`)}</li>);
    blocks.push(
      list.ordered ? <ol key={`l${k++}`}>{items}</ol> : <ul key={`l${k++}`}>{items}</ul>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      // Model headings are section labels inside a short answer, not document
      // structure — render them all at one modest weight.
      blocks.push(
        <h4 key={`h${k++}`} className="md-h">
          {inline(heading[2], `h${k}`)}
        </h4>,
      );
      continue;
    }

    if (BULLET.test(line)) {
      flushPara();
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const item = line.replace(BULLET, "");
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      continue;
    }

    flushList();
    para.push(line.trim());
  }

  flushPara();
  flushList();

  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
