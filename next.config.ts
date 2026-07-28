import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_ACTIONS === "true";
const repoName = "odyssey-narrator";

const nextConfig: NextConfig = {
  // Use standalone for dev server, export for GitHub Pages CI
  output: isGithubPages ? "export" : "standalone",
  // GitHub Pages serves from /<repo-name>/, so we need a basePath
  basePath: isGithubPages ? `/${repoName}` : "",
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
};

export default nextConfig;
