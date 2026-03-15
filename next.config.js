/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "pdfjs-dist",
    "canvas",
    "sharp",
  ],

  webpack(config, { isServer }) {
    if (!isServer) {
      // Não inclui pdfjs-dist no bundle do cliente
      config.resolve.alias["pdfjs-dist"] = false;
    }
    config.module.rules.push({
      test: /\.node$/,
      use: "ignore-loader",
    });
    return config;
  },

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

module.exports = nextConfig;
