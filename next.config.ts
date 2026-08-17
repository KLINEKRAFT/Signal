import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Media never passes through a Function, so no body-size overrides are needed.
  // Everything here runs on the Node runtime; nothing needs the edge runtime.

  // The PDF exporter reads its fonts and the maker's mark from disk at request
  // time. Next's tracer follows imports, not readFileSync paths, so without
  // this the files are absent from the deployed function and every export
  // fails in production while working perfectly in dev.
  outputFileTracingIncludes: {
    '/api/jobs/[id]/export': [
      './lib/exports/fonts/**',
      './public/klinekraft-logo.png',
    ],
  },
};

export default nextConfig;
