/** @type {import('next').NextConfig} */

// Vercel sets VERCEL=1 during its build.
const isVercel = process.env.VERCEL === '1';

const nextConfig = {
  reactStrictMode: true,

  // `standalone` emits a self-contained server bundle so the Docker runtime
  // stage needs no node_modules — see frontend/Dockerfile.
  //
  // It is deliberately NOT enabled on Vercel. Vercel's own builder produces its
  // serverless output from `.next` and does not consume `.next/standalone`, so
  // there the option is at best dead build work and disk, and has historically
  // interfered with some Next releases. Scoping it to the Docker path keeps
  // both deployment targets doing exactly what they need and nothing more.
  ...(isVercel ? {} : { output: 'standalone' }),
};

export default nextConfig;
