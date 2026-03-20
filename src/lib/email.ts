// src/lib/email.ts
// Helper de e-mail usando Resend (resend.com — grátis até 3.000/mês)
// Configure: RESEND_API_KEY e NOTIFY_EMAIL nas variáveis de ambiente

import type { Concurso } from "./scraper";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL   = process.env.NOTIFY_EMAIL || ""; // seu e-mail para receber alertas
// IMPORTANTE: FROM_EMAIL deve ser um domínio verificado no Resend (não Gmail/Outlook).
// Se não tiver domínio próprio verificado, use o sandbox do Resend: onboarding@resend.dev
// (só envia para o e-mail do dono da conta Resend — perfeito para uso pessoal)
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

// ─── Envia e-mail via Resend ──────────────────────────────────────────────────
async function enviarEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[EMAIL] RESEND_API_KEY não configurado — e-mail não enviado");
    return false;
  }
  if (!to) {
    console.warn("[EMAIL] NOTIFY_EMAIL não configurado — e-mail não enviado");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) {
      // Log detalhado: mostra o erro exato do Resend (ex: domínio não verificado, API key inválida)
      console.error(`[EMAIL] Erro Resend (HTTP ${res.status}):`, JSON.stringify(data));
      console.error(`[EMAIL] FROM=${FROM_EMAIL} | TO=${to} | SUBJECT=${subject}`);
      return false;
    }
    console.log(`[EMAIL] Enviado com sucesso: id=${data.id} | to=${to}`);
    return true;
  } catch (e) {
    console.error("[EMAIL] Erro de rede ao enviar e-mail:", e);
    return false;
  }
}

// ─── Estilos comuns ───────────────────────────────────────────────────────────
const estiloBase = `
  body { margin:0; padding:0; background:#f4f4f4; font-family:'Segoe UI',sans-serif; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; }
  .header { background:linear-gradient(135deg,#0B1A38,#00C896); padding:28px 32px; }
  .header h1 { color:#fff; margin:0; font-size:22px; font-weight:800; }
  .header p  { color:rgba(255,255,255,.7); margin:4px 0 0; font-size:13px; }
  .body { padding:28px 32px; }
  .card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px 20px; margin-bottom:14px; }
  .card-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; }
  .cargo { font-size:16px; font-weight:700; color:#1a202c; }
  .orgao { font-size:13px; color:#00A87A; font-weight:600; margin-top:2px; }
  .meta  { font-size:11px; color:#718096; margin-top:2px; }
  .badge { background:#00C896; color:#002D1F; font-size:10px; font-weight:800; padding:3px 9px; border-radius:20px; white-space:nowrap; }
  .badge-urgente { background:#FF4B4B; color:#fff; }
  .badge-previsto { background:#FFB800; color:#2D1F00; }
  .grid { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .tag  { background:#edf2f7; color:#4a5568; font-size:11px; padding:3px 8px; border-radius:5px; font-weight:600; }
  .btn  { display:inline-block; background:#00C896; color:#002D1F; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:700; font-size:13px; margin-top:12px; }
  .footer { background:#f8fafc; padding:16px 32px; text-align:center; font-size:11px; color:#a0aec0; border-top:1px solid #e2e8f0; }
  .divider { border:none; border-top:1px solid #e2e8f0; margin:20px 0; }
  .stat { text-align:center; }
  .stat-num { font-size:32px; font-weight:900; color:#00C896; }
  .stat-label { font-size:11px; color:#718096; text-transform:uppercase; letter-spacing:1px; }
`;

function rodape() {
  return `
    <div class="footer">
      <p>Concursos Contábeis · @concursos.contabeis</p>
      <p>Você está recebendo porque configurou alertas neste painel.</p>
    </div>
  `;
}

// ─── Template: novo concurso ──────────────────────────────────────────────────
export async function emailNovoConcurso(concurso: Concurso): Promise<boolean> {
  if (!NOTIFY_EMAIL) return false;

  const urgente = concurso.diasRestantes >= 0 && concurso.diasRestantes <= 7;
  const badgeClass = urgente ? "badge badge-urgente" : "badge";
  const badgeText = urgente
    ? `⚡ ${concurso.diasRestantes}d restantes`
    : concurso.status === "Inscricoes Abertas" ? "Inscrições Abertas" : "Previsto";

  const html = `
    <!DOCTYPE html><html><head><style>${estiloBase}</style></head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🆕 Novo Concurso de Contabilidade</h1>
          <p>${new Date().toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}</p>
        </div>
        <div class="body">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="cargo">${concurso.cargo}</div>
                <div class="orgao">${concurso.orgao}</div>
                <div class="meta">${concurso.estado} · ${concurso.nivel}${concurso.banca !== "-" ? " · " + concurso.banca : ""}</div>
              </div>
              <span class="${badgeClass}">${badgeText}</span>
            </div>
            <div class="grid">
              <span class="tag">💰 ${concurso.salario}</span>
              <span class="tag">🎯 ${concurso.vagas}</span>
              ${concurso.inscricao !== "-" ? `<span class="tag">📅 ${concurso.inscricao}</span>` : ""}
              ${concurso.dataProva !== "-" ? `<span class="tag">📝 Prova: ${concurso.dataProva}</span>` : ""}
            </div>
            <a href="${concurso.linkEdital || concurso.linkNoticia}" class="btn">Ver Edital →</a>
          </div>
          <p style="font-size:13px;color:#718096;margin-top:20px;">
            Acesse o painel para gerar o card do Instagram e a legenda completa com hashtags.
          </p>
        </div>
        ${rodape()}
      </div>
    </body></html>
  `;

  return enviarEmail(
    NOTIFY_EMAIL,
    `🆕 Novo concurso: ${concurso.cargo} — ${concurso.orgao} (${concurso.estado})`,
    html
  );
}

