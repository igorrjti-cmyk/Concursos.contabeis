/** @type {import('next').NextConfig} */
const nextConfig = {
  // Marca módulos nativos (.node) como externos ao webpack.
  // Sem isso, o webpack tenta fazer parse de binários e falha no build.
  serverExternalPackages: [
    "@resvg/resvg-js",
    "playwright",
    "playwright-core",
    "sharp",
  ],

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
