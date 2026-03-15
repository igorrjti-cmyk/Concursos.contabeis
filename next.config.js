/** @type {import('next').NextConfig} */
const nextConfig = {
  // Módulos nativos — carregados pelo Node.js diretamente, não pelo webpack
  serverExternalPackages: [
    "pdfjs-dist",
    "canvas",
    "sharp",
  ],

  webpack(config) {
    // Ignora binários .node que o webpack não processa
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
