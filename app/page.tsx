import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { UploadFlow } from '@/components/UploadFlow';

export default function HomePage() {
  return (
    <>
      <Header current="upload" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-12 sm:px-8 sm:pt-20">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-medium leading-[1.1] tracking-[-0.01em] sm:text-5xl">
            TURN RECORDINGS INTO
            <br />
            SOMETHING USEFUL.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-gray sm:text-lg">
            Upload video or audio. SIGNAL will transcribe it, understand it, and turn it into a
            clear professional recap.
          </p>
        </div>

        <div className="mt-12 sm:mt-16">
          <UploadFlow />
        </div>
      </main>

      <Footer />
    </>
  );
}
