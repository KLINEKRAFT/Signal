import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { Header } from '@/components/Header';
import { HistoryList } from '@/components/HistoryList';
import { EmptyState } from '@/components/EmptyState';
import { Footer } from '@/components/Footer';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100);

  return (
    <>
      <Header current="history" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-medium tracking-[0.08em] sm:text-3xl">
            HISTORY
          </h1>
          <span className="label">{rows.length} RECORDINGS</span>
        </div>

        <div className="mt-10">
          {rows.length === 0 ? (
            <EmptyState
              label="NO SOURCE LOADED"
              detail="Nothing has been processed yet. Upload a recording to get started."
              action={
                <Link
                  href="/"
                  className="label inline-block border border-line px-5 py-3 transition-colors hover:border-line-lit hover:text-paper"
                >
                  Upload media
                </Link>
              }
            />
          ) : (
            <HistoryList
              rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
