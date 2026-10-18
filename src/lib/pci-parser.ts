import * as cheerio from 'cheerio';
import type { Concurso, DetalhesEdital } from './scraper';
import { limpar, normalizar, slug, tipoRelevancia } from './concurso-dados';
import { extrairDetalhesEspecialidade } from './especialidades-contabeis';
import { UF_NOMES } from './ufs';

const MESES = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export function normalizarDatasTexto(texto: string): string {
  return normalizar(texto).replace(/(\d{1,2})(?:o|º|°)?\s+de\s+(\w+)\s+de\s+(\d{4})/g, (all, d, mes, y) => {
    const m = MESES.indexOf(mes);
    return m < 0 ? all : `${d.padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${y}`;
  });
}

export function extrairPeriodo(texto: string): Partial<DetalhesEdital> {
  const t = normalizarDatasTexto(texto);
  const datas = [...t.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)];
  // Prefer the paragraph about enrollment; never use payment/fee-exemption dates.
  if (!/inscri/.test(t) || /^(?:a |o )?(?:pedido|periodo|prazo).*isencao/.test(t) || datas.length === 0) return {};
  const inicio = datas.length > 1 ? datas[0][1] : undefined;
  const fim = datas.length > 1 ? datas[1] : datas[0];
  const antes = t.slice(Math.max(0, fim.index! - 24), fim.index);
  const depois = t.slice(fim.index! + fim[1].length, fim.index! + fim[1].length + 30);
  const hora = antes.match(/(?:as|ate as)\s+(\d{1,2})h(?:(\d{2})(?:min)?)?\s+(?:do\s+)?dia\s*$/) || depois.match(/^\s*,?\s*(?:as|ate as)\s+(\d{1,2})h(?:(\d{2})(?:min)?)?/);
  return { inscricaoInicio:inicio, inscricaoAte:fim[1], inscricao:inicio ? inicio+' a '+fim[1] : fim[1], inscricaoFimHora:hora ? hora[1].padStart(2,'0')+':'+(hora[2] || '00') : undefined };
}

export function lerListagemPCI(html: string): Partial<Concurso>[] {
  const $ = cheerio.load(html), saida: Partial<Concurso>[] = [];
  // Each row is parsed independently, so a neighboring edital cannot supply values.
  $('#concursos .ca').each((_, el) => {
    const row = $(el), a = row.children('a[href*="/noticias/"]').first();
    if (!a.length) return;
    const orgao = limpar(a.text()), title = a.attr('title') || '', linkNoticia = a.attr('href') || '';
    if (/processo seletivo|selecao simplificada|seletivo simplificado|temporari|credenciamento/.test(normalizar(title))) return;
    const copy = row.find('.cd').first().clone();
    copy.find('br').replaceWith('\n');
    const linhas = copy.text().split('\n').map(limpar).filter(Boolean);
    const cargo = linhas[1] || 'Vários Cargos', nivel = linhas[2] || 'Consultar edital';
    const dataTexto = limpar(row.find('.ce').text());
    const ds = [...dataTexto.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)];
    const end = ds.at(-1); const y = end?.[3];
    const fmt = (m: RegExpMatchArray, ano: string) => m[1].padStart(2,'0')+'/'+m[2].padStart(2,'0')+'/'+ano;
    let inscricaoInicio: string | undefined;
    if (ds.length > 1 && y) inscricaoInicio = fmt(ds[0], String(Number(y) - (Number(ds[0][2]) > Number(end![2]) ? 1 : 0)));
    const inscricaoAte = end && y ? fmt(end,y) : 'Ver edital';
    const ufTitle = title.match(/\s-\s([A-Z]{2}(?:(?:\/|,\s*|\s+e\s+)[A-Z]{2})*)(?=\s|,)/)?.[1];
    const ufRow = limpar(row.find('.cc').text());
    const estados = ufTitle?.match(/\b[A-Z]{2}\b/g) || (ufRow.match(/\b[A-Z]{2}\b/g) ?? []);
    saida.push({ id:slug(orgao+'-'+linkNoticia.split('/').pop()), cargo, orgao, linkNoticia,
      estado:estados.length ? estados.join('/') : 'Nacional', estados, uf:estados.join('/') || 'Nacional',
      nivel, inscricaoInicio, inscricaoAte, inscricao:inscricaoInicio ? inscricaoInicio+' a '+inscricaoAte : inscricaoAte,
      vagas:'Ver edital', salario:'Ver edital', status:'Previsto', diasRestantes:-1,
    });
  });
  return saida;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
