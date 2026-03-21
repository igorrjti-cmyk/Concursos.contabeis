// src/app/api/cron/publicar-agendados/route.ts
// Cron job a cada 5 minutos — publica agendamentos vencidos via Instagram Graph API
// Os cards base64 foram gerados no navegador do usuário ao agendar e estão salvos no banco
// Sem dependência de serviço externo de screenshot!

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 60;

const IG_TOKEN = process.env.IG_ACCESS_TOKEN || "EAARBkW84Ti8BRPU6kBZAbDb5odzlUdZBktZBU3lUxyK2bzqImydyWaEPLyZB0gVZA9S3qvO83A9PMnrrrgcfs2jZCs0rpXOK0crU3u81epspkjMXGf0uEhXGROyha0QdS3887ZAZAwS1Br8itDVzyEc7MciCbEkkkiZBQh08UIuT5f6y1f2tzSdXrb8g8FfkanasZBJ9qXxp69aaJZCbjSkgEvjR76nzOfX4iJOA8YojtXZAx7ZApNis4SpnWmjLS29CHDoZBr1UZAZB42SWZBKyQdn7rirBhnNyo";
const IG_ID    = process.env.IG_ACCOUNT_ID   || "17841459409972261";
const IG_VER   = "v19.0";

// Faz upload do base64 para o Imgur e retorna a URL pública
async function uploadBase64(base64: string): Promise<string | null> {
  try {
    const b64 = base64.includes(",") ? base64.split(",")[1] : base64;
    const res  = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: { "Authorization": "Client-ID 546c25a59c58ad7", "Content-Type": "application/json" },
      body: JSON.stringify({ image: b64, type: "base64" }),
    });
    const data = await res.json() as { success: boolean; data?: { link: string } };
    return data.success ? (data.data?.link ?? null) : null;
  } catch { return null; }
}

// Cria container, aguarda FINISHED e publica
async function publicarViaAPI(imageUrl: string, tipo: "IMAGE" | "STORIES", legenda?: string): Promise<string | null> {
  const bodyContainer: Record<string, unknown> = {
    image_url: imageUrl, media_type: tipo, access_token: IG_TOKEN,
  };
  if (legenda && tipo === "IMAGE") bodyContainer.caption = legenda;

  const cRes  = await fetch(`https://graph.facebook.com/${IG_VER}/${IG_ID}/media`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyContainer),
  });
  const cData = await cRes.json() as { id?: string; error?: { message: string } };
  if (!cData.id) { console.error("Erro container:", cData.error?.message); return null; }

  // Aguarda processamento (máx 30s)
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const sRes  = await fetch(`https://graph.facebook.com/${IG_VER}/${cData.id}?fields=status_code,status&access_token=${IG_TOKEN}`);
    const sData = await sRes.json() as { status_code?: string };
    if (sData.status_code === "FINISHED") break;
    if (sData.status_code === "ERROR")    return null;
  }

  const pRes  = await fetch(`https://graph.facebook.com/${IG_VER}/${IG_ID}/media_publish`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: cData.id, access_token: IG_TOKEN }),
  });
  const pData = await pRes.json() as { id?: string };
  return pData.id ?? null;
}

export async function GET(req: Request) {
  // Segurança: só Vercel Cron pode chamar
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase nao configurado" });

  // Busca agendamentos pendentes vencidos (com imagens salvas)
  const { data: pendentes, error } = await sb
    .from("agendamentos_posts")
    .select("*")
    .eq("publicado", false)
    .lte("agendado_para", new Date().toISOString())
    .limit(10);

  if (error) return NextResponse.json({ ok: false, error: error.message });
  if (!pendentes?.length) {
    return NextResponse.json({ ok: true, processados: 0, msg: "Nenhum agendamento pendente" });
  }

  const resultados = [];

  for (const ag of pendentes) {
    const r: Record<string, unknown> = { id: ag.id, cargo: ag.cargo, modo: ag.modo };

    try {
      let postIdFeed = null, postIdStories = null;

      // ── Publica Feed ──────────────────────────────────────────────────────
      if ((ag.modo === "feed" || ag.modo === "ambos") && ag.feed_base64) {
        const imageUrl = await uploadBase64(ag.feed_base64);
        if (imageUrl) {
          postIdFeed = await publicarViaAPI(imageUrl, "IMAGE", ag.legenda);
          r.feed = postIdFeed ? `✅ postId: ${postIdFeed}` : "❌ publicação falhou";
        } else {
          r.feed = "❌ upload falhou";
        }
      } else if (ag.modo === "feed" || ag.modo === "ambos") {
        r.feed = "⚠️ sem imagem salva (agendado antes da v5.1)";
      }

      // ── Publica Stories ───────────────────────────────────────────────────
      if ((ag.modo === "stories" || ag.modo === "ambos") && ag.stories_base64) {
        const imageUrl = await uploadBase64(ag.stories_base64);
        if (imageUrl) {
          postIdStories = await publicarViaAPI(imageUrl, "STORIES");
          r.stories = postIdStories ? `✅ postId: ${postIdStories}` : "❌ publicação falhou";
        } else {
          r.stories = "❌ upload falhou";
        }
      } else if (ag.modo === "stories" || ag.modo === "ambos") {
        r.stories = "⚠️ sem imagem salva (agendado antes da v5.1)";
      }

      const ok = postIdFeed !== null || postIdStories !== null;

      // Marca como publicado no banco
      await sb.from("agendamentos_posts").update({
        publicado:       true,
        publicado_em:    new Date().toISOString(),
        post_id_feed:    postIdFeed,
        post_id_stories: postIdStories,
        // Limpa os base64 após publicar (economiza espaço no banco)
        feed_base64:     null,
        stories_base64:  null,
      }).eq("id", ag.id);

      // Registra no histórico
      if (ok) {
        await sb.from("historico_posts").insert({
          concurso_id: ag.concurso_id,
          cargo:       ag.cargo,
          orgao:       ag.orgao,
          estado:      ag.estado,
        });
      }

      r.status = ok ? "✅ publicado" : "❌ falhou";

    } catch (e) {
      r.status = "erro";
      r.erro   = String(e);
      // Marca como publicado para não tentar novamente indefinidamente
      await sb.from("agendamentos_posts")
        .update({ publicado: true, publicado_em: new Date().toISOString() })
        .eq("id", ag.id);
    }

    resultados.push(r);
  }

  return NextResponse.json({
    ok:          true,
    processados: resultados.length,
    resultados,
    timestamp:   new Date().toISOString(),
  });
}
