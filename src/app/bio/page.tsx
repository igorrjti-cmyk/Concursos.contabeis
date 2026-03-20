"use client";

import { useEffect, useState } from "react";

interface BioItem {
  id: string;
  cargo: string;
  orgao: string;
  estado: string;
  salario: string;
  vagas: string;
  nivel: string;
  banca: string;
  status: string;
  inscricaoAte: string;
  diasRestantes: number;
  dataProva: string;
  linkEdital: string;
  linkNoticia: string;
  posted_at: string;
  ativo: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  "Inscricoes Abertas": "#00C896",
  "Aguardando Prova":   "#A78BFA",
  "Previsto":           "#FFB800",
  "Encerrado":          "#666",
};

const STATUS_LABEL: Record<string, string> = {
  "Inscricoes Abertas": "Inscrições Abertas",
  "Aguardando Prova":   "Aguardando Prova",
  "Previsto":           "Previsto",
  "Encerrado":          "Encerrado",
};

function diasLabel(dias: number, status: string): string {
  if (status === "Encerrado") return "Encerrado";
  if (status === "Aguardando Prova") return "Aguardando Prova";
  if (dias === 0) return "⚡ Encerra hoje!";
  if (dias === 1) return "⚡ Encerra amanhã!";
  if (dias > 0 && dias <= 7) return `⚡ ${dias}d restantes`;
  if (dias > 0) return `📅 ${dias} dias`;
  return "Encerrado";
}

