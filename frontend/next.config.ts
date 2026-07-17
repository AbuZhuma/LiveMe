import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://127.0.0.1:8080/api/:path*" },
      { source: "/uploads/:path*", destination: "http://127.0.0.1:8080/uploads/:path*" },
      { source: "/aac/:path*", destination: "http://127.0.0.1:8888/aac/:path*" },
      { source: "/whip", destination: "http://127.0.0.1:8889/live/main/whip" },
      { source: "/live/:path*", destination: "http://127.0.0.1:8889/live/:path*" },
    ];
  },
};

export default nextConfig;
