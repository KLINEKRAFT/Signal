import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Media never passes through a Function, so no body-size overrides are needed.
  // Everything here runs on the Node runtime; nothing needs the edge runtime.
};

export default nextConfig;
