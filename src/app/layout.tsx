import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Concursos Contabeis | @concursos.contabeis",
  description:
    "Painel de concursos publicos para Ciencias Contabeis: contador, tecnico em contabilidade, auditor fiscal e mais.",
  openGraph: {
    title: "Concursos Contabeis",
    description: "Todos os concursos para Ciencias Contabeis em um so lugar.",
    siteName: "Concursos Contabeis",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning style={{ margin: 0, padding: 0, background: "#080F1E" }}>
        {children}
      </body>
    </html>
  );
}
