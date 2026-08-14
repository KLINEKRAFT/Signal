'use client';

export type TabKey = 'recap' | 'transcript' | 'takeaways' | 'quotes' | 'generate' | 'details';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'recap', label: 'RECAP' },
  { key: 'transcript', label: 'TRANSCRIPT' },
  { key: 'takeaways', label: 'TAKEAWAYS' },
  { key: 'quotes', label: 'QUOTES' },
  { key: 'generate', label: 'GENERATE' },
  { key: 'details', label: 'DETAILS' },
];

/**
 * Horizontally scrollable on phones rather than wrapped or collapsed into a
 * select — six short labels stay legible and tappable that way, and the
 * active tab is never hidden behind a menu.
 */
export function ResultTabs({
  active,
  onChange,
  counts,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  counts: { takeaways: number; quotes: number };
}) {
  return (
    <div className="-mx-5 overflow-x-auto border-b border-line px-5 sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="tablist" className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const count =
            tab.key === 'takeaways'
              ? counts.takeaways
              : tab.key === 'quotes'
                ? counts.quotes
                : null;
          const selected = active === tab.key;

          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(tab.key)}
              className={`label relative flex items-center gap-2 px-4 py-4 transition-colors ${
                selected ? 'text-paper' : 'hover:text-paper'
              }`}
            >
              {tab.label}
              {count ? <span className="data text-[10px] text-gray-dim">{count}</span> : null}
              {selected ? (
                <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-accent" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
