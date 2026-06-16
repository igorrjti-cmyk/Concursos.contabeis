"use client";
// src/components/CardEditor.tsx — v2
// Editor de card com publicação direta via extensão Chrome

import { useState, useRef } from "react";
import type { Concurso } from "@/lib/scraper";
import { gerarLegenda } from "@/lib/legenda";

const EXT_ID = "phmnhackebfpjcjpdopobdalmaolbglk";

interface CardEditorProps {
  concurso: Concurso;
  onClose: () => void;
  onMarcarPostado?: (c: Concurso) => void;
  onAgendamentoSalvo?: () => void;
}

type Formato = "feed" | "stories" | "ambos";

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

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  "Inscricoes Abertas": { bg: "#00C896", color: "#002D1F" },
  "Aguardando Prova":   { bg: "#A78BFA", color: "#1A0050" },
  "Previsto":           { bg: "#FFB800", color: "#2D1F00" },
  "Encerrado":          { bg: "#FF4B4B", color: "#fff" },
};
const STATUS_LABEL: Record<string, string> = {
  "Inscricoes Abertas": "INSCRIÇÕES ABERTAS",
  "Aguardando Prova":   "AGUARDANDO PROVA",
  "Previsto":           "PREVISTO",
  "Encerrado":          "ENCERRADO",
};

