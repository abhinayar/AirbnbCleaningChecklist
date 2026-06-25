/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-lib + sharp are server-only native/heavy deps; keep them external to the bundle.
  experimental: {
    serverComponentsExternalPackages: ["sharp", "pdf-lib"],
  },
};

export default nextConfig;
