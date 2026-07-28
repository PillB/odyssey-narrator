import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_ACTIONS === "true";
const repoName = "odyssey-narrator";
const basePath = isGithubPages ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  // Use standalone for dev server, export for GitHub Pages CI
  output: isGithubPages ? "export" : "standalone",
  // GitHub Pages serves from /<repo-name>/, so we need a basePath
  basePath: basePath || undefined,
  assetPrefix: isGithubPages ? `/${repoName}/` : undefined,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Trailing slash so static HTML files work on GitHub Pages
  trailingSlash: isGithubPages,
  // Expose basePath to client-side code so fetch() calls can prepend it.
  // Next.js auto-prepends basePath for <Link> and <Image> but NOT for fetch().
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
