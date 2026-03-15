import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Concursos Contábeis | @concursos.contabeis",
  description:
    "Painel de concursos públicos para Ciências Contábeis: contador, técnico em contabilidade, auditor fiscal e mais.",
  openGraph: {
    title: "Concursos Contábeis",
    description: "Todos os concursos para Ciências Contábeis em um só lugar.",
    siteName: "Concursos Contábeis",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, background: "#080F1E" }}>
        {children}
      </body>
    </html>
  );
}
