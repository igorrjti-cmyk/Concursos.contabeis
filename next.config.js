/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "unpdf",
    "canvas",
    "sharp",
    "@napi-rs/canvas",
  ],

  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.alias["unpdf"] = false;
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
