import { MakerMark } from './BrandMark';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="label">SIGNAL // MEDIA INTELLIGENCE</p>
        <div className="flex items-center gap-3">
          <span className="label">BUILT BY</span>
          <MakerMark />
        </div>
      </div>
    </footer>
  );
}
