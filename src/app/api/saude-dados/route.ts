import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
/** Public health metadata only: never return credentials or database contents. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let projeto: string | null = null;
  try { projeto = url ? new URL(url).hostname.split('.')[0] : null; } catch { /* invalid configuration */ }
  const sb = getSupabase();
  if (!sb) return NextResponse.json({configurado:false,projeto,cacheDisponivel:false},{status:503});
  const { data, error } = await sb.from('cache_concursos').select('chave').eq('chave','concursos:v20').maybeSingle();
  return NextResponse.json({configurado:true,projeto,cacheDisponivel:!error && !!data},{status:error?503:200});
}