export default function BioPage() {
  const [items, setItems]       = useState<BioItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [atualizado, setAtualizado] = useState("");
  const [filtro, setFiltro]     = useState<"todos" | "ativos">("ativos");

  useEffect(() => {
    fetch("/api/bio")
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setItems(d.items);
          setAtualizado(new Date(d.atualizado).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const exibidos = filtro === "ativos"
    ? items.filter(i => i.ativo && i.status !== "Encerrado")
    : items;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#060E20",
      fontFamily: "'Sora', sans-serif",
      color: "#fff",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.6 } }
        .card {
          animation: fadeUp .4s ease both;
          transition: transform .18s, border-color .18s, box-shadow .18s;
        }
        .card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 40px rgba(0,200,150,.12);
        }
        .btn-link {
          transition: all .15s;
        }
        .btn-link:hover {
          opacity: .85;
          transform: scale(1.02);
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,200,150,.2); border-radius: 4px; }
        @media (max-width: 500px) {
          .card-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(180deg, rgba(0,200,150,.08) 0%, transparent 100%)",
        borderBottom: "1px solid rgba(0,200,150,.1)",
        padding: "40px 20px 32px",
        textAlign: "center",
      }}>
        {/* Logo / Avatar */}
        <div style={{
          width: 72, height: 72,
          background: "linear-gradient(135deg,#00C896,#00788A)",
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          fontSize: 32,
          boxShadow: "0 0 32px rgba(0,200,150,.35)",
        }}>
          🧾
        </div>

        <h1 style={{
          background: "linear-gradient(90deg,#00C896,#00E5A8)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px",
          marginBottom: 6,
        }}>
          Concursos Contábeis
        </h1>

        <p style={{ color: "rgba(255,255,255,.4)", fontSize: 13, marginBottom: 4 }}>
          @concursos.contabeis · pciconcursos.com.br
        </p>

        <p style={{ color: "rgba(255,255,255,.25)", fontSize: 11 }}>
          Todos os editais dos concursos publicados no Instagram
        </p>

        {atualizado && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.15)",
            borderRadius: 20, padding: "4px 12px", marginTop: 14,
            color: "#00C896", fontSize: 10, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00C896", animation: "pulse 2s infinite", display: "inline-block" }} />
            Atualizado {atualizado}
          </div>
        )}
      </div>

      {/* ── FILTROS ── */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 8,
        padding: "20px 20px 0",
      }}>
        {(["ativos", "todos"] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            background: filtro === f ? "rgba(0,200,150,.12)" : "transparent",
            border: `1px solid ${filtro === f ? "#00C896" : "rgba(255,255,255,.1)"}`,
            color: filtro === f ? "#00C896" : "rgba(255,255,255,.35)",
            borderRadius: 20, padding: "6px 18px",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            transition: "all .15s",
          }}>
            {f === "ativos" ? "✅ Inscrições abertas" : "📋 Todos publicados"}
          </button>
        ))}
      </div>

      {/* ── CONTADOR ── */}
      {!loading && (
        <p style={{
          textAlign: "center", color: "rgba(255,255,255,.2)",
          fontSize: 11, marginTop: 14,
        }}>
          {exibidos.length} concurso{exibidos.length !== 1 ? "s" : ""}
          {filtro === "ativos" ? " com inscrições abertas" : " publicados"}
        </p>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{
            width: 36, height: 36,
            border: "3px solid rgba(0,200,150,.15)",
            borderTop: "3px solid #00C896",
            borderRadius: "50%",
            animation: "pulse .8s linear infinite",
            margin: "0 auto 12px",
          }} />
          <p style={{ color: "rgba(255,255,255,.3)", fontSize: 12 }}>Carregando editais...</p>
        </div>
      )}

      {/* ── LISTA ── */}
      {!loading && (
        <div style={{
          maxWidth: 600, margin: "0 auto",
          padding: "16px 16px 48px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {exibidos.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,.2)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {filtro === "ativos" ? "Nenhum concurso ativo no momento" : "Nenhum post registrado ainda"}
              </div>
            </div>
          )}

          {exibidos.map((item, idx) => {
            const cor = STATUS_COLOR[item.status] ?? "#666";
            const isPdf = item.linkEdital?.toLowerCase().endsWith(".pdf");
            const link = item.linkEdital || item.linkNoticia || "#";
            const urgente = item.diasRestantes >= 0 && item.diasRestantes <= 7 && item.status === "Inscricoes Abertas";

            return (
              <div key={item.id} className="card" style={{
                animationDelay: `${idx * 40}ms`,
                background: urgente
                  ? "rgba(255,75,75,.04)"
                  : item.ativo
                    ? "rgba(255,255,255,.03)"
                    : "rgba(255,255,255,.015)",
                border: `1px solid ${urgente ? "rgba(255,75,75,.2)" : item.ativo ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.04)"}`,
                borderRadius: 16,
                overflow: "hidden",
                opacity: item.ativo ? 1 : 0.55,
              }}>
                {/* Barra de status lateral */}
                <div style={{
                  height: 3,
                  background: `linear-gradient(90deg, ${cor}, transparent)`,
                  opacity: item.ativo ? .7 : .3,
                }} />

                <div style={{ padding: "14px 16px" }}>
                  {/* Cabeçalho */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 800, fontSize: 15, color: "#fff",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {item.cargo}
                      </div>
                      <div style={{ color: "#00C896", fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                        {item.orgao}
                      </div>
                      <div style={{ color: "rgba(255,255,255,.3)", fontSize: 10, marginTop: 2 }}>
                        {item.estado}{item.banca !== "-" ? ` · ${item.banca}` : ""} · {item.nivel}
                      </div>
                    </div>

                    {/* Badge status */}
                    <div style={{ flexShrink: 0 }}>
                      {urgente ? (
                        <span style={{
                          background: "rgba(255,75,75,.15)", color: "#FF4B4B",
                          fontSize: 10, fontWeight: 800, padding: "3px 10px",
                          borderRadius: 20, whiteSpace: "nowrap",
                          border: "1px solid rgba(255,75,75,.25)",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }}>
                          {diasLabel(item.diasRestantes, item.status)}
                        </span>
                      ) : (
                        <span style={{
                          background: cor + "15", color: cor,
                          fontSize: 10, fontWeight: 700, padding: "3px 10px",
                          borderRadius: 20, whiteSpace: "nowrap",
                          border: `1px solid ${cor}25`,
                        }}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tags de info */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {item.salario !== "Ver edital" && (
                      <span style={{
                        background: "rgba(0,200,150,.08)", color: "#00C896",
                        fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                        border: "1px solid rgba(0,200,150,.15)",
                      }}>
                        💰 {item.salario}
                      </span>
                    )}
                    {item.vagas !== "Ver edital" && (
                      <span style={{
                        background: "rgba(167,139,250,.08)", color: "#A78BFA",
                        fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                        border: "1px solid rgba(167,139,250,.15)",
                      }}>
                        🎯 {item.vagas}
                      </span>
                    )}
                    {item.inscricaoAte !== "-" && item.ativo && (
                      <span style={{
                        background: "rgba(255,184,0,.08)", color: "#FFB800",
                        fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                        border: "1px solid rgba(255,184,0,.15)",
                      }}>
                        📅 até {item.inscricaoAte}
                      </span>
                    )}
                    {item.dataProva !== "-" && (
                      <span style={{
                        background: "rgba(167,139,250,.08)", color: "#C4B5FD",
                        fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                        border: "1px solid rgba(167,139,250,.15)",
                      }}>
                        📝 Prova: {item.dataProva}
                      </span>
                    )}
                  </div>

                  {/* Botão edital */}
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-link"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      background: isPdf
                        ? "linear-gradient(135deg,#00C896,#00A87A)"
                        : "rgba(255,255,255,.07)",
                      color: isPdf ? "#002D1F" : "rgba(255,255,255,.6)",
                      borderRadius: 10, padding: "10px 16px",
                      fontSize: 12, fontWeight: 700,
                      textDecoration: "none", textAlign: "center",
                      border: isPdf ? "none" : "1px solid rgba(255,255,255,.1)",
                    }}
                  >
                    {isPdf ? "📄 Abrir Edital (PDF)" : "🔗 Ver notícia do concurso"}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,.05)",
        padding: "20px",
        textAlign: "center",
        color: "rgba(255,255,255,.2)",
        fontSize: 11,
      }}>
        <p>Concursos Contábeis · @concursos.contabeis</p>
        <p style={{ marginTop: 4 }}>
          Dados extraídos do{" "}
          <a href="https://www.pciconcursos.com.br" target="_blank" rel="noreferrer"
            style={{ color: "rgba(0,200,150,.5)", textDecoration: "none" }}>
            PCI Concursos
          </a>
          {" "}· Atualizado automaticamente
        </p>
      </div>
    </div>
  );
}
