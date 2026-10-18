import { NextResponse } from "next/server";
import { descobrirConcursos, scrapeDetalhe, type Concurso } from "@/lib/scraper";
import { montarConcursos, normalizar } from "@/lib/concurso-dados";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;
const CACHE_KEY = "concursos:v20";
const LOTE_KEY = "scrape-lote:progresso";
const TAMANHO_LOTE = 5;
interface Progresso {
  candidatos: Partial<Concurso>[];
  concursos: Concurso[];
  anteriores: Concurso[];
  pendencias: { orgao: string; fonte: string; motivo: string }[];
  proximoLote: number;
}
export async function GET(req: Request) {
  const params=new URL(req.url).searchParams;
  const lote = Number(params.get("lote") ?? "0");
  if (!Number.isInteger(lote) || lote < 0) return NextResponse.json({ok:false,error:"Lote inválido"},{status:400});
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ok:false,error:"Supabase não configurado"},{status:503});
  try {
    if(params.get("status")==="1") {
      const {data,error}=await sb.from("cache_concursos").select("dados").eq("chave",LOTE_KEY).maybeSingle();
      if(error) throw error;
      return NextResponse.json({ok:true,proximoLote:data?.dados?.proximoLote || 0,totalLotes:data?.dados?.candidatos ? Math.ceil(data.dados.candidatos.length/TAMANHO_LOTE) : 0});
    }
    let progresso: Progresso;
    if (lote === 0) {
      const {data,error}=await sb.from("cache_concursos").select("dados").eq("chave",CACHE_KEY).maybeSingle();
      if(error) throw error;
      const candidatos=await descobrirConcursos();
      if(!candidatos.length) throw new Error("PCI não retornou candidatos; cache publicado foi preservado");
      progresso={candidatos,concursos:[],anteriores:data?.dados?.concursos || [],pendencias:[],proximoLote:0};
    } else {
      const {data,error}=await sb.from("cache_concursos").select("dados").eq("chave",LOTE_KEY).single();
      if(error) throw error;
      progresso=data?.dados;
      if(!progresso?.candidatos) throw new Error("Inicie a atualização pelo lote 0");
    }
    const totalLotes=Math.ceil(progresso.candidatos.length/TAMANHO_LOTE);
    // A failed or out-of-order chunk cannot publish an incomplete cache.
    if(progresso.proximoLote !== lote) return NextResponse.json({ok:false,error:"Sequência de atualização inválida",proximoLote:progresso.proximoLote},{status:409});
    const items=progresso.candidatos.slice(lote*TAMANHO_LOTE,(lote+1)*TAMANHO_LOTE);
    const detalhes=await Promise.all(items.map(c=>scrapeDetalhe(c.linkNoticia || "")));
    const novos: Concurso[]=[];
    for(let i=0;i<items.length;i++) {
      const cards=montarConcursos(items[i],detalhes[i]);
      for(const c of cards) {
        // Preserve favorites and scheduled-post references when the official role is unchanged.
        const antigo=progresso.anteriores.find(a=>a.linkNoticia===c.linkNoticia && normalizar(a.cargo)===normalizar(c.cargo));
        if(antigo) c.id=antigo.id;
        if(!progresso.concursos.some(a=>a.linkNoticia===c.linkNoticia && normalizar(a.cargo)===normalizar(c.cargo) && a.estado===c.estado)) {
          progresso.concursos.push(c); novos.push(c);
        }
      }
      if(!detalhes[i].ehProcessoSeletivo && !detalhes[i].cargosDetalhados?.length && /cont[aá]b|contabilidade|contador|controle|auditor|finan|or[cç]ament/i.test((items[i].cargo || '')+' '+(detalhes[i].textoHtml || ''))) progresso.pendencias.push({
        orgao:items[i].orgao || "", fonte:items[i].linkNoticia || "", motivo:"Notícia não comprova cargo contábil/formação; conferir edital oficial",
      });
    }
    progresso.proximoLote=lote+1;
    const atualizadoEm=new Date().toISOString();
    const fim=lote===totalLotes-1;
    if(fim) {
      if(!progresso.concursos.length) throw new Error("Nenhum cargo confirmado; cache publicado foi preservado");
      const {error}=await sb.from("cache_concursos").upsert({chave:CACHE_KEY,dados:{concursos:progresso.concursos,atualizadoEm,pendencias:progresso.pendencias,candidatosAnalisados:progresso.candidatos.length},atualizado:atualizadoEm});
      if(error) throw error;
      await sb.from("cache_concursos").delete().eq("chave",LOTE_KEY);
    } else {
      const {error}=await sb.from("cache_concursos").upsert({chave:LOTE_KEY,dados:progresso,atualizado:atualizadoEm});
      if(error) throw error;
    }
    return NextResponse.json({ok:true,lote,totalLotes,novosNesteLote:novos.length,totalAcumulado:progresso.concursos.length,candidatosAnalisados:Math.min((lote+1)*TAMANHO_LOTE,progresso.candidatos.length),pendencias:progresso.pendencias.length,fim,atualizadoEm});
  } catch(e) {
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:502});
  }
}
