import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import { themeBootstrapScript } from '@/components/ThemeToggle';
import './globals.css';

const grotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SIGNAL // Media Intelligence',
  description:
    'Turn recordings into something useful. Upload video or audio and SIGNAL will transcribe it, understand it, and turn it into a clear professional recap.',
  applicationName: 'SIGNAL',
};

export const viewport: Viewport = {
  // One entry per scheme so the browser chrome matches whichever is showing,
  // rather than pinning a dark bar above a light page.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    { media: '(prefers-color-scheme: light)', color: '#f2f1ed' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${plexMono.variable}`}>
      <head>
        {/* Before first paint, so a chosen light theme never flashes dark. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-ink text-paper antialiased">{children}</body>
    </html>
  );
}
