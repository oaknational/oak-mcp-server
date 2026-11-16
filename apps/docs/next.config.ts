import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  compiler: { styledComponents: true },
  // Oak's components ship without stable styled-components ids. Transpiling them lets the compiler
  // give each one a fixed id, so server and client classes cannot collide.
  transpilePackages: ['@oaknational/oak-components'],
};

export default config;
