/** @type {import('next').NextConfig} */

// `output: 'standalone'` emits a self-contained server bundle at
// .next/standalone, which is what frontend/Dockerfile copies into its runtime
// stage so the image needs no node_modules.
//
// It is opt-in rather than on-by-default because it is incompatible with
// `next start` — Next refuses to serve a standalone build that way. Leaving it
// always-on broke `npm run build && npm start` locally (and therefore the
// Playwright E2E suite, which starts the real production server).
//
// Gated on an explicit flag rather than on "not Vercel": the Docker build is
// the one and only consumer, so it should be the one asking for it.
const wantsStandalone = process.env.BUILD_STANDALONE === '1';

const nextConfig = {
  reactStrictMode: true,
  ...(wantsStandalone ? { output: 'standalone' } : {}),
};

export default nextConfig;
