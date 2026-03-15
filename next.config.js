/** @type {import('next').NextConfig} */
const nextConfig = {
  // Módulos com binários nativos (.node) — carregados pelo Node.js diretamente
  serverExternalPackages: [
    "@resvg/resvg-js",
    "playwright",
    "playwright-core",
    "sharp",
    "canvas",
  ],

  webpack(config, { isServer }) {
    // Ignora arquivos binários .node que o webpack não sabe processar
    config.module.rules.push({
      test: /\.node$/,
      use: "ignore-loader",
    });

    // Alias para evitar que @resvg seja resolvido pelo webpack
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@resvg/resvg-js": false,
      };
    }

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
