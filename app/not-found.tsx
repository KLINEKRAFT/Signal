import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-24 sm:px-8">
        <p className="label label-lit">NO SOURCE LOADED</p>
        <h1 className="mt-4 font-display text-3xl font-medium tracking-[0.06em]">
          THAT RECORDING ISN&apos;T HERE.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-gray">
          It may have been deleted, or the link may be wrong.
        </p>
        <Link
          href="/"
          className="label mt-8 inline-block border border-line px-5 py-3 transition-colors hover:border-line-lit hover:text-paper"
        >
          Back to upload
        </Link>
      </main>
      <Footer />
    </>
  );
}
