// src/app/api/publicar/route.ts
// Endpoint chamado pelo worker para publicar um agendamento no Instagram
// Também pode ser chamado manualmente para publicar imediatamente

import { NextResponse } from "next/server";
import { getSupabase }  from "@/lib/supabase";

// POST — agenda para publicação imediata ou agenda para um horário
export async function POST(req: Request) {
  const body = await req.json() as {
    concurso_id: string;
    cargo: string;
    orgao: string;
    estado: string;
    legenda: string;
    formato?: "feed" | "stories";
    agendado_para?: string | null; // ISO ou null = agora
    imediato?: boolean;            // true = não agenda, dispara agora
  };

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "Supabase não configurado — configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  // Cria o agendamento no banco
  const { data: agendamento, error } = await sb
    .from("agendamentos")
    .insert({
      concurso_id:   body.concurso_id,
      cargo:         body.cargo,
      orgao:         body.orgao,
      estado:        body.estado,
      legenda:       body.legenda,
      formato:       body.formato ?? "feed",
      agendado_para: body.agendado_para ?? null,
      status:        "pendente",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Se imediato=true, acorda o worker via endpoint interno
  if (body.imediato) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await fetch(`${baseUrl}/api/publicar/worker`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.WORKER_SECRET}`,
        },
        body: JSON.stringify({ agendamento_id: agendamento.id }),
      });
    } catch {
      // Worker será executado pelo cron mesmo se falhar aqui
    }
  }

  return NextResponse.json({ ok: true, agendamento });
}
