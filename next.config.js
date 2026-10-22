/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sale activado SOLO cuando el build corre dentro del contenedor
  // (BUILD_TARGET=container, que pone el Dockerfile). En Vercel la variable no
  // existe, el valor queda undefined y el build es idéntico al de siempre.
  // "standalone" hace que Next copie a .next/standalone el servidor con sus
  // dependencias ya resueltas, que es lo que Cloud Run necesita para arrancar
  // sin node_modules completo.
  output: process.env.BUILD_TARGET === "container" ? "standalone" : undefined,
  // react-pdf trae binarios de fuentes y módulos ESM que el bundler de Next
  // rompe si intenta empaquetarlos: se deja como dependencia externa.
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
    // pdfkit carga sus fuentes estándar con un require dinámico que el
    // rastreo de archivos de Vercel no ve: sin esto, en producción falla con
    // «Cannot find module …/pdfkit/js/standard-fonts/Helvetica.cjs».
    outputFileTracingIncludes: {
      "/api/admin/informe-vacante/**": [
        "./node_modules/pdfkit/js/standard-fonts/**/*",
        "./node_modules/pdfkit/js/data/**/*",
      ],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "cdn.prod.website-files.com" },
    ],
  },
};

module.exports = nextConfig;
