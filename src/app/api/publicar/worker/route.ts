// src/app/api/publicar/worker/route.ts
// Worker que executa o Playwright e publica no Instagram.
// Chamado pelo cron do Railway (a cada 5 min) ou manualmente.
// Protegido por WORKER_SECRET para não ser chamado externamente.

import { NextResponse } from "next/server";
import { getSupabase }  from "@/lib/supabase";
import type { Agendamento } from "@/app/api/agendamentos/route";

// ── Guard de segurança ────────────────────────────────────────────────────────
function autorizado(req: Request): boolean {
  const auth   = req.headers.get("authorization") ?? "";
  const secret = process.env.WORKER_SECRET ?? "";
  if (!secret) return true; // dev local sem secret configurado
  return auth === `Bearer ${secret}`;
}

// ── Publicação via Playwright ─────────────────────────────────────────────────
async function publicarInstagram(agendamento: Agendamento): Promise<void> {
  // Importação dinâmica — Playwright só existe no servidor Node.js
  const { chromium } = await import("playwright");

  const IG_USER  = process.env.IG_USERNAME!;
  const IG_PASS  = process.env.IG_PASSWORD!;

  if (!IG_USER || !IG_PASS) {
    throw new Error("IG_USERNAME e IG_PASSWORD não configurados nas variáveis de ambiente.");
  }

  // No Railway o Chrome não está pré-instalado com perfil logado,
  // então fazemos login programático com usuário e senha.
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport:  { width: 1280, height: 900 },
  });

  // Remove flag de webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    (window as Window & { chrome?: object }).chrome = { runtime: {} };
  });

  const page = await context.newPage();

  try {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const jitter = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min) + min);

    // ── 1. Login ───────────────────────────────────────────────────────────
    await page.goto("https://www.instagram.com/accounts/login/", {
      waitUntil: "domcontentloaded",
    });
    await sleep(2000 + jitter(0, 1500));

    // Aceita cookies se aparecer
    const cookieBtn = await page.$("button:has-text('Allow'), button:has-text('Aceitar')");
    if (cookieBtn) { await cookieBtn.click(); await sleep(800); }

    await page.fill("input[name='username']", IG_USER);
    await sleep(500 + jitter(0, 400));
    await page.fill("input[name='password']", IG_PASS);
    await sleep(500 + jitter(0, 400));
    await page.click("button[type='submit']");
    await sleep(4000 + jitter(0, 2000));

    // Dispensa "Salvar informações de login"
    const naoAgora = await page.$("button:has-text('Not Now'), button:has-text('Agora não')");
    if (naoAgora) { await naoAgora.click(); await sleep(1000); }

    // Dispensa notificações
    const naoAgora2 = await page.$("button:has-text('Not Now'), button:has-text('Agora não')");
    if (naoAgora2) { await naoAgora2.click(); await sleep(1000); }

    // ── 2. Gera a imagem do card ──────────────────────────────────────────
    // Renderiza o card via rota de geração de imagem (satori)
    const baseUrl   = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const imgUrl    = `${baseUrl}/api/og?id=${encodeURIComponent(agendamento.concurso_id)}&formato=${agendamento.formato}`;
    const imgRes    = await fetch(imgUrl);

    if (!imgRes.ok) throw new Error(`Falha ao gerar imagem do card: ${imgRes.status}`);

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const tmpPath   = `/tmp/card-${agendamento.concurso_id}-${Date.now()}.png`;

    const fs = await import("fs");
    fs.writeFileSync(tmpPath, imgBuffer);

    // ── 3. Novo post ──────────────────────────────────────────────────────
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
    await sleep(2000 + jitter(0, 1000));

    // Clica no botão "+" / Criar
    const btnsNovo = [
      "svg[aria-label='Nova publicação']",
      "svg[aria-label='New post']",
      "svg[aria-label='Criar']",
      "svg[aria-label='Create']",
    ];
    let clicouNovo = false;
    for (const sel of btnsNovo) {
      const el = await page.$(sel);
      if (el) { await el.click(); clicouNovo = true; break; }
    }
    if (!clicouNovo) {
      // Fallback: link com aria-label
      await page.click("[aria-label='Criar'], [aria-label='Create']");
    }
    await sleep(1500 + jitter(0, 800));

    // ── 4. Upload do arquivo ──────────────────────────────────────────────
    const fileInput = await page.waitForSelector("input[type='file']", {
      state: "attached", timeout: 10000,
    });
    await fileInput.setInputFiles(tmpPath);
    await sleep(3000 + jitter(0, 1500));

    // ── 5. Avança pelas etapas (Recortar → Filtros → Legenda) ─────────────
    for (let step = 0; step < 3; step++) {
      for (const sel of ["button:has-text('Próximo')", "button:has-text('Next')", "button:has-text('Avançar')"]) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); break; }
      }
      await sleep(1200 + jitter(0, 800));
    }

    // ── 6. Digita a legenda ────────────────────────────────────────────────
    const legendaSels = [
      "textarea[aria-label='Escreva uma legenda...']",
      "textarea[aria-label='Write a caption...']",
      "div[contenteditable='true'][aria-label*='legenda']",
      "div[contenteditable='true'][aria-label*='caption']",
      "div[contenteditable='true']",
    ];

    for (const sel of legendaSels) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await sleep(500);
        // Digita linha por linha com delays naturais
        for (const linha of agendamento.legenda.split("\n")) {
          for (const char of linha) {
            await page.keyboard.type(char, { delay: 60 + jitter(0, 40) });
          }
          await page.keyboard.press("Enter");
          await sleep(100 + jitter(0, 80));
        }
        break;
      }
    }
    await sleep(1500 + jitter(0, 800));

    // ── 7. Publica ────────────────────────────────────────────────────────
    for (const sel of [
      "button:has-text('Compartilhar')",
      "button:has-text('Share')",
      "button:has-text('Publicar')",
      "button:has-text('Post')",
    ]) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); break; }
    }

    // Aguarda confirmação
    await page.waitForSelector(
      "span:has-text('Publicação compartilhada'), span:has-text('Post shared')",
      { timeout: 30000 }
    ).catch(() => null); // não joga erro se não confirmar

    // Limpa arquivo temporário
    fs.unlinkSync(tmpPath);

  } finally {
    await browser.close();
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 503 });
  }

  // Busca o próximo agendamento pendente cujo horário já chegou
  const agora = new Date().toISOString();

  const { data: agendamento, error: fetchErr } = await sb
    .from("agendamentos")
    .select("*")
    .eq("status", "pendente")
    .or(`agendado_para.is.null,agendado_para.lte.${agora}`)
    .order("agendado_para", { ascending: true, nullsFirst: true })
    .limit(1)
    .single<Agendamento>();

  if (fetchErr || !agendamento) {
    return NextResponse.json({ ok: true, message: "Nenhum agendamento pendente." });
  }

  // Marca como "publicando" para evitar processamento duplo
  await sb
    .from("agendamentos")
    .update({ status: "publicando" })
    .eq("id", agendamento.id);

  try {
    await publicarInstagram(agendamento);

    // Sucesso
    await sb.from("agendamentos").update({
      status:       "publicado",
      publicado_em: new Date().toISOString(),
    }).eq("id", agendamento.id);

    // Registra no histórico de posts
    await sb.from("historico_posts").insert({
      concurso_id: agendamento.concurso_id,
      cargo:       agendamento.cargo,
      orgao:       agendamento.orgao,
      estado:      agendamento.estado,
    });

    return NextResponse.json({
      ok: true,
      publicado: agendamento.concurso_id,
      mensagem:  `✅ Publicado: ${agendamento.cargo} — ${agendamento.orgao}`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro ao publicar:", msg);

    await sb.from("agendamentos").update({
      status:    "erro",
      erro_msg:  msg,
      tentativas: agendamento.tentativas + 1,
    }).eq("id", agendamento.id);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET — status do worker (health check)
export async function GET() {
  return NextResponse.json({
    ok:     true,
    status: "Worker online",
    hora:   new Date().toISOString(),
  });
}
