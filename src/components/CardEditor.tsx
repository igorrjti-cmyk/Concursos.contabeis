"use client";
// src/components/CardEditor.tsx
// Editor de card do Instagram com campos editáveis antes de baixar/publicar

import { useState, useRef, useEffect } from "react";
import type { Concurso } from "@/lib/scraper";
import { renderCardCanvas } from "@/lib/card-renderer";

interface CardEditorProps {
  concurso: Concurso;
  onClose: () => void;
  onDownload?: (canvas: HTMLCanvasElement, formato: "feed" | "stories") => void;
  onPublicar?: (overrides: Partial<Concurso>, formato: "feed" | "stories" | "ambos") => void;
}

type Formato = "feed" | "stories";

// Campos editáveis mapeados para os campos do Concurso
interface Overrides {
  cargo: string;
  orgao: string;
  estado: string;
  nivel: string;
  salario: string;
  vagas: string;
  banca: string;
  status: Concurso["status"];
  inscricaoAte: string;
  dataProva: string;
  dataResultado: string;
}

const STATUS_OPTIONS: { value: Concurso["status"]; label: string }[] = [
  { value: "Inscricoes Abertas", label: "Inscrições Abertas" },
  { value: "Previsto",           label: "Previsto" },
  { value: "Aguardando Prova",   label: "Aguardando Prova" },
  { value: "Encerrado",          label: "Encerrado" },
];

const NIVEIS = ["Superior", "Médio", "Técnico", "Médio/Técnico", "Médio/Técnico/Superior"];

