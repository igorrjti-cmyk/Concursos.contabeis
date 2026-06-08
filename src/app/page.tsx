"use client";

import { useEffect, useState, useCallback } from "react";
import type { Concurso } from "@/lib/scraper";
import { UF_NOMES } from "@/lib/scraper";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const STATUS_DOT: Record<string, string> = {
  "Inscricoes Abertas": "#00C896",
  "Aguardando Prova":   "#A78BFA",
  "Previsto":           "#FFB800",
  "Encerrado":          "#FF4B4B",
};

const STATUS_LABEL: Record<string, string> = {
  "Inscricoes Abertas": "Inscrições Abertas",
  "Aguardando Prova":   "Aguardando Prova",
  "Previsto":           "Previsto",
  "Encerrado":          "Encerrado",
};

const UFS = ["Todos","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO","Nacional"];
const NIVEIS = ["Todos", "Superior", "Médio/Técnico", "Médio/Técnico/Superior"];

type FilterStatus = "todos" | "Inscricoes Abertas" | "Aguardando Prova";
type SortBy = "padrao" | "salario" | "vagas" | "prazo";

function nivelDisplay(cargo: string, nivel: string): string {
  const c = cargo.toLowerCase();
  const ehSuperior = ["contador", "contadora", "auditor", "analista contábil",
    "analista contabil", "fiscal de tribut", "fiscal de rendas"].some(kw => c.includes(kw));
  if (ehSuperior && nivel.includes("Superior")) return "Superior";
  if ((c.includes("técnico em contabilidade") || c.includes("tecnico em contabilidade")) && nivel === "Médio/Técnico/Superior") return "Médio/Técnico";
  return nivel;
}

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
      {dias === 0 ? "⚡ Encerra hoje!" : `⚡ ${dias}d`}
    </span>
  );
}

