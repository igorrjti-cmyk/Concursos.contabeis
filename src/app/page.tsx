"use client";

import { useEffect, useState, useCallback } from "react";
import InstagramCard from "@/components/InstagramCard";
import { gerarLegenda } from "@/lib/legenda";
import type { Concurso } from "@/lib/scraper";
import type { PostHistorico } from "@/app/api/historico/route";

type FilterStatus = "todos" | "Inscrições Abertas" | "Previsto" | "Encerrado";
type TabType = "lista" | "cards" | "historico";
type CardFormato = "feed" | "stories";

const STATUS_DOT: Record<string, string> = {
  "Inscrições Abertas": "#00C896", Previsto: "#FFB800", Encerrado: "#FF4B4B",
};

const UFS = ["Todos","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO","Nacional"];

// ── helpers ─────────────────────────────────────────────────────────────────
function BadgeUrgente({ dias }: { dias: number }) {
  if (dias < 0 || dias > 7) return null;
  return (
    <span style={{ background:"#FF4B4B", color:"#fff", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20, whiteSpace:"nowrap" }}>
      ⚡ {dias === 0 ? "Encerra hoje" : `${dias}d restantes`}
    </span>
  );
}

function Tag({ color, children }: { color:string; children:React.ReactNode }) {
  return <span style={{ background:color+"18", color, padding:"3px 9px", borderRadius:7, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{children}</span>;
}

function Btn({ color, onClick, disabled, children }: { color:string; onClick:(e:React.MouseEvent)=>void; disabled?:boolean; children:React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:color+"18", border:`1px solid ${color}33`, color, borderRadius:9, padding:"7px 12px", cursor:disabled?"not-allowed":"pointer", fontSize:11, fontWeight:600, whiteSpace:"nowrap", opacity:disabled?.5:1 }}>
      {children}
    </button>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [concursos, setConcursos]   = useState<Concurso[]>([]);
  const [historico, setHistorico]   = useState<PostHistorico[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState<FilterStatus>("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [busca, setBusca]           = useState("");
  const [tab, setTab]               = useState<TabType>("lista");
  const [expanded, setExpanded]     = useState<string|null>(null);
  const [copied, setCopied]         = useState<string|null>(null);
  const [downloadingId, setDownloadingId] = useState<string|null>(null);
  const [cardFormato, setCardFormato] = useState<CardFormato>("feed");
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [fromCache, setFromCache]   = useState(false);

  const [clearing, setClearing] = useState(false);

  const clearCache = async () => {
    if (!confirm("Limpar o cache do Supabase? O próximo acesso vai fazer um novo scraping.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/concursos", { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        alert("✅ Cache limpo! Clique em Atualizar para buscar dados frescos.");
      } else {
        alert("❌ Erro: " + data.error);
      }
    } finally {
      setClearing(false);
    }
  };
  const fetchConcursos = useCallback(async (forceRefresh = false) => {
    forceRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res  = await fetch(`/api/concursos${forceRefresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (data.ok) {
        setConcursos(data.concursos);
        setFromCache(data.fromCache ?? false);
        setAtualizadoEm(new Date(data.atualizadoEm).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }));
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  // fetch histórico
  const fetchHistorico = useCallback(async () => {
    try { const r = await fetch("/api/historico"); const d = await r.json(); if (d.ok) setHistorico(d.historico); }
    catch {}
  }, []);

  useEffect(() => { fetchConcursos(); fetchHistorico(); }, [fetchConcursos, fetchHistorico]);

  // filtros compostos
  const filtered = concursos.filter(c => {
    if (filter !== "todos" && c.status !== filter) return false;
    if (estadoFiltro !== "Todos" && c.estado !== estadoFiltro) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!c.cargo.toLowerCase().includes(q) && !c.orgao.toLowerCase().includes(q) && !c.estado.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: concursos.length,
    abertas: concursos.filter(c => c.status === "Inscrições Abertas").length,
    previstos: concursos.filter(c => c.status === "Previsto").length,
    urgentes: concursos.filter(c => c.diasRestantes >= 0 && c.diasRestantes <= 7).length,
  };

  // ações
  const copyLegenda = (c: Concurso) => {
    navigator.clipboard.writeText(gerarLegenda(c));
    setCopied(c.id); setTimeout(() => setCopied(null), 2500);
  };

  const marcarPostado = async (c: Concurso) => {
    await fetch("/api/historico", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ id:c.id, cargo:c.cargo, orgao:c.orgao, estado:c.estado }),
    });
    fetchHistorico();
  };

  const removerHistorico = async (id: string) => {
    await fetch("/api/historico", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id }) });
    fetchHistorico();
  };

  const downloadCard = async (c: Concurso, fmt: CardFormato) => {
    setDownloadingId(c.id + fmt);
    try {
      const h2c = (await import("html2canvas")).default;
      const el  = document.getElementById(`card-${c.id}-${fmt}`);
      if (!el) return;
      const canvas = await h2c(el, { scale:3, backgroundColor:null, useCORS:true });
      const a = document.createElement("a");
      a.download = `${c.id}-${fmt}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } finally { setDownloadingId(null); }
  };

  const jaPostado = (id: string) => {
    const hoje = new Date().toDateString();
    return historico.some(h => h.concurso_id === id && new Date(h.posted_at).toDateString() === hoje);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#080F1E", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Sora',sans-serif", gap:16 }}>
      <div style={{ width:44, height:44, border:"3px solid rgba(0,200,150,.2)", borderTop:"3px solid #00C896", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <div style={{ color:"rgba(255,255,255,.4)", fontSize:13 }}>Buscando concursos…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#080F1E", fontFamily:"'Sora',sans-serif", color:"#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:rgba(0,200,150,.3);border-radius:3px}
        @media(max-width:640px){
          .header-row{flex-direction:column!important;gap:10px!important;align-items:flex-start!important}
          .stats-bar{flex-wrap:wrap!important}
          .stat-item{flex:1 1 45%!important;min-width:120px!important}
          .filters-row{flex-wrap:wrap!important;gap:6px!important}
          .list-row{flex-direction:column!important;gap:10px!important}
          .list-actions{flex-wrap:wrap!important}
          .cards-wrap{justify-content:center!important}
        }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ borderBottom:"1px solid rgba(0,200,150,.1)", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(0,200,150,.02)", position:"sticky", top:0, zIndex:50, backdropFilter:"blur(12px)" }} className="header-row">
        <div>
          <div style={{ background:"linear-gradient(90deg,#00C896,#00E5A8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", fontSize:18, fontWeight:800 }}>
            📊 Concursos Contábeis
          </div>
          <div style={{ color:"rgba(255,255,255,.3)", fontSize:10, marginTop:2 }}>
            pciconcursos.com.br • @concursos.contabeis
            {atualizadoEm && <> • {fromCache ? "🗄️" : "🔄"} {atualizadoEm}</>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={clearCache} disabled={clearing} title="Limpar cache do Supabase" style={{ background:"rgba(255,75,75,.1)", border:"1px solid rgba(255,75,75,.25)", color:"#FF4B4B", borderRadius:10, padding:"9px 14px", fontSize:12, fontWeight:700, cursor:clearing?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:6, opacity:clearing?.6:1 }}>
            <span style={{ display:"inline-block", animation:clearing?"spin .8s linear infinite":"none" }}>🗑️</span>
            {clearing ? "Limpando…" : "Limpar cache"}
          </button>
          <button onClick={() => fetchConcursos(true)} disabled={refreshing} style={{ background:refreshing?"rgba(0,200,150,.15)":"linear-gradient(135deg,#00C896,#00A87A)", color:refreshing?"#00C896":"#002D1F", border:"none", borderRadius:10, padding:"9px 18px", fontSize:12, fontWeight:700, cursor:refreshing?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ display:"inline-block", animation:refreshing?"spin .8s linear infinite":"none" }}>⟳</span>
            {refreshing ? "Buscando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {/* ── STATS ── */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,.06)", overflowX:"auto" }} className="stats-bar">
        {[
          { label:"Total",              value:stats.total,    color:"#00C896" },
          { label:"Inscrições Abertas", value:stats.abertas,  color:"#00C896" },
          { label:"Previstos",          value:stats.previstos,color:"#FFB800" },
          { label:"⚡ Urgentes (≤7d)",  value:stats.urgentes, color:"#FF4B4B" },
        ].map(s => (
          <div key={s.label} style={{ padding:"14px 22px", borderRight:"1px solid rgba(255,255,255,.06)", flexShrink:0 }} className="stat-item">
            <div style={{ color:"rgba(255,255,255,.3)", fontSize:9, letterSpacing:1 }}>{s.label.toUpperCase()}</div>
            <div style={{ color:s.color, fontSize:24, fontWeight:800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div style={{ display:"flex", alignItems:"center", borderBottom:"1px solid rgba(255,255,255,.06)", padding:"0 20px", overflowX:"auto" }}>
        {(["lista","cards","historico"] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background:"none", border:"none", borderBottom:tab===t?"2px solid #00C896":"2px solid transparent", color:tab===t?"#00C896":"rgba(255,255,255,.35)", padding:"13px 16px", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>
            {t === "lista" ? "📋 Lista" : t === "cards" ? "🎨 Cards Instagram" : `📖 Histórico (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FILTROS ── */}
      {tab !== "historico" && (
        <div style={{ padding:"10px 20px", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", borderBottom:"1px solid rgba(255,255,255,.05)" }} className="filters-row">
          {/* Busca */}
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="🔍 Buscar cargo, órgão ou estado…"
            style={{ background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", color:"#fff", borderRadius:9, padding:"7px 12px", fontSize:12, outline:"none", minWidth:200, flex:1 }}
          />
          {/* Status */}
          {(["todos","Inscrições Abertas","Previsto","Encerrado"] as FilterStatus[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background:filter===f?"rgba(0,200,150,.12)":"transparent", border:`1px solid ${filter===f?"#00C896":"rgba(255,255,255,.1)"}`, color:filter===f?"#00C896":"rgba(255,255,255,.4)", borderRadius:18, padding:"5px 11px", cursor:"pointer", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
              {f === "todos" ? "Todos" : f}
            </button>
          ))}
          {/* Estado */}
          <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={{ background:"#0C1E3E", border:"1px solid rgba(255,255,255,.12)", color:"rgba(255,255,255,.7)", borderRadius:9, padding:"6px 10px", fontSize:11, cursor:"pointer" }}>
            {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>

          {/* Formato card (só na aba cards) */}
          {tab === "cards" && (
            <div style={{ display:"flex", gap:4, marginLeft:"auto" }}>
              {(["feed","stories"] as CardFormato[]).map(f => (
                <button key={f} onClick={() => setCardFormato(f)} style={{ background:cardFormato===f?"rgba(0,200,150,.15)":"transparent", border:`1px solid ${cardFormato===f?"#00C896":"rgba(255,255,255,.12)"}`, color:cardFormato===f?"#00C896":"rgba(255,255,255,.4)", borderRadius:8, padding:"5px 11px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                  {f === "feed" ? "⬜ Feed 1:1" : "📱 Stories 9:16"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CONTENT ── */}
      <main style={{ padding:"20px" }}>

        {/* ── LISTA ── */}
        {tab === "lista" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:960 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign:"center", padding:"60px 20px", color:"rgba(255,255,255,.25)" }}>
                Nenhum concurso encontrado com esses filtros.
              </div>
            )}
            {filtered.map(c => {
              const postado = jaPostado(c.id);
              return (
                <div key={c.id} style={{ background:expanded===c.id?"rgba(0,200,150,.04)":"rgba(255,255,255,.025)", border:`1px solid ${expanded===c.id?"rgba(0,200,150,.3)":"rgba(255,255,255,.07)"}`, borderRadius:14, overflow:"hidden" }}>
                  {/* Row */}
                  <div onClick={() => setExpanded(expanded===c.id ? null : c.id)} style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:14, cursor:"pointer", flexWrap:"wrap" }} className="list-row">
                    <div style={{ width:9, height:9, borderRadius:"50%", background:STATUS_DOT[c.status]??"#888", boxShadow:`0 0 6px ${STATUS_DOT[c.status]??"#888"}`, flexShrink:0 }} />

                    <div style={{ flex:1, minWidth:160 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ color:"#fff", fontWeight:700, fontSize:14 }}>{c.cargo}</span>
                        <BadgeUrgente dias={c.diasRestantes} />
                        {postado && <span style={{ background:"rgba(0,200,150,.15)", color:"#00C896", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>✅ Postado hoje</span>}
                      </div>
                      <div style={{ color:"#00C896", fontSize:12, marginTop:2 }}>{c.orgao}</div>
                      <div style={{ color:"rgba(255,255,255,.3)", fontSize:10, marginTop:1 }}>📍 {c.estado} • {c.nivel}{c.banca!=="—"?` • ${c.banca}`:""}</div>
                    </div>

                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }} className="list-actions">
                      <Tag color="#00C896">💰 {c.salario}</Tag>
                      <Tag color="#A78BFA">🎯 {c.vagas}</Tag>
                      <Tag color={STATUS_DOT[c.status]??"#888"}>{c.status}</Tag>
                    </div>

                    <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap" }} className="list-actions">
                      <Btn color="#00C896" onClick={e => { e.stopPropagation(); copyLegenda(c); }}>
                        {copied===c.id ? "✅ Copiado!" : "📋 Legenda"}
                      </Btn>
                      <Btn color="#A78BFA" onClick={e => { e.stopPropagation(); setTab("cards"); setExpanded(c.id); }}>🎨 Card</Btn>
                      <Btn color="#FFB800" onClick={e => { e.stopPropagation(); marcarPostado(c); }} disabled={postado}>
                        {postado ? "📌 Postado" : "📌 Marcar postado"}
                      </Btn>
                      <a href={c.linkEdital} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", color:"rgba(255,255,255,.55)", borderRadius:9, padding:"7px 12px", fontSize:11, fontWeight:600, textDecoration:"none" }}>
                        🔗 Edital
                      </a>
                    </div>
                  </div>

                  {/* Expanded */}
                  {expanded===c.id && (
                    <div style={{ borderTop:"1px solid rgba(255,255,255,.06)", padding:"14px 18px 18px" }}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                        {c.inscricao!=="—" && <span style={{ background:"rgba(0,200,150,.1)", border:"1px solid rgba(0,200,150,.2)", color:"#00C896", padding:"4px 10px", borderRadius:7, fontSize:11, fontWeight:700 }}>📅 Inscrições: {c.inscricao}</span>}
                        {c.dataProva!=="—" && <span style={{ background:"rgba(167,139,250,.1)", border:"1px solid rgba(167,139,250,.2)", color:"#A78BFA", padding:"4px 10px", borderRadius:7, fontSize:11, fontWeight:700 }}>📝 Prova: {c.dataProva}</span>}
                        {c.dataResultado!=="—" && <span style={{ background:"rgba(255,184,0,.1)", border:"1px solid rgba(255,184,0,.2)", color:"#FFB800", padding:"4px 10px", borderRadius:7, fontSize:11, fontWeight:700 }}>🏆 Resultado: {c.dataResultado}</span>}
                      </div>
                      <div style={{ color:"rgba(255,255,255,.25)", fontSize:9, letterSpacing:1.5, marginBottom:8 }}>LEGENDA PRONTA</div>
                      <pre style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.07)", borderRadius:9, padding:14, color:"rgba(255,255,255,.75)", fontSize:11, whiteSpace:"pre-wrap", lineHeight:1.75, margin:0, maxHeight:200, overflowY:"auto" }}>
                        {gerarLegenda(c)}
                      </pre>
                      <button onClick={() => copyLegenda(c)} style={{ marginTop:10, background:copied===c.id?"#00C896":"rgba(0,200,150,.1)", border:"1px solid rgba(0,200,150,.25)", color:copied===c.id?"#002D1F":"#00C896", borderRadius:7, padding:"7px 16px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
                        {copied===c.id ? "✅ Copiado!" : "📋 Copiar Legenda"}
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
            <p style={{ color:"rgba(255,255,255,.3)", fontSize:11, marginBottom:20 }}>
              {cardFormato === "feed" ? "⬜ Feed 1:1 — ideal para o feed do Instagram" : "📱 Stories 9:16 — arraste para cima no Instagram Stories"}
              {" "}• Clique em <strong style={{ color:"#00C896" }}>⬇️ Baixar PNG</strong> para salvar.
            </p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:24 }} className="cards-wrap">
              {filtered.map(c => (
                <div key={c.id} style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
                  <InstagramCard concurso={c} formato={cardFormato} />
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap", justifyContent:"center" }}>
                    <button onClick={() => downloadCard(c, cardFormato)} disabled={downloadingId===c.id+cardFormato} style={{ background:downloadingId===c.id+cardFormato?"rgba(0,200,150,.15)":"linear-gradient(135deg,#00C896,#00A87A)", color:downloadingId===c.id+cardFormato?"#00C896":"#002D1F", border:"none", borderRadius:9, padding:"8px 14px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
                      {downloadingId===c.id+cardFormato ? "⟳ Gerando…" : "⬇️ Baixar PNG"}
                    </button>
                    <Btn color="#00C896" onClick={() => copyLegenda(c)}>{copied===c.id ? "✅ Copiado!" : "📋 Legenda"}</Btn>
                    <Btn color="#FFB800" onClick={() => marcarPostado(c)} disabled={jaPostado(c.id)}>{jaPostado(c.id) ? "📌 Postado" : "📌 Marcar"}</Btn>
                    <a href={c.linkEdital} target="_blank" rel="noreferrer" style={{ background:"rgba(167,139,250,.1)", border:"1px solid rgba(167,139,250,.2)", color:"#A78BFA", borderRadius:9, padding:"8px 12px", fontSize:11, fontWeight:600, textDecoration:"none" }}>🔗 Edital</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {tab === "historico" && (
          <div style={{ maxWidth:700 }}>
            <p style={{ color:"rgba(255,255,255,.3)", fontSize:11, marginBottom:20 }}>
              📖 Registro dos concursos que você marcou como postados. Evita postar o mesmo conteúdo duas vezes.
            </p>
            {historico.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 20px", color:"rgba(255,255,255,.2)" }}>
                Nenhum post registrado ainda.<br />Marque um concurso como postado na aba Lista ou Cards.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {historico.map(h => (
                  <div key={String(h.id)+h.posted_at} style={{ background:"rgba(255,255,255,.025)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <div>
                      <div style={{ color:"#fff", fontWeight:700, fontSize:13 }}>{h.cargo}</div>
                      <div style={{ color:"#00C896", fontSize:11, marginTop:2 }}>{h.orgao} — {h.estado}</div>
                      <div style={{ color:"rgba(255,255,255,.3)", fontSize:10, marginTop:2 }}>
                        Postado em {new Date(h.posted_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}
                      </div>
                    </div>
                    <button onClick={() => removerHistorico(h.concurso_id)} style={{ background:"rgba(255,75,75,.1)", border:"1px solid rgba(255,75,75,.2)", color:"#FF4B4B", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                      🗑️ Remover
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
