"use client";
// src/components/InstagramCard.tsx
// Melhorias v2:
//  - Data da prova em destaque próprio quando disponível
//  - Badge de urgência maior e mais visível
//  - Layout com faixas coloridas por status
//  - Gradiente e grid renovados
//  - Contador regressivo de dias exibido com destaque

import { Concurso, statusDisplay } from "@/lib/scraper";

interface Props {
  concurso: Concurso;
  handle?: string;
  formato?: "feed" | "stories";
}

const STATUS_STYLE: Record<string, { bg: string; color: string; glow: string }> = {
  "Inscricoes Abertas": { bg: "#00C896", color: "#002D1F", glow: "rgba(0,200,150,0.35)" },
  "Previsto":           { bg: "#FFB800", color: "#2D1F00", glow: "rgba(255,184,0,0.3)"  },
  "Encerrado":          { bg: "#FF4B4B", color: "#fff",    glow: "rgba(255,75,75,0.3)"  },
};

export default function InstagramCard({
  concurso: c,
  handle = "@concursos.contabeis",
  formato = "feed",
}: Props) {
  const st       = STATUS_STYLE[c.status] ?? STATUS_STYLE["Previsto"];
  const temProva = c.dataProva && c.dataProva !== "-";
  const temRes   = c.dataResultado && c.dataResultado !== "-";
  const urgente  = c.diasRestantes >= 0 && c.diasRestantes <= 7;
  const isStories = formato === "stories";

  const W   = isStories ? 270 : 480;
  const H   = isStories ? 480 : 480;
  const PAD = isStories ? 20  : 28;

  // Campos do grid principal
  const campos = [
    { icon: "💰", label: "Salário",        value: c.salario },
    { icon: "🎯", label: "Vagas",          value: c.vagas   },
    { icon: "📅", label: c.status === "Inscricoes Abertas" ? "Inscrições até" : "Edital", value: c.inscricaoAte },
    { icon: "🏦", label: "Banca",          value: c.banca !== "-" ? c.banca : "A definir" },
  ];

  const gridCols = isStories ? "1fr 1fr" : campos.length > 4 ? "1fr 1fr 1fr" : "1fr 1fr";
  const titleSize = isStories ? 14 : c.cargo.length > 30 ? 17 : 22;
  const statusText = statusDisplay(c.status);

  return (
    <div
      id={"card-" + c.id + "-" + formato}
      style={{
        width: W, height: H,
        background: "linear-gradient(155deg,#060E20 0%,#0B1A38 50%,#060E20 100%)",
        borderRadius: 20,
        fontFamily: "'Sora',sans-serif",
        position: "relative", overflow: "hidden",
        boxSizing: "border-box",
        display: "flex", flexDirection: "column",
        padding: PAD,
        gap: 10,
        flexShrink: 0,
      }}
    >
      {/* ── Faixa colorida lateral esquerda ── */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
        background: `linear-gradient(to bottom, ${st.bg}, transparent)`,
      }} />

      {/* ── Grid sutil de fundo ── */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)",
        backgroundSize: "32px 32px", pointerEvents: "none",
      }} />

      {/* ── Glow de status (canto sup. direito) ── */}
      <div style={{
        position: "absolute", top: -60, right: -60,
        width: 200, height: 200,
        background: `radial-gradient(circle, ${st.glow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* ── TOP: marca + status ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
        <span style={{
          background: "linear-gradient(90deg,#00C896,#00E5A8)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
        }}>
          Concursos Contábeis
        </span>
        <span style={{
          background: st.bg, color: st.color,
          fontSize: 8, fontWeight: 800,
          padding: "4px 10px", borderRadius: 20,
          letterSpacing: 0.8, textTransform: "uppercase",
          boxShadow: `0 0 12px ${st.glow}`,
        }}>
          {statusText}
        </span>
      </div>

      {/* ── URGÊNCIA — badge grande quando ≤ 7 dias ── */}
      {urgente && (
        <div style={{
          background: "linear-gradient(135deg,#FF4B4B,#FF2222)",
          borderRadius: 12, padding: "8px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "relative",
          boxShadow: "0 4px 20px rgba(255,75,75,0.4)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>🚨</span>
            <div>
              <div style={{ color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>
                URGENTE — INSCRIÇÕES ENCERRAM EM
              </div>
              <div style={{ color: "rgba(255,255,255,.8)", fontSize: 9 }}>Corra para não perder!</div>
            </div>
          </div>
          <div style={{
            background: "rgba(0,0,0,0.25)", borderRadius: 8,
            padding: "4px 10px", textAlign: "center",
          }}>
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{c.diasRestantes}</div>
            <div style={{ color: "rgba(255,255,255,.7)", fontSize: 7, fontWeight: 700, letterSpacing: 1 }}>DIAS</div>
          </div>
        </div>
      )}

      {/* ── CARGO + ÓRGÃO ── */}
      <div style={{ position: "relative" }}>
        <div style={{
          color: "#fff", fontSize: titleSize, fontWeight: 800,
          lineHeight: 1.2, letterSpacing: "-0.3px",
          marginBottom: 4,
        }}>
          {c.cargo}
        </div>
        <div style={{ color: "#00C896", fontSize: isStories ? 11 : 13, fontWeight: 700, marginBottom: 2 }}>
          {c.orgao}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)",
            fontSize: 9, padding: "2px 7px", borderRadius: 5, fontWeight: 600,
          }}>
            📍 {c.estado}
          </span>
          <span style={{
            background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)",
            fontSize: 9, padding: "2px 7px", borderRadius: 5, fontWeight: 600,
          }}>
            🎓 {c.nivel}
          </span>
        </div>
      </div>

      {/* ── DATA DA PROVA — destaque especial quando disponível ── */}
      {temProva && (
        <div style={{
          background: "linear-gradient(135deg,rgba(167,139,250,0.15),rgba(139,92,246,0.1))",
          border: "1px solid rgba(167,139,250,0.3)",
          borderRadius: 10, padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 10,
          position: "relative",
        }}>
          <span style={{ fontSize: 18 }}>📝</span>
          <div>
            <div style={{ color: "rgba(167,139,250,0.7)", fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
              Data da Prova
            </div>
            <div style={{ color: "#C4B5FD", fontSize: isStories ? 14 : 17, fontWeight: 800, letterSpacing: "-0.3px" }}>
              {c.dataProva}
            </div>
          </div>
          {temRes && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ color: "rgba(167,139,250,0.7)", fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                Resultado
              </div>
              <div style={{ color: "#C4B5FD", fontSize: 12, fontWeight: 700 }}>{c.dataResultado}</div>
            </div>
          )}
        </div>
      )}

      {/* ── GRID DE CAMPOS ── */}
      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 7, position: "relative", flex: 1, alignContent: "start" }}>
        {campos.map(item => (
          <div key={item.label} style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 10, padding: "8px 10px",
          }}>
            <div style={{ color: "rgba(255,255,255,.3)", fontSize: 7.5, letterSpacing: .8, marginBottom: 3, textTransform: "uppercase" }}>
              {item.icon} {item.label}
            </div>
            <div style={{ color: "#fff", fontSize: isStories ? 10 : 12, fontWeight: 700, lineHeight: 1.3 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── STORIES CTA ── */}
      {isStories && (
        <div style={{
          background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.2)",
          borderRadius: 10, padding: "9px 12px", textAlign: "center",
        }}>
          <div style={{ color: "rgba(255,255,255,.4)", fontSize: 8, marginBottom: 2 }}>ARRASTE PARA CIMA</div>
          <div style={{ color: "#00C896", fontSize: 11, fontWeight: 800 }}>Ver edital completo →</div>
        </div>
      )}

      {/* ── RODAPÉ ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 10,
        position: "relative",
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,.2)", fontSize: 7.5, letterSpacing: 1.5, textTransform: "uppercase" }}>
            Siga no Instagram
          </div>
          <div style={{ color: "#00C896", fontSize: isStories ? 11 : 13, fontWeight: 800 }}>{handle}</div>
        </div>
        {!isStories && (
          <div style={{
            background: "linear-gradient(135deg,#00C896,#00A87A)",
            color: "#002D1F", fontSize: 9, fontWeight: 800,
            padding: "7px 14px", borderRadius: 20, letterSpacing: .5,
          }}>
            VER EDITAL
          </div>
        )}
      </div>
    </div>
  );
}
