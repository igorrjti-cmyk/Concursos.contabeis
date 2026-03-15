"use client";

import { useEffect, useState, useCallback } from "react";
import InstagramCard from "@/components/InstagramCard";
import { gerarLegenda } from "@/lib/legenda";
import type { Concurso } from "@/lib/scraper";
import type { PostHistorico } from "@/app/api/historico/route";

type FilterStatus = "todos" | "Inscricoes Abertas" | "Previsto";
type TabType = "lista" | "cards" | "historico";
type CardFormato = "feed" | "stories";
type SortBy = "padrao" | "salario" | "vagas" | "prazo";

const STATUS_DOT: Record<string, string> = {
  "Inscricoes Abertas": "#00C896",
  "Previsto":           "#FFB800",
  "Encerrado":          "#FF4B4B",
};

const STATUS_BG: Record<string, string> = {
  "Inscricoes Abertas": "rgba(0,200,150,.08)",
  "Previsto":           "rgba(255,184,0,.08)",
  "Encerrado":          "rgba(255,75,75,.08)",
};

const NIVEIS = ["Todos", "Superior", "Médio/Técnico", "Médio/Técnico/Superior"];

const UFS = ["Todos","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO","Nacional"];

function parseSalario(s: string): number {
  return parseFloat(s.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
}

function parseVagas(v: string): number {
  const m = v.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function BadgeUrgente({ dias }: { dias: number }) {
  if (dias < 0 || dias > 7) return null;
  return (
    <span style={{
      background: "linear-gradient(135deg,#FF4B4B,#FF2222)",
      color: "#fff", fontSize: 10, fontWeight: 800,
      padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap",
      boxShadow: "0 2px 8px rgba(255,75,75,.4)",
      animation: "pulse 1.5s ease-in-out infinite",
    }}>
      {dias === 0 ? "⚡ Encerra hoje!" : `⚡ ${dias}d restantes`}
    </span>
  );
}

function StatusTag({ status }: { status: string }) {
  const color = STATUS_DOT[status] ?? "#888";
  const label = status === "Inscricoes Abertas" ? "Inscrições Abertas" : status;
  return (
    <span style={{
      background: STATUS_BG[status] ?? "rgba(255,255,255,.07)",
      color, padding: "3px 9px", borderRadius: 7,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      border: `1px solid ${color}22`,
    }}>
      {label}
    </span>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: color + "15", color,
      padding: "3px 9px", borderRadius: 7,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      border: `1px solid ${color}25`,
    }}>
      {children}
    </span>
  );
}

