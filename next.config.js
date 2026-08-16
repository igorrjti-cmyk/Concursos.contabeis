/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "unpdf",
    "canvas",
    "sharp",
    "@napi-rs/canvas",
  ],

  // Garante que o arquivo da fonte Sora seja incluído no bundle das
  // funções serverless que geram cards no servidor — sem isso, a Vercel
  // pode não copiar a pasta /public para dentro da function, e o
  // GlobalFonts.registerFromPath falharia em produção.
  outputFileTracingIncludes: {
    "/api/cron/**": ["./public/fonts/**"],
  },

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
