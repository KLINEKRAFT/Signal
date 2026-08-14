import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadJob } from '@/lib/db/queries';
import { Header } from '@/components/Header';
import { JobView } from '@/components/JobView';
import { Footer } from '@/components/Footer';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const payload = await loadJob(id);
  if (!payload) return { title: 'Not found // SIGNAL' };
  return { title: `${payload.job.title || payload.job.originalFilename} // SIGNAL` };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Rendered server-side so a returning visitor sees the finished recap in the
  // first paint rather than a spinner that resolves into one.
  const payload = await loadJob(id);
  if (!payload) notFound();

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <JobView initial={payload} />
      </main>
      <Footer />
    </>
  );
}
