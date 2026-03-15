"use client";
// src/components/InstagramCard.tsx
// Suporta formato "feed" (480×480) e "stories" (270×480)

import { Concurso } from "@/lib/scraper";

interface Props {
  concurso: Concurso;
  handle?: string;
  formato?: "feed" | "stories";
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  "Inscrições Abertas": { bg: "#00C896", color: "#002D1F" },
  "Em Andamento":       { bg: "#60A5FA", color: "#0A1628" },
  Previsto:             { bg: "#FFB800", color: "#2D1F00" },
  Encerrado:            { bg: "#FF4B4B", color: "#fff"    },
};

const URGENTE_DIAS = 7;

export default function InstagramCard({
  concurso: c,
  handle = "@concursos.contabeis",
  formato = "feed",
}: Props) {
  const st = STATUS_STYLE[c.status] ?? STATUS_STYLE["Previsto"];
  const temProva     = c.dataProva    && c.dataProva    !== "—";
  const temResultado = c.dataResultado && c.dataResultado !== "—";
  const urgente = c.diasRestantes >= 0 && c.diasRestantes <= URGENTE_DIAS;

  const isStories = formato === "stories";
  const W = isStories ? 270 : 480;
  const H = isStories ? 480 : 480;
  const PAD = isStories ? 22 : 30;

  const campos = [
    { icon: "💰", label: "Salário",         value: c.salario },
    { icon: "🎯", label: "Vagas",            value: c.vagas },
    { icon: "📅", label: "Inscrições até",   value: c.inscricaoAte },
    { icon: "🏦", label: "Banca",            value: c.banca },
    ...(temProva     ? [{ icon: "📝", label: "Data da Prova", value: c.dataProva }]     : []),
    ...(temResultado ? [{ icon: "🏆", label: "Resultado",     value: c.dataResultado }] : []),
  ];

  // Stories: 1 coluna; Feed: 2 cols (3 se tiver extras)
  const gridCols = isStories
    ? "1fr"
    : campos.length > 4 ? "1fr 1fr 1fr" : "1fr 1fr";

  const titleSize = isStories ? 15 : campos.length > 4 ? 17 : 21;

  return (
    <div
      id={`card-${c.id}-${formato}`}
      style={{
        width: W, height: H,
        background: "linear-gradient(145deg,#08122A 0%,#0C1E3E 55%,#081220 100%)",
        borderRadius: 20, padding: PAD,
        fontFamily: "'Sora',sans-serif",
        position: "relative", overflow: "hidden",
        boxSizing: "border-box",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        flexShrink: 0,
      }}
    >
      {/* Grid texture */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(0,200,150,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,150,.05) 1px,transparent 1px)", backgroundSize:"36px 36px", pointerEvents:"none" }} />
      {/* Glow top-right */}
      <div style={{ position:"absolute", top:-70, right:-70, width:220, height:220, background:"radial-gradient(circle,rgba(0,200,150,.18) 0%,transparent 70%)", pointerEvents:"none" }} />
      {/* Glow bottom-left */}
      <div style={{ position:"absolute", bottom:-50, left:-50, width:180, height:180, background:"radial-gradient(circle,rgba(0,100,200,.12) 0%,transparent 70%)", pointerEvents:"none" }} />

      {/* ── TOP ── */}
      <div style={{ position:"relative" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <span style={{ background:"linear-gradient(90deg,#00C896,#00E5A8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", fontSize:9, fontWeight:800, letterSpacing:2, textTransform:"uppercase" }}>
            📊 Concursos Contábeis
          </span>
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            {urgente && (
              <span style={{ background:"#FF4B4B", color:"#fff", fontSize:8, fontWeight:800, padding:"3px 7px", borderRadius:20, letterSpacing:1 }}>
                ⚡ {c.diasRestantes}d
              </span>
            )}
            <span style={{ background:st.bg, color:st.color, fontSize:8, fontWeight:800, padding:"3px 8px", borderRadius:20, letterSpacing:1, textTransform:"uppercase" }}>
              {c.status}
            </span>
          </div>
        </div>

        <div style={{ color:"#fff", fontSize:titleSize, fontWeight:800, lineHeight:1.2, marginBottom:5, letterSpacing:"-0.3px" }}>
          {c.cargo}
        </div>
        <div style={{ color:"#00C896", fontSize:isStories?11:13, fontWeight:600, marginBottom:3 }}>
          {c.orgao}
        </div>
        <div style={{ color:"rgba(255,255,255,.4)", fontSize:10 }}>
          📍 {c.estado}&nbsp;•&nbsp;{c.nivel}
          {c.banca !== "—" ? `\u00a0•\u00a0${c.banca}` : ""}
        </div>
      </div>

      {/* ── STATS GRID ── */}
      <div style={{ display:"grid", gridTemplateColumns: gridCols, gap:7, position:"relative" }}>
        {campos.map(item => (
          <div key={item.label} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(0,200,150,.12)", borderRadius:9, padding:"8px 10px" }}>
            <div style={{ color:"rgba(255,255,255,.35)", fontSize:7.5, letterSpacing:.8, marginBottom:2, textTransform:"uppercase" }}>
              {item.icon} {item.label}
            </div>
            <div style={{ color:"#fff", fontSize:isStories?10:11, fontWeight:700, lineHeight:1.3 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Stories — CTA extra */}
      {isStories && (
        <div style={{ background:"rgba(0,200,150,.08)", border:"1px solid rgba(0,200,150,.2)", borderRadius:10, padding:"10px 12px", position:"relative", textAlign:"center" }}>
          <div style={{ color:"rgba(255,255,255,.5)", fontSize:9, marginBottom:3 }}>👆 ARRASTE PARA CIMA</div>
          <div style={{ color:"#00C896", fontSize:11, fontWeight:800 }}>Ver edital completo</div>
        </div>
      )}

      {/* ── BOTTOM ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:12, position:"relative" }}>
        <div>
          <div style={{ color:"rgba(255,255,255,.25)", fontSize:8, letterSpacing:1.5, textTransform:"uppercase" }}>Siga no Instagram</div>
          <div style={{ color:"#00C896", fontSize:isStories?12:14, fontWeight:800 }}>{handle}</div>
        </div>
        {!isStories && (
          <div style={{ background:"linear-gradient(135deg,#00C896,#00A87A)", color:"#002D1F", fontSize:10, fontWeight:800, padding:"8px 16px", borderRadius:20, letterSpacing:.5 }}>
            VER EDITAL →
          </div>
        )}
      </div>
    </div>
  );
}