export default function PublicPage() {
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState("");
  const buscaDebounced            = useDebounce(busca, 250);
  const [filter, setFilter]       = useState<FilterStatus>("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [nivelFiltro, setNivelFiltro]   = useState("Todos");
  const [sortBy, setSortBy]       = useState<SortBy>("padrao");
  const [salarioMin, setSalarioMin] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState("");

  const fetchConcursos = useCallback(async () => {
    try {
      const res  = await fetch("/api/concursos");
      const data = await res.json();
      if (data.ok) {
        setConcursos(data.concursos as Concurso[]);
        setAtualizadoEm(new Date(data.atualizadoEm).toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }));
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConcursos(); }, [fetchConcursos]);

  const filtered = (() => {
    const hojeMs = new Date().setHours(0, 0, 0, 0);
    let list = concursos.filter(c => {
      if (c.dataProva && c.dataProva !== "-") {
        const p = c.dataProva.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (p) {
          const dtP = new Date(parseInt(p[3]), parseInt(p[2]) - 1, parseInt(p[1])).setHours(0,0,0,0);
          if (dtP < hojeMs) return false;
        }
      }
      if (filter !== "todos" && c.status !== filter) return false;
      if (estadoFiltro !== "Todos" && c.estado !== estadoFiltro) return false;
      if (nivelFiltro !== "Todos") {
        const nivelNorm = nivelDisplay(c.cargo, c.nivel);
        if (nivelFiltro === "Superior") {
          if (!nivelNorm.includes("Superior")) return false;
        } else {
          if (nivelNorm !== nivelFiltro) return false;
        }
      }
      if (buscaDebounced.trim()) {
        const q = buscaDebounced.toLowerCase();
        if (!c.cargo.toLowerCase().includes(q) && !c.orgao.toLowerCase().includes(q) &&
            !c.estado.toLowerCase().includes(q) && !(c.cidade || "").toLowerCase().includes(q) &&
            !(c.uf || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });

    if (salarioMin > 0)       list = list.filter(c => parseSalario(c.salario) >= salarioMin);
    if (sortBy === "salario") list = [...list].sort((a, b) => parseSalario(b.salario) - parseSalario(a.salario));
    if (sortBy === "vagas")   list = [...list].sort((a, b) => parseVagas(b.vagas) - parseVagas(a.vagas));
    if (sortBy === "prazo")   list = [...list].sort((a, b) => {
      if (a.diasRestantes < 0 && b.diasRestantes >= 0) return 1;
      if (b.diasRestantes < 0 && a.diasRestantes >= 0) return -1;
      return a.diasRestantes - b.diasRestantes;
    });
    return list;
  })();

  const abertas  = concursos.filter(c => c.status === "Inscricoes Abertas").length;
  const urgentes = concursos.filter(c => c.status === "Inscricoes Abertas" && c.diasRestantes >= 0 && c.diasRestantes <= 7).length;

  return (
    <div style={{ minHeight: "100vh", background: "#060E20", fontFamily: "'Sora',sans-serif", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060E20; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .6 } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        .row:hover { background: rgba(255,255,255,.035) !important; }
        .edital-link:hover { opacity: 1 !important; background: rgba(0,200,150,.15) !important; }
        input:focus { outline: none; border-color: rgba(0,200,150,.4) !important; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,200,150,.2); border-radius: 2px; }
        @media (max-width: 640px) {
          .meta-row { display: none !important; }
          .tag-sal { display: none !important; }
          .header-pills { display: none !important; }
        }
      `}</style>

      {/* HEADER */}
      <header style={{
        borderBottom: "1px solid rgba(0,200,150,.1)",
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,0,0,.3)",
        position: "sticky", top: 0, zIndex: 50,
        backdropFilter: "blur(20px)",
        gap: 12,
      }}>
        <div>
          <div style={{
            background: "linear-gradient(90deg,#00C896,#00E5A8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontSize: 20, fontWeight: 900, letterSpacing: "-0.5px",
          }}>
            Concursos Contábeis
          </div>
          <div style={{ color: "rgba(255,255,255,.25)", fontSize: 10, marginTop: 2 }}>
            Editais com cargos de Contabilidade · @concursos.contabeis
            {atualizadoEm && <span style={{ marginLeft: 6, color: "rgba(255,255,255,.15)" }}>· atualizado {atualizadoEm}</span>}
          </div>
        </div>
        <div className="header-pills" style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {abertas > 0 && (
            <span style={{
              background: "rgba(0,200,150,.1)", border: "1px solid rgba(0,200,150,.2)",
              color: "#00C896", fontSize: 11, fontWeight: 700,
              padding: "4px 12px", borderRadius: 20,
            }}>
              {abertas} com inscrições abertas
            </span>
          )}
          {urgentes > 0 && (
            <span style={{
              background: "rgba(255,75,75,.1)", border: "1px solid rgba(255,75,75,.2)",
              color: "#FF4B4B", fontSize: 11, fontWeight: 700,
              padding: "4px 12px", borderRadius: 20,
              animation: "pulse 1.5s ease-in-out infinite",
            }}>
              ⚡ {urgentes} urgentes
            </span>
          )}
        </div>
      </header>

      {/* FILTROS */}
      <div style={{
        padding: "12px 24px",
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,.04)",
        background: "rgba(255,255,255,.01)",
      }}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="🔎  Buscar cargo, órgão ou estado..."
          style={{
            background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
            color: "#fff", borderRadius: 9, padding: "8px 13px", fontSize: 12,
            outline: "none", minWidth: 220, flex: 1,
            transition: "border-color .2s",
          }}
        />
        {(["todos", "Inscricoes Abertas", "Aguardando Prova"] as FilterStatus[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? "rgba(0,200,150,.1)" : "transparent",
            border: "1px solid " + (filter === f ? "#00C896" : "rgba(255,255,255,.1)"),
            color: filter === f ? "#00C896" : "rgba(255,255,255,.35)",
            borderRadius: 18, padding: "6px 13px",
            cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
            transition: "all .15s",
          }}>
            {f === "todos" ? "Todos" : f === "Inscricoes Abertas" ? "Inscrições Abertas" : "Aguardando Prova"}
          </button>
        ))}
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={{
          background: "#0C1E3E", border: "1px solid rgba(255,255,255,.1)",
          color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "7px 10px",
          fontSize: 11, cursor: "pointer",
        }}>
          {UFS.map(uf => (
            <option key={uf} value={uf}>
              {uf === "Todos" ? "🗺️ Estado" : uf + (UF_NOMES[uf] ? " — " + UF_NOMES[uf] : "")}
            </option>
          ))}
        </select>
        <select value={nivelFiltro} onChange={e => setNivelFiltro(e.target.value)} style={{
          background: "#0C1E3E", border: "1px solid rgba(255,255,255,.1)",
          color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "7px 10px",
          fontSize: 11, cursor: "pointer",
        }}>
          {NIVEIS.map(n => (
            <option key={n} value={n}>
              {n === "Todos" ? "🎓 Nível" : n === "Superior" ? "Superior (inclui misto)" : n}
            </option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{
          background: "#0C1E3E", border: "1px solid rgba(255,255,255,.1)",
          color: "rgba(255,255,255,.6)", borderRadius: 9, padding: "7px 10px",
          fontSize: 11, cursor: "pointer",
        }}>
          <option value="padrao">↕ Ordenar</option>
          <option value="prazo">⏰ Menor prazo</option>
          <option value="salario">💰 Maior salário</option>
          <option value="vagas">🎯 Mais vagas</option>
        </select>
        <select value={salarioMin} onChange={e => setSalarioMin(Number(e.target.value))} style={{
          background: "#0C1E3E", border: "1px solid rgba(255,255,255,.1)",
          color: salarioMin > 0 ? "#00C896" : "rgba(255,255,255,.6)",
          borderRadius: 9, padding: "7px 10px", fontSize: 11, cursor: "pointer",
        }}>
          <option value={0}>💰 Salário mín.</option>
          <option value={3000}>R$ 3.000+</option>
          <option value={5000}>R$ 5.000+</option>
          <option value={8000}>R$ 8.000+</option>
          <option value={10000}>R$ 10.000+</option>
          <option value={15000}>R$ 15.000+</option>
          <option value={20000}>R$ 20.000+</option>
        </select>
      </div>

      {/* LISTA */}
      <main style={{ padding: "20px 24px", maxWidth: 1000, margin: "0 auto" }}>
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16 }}>
            <div style={{ width: 36, height: 36, border: "3px solid rgba(0,200,150,.15)", borderTop: "3px solid #00C896", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
            <div style={{ color: "rgba(255,255,255,.3)", fontSize: 13 }}>Carregando concursos...</div>
          </div>
        )}

        {!loading && (
          <>
            <div style={{ color: "rgba(255,255,255,.2)", fontSize: 11, marginBottom: 12, paddingLeft: 2 }}>
              {filtered.length} concurso{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
              {buscaDebounced && ` para "${buscaDebounced}"`}
            </div>

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "80px 20px", color: "rgba(255,255,255,.2)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Nenhum concurso encontrado</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Tente outros filtros</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map((c, i) => {
                const cor = STATUS_DOT[c.status] ?? "#888";
                const isPdf = c.linkEdital.toLowerCase().endsWith(".pdf");
                const temProva = c.dataProva && c.dataProva !== "-";

                return (
                  <div
                    key={c.id}
                    className="row"
                    style={{
                      background: "rgba(255,255,255,.02)",
                      border: "1px solid rgba(255,255,255,.06)",
                      borderRadius: 12,
                      overflow: "hidden",
                      transition: "background .15s",
                      animation: `fadeIn .25s ease ${Math.min(i, 20) * 0.03}s both`,
                    }}
                  >
                    <div style={{ height: 3, background: `linear-gradient(90deg,${cor},transparent)`, opacity: .5 }} />
                    <div style={{
                      padding: "13px 18px",
                      display: "flex", alignItems: "center", gap: 12,
                      flexWrap: "wrap",
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: cor, boxShadow: `0 0 6px ${cor}`,
                        flexShrink: 0,
                      }} />

                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>
                            {c.cargo.length > 55 ? c.cargo.slice(0, 52) + "…" : c.cargo}
                          </span>
                          <BadgeUrgente dias={c.diasRestantes} />
                          {temProva && (
                            <span style={{ background: "rgba(167,139,250,.1)", color: "#A78BFA", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                              📝 Prova: {c.dataProva}
                            </span>
                          )}
                        </div>
                        <div style={{ color: "#00C896", fontSize: 12, marginTop: 2, fontWeight: 600 }}>{c.orgao}</div>
                        <div className="meta-row" style={{ color: "rgba(255,255,255,.3)", fontSize: 10, marginTop: 2 }}>
                          {c.cidade ? c.cidade + "/" : ""}{c.estado}{c.uf && c.uf !== c.estado ? " · " + c.uf : ""} · {nivelDisplay(c.cargo, c.nivel)}
                          {c.inscricao && c.inscricao !== "-" && <> · Inscrições: {c.inscricao}</>}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span className="tag-sal" style={{
                          background: "rgba(0,200,150,.08)", border: "1px solid rgba(0,200,150,.15)",
                          color: "#00C896", padding: "3px 9px", borderRadius: 7,
                          fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                        }}>{c.salario}</span>
                        <span style={{
                          background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.15)",
                          color: "#A78BFA", padding: "3px 9px", borderRadius: 7,
                          fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                        }}>{c.vagas}</span>
                        <span style={{
                          background: (STATUS_DOT[c.status] ?? "#888") + "15",
                          border: "1px solid " + (STATUS_DOT[c.status] ?? "#888") + "30",
                          color: STATUS_DOT[c.status] ?? "#888",
                          padding: "3px 9px", borderRadius: 7,
                          fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                        }}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </div>

                      <a
                        href={c.linkEdital}
                        target="_blank"
                        rel="noreferrer"
                        className="edital-link"
                        style={{
                          background: isPdf ? "rgba(0,200,150,.08)" : "rgba(255,255,255,.04)",
                          border: isPdf ? "1px solid rgba(0,200,150,.2)" : "1px solid rgba(255,255,255,.08)",
                          color: isPdf ? "#00C896" : "rgba(255,255,255,.4)",
                          borderRadius: 9, padding: "8px 14px",
                          fontSize: 12, fontWeight: 700,
                          textDecoration: "none", whiteSpace: "nowrap",
                          transition: "all .15s",
                          opacity: .85,
                          flexShrink: 0,
                        }}
                      >
                        {isPdf ? "📄 Ver edital" : "🔗 Ver notícia"}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <footer style={{
        borderTop: "1px solid rgba(255,255,255,.04)",
        padding: "24px",
        textAlign: "center",
        color: "rgba(255,255,255,.15)",
        fontSize: 11,
        marginTop: 40,
      }}>
        Concursos Contábeis · Fonte: pciconcursos.com.br · Siga @concursos.contabeis no Instagram
      </footer>
    </div>
  );
}
