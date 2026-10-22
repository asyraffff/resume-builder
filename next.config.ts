import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The ATS step used to live at /analyze; keep old links and bookmarks working.
  async redirects() {
    return [{ source: "/analyze", destination: "/ats", permanent: true }];
  },
  // Basic hardening: no framing (clickjacking), no MIME sniffing, no full URLs leaked to other sites,
  // and no camera/microphone/location access.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