// ─── Template: alerta de prazo ────────────────────────────────────────────────
export async function emailAlertaPrazo(concursos: Concurso[]): Promise<boolean> {
  if (!NOTIFY_EMAIL || concursos.length === 0) return false;

  const itens = concursos.map(c => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="cargo">${c.cargo}</div>
          <div class="orgao">${c.orgao}</div>
          <div class="meta">${c.estado} · ${c.nivel}</div>
        </div>
        <span class="badge badge-urgente">⚡ ${c.diasRestantes === 0 ? "Encerra HOJE" : c.diasRestantes + "d restantes"}</span>
      </div>
      <div class="grid">
        <span class="tag">💰 ${c.salario}</span>
        <span class="tag">🎯 ${c.vagas}</span>
        <span class="tag">📅 até ${c.inscricaoAte}</span>
      </div>
      <a href="${c.linkEdital || c.linkNoticia}" class="btn">Ver Edital →</a>
    </div>
  `).join("");

  const html = `
    <!DOCTYPE html><html><head><style>${estiloBase}</style></head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚡ Inscrições Encerrando em Breve</h1>
          <p>${concursos.length} concurso${concursos.length > 1 ? "s" : ""} com prazo nos próximos 3 dias</p>
        </div>
        <div class="body">
          <p style="font-size:14px;color:#4a5568;margin-bottom:20px;">
            Ótima oportunidade para postar sobre esses concursos enquanto as inscrições ainda estão abertas!
          </p>
          ${itens}
        </div>
        ${rodape()}
      </div>
    </body></html>
  `;

  return enviarEmail(
    NOTIFY_EMAIL,
    `⚡ ${concursos.length} concurso${concursos.length > 1 ? "s" : ""} encerrando inscrições em breve`,
    html
  );
}

// ─── Template: resumo semanal ─────────────────────────────────────────────────
export async function emailResumoSemanal(dados: {
  novos: Concurso[];
  encerrandoEssaSemana: Concurso[];
  comProvaEssaSemana: Concurso[];
  totalPostsEssaSemana: number;
  totalConcursosAtivos: number;
}): Promise<boolean> {
  if (!NOTIFY_EMAIL) return false;

  const { novos, encerrandoEssaSemana, comProvaEssaSemana, totalPostsEssaSemana, totalConcursosAtivos } = dados;

  const listarConcursos = (lista: Concurso[], limite = 5) =>
    lista.slice(0, limite).map(c => `
      <div class="card" style="margin-bottom:8px;">
        <div class="cargo" style="font-size:14px;">${c.cargo}</div>
        <div class="orgao">${c.orgao} — ${c.estado}</div>
        <div class="grid" style="margin-top:6px;">
          <span class="tag">💰 ${c.salario}</span>
          <span class="tag">🎯 ${c.vagas}</span>
          ${c.diasRestantes >= 0 ? `<span class="tag">📅 ${c.diasRestantes}d</span>` : ""}
        </div>
      </div>
    `).join("") + (lista.length > limite ? `<p style="font-size:12px;color:#a0aec0;">+${lista.length - limite} mais no painel</p>` : "");

  const html = `
    <!DOCTYPE html><html><head><style>${estiloBase}</style></head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Resumo Semanal</h1>
          <p>Semana de ${new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}</p>
        </div>
        <div class="body">

          <!-- Stats -->
          <div style="display:flex;gap:12px;margin-bottom:24px;text-align:center;">
            <div style="flex:1;background:#f8fafc;border-radius:10px;padding:16px;">
              <div class="stat-num">${totalConcursosAtivos}</div>
              <div class="stat-label">Concursos ativos</div>
            </div>
            <div style="flex:1;background:#f8fafc;border-radius:10px;padding:16px;">
              <div class="stat-num" style="color:#3B82F6;">${novos.length}</div>
              <div class="stat-label">Novos esta semana</div>
            </div>
            <div style="flex:1;background:#f8fafc;border-radius:10px;padding:16px;">
              <div class="stat-num" style="color:#F59E0B;">${totalPostsEssaSemana}</div>
              <div class="stat-label">Posts publicados</div>
            </div>
          </div>

          ${novos.length > 0 ? `
            <h3 style="font-size:15px;color:#1a202c;margin:0 0 12px;">🆕 Novos esta semana (${novos.length})</h3>
            ${listarConcursos(novos)}
            <hr class="divider">
          ` : ""}

          ${encerrandoEssaSemana.length > 0 ? `
            <h3 style="font-size:15px;color:#EF4444;margin:0 0 12px;">⚡ Encerrando esta semana (${encerrandoEssaSemana.length})</h3>
            ${listarConcursos(encerrandoEssaSemana)}
            <hr class="divider">
          ` : ""}

          ${comProvaEssaSemana.length > 0 ? `
            <h3 style="font-size:15px;color:#8B5CF6;margin:0 0 12px;">📝 Provas esta semana (${comProvaEssaSemana.length})</h3>
            ${listarConcursos(comProvaEssaSemana)}
            <hr class="divider">
          ` : ""}

          <p style="font-size:13px;color:#718096;margin-top:16px;text-align:center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || "#"}" style="color:#00A87A;font-weight:700;">
              Acessar o painel completo →
            </a>
          </p>
        </div>
        ${rodape()}
      </div>
    </body></html>
  `;

  return enviarEmail(NOTIFY_EMAIL, "📊 Resumo Semanal — Concursos Contábeis", html);
}