type Cargo = NonNullable<DetalhesEdital['cargosDetalhados']>[number];

export function lerNoticiaPCI(html: string, url: string): Partial<DetalhesEdital> & { textoHtml: string } {
  const $ = cheerio.load(html);
  const root = $('[itemprop="articleBody"]').first();
  if (!root.length) return {textoHtml:'', cargosContabeis:[], cargosDetalhados:[]};
  const textoHtml = root.text();
  const titulo = limpar($('h1').first().text());
  const ehProcessoSeletivo = /processo seletivo|selecao simplificada|seletivo simplificado|temporari/.test(normalizar(titulo)) || /processo seletivo|oficiais temporarios|servico militar voluntario|contratacao (?:por tempo determinado|temporaria)/.test(normalizar(root.find('p').slice(0,2).text()));
  const paragrafos = root.find('p').map((_,e)=>limpar($(e).text())).get();
  const todos: {cargo:string; detalhe:string; evidencia:string}[] = [];
  root.find('li').each((_,el) => {
    const t = limpar($(el).text());
    if (!t || t.length > 1000 || /https?:|clique|podcast|material basico/.test(normalizar(t))) return;
    const i = t.search(/\s*\((?=[^)]*(?:\bvagas?\b|\bCR\b|reserva|\d+\s*(?:AC|PcD|PN)))/i);
    let cargo = limpar(i < 0 ? t : t.slice(0,i)).replace(/[;:.]+$/,'');
    if (/^ci[eê]ncias cont[aá]beis$/i.test(cargo)) {
      const heading=limpar($(el).closest('ul').prev('p,h2,h3,h4').text());
      if (/^(?:Analista|Assistente|T[eé]cnico|Auditor|Especialista)\b/i.test(heading) && heading.length<150) cargo=heading+' - '+cargo;
      else return;
    }
    if (cargo.length > 3 && cargo.length < 180) todos.push({cargo, detalhe:i < 0 ? '' : t.slice(i), evidencia:t});
  });
  // Tables associate each requirement with its own row, never the whole document.
  root.find('tr').each((_,el) => {
    const cells=$(el).find('td').map((_,td)=>limpar($(td).text())).get();
    if (cells.length < 2) return;
    const headers=$(el).closest('table').find('tr').first().find('th,td').map((_,td)=>normalizar($(td).text())).get();
    const nomeIdx=headers.findIndex(t=>/^(?:cargo|funcao|denominacao)/.test(t));
    const vagasIdx=headers.findIndex(t=>/^(?:total de )?vagas/.test(t));
    const cargo=nomeIdx>=0 ? cells[nomeIdx] : cells.find(t=>!/^\d+$|^R\$|^CR$|^superior|^medio|^graduacao|^bacharel/i.test(t));
    if (!cargo || /^(?:cargo|funcao|escolaridade|requisitos?|total|vagas)$/i.test(normalizar(cargo))) return;
    let detalhe=cells.filter(t=>t!==cargo).join(' | ');
    if(vagasIdx>=0 && /^\d+$/.test(cells[vagasIdx] || '')) detalhe+=' | '+cells[vagasIdx]+' vagas';
    if (cargo.length < 160) todos.push({cargo, detalhe,evidencia:cells.join(' | ')});
  });
  // Single-position announcements often put the title and requirements in prose.
  if (!todos.length) {
    for (const p of paragrafos) {
      const m=p.match(/(?:cargo|funcao)\s+de\s+([^.;:]{3,120}?)(?=\s*\(|\s*,\s*(?:com|para|que)|\s+(?:com|para o qual|que exige)|[.;]|$)/i);
      if (m) todos.push({cargo:limpar(m[1]),detalhe:p,evidencia:p});
    }
  }
  const cargos: Cargo[]=[];
  for (const row of todos) {
    const nome=normalizar(row.cargo);
    // A table/list row may explicitly list several acceptable degrees.
    let requisito = /ciencias contabeis|formacao|graduacao|bacharel|diploma|curso superior|registro.*crc/.test(normalizar(row.detalhe)) ? row.detalhe : 'Consultar edital';
    for (const p of paragrafos) {
      const np=normalizar(p);
      if (np.includes(nome) && /(?:requisito|exige|necessari|possuir|formacao|graduacao|bacharel|diploma)/.test(np) && !/conteudo programatico/.test(np)) {
        // Do not attribute the qualification of another named role to this one.
        const outros=todos.filter(o=>normalizar(o.cargo)!==nome && np.includes(normalizar(o.cargo)));
        if (!outros.length) requisito=p;
      }
    }
    if (todos.length === 1 && requisito === 'Consultar edital') {
      const p=paragrafos.find(p=>/ciencias contabeis/.test(normalizar(p)) && /requisito|necessari|exige|formacao|graduacao|diploma|superior/.test(normalizar(p)) && !/conteudo programatico/.test(normalizar(p)));
      if(p) requisito=p;
    }
    const relevancia=tipoRelevancia(row.cargo,requisito);
    if (!relevancia) continue;
    const d=normalizar(row.detalhe);
    let vagas='Ver edital';
    const vm=row.detalhe.match(/\b(\d+)\s*vagas?\b/i);
    if (vm) vagas=vm[1]+(vm[1]==='1'?' vaga':' vagas')+(/\+\s*cr\b/i.test(row.detalhe)?' + CR':'');
    else if (/\bcr\b|cadastro (?:de )?reserva/.test(d)) vagas='Cadastro Reserva';
    if (vm && /\+\s*cadastro (?:de )?reserva/.test(d) && !vagas.includes('CR')) vagas+=' + CR';
    const nomeRE=escapar(row.cargo);
    let salario=row.detalhe.match(/R\$\s*([\d.,]+)/i)?.[1];
    for (const p of paragrafos) {
      const re=new RegExp('R\\$\\s*([\\d.,]+)\\s+para\\s+(?:o\\s+(?:cargo\\s+de\\s+)?)?'+nomeRE+'(?=\\s*(?:[,.;]|e\\s+de\\s+R|$))','i');
      salario ||= p.match(re)?.[1];
    }
    let nivel = /tecnico (?:em|de) contabilidade/.test(nome) ? 'Médio/Técnico' : /contador|contabeis|analista.*contabil|especialidade.*contabilidade/.test(nome) || /graduacao|superior|bacharel/.test(normalizar(requisito)) ? 'Superior' : 'Consultar edital';
    const abertura=normalizar(paragrafos[0] || '');
    if(nivel==='Consultar edital' && /(?:nivel|ensino) superior/.test(abertura) && !/medio|fundamental|tecnico/.test(abertura)) nivel='Superior';
    // A shared salary is safe only when the source explicitly links it to the level.
    if (!salario && nivel !== 'Consultar edital') {
      const n=nivel==='Superior'?'superior':'medio';
      salario=normalizar(textoHtml).match(new RegExp('r\\$\\s*([\\d.,]+)\\s+para\\s+cargos\\s+de\\s+nivel\\s+'+n))?.[1];
    }
    if (!salario) {
      const comum=paragrafos.find(p=> {
        const n=normalizar(p);
        return /remuneracao(?: inicial)? (?:e|sera|de)|salario(?: inicial)? (?:e|sera|de)/.test(n)
          && !/varia|entre|ate| a r\$|para (?:o cargo|contador|analista|auditor|assistente)/.test(n)
          && (p.match(/R\$/g)||[]).length===1;
      });
      salario=comum?.match(/R\$\s*(\d[\d.,]*\d)/i)?.[1];
    }
    // A single-position story may state its salary/vacancy count unambiguously.
    if (todos.length === 1) {
      const p=paragrafos.find(p=>/remuneracao|salario/.test(normalizar(p)) && !/varia|entre|ate|de r\$.* a r\$/.test(normalizar(p)));
      salario ||= p?.match(/R\$\s*([\d.,]+)/i)?.[1];
      if (vagas==='Ver edital') {
        const p0=paragrafos[0] || '';
        const v=p0.match(/(?:preenchimento|preencher|oferta|oferece|ofertar)\s+(?:de\s+)?(\d+)\s*vagas?/i);
        if (v) vagas=v[1]+(v[1]==='1'?' vaga':' vagas');
      }
    }
    let detalheLocal=normalizar(row.detalhe);
    const estados: string[]=[];
    for(const [uf,n] of Object.entries(UF_NOMES).filter(([uf])=>uf!=='Nacional').sort((a,b)=>b[1].length-a[1].length)) {
      const estado=normalizar(n);
      if(detalheLocal.includes(estado)) { estados.push(uf); detalheLocal=detalheLocal.replaceAll(estado,''); }
    }
    const anterior=cargos.find(c=>normalizar(c.cargo)===nome && (c.estados?.join('/') || '')===estados.join('/'));
    if (!anterior) cargos.push({cargo:row.cargo,vagas,salario:salario?'R$ '+salario.replace(/[.,]+$/,''):'Ver edital',nivel,requisito,evidencia:row.evidencia,estados:estados.length?estados:undefined});
  }
  // Judicial career pay headings in FCC PDFs and the PCI prose are explicit.
  for(const especial of extrairDetalhesEspecialidade(textoHtml)) {
    const c=cargos.find(c=>normalizar(c.cargo)===normalizar(especial.cargo));
    if(c) { if(especial.salario!=='Ver edital') c.salario=especial.salario; }
  }
  const periodos=paragrafos.filter(p=>/inscri/.test(normalizar(p))).map(p=>({p,d:extrairPeriodo(p)})).filter(p=>p.d.inscricaoAte);
  const basePeriodo=periodos.find(p=>p.d.inscricaoInicio)?.d;
  const atualPeriodo=(periodos.find(p=>/prorrog|reabert/.test(normalizar(p.p))) || periodos.find(p=>p.d.inscricaoInicio) || periodos[0])?.d;
  const periodo: Partial<DetalhesEdital>=atualPeriodo ? {...atualPeriodo,inscricaoInicio:atualPeriodo.inscricaoInicio || basePeriodo?.inscricaoInicio} : {};
  if(periodo.inscricaoInicio && periodo.inscricaoAte) periodo.inscricao=periodo.inscricaoInicio+' a '+periodo.inscricaoAte;
  const linhasProva = paragrafos.map(normalizarDatasTexto).filter(p=>/prova(?:s)? (?:objetiva|escrita)|aplicacao das provas|as provas (?:estao|foram)/.test(p))
    .sort((a,b)=>Number(/remarcad|adiad|alterad/.test(b))-Number(/remarcad|adiad|alterad/.test(a)));
  let dataProva='-';
  for (const p of linhasProva) {
    const m=p.match(/(?:remarcad\w*|adiad\w*|alterad\w*)[^.;]{0,100}?para\s+(?:o\s+dia\s+)?(\d{2}\/\d{2}\/\d{4})/)
      || p.match(/(?:previst\w*|aplicad\w*|realizad\w*|marcad\w*|adiad\w*|ocorrerao|acontecerao)[^.;]{0,100}?(\d{2}\/\d{2}\/\d{4})/);
    if(m){dataProva=m[1];break;}
  }
  const a=root.find('a[href^="http"]').filter((_,e)=>!/pciconcursos|facebook|instagram|youtube|t\.me/.test($(e).attr('href') || '')).first();
  const linkEdital=a.attr('href') || url;
  return {textoHtml, ehProcessoSeletivo, cargosContabeis:cargos.map(c=>c.cargo),cargosDetalhados:cargos,...periodo,dataProva,linkEdital};
}
