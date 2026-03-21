import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: true, agendamentos: [] });
  const { data, error } = await sb
    .from("agendamentos_posts")
    .select("*")
    .order("agendado_para", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, agendamentos: data ?? [] });
}

export async function POST(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase nao configurado" }, { status: 503 });
  const body = await req.json();
  const { error, data } = await sb
    .from("agendamentos_posts")
    .insert({ concurso_id: body.concurso_id, cargo: body.cargo, orgao: body.orgao, estado: body.estado, modo: body.modo, agendado_para: body.agendado_para, publicado: false })
    .select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, agendamento: data });
}

export async function PATCH(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase nao configurado" }, { status: 503 });
  const body = await req.json();
  const { error } = await sb.from("agendamentos_posts")
    .update({ publicado: true, publicado_em: new Date().toISOString(), post_id_feed: body.post_id_feed ?? null, post_id_stories: body.post_id_stories ?? null })
    .eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase nao configurado" }, { status: 503 });
  const { id } = await req.json();
  const { error } = await sb.from("agendamentos_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
