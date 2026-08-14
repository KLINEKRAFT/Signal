import { Fragment } from 'react';

/**
 * A small Markdown renderer for generated prose.
 *
 * Deliberately not a dependency: the model is instructed to produce headings,
 * bullets, bold, and rules, and that is the whole grammar. Pulling in a full
 * parser plus a sanitiser to render six constructs would add more surface than
 * it removes — and this never renders user-supplied HTML, because it never
 * renders HTML at all.
 */
export function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split('\n');
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="my-3 space-y-2">
        {list.map((item, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-paper/90">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 bg-accent" />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      list.push(numbered[1]);
      return;
    }

    flushList(`list-${i}`);

    if (!line.trim()) return;

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<div key={i} aria-hidden className="dot-rule my-6" />);
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const depth = heading[1].length;
      blocks.push(
        depth <= 2 ? (
          <h3
            key={i}
            className="mt-6 font-display text-xs font-medium uppercase tracking-[0.14em] text-paper first:mt-0"
          >
            {inline(heading[2])}
          </h3>
        ) : (
          <h4 key={i} className="mt-5 font-display text-sm font-medium text-paper first:mt-0">
            {inline(heading[2])}
          </h4>
        ),
      );
      return;
    }

    if (/^\s*>\s?/.test(line)) {
      blocks.push(
        <blockquote
          key={i}
          className="my-3 border-l border-accent pl-4 text-[15px] leading-relaxed text-paper/85"
        >
          {inline(line.replace(/^\s*>\s?/, ''))}
        </blockquote>,
      );
      return;
    }

    blocks.push(
      <p key={i} className="my-3 text-[15px] leading-relaxed text-paper/90">
        {inline(line)}
      </p>,
    );
  });

  flushList('list-end');

  return <div className="[&>*:first-child]:mt-0">{blocks}</div>;
}

/** Bold, italic, and inline code. Everything else stays literal text. */
function inline(text: string): React.ReactNode {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\n]+\*(?!\w))/g;
  const parts = text.split(pattern).filter((part) => part !== undefined && part !== '');

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-medium text-paper">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="data border border-line px-1 py-0.5 text-[13px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
