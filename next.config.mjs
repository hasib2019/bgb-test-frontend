/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits a minimal self-contained server bundle so the Docker runtime stage
  // does not need node_modules at all.
  output: 'standalone',
};

export default nextConfig;