export default function CardEditor({ concurso, onClose, onMarcarPostado, onAgendamentoSalvo }: CardEditorProps) {
  const [overrides, setOverrides] = useState<Overrides>({
    cargo:         concurso.cargo,
    orgao:         concurso.orgao,
    estado:        concurso.estado,
    nivel:         concurso.nivel,
    salario:       concurso.salario,
    vagas:         concurso.vagas,
    banca:         concurso.banca,
    status:        concurso.status,
    inscricaoAte:  concurso.inscricaoAte,
    dataProva:     concurso.dataProva,
    dataResultado: concurso.dataResultado,
  });

  const [formato, setFormato] = useState<"feed" | "stories">("feed");
  const [publicando, setPublicando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" | "info" } | null>(null);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [agendarModo, setAgendarModo] = useState<Formato>("feed");
  const [agendadoPara, setAgendadoPara] = useState("");

  const concursoEditado: Concurso = { ...concurso, ...overrides };

  function set(field: keyof Overrides, value: string) {
    setOverrides(prev => ({ ...prev, [field]: value }));
  }

  function showToast(msg: string, tipo: "ok" | "erro" | "info" = "ok") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  }

  async function renderCards(modo: Formato) {
    await document.fonts.ready;
    const { renderCardCanvas } = await import("@/lib/card-renderer");
    const feedBase64    = (modo === "feed"    || modo === "ambos") ? (await renderCardCanvas(concursoEditado, "feed")).toDataURL("image/png")    : null;
    const storiesBase64 = (modo === "stories" || modo === "ambos") ? (await renderCardCanvas(concursoEditado, "stories")).toDataURL("image/png") : null;
    return { feedBase64, storiesBase64 };
  }

  async function handlePublicar(modo: Formato) {
    setPublicando(true);
    try {
      const { feedBase64, storiesBase64 } = await renderCards(modo);
      const legenda = gerarLegenda(concursoEditado);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chrome = (window as any).chrome;
      if (!chrome?.runtime?.sendMessage) {
        throw new Error("Extensão não encontrada. Instale a extensão Concursos Contábeis no Chrome.");
      }

      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          EXT_ID,
          { type: "PUBLICAR_INSTAGRAM", feedBase64, storiesBase64, legenda, agendadoPara: null },
          (r: { ok: boolean } | undefined) => {
            if (chrome.runtime.lastError || !r?.ok) {
              reject(new Error(chrome.runtime.lastError?.message || "Extensão não respondeu. Verifique se está instalada e ativa."));
            } else { resolve(); }
          }
        );
      });

      const partes = [feedBase64 && "Feed", storiesBase64 && "Stories"].filter(Boolean).join(" + ");
      showToast(`✅ ${partes} publicado com sucesso!`, "ok");
      onMarcarPostado?.(concursoEditado);
    } catch (e: unknown) {
      showToast("❌ " + (e instanceof Error ? e.message : "Erro desconhecido"), "erro");
    } finally {
      setPublicando(false);
    }
  }

  async function handleAgendar() {
    if (!agendadoPara) return;
    setPublicando(true);
    try {
      const { feedBase64, storiesBase64 } = await renderCards(agendarModo);
      const legenda = gerarLegenda(concursoEditado);

      const res = await fetch("/api/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concurso_id:    concursoEditado.id,
          cargo:          concursoEditado.cargo,
          orgao:          concursoEditado.orgao,
          estado:         concursoEditado.estado,
          modo:           agendarModo,
          agendado_para:  new Date(agendadoPara).toISOString(),
          feed_base64:    feedBase64,
          stories_base64: storiesBase64,
          legenda,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Erro ao salvar agendamento");

      const partes = agendarModo === "feed" ? "Feed" : agendarModo === "stories" ? "Stories" : "Feed + Stories";
      showToast(`⏰ ${partes} agendado para ${new Date(agendadoPara).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}!`, "ok");
      setAgendarAberto(false);
      setAgendadoPara("");
      onAgendamentoSalvo?.();
    } catch (e: unknown) {
      showToast("❌ " + (e instanceof Error ? e.message : "Erro ao agendar"), "erro");
    } finally {
      setPublicando(false);
    }
  }

  async function handleDownload() {
    setBaixando(true);
    try {
      const { renderCardCanvas } = await import("@/lib/card-renderer");
      const canvas = await renderCardCanvas(concursoEditado, formato);
      const a = document.createElement("a");
      a.download = `${concurso.id}-${formato}-editado.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } finally {
      setBaixando(false);
    }
  }

  // ─── Estilos reutilizáveis ────────────────────────────────────────────────
  const fieldStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 8, color: "#fff", fontSize: 12, padding: "7px 10px",
    width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,.3)", fontSize: 10, letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 4, display: "block",
  };
  const sectionStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
    borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
  };
  const sectionTitle: React.CSSProperties = {
    color: "rgba(255,255,255,.2)", fontSize: 9, letterSpacing: 1.5,
    textTransform: "uppercase", marginBottom: 2,
  };
  const btnBase: React.CSSProperties = {
    borderRadius: 9, padding: "10px 16px", fontSize: 12, fontWeight: 700,
    cursor: "pointer", width: "100%", fontFamily: "inherit",
  };

  const st = STATUS_STYLE[concursoEditado.status] ?? STATUS_STYLE["Previsto"];
  const stLabel = STATUS_LABEL[concursoEditado.status] ?? concursoEditado.status;
  const temProva = concursoEditado.dataProva && concursoEditado.dataProva !== "-";
  const MAX_CARGO = 36;
  const cargoDisplay = concursoEditado.cargo.length > MAX_CARGO
    ? concursoEditado.cargo.slice(0, MAX_CARGO - 1).trimEnd() + "…"
    : concursoEditado.cargo;
  const titleSize = cargoDisplay.length > 30 ? 20 : cargoDisplay.length > 20 ? 25 : 30;
  const campos = [
    { icon: "💰", label: "Salário",  value: concursoEditado.salario },
    { icon: "🎯", label: "Vagas",    value: concursoEditado.vagas },
    { icon: "📅", label: concursoEditado.status === "Inscricoes Abertas" ? "Inscrições até" : "Edital", value: concursoEditado.inscricaoAte },
    { icon: "🏦", label: "Banca",    value: concursoEditado.banca !== "-" ? concursoEditado.banca : "A definir" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "#0A1628", border: "1px solid rgba(255,255,255,.1)",
        borderRadius: 16, width: "100%", maxWidth: 1020, maxHeight: "96vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: "'Sora', sans-serif",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.07)",
        }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>✏️ Editar e Publicar Card</div>
            <div style={{ color: "rgba(255,255,255,.3)", fontSize: 11, marginTop: 2 }}>
              {concurso.cargo} · {concurso.orgao}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 8, color: "rgba(255,255,255,.5)", cursor: "pointer",
            fontSize: 13, padding: "6px 12px", fontFamily: "inherit",
          }}>✕ Fechar</button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* ── Formulário ── */}
          <div style={{
            width: 300, flexShrink: 0, padding: "14px",
            overflowY: "auto", borderRight: "1px solid rgba(255,255,255,.06)",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={sectionStyle}>
              <div style={sectionTitle}>Identificação</div>
              <div><label style={labelStyle}>Cargo</label>
                <input style={fieldStyle} value={overrides.cargo} onChange={e => set("cargo", e.target.value)} /></div>
              <div><label style={labelStyle}>Órgão</label>
                <input style={fieldStyle} value={overrides.orgao} onChange={e => set("orgao", e.target.value)} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={labelStyle}>UF</label>
                  <input style={fieldStyle} value={overrides.estado} maxLength={2}
                    onChange={e => set("estado", e.target.value.toUpperCase())} /></div>
                <div><label style={labelStyle}>Nível</label>
                  <select style={fieldStyle} value={overrides.nivel} onChange={e => set("nivel", e.target.value)}>
                    {NIVEIS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select></div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>Informações</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={labelStyle}>Salário</label>
                  <input style={fieldStyle} value={overrides.salario} onChange={e => set("salario", e.target.value)} /></div>
                <div><label style={labelStyle}>Vagas</label>
                  <input style={fieldStyle} value={overrides.vagas} onChange={e => set("vagas", e.target.value)} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={labelStyle}>Banca</label>
                  <input style={fieldStyle} value={overrides.banca} onChange={e => set("banca", e.target.value)} /></div>
                <div><label style={labelStyle}>Status</label>
                  <select style={fieldStyle} value={overrides.status}
                    onChange={e => set("status", e.target.value as Concurso["status"])}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
              </div>
              <div><label style={labelStyle}>Inscrições até</label>
                <input style={fieldStyle} value={overrides.inscricaoAte}
                  onChange={e => set("inscricaoAte", e.target.value)} placeholder="DD/MM/AAAA" /></div>
            </div>

            <div style={sectionStyle}>
              <div style={sectionTitle}>📝 Datas</div>
              <div><label style={{
                ...labelStyle,
                color: temProva ? "rgba(167,139,250,.7)" : "rgba(255,255,255,.3)",
              }}>Data da Prova <span style={{ opacity: .5 }}>(- para ocultar)</span></label>
                <input style={{
                  ...fieldStyle,
                  borderColor: temProva ? "rgba(167,139,250,.5)" : "rgba(255,255,255,.12)",
                  background: temProva ? "rgba(167,139,250,.08)" : "rgba(255,255,255,.06)",
                }} value={overrides.dataProva}
                  onChange={e => set("dataProva", e.target.value)} placeholder="DD/MM/AAAA ou -" /></div>
              <div><label style={labelStyle}>Resultado</label>
                <input style={fieldStyle} value={overrides.dataResultado}
                  onChange={e => set("dataResultado", e.target.value)} placeholder="DD/MM/AAAA ou -" /></div>
            </div>

            {overrides.dataProva !== concurso.dataProva && (
              <div style={{
                background: "rgba(255,184,0,.08)", border: "1px solid rgba(255,184,0,.2)",
                borderRadius: 8, padding: "8px 12px", color: "#FFB800", fontSize: 11,
              }}>
                ⚠️ Data alterada: <strong>{concurso.dataProva || "-"}</strong> → <strong>{overrides.dataProva}</strong>
              </div>
            )}
          </div>

          {/* ── Preview ── */}
          <div style={{
            flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "20px", overflowY: "auto", background: "rgba(0,0,0,.2)",
          }}>
            <div style={{ transform: "scale(0.57)", transformOrigin: "top center", marginBottom: "-260px" }}>
              {/* Preview fiel ao InstagramCard */}
              <div style={{
                width: 480, height: 600,
                background: "linear-gradient(160deg,#050D1E 0%,#091630 45%,#050D1E 100%)",
                borderRadius: 16, position: "relative", overflow: "hidden",
                boxSizing: "border-box", display: "flex", flexDirection: "column",
                gap: 18, paddingTop: Math.round(600 * 0.15), paddingBottom: 18,
                paddingLeft: 43, paddingRight: 43, flexShrink: 0,
                fontFamily: "'Sora', sans-serif",
              }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5,
                  background: `linear-gradient(to bottom, ${st.bg} 55%, transparent)`, borderRadius: "16px 0 0 16px" }} />
                <div style={{ position: "absolute", inset: 0,
                  backgroundImage: "linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
                  backgroundSize: "36px 36px", pointerEvents: "none" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ background: "linear-gradient(90deg,#00C896,#00E5A8)", WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent", fontSize: 8, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase" }}>
                      Concursos Contábeis
                    </span>
                    <span style={{ background: st.bg, color: st.color, fontSize: 8.5, fontWeight: 800,
                      padding: "4px 11px", borderRadius: 20, textTransform: "uppercase" }}>{stLabel}</span>
                  </div>
                  <div>
                    <div style={{ color: "#fff", fontSize: titleSize, fontWeight: 800, lineHeight: 1.15, marginBottom: 5 }}>
                      {cargoDisplay}
                    </div>
                    <div style={{ color: "#00C896", fontSize: titleSize * 0.52, fontWeight: 700, marginBottom: 6, opacity: .92 }}>
                      {concursoEditado.orgao}
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[`📍 ${concursoEditado.estado}`, `🎓 ${concursoEditado.nivel}`].map(t => (
                        <span key={t} style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.09)",
                          color: "rgba(255,255,255,.55)", fontSize: 8.5, padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                {temProva && (
                  <div style={{ background: "linear-gradient(135deg,rgba(167,139,250,.2),rgba(99,60,220,.14))",
                    border: "1.5px solid rgba(167,139,250,.5)", borderRadius: 12, padding: "14px 20px",
                    display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ fontSize: 28, flexShrink: 0 }}>📝</span>
                    <div>
                      <div style={{ color: "rgba(196,181,253,.7)", fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
                        textTransform: "uppercase", marginBottom: 4 }}>Data da Prova</div>
                      <div style={{ color: "#E9D5FF", fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
                        {concursoEditado.dataProva}
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {campos.map(item => (
                      <div key={item.label} style={{ background: "rgba(255,255,255,.04)",
                        border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "9px 13px" }}>
                        <div style={{ color: "rgba(255,255,255,.3)", fontSize: 8, letterSpacing: .8,
                          marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>
                          {item.icon} {item.label}
                        </div>
                        <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 11 }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,.2)", fontSize: 7.5, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>Siga no Instagram</div>
                      <div style={{ color: "#00C896", fontSize: 13, fontWeight: 800 }}>@concursos.contabeis</div>
                    </div>
                    <div style={{ background: "linear-gradient(135deg,#00C896,#00A87A)", color: "#002D1F",
                      fontSize: 9.5, fontWeight: 800, padding: "7px 16px", borderRadius: 20 }}>VER EDITAL</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Ações ── */}
          <div style={{
            width: 220, flexShrink: 0, padding: "14px",
            borderLeft: "1px solid rgba(255,255,255,.06)",
            display: "flex", flexDirection: "column", gap: 10, overflowY: "auto",
          }}>
            <div style={sectionTitle}>Formato preview</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["feed", "stories"] as const).map(f => (
                <button key={f} onClick={() => setFormato(f)} style={{
                  flex: 1, padding: "6px 4px",
                  background: formato === f ? "rgba(0,200,150,.12)" : "transparent",
                  border: "1px solid " + (formato === f ? "#00C896" : "rgba(255,255,255,.1)"),
                  color: formato === f ? "#00C896" : "rgba(255,255,255,.35)",
                  borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {f === "feed" ? "📐 Feed" : "📱 Stories"}
                </button>
              ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 10 }}>
              <div style={sectionTitle}>Publicar agora</div>
            </div>

            {(["feed", "stories", "ambos"] as Formato[]).map(modo => (
              <button key={modo} disabled={publicando} onClick={() => handlePublicar(modo)} style={{
                ...btnBase,
                background: publicando ? "rgba(167,139,250,.1)" : "rgba(167,139,250,.15)",
                border: "1px solid rgba(167,139,250,.35)",
                color: "#A78BFA",
                opacity: publicando ? .6 : 1,
              }}>
                {publicando ? "Publicando..." : modo === "feed" ? "📤 Publicar Feed" : modo === "stories" ? "📱 Publicar Stories" : "📲 Publicar Ambos"}
              </button>
            ))}

            <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 10 }}>
              <div style={sectionTitle}>Agendar</div>
            </div>

            <button onClick={() => setAgendarAberto(true)} style={{
              ...btnBase,
              background: "rgba(255,184,0,.1)", border: "1px solid rgba(255,184,0,.3)", color: "#FFB800",
            }}>
              ⏰ Agendar publicação
            </button>

            <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 10 }}>
              <div style={sectionTitle}>Download</div>
            </div>

            <button onClick={handleDownload} disabled={baixando} style={{
              ...btnBase,
              background: "rgba(0,200,150,.1)", border: "1px solid rgba(0,200,150,.3)", color: "#00C896",
              opacity: baixando ? .6 : 1,
            }}>
              {baixando ? "Gerando..." : `⬇️ Baixar PNG (${formato})`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal de Agendamento ── */}
      {agendarAberto && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#0D1B35", border: "1px solid rgba(0,200,150,.2)",
            borderRadius: 20, padding: 32, width: 400, fontFamily: "'Sora',sans-serif",
          }}>
            <h3 style={{ color: "#00C896", margin: "0 0 8px", fontSize: 18 }}>⏰ Agendar publicação</h3>
            <p style={{ color: "rgba(255,255,255,.5)", fontSize: 13, margin: "0 0 20px" }}>
              {concursoEditado.cargo} · {concursoEditado.orgao}
            </p>

            <label style={{ ...labelStyle, display: "block", marginBottom: 6 }}>FORMATO</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {(["feed", "stories", "ambos"] as Formato[]).map(f => (
                <button key={f} onClick={() => setAgendarModo(f)} style={{
                  flex: 1, padding: "7px 4px",
                  background: agendarModo === f ? "rgba(0,200,150,.12)" : "transparent",
                  border: "1px solid " + (agendarModo === f ? "#00C896" : "rgba(255,255,255,.1)"),
                  color: agendarModo === f ? "#00C896" : "rgba(255,255,255,.35)",
                  borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {f === "feed" ? "Feed" : f === "stories" ? "Stories" : "Ambos"}
                </button>
              ))}
            </div>

            <label style={{ ...labelStyle, display: "block", marginBottom: 6 }}>DATA E HORA</label>
            <input type="datetime-local" value={agendadoPara}
              onChange={e => setAgendadoPara(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              style={{ ...fieldStyle, fontSize: 14 }} />

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={() => { setAgendarAberto(false); setAgendadoPara(""); }} style={{
                flex: 1, padding: "10px 0", borderRadius: 8,
                border: "1px solid rgba(255,255,255,.1)", background: "transparent",
                color: "rgba(255,255,255,.5)", cursor: "pointer", fontFamily: "inherit",
              }}>Cancelar</button>
              <button disabled={!agendadoPara || publicando} onClick={handleAgendar} style={{
                flex: 2, padding: "10px 0", borderRadius: 8,
                background: agendadoPara ? "#00C896" : "rgba(0,200,150,.3)",
                border: "none", color: "#002D1F", fontWeight: 800,
                cursor: agendadoPara ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 13,
              }}>
                {publicando ? "Agendando..." : "⏰ Confirmar agendamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 32, right: 32, zIndex: 9999,
          background: toast.tipo === "ok" ? "rgba(0,200,150,.95)" : toast.tipo === "erro" ? "rgba(255,75,75,.95)" : "rgba(99,102,241,.95)",
          color: "#fff", padding: "14px 24px", borderRadius: 12,
          fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,.4)", display: "flex", alignItems: "center", gap: 10,
          maxWidth: 400,
        }}>
          {toast.msg}
          <button onClick={() => setToast(null)} style={{
            background: "none", border: "none", color: "#fff", cursor: "pointer",
            fontSize: 18, lineHeight: 1, marginLeft: 8,
          }}>×</button>
        </div>
      )}
    </div>
  );
}
