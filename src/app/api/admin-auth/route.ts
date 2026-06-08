// src/app/api/admin-auth/route.ts
// Valida a senha do admin contra a variável de ambiente ADMIN_PASSWORD

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { senha } = await req.json();
    const senhaCorreta = process.env.ADMIN_PASSWORD;

    if (!senhaCorreta) {
      console.error("[admin-auth] ADMIN_PASSWORD não configurada no ambiente");
      return NextResponse.json({ ok: false, error: "Servidor mal configurado" }, { status: 500 });
    }

    if (senha === senhaCorreta) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "Requisição inválida" }, { status: 400 });
  }
}
