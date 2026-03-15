// src/app/api/agendamentos/route.ts
// CRUD da fila de agendamentos para publicação no Instagram

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export interface Agendamento {
  id: number;
  concurso_id: string;
  cargo: string;
  orgao: string;
  estado: string;
  legenda: string;
  formato: "feed" | "stories";
  status: "pendente" | "publicando" | "publicado" | "erro";
  agendado_para: string | null;
  publicado_em: string | null;
  erro_msg: string | null;
  tentativas: number;
  criado_em: string;
}

// GET — lista agendamentos (filtrado por status opcional)
export async function GET(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: true, agendamentos: [] });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // pendente | publicado | erro | todos

  let query = sb
    .from("agendamentos")
    .select("*")
    .order("agendado_para", { ascending: true, nullsFirst: true })
    .order("criado_em",     { ascending: true });

  if (status && status !== "todos") {
    query = query.eq("status", status);
  } else if (!status) {
    // Default: mostra pendentes + publicando + erros recentes
    query = query.in("status", ["pendente", "publicando", "erro"]);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, agendamentos: data ?? [] });
}

// POST — adiciona um agendamento
export async function POST(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 503 });

  const body = await req.json() as {
    concurso_id: string;
    cargo: string;
    orgao: string;
    estado: string;
    legenda: string;
    formato?: "feed" | "stories";
    agendado_para?: string | null; // ISO string ou null
  };

  // Verifica se já existe um agendamento pendente para esse concurso
  const { data: existente } = await sb
    .from("agendamentos")
    .select("id, status")
    .eq("concurso_id", body.concurso_id)
    .in("status", ["pendente", "publicando"])
    .maybeSingle();

  if (existente) {
    return NextResponse.json(
      { ok: false, error: "Já existe um agendamento pendente para esse concurso." },
      { status: 409 }
    );
  }

  const { data, error } = await sb.from("agendamentos").insert({
    concurso_id:   body.concurso_id,
    cargo:         body.cargo,
    orgao:         body.orgao,
    estado:        body.estado,
    legenda:       body.legenda,
    formato:       body.formato ?? "feed",
    agendado_para: body.agendado_para ?? null,
    status:        "pendente",
  }).select().single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, agendamento: data });
}

// PATCH — atualiza status (usado pelo worker)
export async function PATCH(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 503 });

  const body = await req.json() as {
    id: number;
    status: string;
    erro_msg?: string;
    publicado_em?: string;
  };

  const updates: Record<string, unknown> = { status: body.status };
  if (body.erro_msg)     updates.erro_msg    = body.erro_msg;
  if (body.publicado_em) updates.publicado_em = body.publicado_em;

  // Se for erro, busca tentativas atuais e incrementa manualmente
  if (body.status === "erro") {
    const { data: atual } = await sb
      .from("agendamentos")
      .select("tentativas")
      .eq("id", body.id)
      .single<{ tentativas: number }>();
    updates.tentativas = (atual?.tentativas ?? 0) + 1;
  }

  const { error } = await sb
    .from("agendamentos")
    .update(updates)
    .eq("id", body.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove agendamento
export async function DELETE(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase não configurado" }, { status: 503 });

  const { id } = await req.json() as { id: number };

  const { error } = await sb
    .from("agendamentos")
    .delete()
    .eq("id", id)
    .in("status", ["pendente", "erro"]); // só permite deletar pendentes/com erro

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