export default function CardEditor({ concurso, onClose, onDownload, onPublicar }: CardEditorProps) {
  const [formato, setFormato] = useState<Formato>("feed");
  const [overrides, setOverrides] = useState<Overrides>({
    cargo:        concurso.cargo,
    orgao:        concurso.orgao,
    estado:       concurso.estado,
    nivel:        concurso.nivel,
    salario:      concurso.salario,
    vagas:        concurso.vagas,
    banca:        concurso.banca,
    status:       concurso.status,
    inscricaoAte: concurso.inscricaoAte,
    dataProva:    concurso.dataProva,
    dataResultado: concurso.dataResultado,
  });
  const [baixando, setBaixando] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Mescla os overrides com o concurso original
  const concursoEditado: Concurso = { ...concurso, ...overrides };

  function set(field: keyof Overrides, value: string) {
    setOverrides(prev => ({ ...prev, [field]: value }));
  }

  async function handleDownload() {
    setBaixando(true);
    try {
      const canvas = await renderCardCanvas(concursoEditado, formato);
      if (onDownload) {
        onDownload(canvas, formato);
      } else {
        const a = document.createElement("a");
        a.download = `${concurso.id}-${formato}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      }
    } finally {
      setBaixando(false);
    }
  }

  function handlePublicar(modo: "feed" | "stories" | "ambos") {
    onPublicar?.(overrides, modo);
  }

  const fieldStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
    padding: "7px 10px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,.3)",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
    display: "block",
  };
  const sectionStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.02)",
    border: "1px solid rgba(255,255,255,.06)",
    borderRadius: 10,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
  const sectionTitleStyle: React.CSSProperties = {
    color: "rgba(255,255,255,.2)",
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "#0A1628",
        border: "1px solid rgba(255,255,255,.1)",
        borderRadius: 16,
        width: "100%", maxWidth: 980,
        maxHeight: "96vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,.07)",
        }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>
              ✏️ Editar Card Instagram
            </div>
            <div style={{ color: "rgba(255,255,255,.3)", fontSize: 11, marginTop: 2 }}>
              {concurso.cargo} · {concurso.orgao}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
              borderRadius: 8, color: "rgba(255,255,255,.5)", cursor: "pointer",
              fontSize: 13, padding: "6px 12px",
            }}
          >✕ Fechar</button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* ── Formulário (esquerda) ── */}
          <div style={{
            width: 320, flexShrink: 0,
            padding: "16px",
            overflowY: "auto",
            borderRight: "1px solid rgba(255,255,255,.06)",
            display: "flex", flexDirection: "column", gap: 12,
          }}>

            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Identificação</div>
              <div>
                <label style={labelStyle}>Cargo</label>
                <input style={fieldStyle} value={overrides.cargo} onChange={e => set("cargo", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Órgão</label>
                <input style={fieldStyle} value={overrides.orgao} onChange={e => set("orgao", e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Estado (UF)</label>
                  <input style={fieldStyle} value={overrides.estado} maxLength={2}
                    onChange={e => set("estado", e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label style={labelStyle}>Nível</label>
                  <select style={fieldStyle} value={overrides.nivel} onChange={e => set("nivel", e.target.value)}>
                    {NIVEIS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Informações</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Salário</label>
                  <input style={fieldStyle} value={overrides.salario} onChange={e => set("salario", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Vagas</label>
                  <input style={fieldStyle} value={overrides.vagas} onChange={e => set("vagas", e.target.value)} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={labelStyle}>Banca</label>
                  <input style={fieldStyle} value={overrides.banca} onChange={e => set("banca", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={fieldStyle} value={overrides.status}
                    onChange={e => set("status", e.target.value as Concurso["status"])}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Inscrições até</label>
                <input style={fieldStyle} value={overrides.inscricaoAte}
                  onChange={e => set("inscricaoAte", e.target.value)}
                  placeholder="DD/MM/AAAA" />
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>📝 Datas da prova</div>
              <div>
                <label style={labelStyle}>
                  Data da Prova
                  <span style={{ color: "rgba(255,255,255,.2)", marginLeft: 4 }}>(use - para ocultar)</span>
                </label>
                <input
                  style={{
                    ...fieldStyle,
                    borderColor: overrides.dataProva && overrides.dataProva !== "-"
                      ? "rgba(167,139,250,.5)" : "rgba(255,255,255,.12)",
                    background: overrides.dataProva && overrides.dataProva !== "-"
                      ? "rgba(167,139,250,.08)" : "rgba(255,255,255,.06)",
                  }}
                  value={overrides.dataProva}
                  onChange={e => set("dataProva", e.target.value)}
                  placeholder="DD/MM/AAAA ou -"
                />
              </div>
              <div>
                <label style={labelStyle}>Data do Resultado</label>
                <input style={fieldStyle} value={overrides.dataResultado}
                  onChange={e => set("dataResultado", e.target.value)}
                  placeholder="DD/MM/AAAA ou -" />
              </div>
            </div>

            {/* Botões de ação */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Seletor de formato */}
              <div style={{ display: "flex", gap: 6 }}>
                {(["feed", "stories"] as Formato[]).map(f => (
                  <button key={f} onClick={() => setFormato(f)} style={{
                    flex: 1,
                    background: formato === f ? "rgba(0,200,150,.12)" : "transparent",
                    border: "1px solid " + (formato === f ? "#00C896" : "rgba(255,255,255,.1)"),
                    color: formato === f ? "#00C896" : "rgba(255,255,255,.35)",
                    borderRadius: 8, padding: "7px 10px",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>
                    {f === "feed" ? "📐 Feed 4:5" : "📱 Stories 9:16"}
                  </button>
                ))}
              </div>

              <button onClick={handleDownload} disabled={baixando} style={{
                background: baixando ? "rgba(0,200,150,.3)" : "rgba(0,200,150,.15)",
                border: "1px solid rgba(0,200,150,.4)",
                color: "#00C896", borderRadius: 9,
                padding: "10px 16px", fontSize: 12, fontWeight: 700,
                cursor: baixando ? "not-allowed" : "pointer",
              }}>
                {baixando ? "Gerando..." : `⬇️ Baixar PNG (${formato})`}
              </button>

              {onPublicar && (
                <button onClick={() => handlePublicar("feed")} style={{
                  background: "rgba(167,139,250,.1)",
                  border: "1px solid rgba(167,139,250,.3)",
                  color: "#A78BFA", borderRadius: 9,
                  padding: "10px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  📤 Publicar no Instagram (Feed)
                </button>
              )}
            </div>

            {/* Aviso se dataProva foi alterada */}
            {overrides.dataProva !== concurso.dataProva && (
              <div style={{
                background: "rgba(255,184,0,.08)",
                border: "1px solid rgba(255,184,0,.2)",
                borderRadius: 8, padding: "8px 12px",
                color: "#FFB800", fontSize: 11,
              }}>
                ⚠️ Data da prova alterada de <strong>{concurso.dataProva || "-"}</strong> para{" "}
                <strong>{overrides.dataProva}</strong>. Apenas o card será afetado — o dado original no banco não muda.
              </div>
            )}
          </div>

          {/* ── Preview (direita) ── */}
          <div style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
            overflowY: "auto",
            background: "rgba(0,0,0,.2)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ color: "rgba(255,255,255,.2)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
                Preview — {formato === "feed" ? "1080 × 1350 px" : "1080 × 1920 px"}
              </div>
              {/* O InstagramCard real renderizado em escala */}
              <div
                ref={previewRef}
                style={{
                  transform: formato === "feed" ? "scale(0.57)" : "scale(0.32)",
                  transformOrigin: "top center",
                  marginBottom: formato === "feed" ? "-260px" : "-330px",
                }}
              >
                <PreviewCard concurso={concursoEditado} formato={formato} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Preview inline (usando os mesmos estilos do InstagramCard mas sem importar o componente
// para evitar dependência circular — replica o visual fiel ao card real)
function PreviewCard({ concurso: c, formato }: { concurso: Concurso; formato: Formato }) {
  const isStories = formato === "stories";
  const W = isStories ? 270 : 480;
  const H = isStories ? 480 : 600;

  const STATUS_STYLE: Record<string, { bg: string; color: string; glow: string }> = {
    "Inscricoes Abertas": { bg: "#00C896", color: "#002D1F", glow: "rgba(0,200,150,0.4)" },
    "Aguardando Prova":   { bg: "#A78BFA", color: "#1A0050", glow: "rgba(167,139,250,0.35)" },
    "Previsto":           { bg: "#FFB800", color: "#2D1F00", glow: "rgba(255,184,0,0.35)" },
    "Encerrado":          { bg: "#FF4B4B", color: "#fff",    glow: "rgba(255,75,75,0.35)" },
  };
  const STATUS_LABEL: Record<string, string> = {
    "Inscricoes Abertas": "INSCRIÇÕES ABERTAS",
    "Aguardando Prova":   "AGUARDANDO PROVA",
    "Previsto":           "PREVISTO",
    "Encerrado":          "ENCERRADO",
  };

  const st = STATUS_STYLE[c.status] ?? STATUS_STYLE["Previsto"];
  const stLabel = STATUS_LABEL[c.status] ?? c.status;
  const temProva = c.dataProva && c.dataProva !== "-";
  const PAD_X = isStories ? 18 : 28 + 15;
  const PAD_TOP = isStories ? 18 : Math.round(H * 0.15);
  const MAX_CARGO = isStories ? 26 : 36;
  const cargoDisplay = c.cargo.length > MAX_CARGO ? c.cargo.slice(0, MAX_CARGO - 1).trimEnd() + "…" : c.cargo;
  const titleSize = isStories ? 12 : cargoDisplay.length > 30 ? 20 : cargoDisplay.length > 20 ? 25 : 30;
  const orgaoSize = isStories ? 9 : titleSize * 0.52;
  const campos = [
    { icon: "💰", label: "Salário",  value: c.salario },
    { icon: "🎯", label: "Vagas",    value: c.vagas },
    { icon: "📅", label: c.status === "Inscricoes Abertas" ? "Inscrições até" : "Edital", value: c.inscricaoAte },
    { icon: "🏦", label: "Banca",    value: c.banca !== "-" ? c.banca : "A definir" },
  ];

  return (
    <div style={{
      width: W, height: H,
      background: "linear-gradient(160deg,#050D1E 0%,#091630 45%,#050D1E 100%)",
      borderRadius: 16, fontFamily: "'Sora',sans-serif",
      position: "relative", overflow: "hidden", boxSizing: "border-box",
      display: "flex", flexDirection: "column", justifyContent: "flex-start",
      gap: isStories ? 10 : 18,
      paddingTop: PAD_TOP, paddingBottom: 18,
      paddingLeft: PAD_X, paddingRight: PAD_X,
      flexShrink: 0,
    }}>
      {/* Faixa lateral */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5,
        background: `linear-gradient(to bottom, ${st.bg} 55%, transparent)`,
        borderRadius: "16px 0 0 16px" }} />
      {/* Grade */}
      <div style={{ position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
        backgroundSize: "36px 36px", pointerEvents: "none" }} />

      {/* Header: marca + badge */}
      <div style={{ display: "flex", flexDirection: "column", gap: isStories ? 6 : 10, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            background: "linear-gradient(90deg,#00C896,#00E5A8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontSize: isStories ? 7 : 8, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase",
          }}>Concursos Contábeis</span>
          <span style={{
            background: st.bg, color: st.color,
            fontSize: isStories ? 7 : 8.5, fontWeight: 800,
            padding: "4px 11px", borderRadius: 20, letterSpacing: 0.8, textTransform: "uppercase",
          }}>{stLabel}</span>
        </div>

        {/* Cargo + órgão + tags */}
        <div>
          <div style={{ color: "#fff", fontSize: titleSize, fontWeight: 800, lineHeight: 1.15, marginBottom: isStories ? 3 : 5 }}>
            {cargoDisplay}
          </div>
          <div style={{ color: "#00C896", fontSize: orgaoSize, fontWeight: 700, marginBottom: isStories ? 3 : 6, opacity: 0.92 }}>
            {c.orgao}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[`📍 ${c.estado}`, `🎓 ${c.nivel}`].map(tag => (
              <span key={tag} style={{
                background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.09)",
                color: "rgba(255,255,255,.55)", fontSize: isStories ? 7 : 8.5,
                padding: "2px 7px", borderRadius: 5, fontWeight: 600,
              }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Data da prova */}
      {temProva && (
        <div style={{
          background: "linear-gradient(135deg,rgba(167,139,250,0.20),rgba(99,60,220,0.14))",
          border: "1.5px solid rgba(167,139,250,0.5)", borderRadius: 12,
          padding: isStories ? "10px 14px" : "14px 20px",
          display: "flex", alignItems: "center", gap: isStories ? 10 : 16,
        }}>
          <span style={{ fontSize: isStories ? 18 : 28, flexShrink: 0 }}>📝</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "rgba(196,181,253,0.7)", fontSize: isStories ? 7.5 : 9, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
              Data da Prova
            </div>
            <div style={{ color: "#E9D5FF", fontSize: isStories ? 18 : 28, fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1 }}>
              {c.dataProva}
            </div>
          </div>
        </div>
      )}

      {/* Grid de campos */}
      <div style={{ display: "flex", flexDirection: "column", gap: isStories ? 6 : 10, position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isStories ? 5 : 8 }}>
          {campos.map(item => (
            <div key={item.label} style={{
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 10, padding: isStories ? "5px 8px" : "9px 13px",
            }}>
              <div style={{ color: "rgba(255,255,255,.3)", fontSize: isStories ? 7 : 8, letterSpacing: 0.8, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>
                {item.icon} {item.label}
              </div>
              <div style={{ color: "#fff", fontSize: isStories ? 10 : 13, fontWeight: 700, lineHeight: 1.25 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: isStories ? 8 : 11 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,.2)", fontSize: isStories ? 7 : 7.5, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>Siga no Instagram</div>
            <div style={{ color: "#00C896", fontSize: isStories ? 10 : 13, fontWeight: 800 }}>@concursos.contabeis</div>
          </div>
          <div style={{
            background: "linear-gradient(135deg,#00C896,#00A87A)", color: "#002D1F",
            fontSize: isStories ? 8.5 : 9.5, fontWeight: 800,
            padding: isStories ? "5px 11px" : "7px 16px", borderRadius: 20, letterSpacing: 0.5,
          }}>VER EDITAL</div>
        </div>
      </div>
    </div>
  );
}
