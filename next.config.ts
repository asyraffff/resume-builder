import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ATS step used to live at /analyze; keep old links and bookmarks working.
  async redirects() {
    return [{ source: "/analyze", destination: "/ats", permanent: true }];
  },
};

export default nextConfig;