function Btn({ color, onClick, disabled, children }: {
  color: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: color + "15", border: "1px solid " + color + "30",
      color, borderRadius: 9, padding: "7px 13px",
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
      opacity: disabled ? 0.5 : 1,
      transition: "all .15s",
    }}>
      {children}
    </button>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{
      padding: "16px 22px", borderRight: "1px solid rgba(255,255,255,.06)",
      flexShrink: 0, position: "relative", overflow: "hidden",
    }}>
      {/* Fundo com glow sutil */}
      <div style={{
        position: "absolute", bottom: -20, right: -20,
        width: 80, height: 80,
        background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ color: "rgba(255,255,255,.3)", fontSize: 9, letterSpacing: 1.2, marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color, fontSize: 26, fontWeight: 900, lineHeight: 1, letterSpacing: "-1px" }}>{value}</div>
      {sub && <div style={{ color: "rgba(255,255,255,.2)", fontSize: 9, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ConfirmModal({ mensagem, onConfirm, onCancel }: { mensagem: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{
        background: "#0C1E3E", border: "1px solid rgba(255,75,75,.25)",
        borderRadius: 16, padding: "28px 32px", maxWidth: 400, width: "90%",
        display: "flex", flexDirection: "column", gap: 20,
        boxShadow: "0 20px 60px rgba(0,0,0,.6)",
      }}>
        <div style={{ color: "#fff", fontSize: 14, lineHeight: 1.6 }}>{mensagem}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "8px 18px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Cancelar
          </button>
          <button onClick={onConfirm} style={{ background: "rgba(255,75,75,.15)", border: "1px solid rgba(255,75,75,.3)", color: "#FF4B4B", borderRadius: 9, padding: "8px 18px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [concursos, setConcursos]       = useState<Concurso[]>([]);
  const [historico, setHistorico]       = useState<PostHistorico[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [filter, setFilter]             = useState<FilterStatus>("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [nivelFiltro, setNivelFiltro]   = useState("Todos");
  const [sortBy, setSortBy]             = useState<SortBy>("padrao");
  const [busca, setBusca]               = useState("");
  const [tab, setTab]                   = useState<TabType>("lista");
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [copied, setCopied]             = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [cardFormato, setCardFormato]   = useState<CardFormato>("feed");
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [fromCache, setFromCache]       = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ mensagem: string; onConfirm: () => void } | null>(null);
  const [clearing, setClearing]         = useState(false);
  const [debugging, setDebugging]       = useState(false);

  const confirmar = (mensagem: string): Promise<boolean> =>
    new Promise(resolve => {
      setConfirmModal({ mensagem, onConfirm: () => { setConfirmModal(null); resolve(true); } });
    });

  const runDebug = async () => {
    setDebugging(true);
    console.clear();
    console.group("DEBUG - Concursos Contabeis");
    try {
      const urls = ["/vagas/contador", "/vagas/contabilidade", "/vagas/tecnico-em-contabilidade", "/vagas/auditor-fiscal"];
      for (const u of urls) {
        const res  = await fetch("/api/debug?url=" + encodeURIComponent(u));
        const data = await res.json();
        console.group("URL: " + u);
        console.log("Fetch OK:", data.fetch?.ok, "| Status:", data.fetch?.status);
        console.log("Links encontrados:", data.links_total, "| Validos:", data.links_validos);
        const blocos = (data.debug_primeiros_3_concursos ?? []) as Record<string, unknown>[];
        blocos.forEach((b, i) => {
          console.group("Concurso #" + (i + 1) + ": " + b.orgao);
          console.log("title:", b.title);
          console.log("UF:", b.uf_extraido);
          console.log("Cargo do title:", b.cargo_do_title);
          console.log("Vagas:", b.vagas_match);
          console.log("Data periodo:", b.data_periodo, "| Data unica:", b.data_unica);
          console.log("Bloco:", b.bloco_linhas);
          console.groupEnd();
        });
        console.groupEnd();
      }
    } catch (e) {
      console.error("Erro no debug:", e);
    } finally {
      console.groupEnd();
      setDebugging(false);
    }
  };

  const clearCache = async () => {
    if (!await confirmar("Limpar o cache do Supabase? O próximo acesso vai fazer um novo scraping.")) return;
    setClearing(true);
    try {
      const res  = await fetch("/api/concursos", { method: "DELETE" });
      const data = await res.json();
      if (data.ok) alert("Cache limpo! Clique em Atualizar para buscar dados frescos.");
      else alert("Erro: " + data.error);
    } finally {
      setClearing(false);
    }
  };

  const fetchConcursos = useCallback(async (forceRefresh = false) => {
    forceRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res  = await fetch("/api/concursos" + (forceRefresh ? "?refresh=1" : ""));
      const data = await res.json();
      if (data.ok) {
        const c = data.concursos as Concurso[];
        setConcursos(c);
        setFromCache(data.fromCache ?? false);
        setAtualizadoEm(new Date(data.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));
        console.group(`Concursos Contábeis ${data.fromCache ? "[CACHE]" : "[AO VIVO]"}`);
        console.log("Total:", c.length, "| Atualizado:", new Date(data.atualizadoEm).toLocaleString("pt-BR"));
        const porStatus = c.reduce((acc: Record<string, number>, x) => { acc[x.status] = (acc[x.status] || 0) + 1; return acc; }, {});
        console.log("Por status:", porStatus);
        console.table(c.slice(0, 15).map(x => ({ cargo: x.cargo, orgao: x.orgao, estado: x.estado, status: x.status, dias: x.diasRestantes, salario: x.salario })));
        console.groupEnd();
      }
    } catch (e) {
      console.error("Erro ao carregar concursos:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchHistorico = useCallback(async () => {
    try {
      const r = await fetch("/api/historico");
      const d = await r.json();
      if (d.ok) setHistorico(d.historico);
    } catch {}
  }, []);

  useEffect(() => { fetchConcursos(); fetchHistorico(); }, [fetchConcursos, fetchHistorico]);

  // Filtragem + ordenação
  const filtered = (() => {
    let list = concursos.filter(c => {
      if (filter !== "todos" && c.status !== filter) return false;
      if (estadoFiltro !== "Todos" && c.estado !== estadoFiltro) return false;
      if (nivelFiltro !== "Todos" && !c.nivel.includes(nivelFiltro.replace("Todos", ""))) return false;
      if (busca.trim()) {
        const q = busca.toLowerCase();
        if (!c.cargo.toLowerCase().includes(q) && !c.orgao.toLowerCase().includes(q) && !c.estado.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    if (sortBy === "salario")  list = [...list].sort((a, b) => parseSalario(b.salario) - parseSalario(a.salario));
    if (sortBy === "vagas")    list = [...list].sort((a, b) => parseVagas(b.vagas) - parseVagas(a.vagas));
    if (sortBy === "prazo")    list = [...list].sort((a, b) => {
      if (a.diasRestantes < 0 && b.diasRestantes >= 0) return 1;
      if (b.diasRestantes < 0 && a.diasRestantes >= 0) return -1;
      return a.diasRestantes - b.diasRestantes;
    });

    return list;
  })();

  const stats = {
    total:    concursos.length,
    abertas:  concursos.filter(c => c.status === "Inscricoes Abertas").length,
    previstos: concursos.filter(c => c.status === "Previsto").length,
    urgentes: concursos.filter(c => c.diasRestantes >= 0 && c.diasRestantes <= 7).length,
    comProva: concursos.filter(c => c.dataProva && c.dataProva !== "-").length,
  };

  const copyLegenda = (c: Concurso) => {
    navigator.clipboard.writeText(gerarLegenda(c));
    setCopied(c.id);
    setTimeout(() => setCopied(null), 2500);
  };

  const marcarPostado = async (c: Concurso) => {
    await fetch("/api/historico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, cargo: c.cargo, orgao: c.orgao, estado: c.estado }),
    });
    fetchHistorico();
  };

  const removerHistorico = async (id: string) => {
    await fetch("/api/historico", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    fetchHistorico();
  };

  const downloadCard = async (c: Concurso, fmt: CardFormato) => {
    setDownloadingId(c.id + fmt);
    try {
      const h2c = (await import("html2canvas")).default;
      const el  = document.getElementById("card-" + c.id + "-" + fmt);
      if (!el) return;
      const canvas = await h2c(el, { scale: 3, backgroundColor: null, useCORS: true });
      const a = document.createElement("a");
      a.download = c.id + "-" + fmt + ".png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    } finally {
      setDownloadingId(null);
    }
  };

  const jaPostado = (id: string) => {
    const hoje = new Date().toDateString();
    return historico.some(h => h.concurso_id === id && new Date(h.posted_at).toDateString() === hoje);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#060E20", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Sora',sans-serif", gap: 16 }}>
      <div style={{ width: 44, height: 44, border: "3px solid rgba(0,200,150,.15)", borderTop: "3px solid #00C896", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <div style={{ color: "rgba(255,255,255,.35)", fontSize: 13 }}>Buscando concursos...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#060E20", fontFamily: "'Sora',sans-serif", color: "#fff" }}>
      {confirmModal && <ConfirmModal mensagem={confirmModal.mensagem} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />}

      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.7 } }
        * { box-sizing: border-box }
        ::-webkit-scrollbar { width:5px; height:5px }
        ::-webkit-scrollbar-thumb { background:rgba(0,200,150,.25); border-radius:3px }
        button:hover:not(:disabled) { opacity: .85; }
        @media(max-width:640px){
          .header-row{flex-direction:column!important;gap:10px!important;align-items:flex-start!important}
          .stats-bar{flex-wrap:wrap!important}
          .stat-item{flex:1 1 45%!important;min-width:120px!important}
          .filters-row{flex-wrap:wrap!important;gap:6px!important}
          .list-meta{flex-wrap:wrap!important}
          .list-btns{flex-wrap:wrap!important}
          .cards-wrap{justify-content:center!important}
        }
      `}</style>

      {/* ══════════════════════ HEADER ══════════════════════ */}
      <header style={{
        borderBottom: "1px solid rgba(0,200,150,.1)",
        padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,200,150,.02)",
        position: "sticky", top: 0, zIndex: 50,
        backdropFilter: "blur(16px)",
      }} className="header-row">
        <div>
          <div style={{
            background: "linear-gradient(90deg,#00C896,#00E5A8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontSize: 18, fontWeight: 900, letterSpacing: "-0.5px",
          }}>
            Concursos Contábeis
          </div>
          <div style={{ color: "rgba(255,255,255,.25)", fontSize: 10, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            pciconcursos.com.br · @concursos.contabeis
            {atualizadoEm && (
              <>
                <span style={{ opacity: .4 }}>·</span>
                <span style={{
                  background: fromCache ? "rgba(255,184,0,.1)" : "rgba(0,200,150,.1)",
                  color: fromCache ? "#FFB800" : "#00C896",
                  padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                }}>
                  {fromCache ? "CACHE" : "AO VIVO"}
                </span>
                <span>{atualizadoEm}</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={runDebug} disabled={debugging} title="Logs no console F12" style={{
            background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.2)",
            color: "#A78BFA", borderRadius: 10, padding: "8px 13px",
            fontSize: 11, fontWeight: 700, cursor: debugging ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 5, opacity: debugging ? .6 : 1,
          }}>
            <span style={{ display: "inline-block", animation: debugging ? "spin .8s linear infinite" : "none" }}>🔍</span>
            {debugging ? "Analisando..." : "Debug F12"}
          </button>
          <button onClick={clearCache} disabled={clearing} style={{
            background: "rgba(255,75,75,.1)", border: "1px solid rgba(255,75,75,.2)",
            color: "#FF4B4B", borderRadius: 10, padding: "8px 13px",
            fontSize: 11, fontWeight: 700, cursor: clearing ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 5, opacity: clearing ? .6 : 1,
          }}>
            <span style={{ display: "inline-block", animation: clearing ? "spin .8s linear infinite" : "none" }}>🗑</span>
            {clearing ? "Limpando..." : "Limpar cache"}
          </button>
          <button onClick={() => fetchConcursos(true)} disabled={refreshing} style={{
            background: refreshing ? "rgba(0,200,150,.15)" : "linear-gradient(135deg,#00C896,#00A87A)",
            color: refreshing ? "#00C896" : "#002D1F",
            border: "none", borderRadius: 10, padding: "8px 18px",
            fontSize: 11, fontWeight: 700,
            cursor: refreshing ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin .8s linear infinite" : "none" }}>↻</span>
            {refreshing ? "Buscando..." : "Atualizar"}
          </button>
        </div>
      </header>

      {/* ══════════════════════ STATS BAR ══════════════════════ */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.05)", overflowX: "auto" }} className="stats-bar">
        <StatCard label="Total"             value={stats.total}    color="#fff"     />
        <StatCard label="Inscrições Abertas" value={stats.abertas}  color="#00C896"  sub={`${stats.urgentes} urgentes`} />
        <StatCard label="Previstos"          value={stats.previstos} color="#FFB800" />
        <StatCard label="Com Data de Prova"  value={stats.comProva}  color="#A78BFA" />
        {stats.urgentes > 0 && (
          <StatCard label="⚡ Urgentes (≤7d)" value={stats.urgentes}  color="#FF4B4B" sub="encerram em breve" />
        )}
      </div>

      {/* ══════════════════════ TABS ══════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,.05)", padding: "0 20px", overflowX: "auto" }}>
        {(["lista", "cards", "historico"] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none",
            borderBottom: tab === t ? "2px solid #00C896" : "2px solid transparent",
            color: tab === t ? "#00C896" : "rgba(255,255,255,.3)",
            padding: "13px 18px", cursor: "pointer",
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
            transition: "color .15s",
          }}>
            {t === "lista" ? "Lista" : t === "cards" ? "Cards Instagram" : `Histórico (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ══════════════════════ FILTROS ══════════════════════ */}
      {tab !== "historico" && (
        <div style={{
          padding: "10px 20px",
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,.04)",
          background: "rgba(255,255,255,.01)",
        }} className="filters-row">
          {/* Busca */}
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="🔎  Buscar cargo, órgão ou estado..."
            style={{
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
              color: "#fff", borderRadius: 9, padding: "7px 12px", fontSize: 12,
              outline: "none", minWidth: 220, flex: 1,
            }}
          />

          {/* Filtro status */}
          {(["todos", "Inscricoes Abertas", "Previsto"] as FilterStatus[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? "rgba(0,200,150,.1)" : "transparent",
              border: "1px solid " + (filter === f ? "#00C896" : "rgba(255,255,255,.1)"),
              color: filter === f ? "#00C896" : "rgba(255,255,255,.35)",
              borderRadius: 18, padding: "5px 12px",
              cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              transition: "all .15s",
            }}>
              {f === "todos" ? "Todos" : f === "Inscricoes Abertas" ? "Inscrições Abertas" : f}
            </button>
          ))}

          {/* Estado */}
          <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={{
            background: "#0C1E3E", border: "1px solid rgba(255,255,255,.1)",
            color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "6px 10px",
            fontSize: 11, cursor: "pointer",
          }}>
            {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>

          {/* Nível */}
          <select value={nivelFiltro} onChange={e => setNivelFiltro(e.target.value)} style={{
            background: "#0C1E3E", border: "1px solid rgba(255,255,255,.1)",
            color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "6px 10px",
            fontSize: 11, cursor: "pointer",
          }}>
            {NIVEIS.map(n => <option key={n} value={n}>{n === "Todos" ? "🎓 Nível" : n}</option>)}
          </select>

          {/* Ordenação */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{
            background: "#0C1E3E", border: "1px solid rgba(255,255,255,.1)",
            color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "6px 10px",
            fontSize: 11, cursor: "pointer",
          }}>
            <option value="padrao">↕ Ordenar</option>
            <option value="prazo">⏰ Menor prazo</option>
            <option value="salario">💰 Maior salário</option>
            <option value="vagas">🎯 Mais vagas</option>
          </select>

          {/* Formato dos cards */}
          {tab === "cards" && (
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {(["feed", "stories"] as CardFormato[]).map(f => (
                <button key={f} onClick={() => setCardFormato(f)} style={{
                  background: cardFormato === f ? "rgba(0,200,150,.12)" : "transparent",
                  border: "1px solid " + (cardFormato === f ? "#00C896" : "rgba(255,255,255,.1)"),
                  color: cardFormato === f ? "#00C896" : "rgba(255,255,255,.35)",
                  borderRadius: 8, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                  {f === "feed" ? "Feed 1:1" : "Stories 9:16"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ CONTEÚDO ══════════════════════ */}
      <main style={{ padding: "20px" }}>

        {/* ── LISTA ── */}
        {tab === "lista" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 980 }}>

            {/* Contador de resultados */}
            {filtered.length > 0 && (
              <div style={{ color: "rgba(255,255,255,.2)", fontSize: 11, marginBottom: 4, paddingLeft: 4 }}>
                {filtered.length} concurso{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
                {busca && ` para "${busca}"`}
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,.2)" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum concurso encontrado</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Tente outros filtros ou atualize os dados</div>
              </div>
            )}

            {filtered.map(c => {
              const postado = jaPostado(c.id);
              const isOpen  = expanded === c.id;
              const temProva = c.dataProva && c.dataProva !== "-";

              return (
                <div key={c.id} style={{
                  background: isOpen ? "rgba(0,200,150,.03)" : "rgba(255,255,255,.02)",
                  border: "1px solid " + (isOpen ? "rgba(0,200,150,.25)" : "rgba(255,255,255,.06)"),
                  borderRadius: 14, overflow: "hidden",
                  transition: "border-color .2s, background .2s",
                }}>
                  {/* Faixa de status lateral */}
                  <div style={{
                    height: 3,
                    background: `linear-gradient(90deg, ${STATUS_DOT[c.status] ?? "#888"}, transparent)`,
                    opacity: .6,
                  }} />

                  <div
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    style={{
                      padding: "13px 18px",
                      display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", flexWrap: "wrap",
                    }}
                  >
                    {/* Dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: STATUS_DOT[c.status] ?? "#888",
                      boxShadow: `0 0 6px ${STATUS_DOT[c.status] ?? "#888"}`,
                      flexShrink: 0,
                    }} />

                    {/* Info principal */}
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{c.cargo}</span>
                        <BadgeUrgente dias={c.diasRestantes} />
                        {postado && (
                          <span style={{ background: "rgba(0,200,150,.12)", color: "#00C896", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                            ✓ Postado hoje
                          </span>
                        )}
                        {temProva && (
                          <span style={{ background: "rgba(167,139,250,.1)", color: "#A78BFA", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                            📝 Prova: {c.dataProva}
                          </span>
                        )}
                      </div>
                      <div style={{ color: "#00C896", fontSize: 12, marginTop: 2, fontWeight: 600 }}>{c.orgao}</div>
                      <div style={{ color: "rgba(255,255,255,.3)", fontSize: 10, marginTop: 1 }} className="list-meta">
                        {c.estado} · {c.nivel}{c.banca !== "-" ? " · " + c.banca : ""}
                      </div>
                      {/* Cargos contábeis inline quando há múltiplos */}
                      {c.cargosContabeis && c.cargosContabeis.length > 1 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                          {c.cargosContabeis.map(cg => (
                            <span key={cg} style={{
                              background: "rgba(0,200,150,.06)", border: "1px solid rgba(0,200,150,.15)",
                              color: "rgba(0,200,150,.8)", fontSize: 9, fontWeight: 700,
                              padding: "1px 6px", borderRadius: 4,
                            }}>
                              {cg}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tags */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <Tag color="#00C896">{c.salario}</Tag>
                      <Tag color="#A78BFA">{c.vagas}</Tag>
                      <StatusTag status={c.status} />
                    </div>

                    {/* Botões */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }} className="list-btns">
                      <Btn color="#00C896" onClick={e => { e.stopPropagation(); copyLegenda(c); }}>
                        {copied === c.id ? "✓ Copiado!" : "Legenda"}
                      </Btn>
                      <Btn color="#A78BFA" onClick={e => { e.stopPropagation(); setTab("cards"); setExpanded(c.id); }}>
                        Card
                      </Btn>
                      <Btn color="#FFB800" onClick={e => { e.stopPropagation(); marcarPostado(c); }} disabled={postado}>
                        {postado ? "Postado" : "Marcar postado"}
                      </Btn>
                      {(() => {
                        const isPdf = c.linkEdital.toLowerCase().endsWith(".pdf");
                        return (
                          <a
                            href={c.linkEdital} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            title={isPdf ? "Abrir PDF do edital" : "Abrir notícia (PDF não encontrado)"}
                            style={{
                              background: isPdf ? "rgba(0,200,150,.08)" : "rgba(255,255,255,.04)",
                              border: isPdf ? "1px solid rgba(0,200,150,.2)" : "1px solid rgba(255,255,255,.08)",
                              color: isPdf ? "#00C896" : "rgba(255,255,255,.35)",
                              borderRadius: 9, padding: "7px 12px",
                              fontSize: 11, fontWeight: 600,
                              textDecoration: "none", whiteSpace: "nowrap",
                            }}
                          >
                            {isPdf ? "📄 PDF" : "Notícia ↗"}
                          </a>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Painel expandido */}
                  {isOpen && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: "14px 18px 18px" }}>

                      {/* Cargos contábeis identificados */}
                      {c.cargosContabeis && c.cargosContabeis.length > 1 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ color: "rgba(255,255,255,.2)", fontSize: 9, letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" }}>
                            🏷️ Cargos contábeis neste concurso
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {c.cargosContabeis.map(cargo => (
                              <span key={cargo} style={{
                                background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.2)",
                                color: "#00C896", padding: "4px 10px", borderRadius: 7,
                                fontSize: 11, fontWeight: 700,
                              }}>
                                {cargo}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Datas */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                        {c.inscricao !== "-" && (
                          <span style={{ background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.15)", color: "#00C896", padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>
                            📅 Inscrições: {c.inscricao}
                          </span>
                        )}
                        {temProva && (
                          <span style={{ background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.15)", color: "#A78BFA", padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>
                            📝 Prova: {c.dataProva}
                          </span>
                        )}
                        {c.dataResultado !== "-" && (
                          <span style={{ background: "rgba(255,184,0,.08)", border: "1px solid rgba(255,184,0,.15)", color: "#FFB800", padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>
                            🏆 Resultado: {c.dataResultado}
                          </span>
                        )}
                      </div>

                      {/* Legenda */}
                      <div style={{ color: "rgba(255,255,255,.2)", fontSize: 9, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase" }}>
                        Legenda pronta para Instagram
                      </div>
                      <pre style={{
                        background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.06)",
                        borderRadius: 10, padding: 14,
                        color: "rgba(255,255,255,.7)", fontSize: 11,
                        whiteSpace: "pre-wrap", lineHeight: 1.75, margin: 0,
                        maxHeight: 200, overflowY: "auto",
                      }}>
                        {gerarLegenda(c)}
                      </pre>
                      <button onClick={() => copyLegenda(c)} style={{
                        marginTop: 10,
                        background: copied === c.id ? "#00C896" : "rgba(0,200,150,.1)",
                        border: "1px solid rgba(0,200,150,.2)",
                        color: copied === c.id ? "#002D1F" : "#00C896",
                        borderRadius: 7, padding: "7px 16px",
                        cursor: "pointer", fontSize: 11, fontWeight: 700,
                      }}>
                        {copied === c.id ? "✓ Copiado!" : "Copiar Legenda"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── CARDS ── */}
        {tab === "cards" && (
          <div>
            <p style={{ color: "rgba(255,255,255,.25)", fontSize: 11, marginBottom: 20 }}>
              {cardFormato === "feed" ? "Feed 1:1 — ideal para o feed do Instagram" : "Stories 9:16 — arraste para cima no Instagram Stories"}
              {" — Clique em Baixar PNG para salvar."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }} className="cards-wrap">
              {filtered.map(c => (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <InstagramCard concurso={c} formato={cardFormato} />
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      onClick={() => downloadCard(c, cardFormato)}
                      disabled={downloadingId === c.id + cardFormato}
                      style={{
                        background: downloadingId === c.id + cardFormato ? "rgba(0,200,150,.1)" : "linear-gradient(135deg,#00C896,#00A87A)",
                        color: downloadingId === c.id + cardFormato ? "#00C896" : "#002D1F",
                        border: "none", borderRadius: 9, padding: "8px 14px",
                        cursor: "pointer", fontSize: 11, fontWeight: 700,
                      }}
                    >
                      {downloadingId === c.id + cardFormato ? "Gerando..." : "Baixar PNG"}
                    </button>
                    <Btn color="#00C896" onClick={() => copyLegenda(c)}>{copied === c.id ? "✓ Copiado!" : "Legenda"}</Btn>
                    <Btn color="#FFB800" onClick={() => marcarPostado(c)} disabled={jaPostado(c.id)}>
                      {jaPostado(c.id) ? "Postado" : "Marcar"}
                    </Btn>
                    {(() => {
                      const isPdf = c.linkEdital.toLowerCase().endsWith(".pdf");
                      return (
                        <a href={c.linkEdital} target="_blank" rel="noreferrer"
                          title={isPdf ? "Abrir PDF do edital" : "Abrir notícia"}
                          style={{
                            background: isPdf ? "rgba(0,200,150,.08)" : "rgba(167,139,250,.08)",
                            border: isPdf ? "1px solid rgba(0,200,150,.2)" : "1px solid rgba(167,139,250,.15)",
                            color: isPdf ? "#00C896" : "#A78BFA",
                            borderRadius: 9, padding: "8px 12px",
                            fontSize: 11, fontWeight: 600, textDecoration: "none",
                          }}
                        >
                          {isPdf ? "📄 PDF" : "Notícia ↗"}
                        </a>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        
        {/* ── HISTÓRICO ── */}

        {tab === "historico" && (
          <div style={{ maxWidth: 700 }}>
            <p style={{ color: "rgba(255,255,255,.25)", fontSize: 11, marginBottom: 20 }}>
              Registro dos concursos que você marcou como postados.
            </p>
            {historico.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,.2)" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum post registrado ainda</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Marque concursos como postados na aba Lista</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {historico.map(h => (
                  <div key={String(h.id) + h.posted_at} style={{
                    background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)",
                    borderRadius: 12, padding: "12px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 12, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{h.cargo}</div>
                      <div style={{ color: "#00C896", fontSize: 11, marginTop: 2 }}>{h.orgao} — {h.estado}</div>
                      <div style={{ color: "rgba(255,255,255,.25)", fontSize: 10, marginTop: 2 }}>
                        Postado em {new Date(h.posted_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <button onClick={() => removerHistorico(h.concurso_id)} style={{
                      background: "rgba(255,75,75,.08)", border: "1px solid rgba(255,75,75,.15)",
                      color: "#FF4B4B", borderRadius: 8, padding: "6px 12px",
                      cursor: "pointer", fontSize: 11, fontWeight: 600,
                    }}>
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
