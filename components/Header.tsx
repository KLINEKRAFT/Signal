import Link from 'next/link';
import { BrandMark } from './BrandMark';

export function Header({ current }: { current?: 'upload' | 'history' }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="SIGNAL home">
          <BrandMark />
          <span className="label hidden sm:inline">SIGNAL // MEDIA INTELLIGENCE</span>
        </Link>

        <nav className="flex items-center gap-5">
          <Link
            href="/"
            className={`label transition-colors hover:text-paper ${
              current === 'upload' ? 'text-paper' : ''
            }`}
          >
            Upload
          </Link>
          <Link
            href="/history"
            className={`label transition-colors hover:text-paper ${
              current === 'history' ? 'text-paper' : ''
            }`}
          >
            History
          </Link>
        </nav>
      </div>
    </header>
  );
}
