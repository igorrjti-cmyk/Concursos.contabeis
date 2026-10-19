import type { Concurso, DetalhesEdital } from './scraper';
import { aplicarConferencia } from './auditoria-editais';

export const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const limpar = (s: string) => s.replace(/\s+/g, ' ').trim();
export function statusDisplay(s: string): string {
  return ({'Inscricoes Abertas':'Inscrições Abertas','Inscricoes em breve':'Inscrições em breve','Aguardando Prova':'Aguardando Prova'} as Record<string,string>)[s] || s;
}
export const slug = (s: string) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function diaNumero(s?: string): number | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date.getTime() / 86400000 : null;
}

export function hojeBrasil(now = new Date()): number {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = (type: string) => p.find(x => x.type === type)!.value;
  return Date.UTC(+get('year'), +get('month') - 1, +get('day')) / 86400000;
}

export function atualizarPrazo(c: Concurso, now = new Date()): Concurso {
  const hoje = hojeBrasil(now);
  const inicio = diaNumero(c.inscricaoInicio);
  const fim = diaNumero(c.inscricaoAte);
  const prova = diaNumero(c.dataProva);
  let status: Concurso['status'] = 'Previsto';
  if (prova !== null && prova < hoje) status = 'Encerrado';
  else if (inicio !== null && inicio > hoje) status = 'Inscricoes em breve';
  else if (fim !== null && fim >= hoje) status = 'Inscricoes Abertas';
  else if (prova !== null && prova >= hoje) status = 'Aguardando Prova';
  else if (fim !== null && fim < hoje) status = 'Encerrado';
  // An explicit closing time is relevant on the last day too.
  if (status === 'Inscricoes Abertas' && fim === hoje && c.inscricaoFimHora) {
    const hhmm = new Intl.DateTimeFormat('en-GB', {timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(now);
    if (hhmm > c.inscricaoFimHora) status = prova !== null && prova >= hoje ? 'Aguardando Prova' : 'Encerrado';
  }
  return { ...c, status, diasRestantes: fim === null ? -1 : fim - hoje };
}

export function tipoRelevancia(cargo: string, requisito = ''): Concurso['relevancia'] | undefined {
  const nome = normalizar(cargo), req = normalizar(requisito);
  if (/contabil|contabilidade|\bcontabeis\b|\b(?:sub[- ]?)?contador(?:a)?\b/.test(nome)) return 'cargo-contabil';
  if (/(?:ciencias contabeis|graduacao em contabilidade|bacharel(?:ado)? em contabilidade|curso (?:superior )?de contabilidade)/.test(req)) return 'formacao-contabil';
  if (/\s[-–—]\s.*(?:direito|tecnologia|computacao|engenharia|saude|administracao|economicas)/.test(nome)) return undefined;
  if (/^auditor(?:\s+-\s+[^-]+)?$|auditor.*(?:fiscal|financas|controle)|fiscal.*(?:tribut|receita|rendas)|(?:agente|analista).*(?:tribut|receita|rendas)|controlador interno|coordenador de controle interno/.test(nome) && !/biolog|medic|saude|engenharia|ambiental|sanitari|obras/.test(nome)) return 'area-fiscal';
  return undefined;
}

export function montarConcursos(item: Partial<Concurso>, det: DetalhesEdital, now = new Date()): Concurso[] {
  if (det.ehProcessoSeletivo) return [];
  // Only role-level evidence may create cards. The list-page salary is a total/max.
  const cargos = det.cargosDetalhados ?? [];
  return cargos.flatMap(cd => {
    const relevancia = tipoRelevancia(cd.cargo, cd.requisito);
    if (!relevancia) return [];
    const estados=cd.estados?.length ? cd.estados : item.estados;
    let hash=0;
    for(const ch of (item.linkNoticia || '')+(estados?.join('/') || '')) hash=(hash*31+ch.charCodeAt(0))|0;
    const id = slug((item.orgao || '') + '-' + cd.cargo).slice(0,100)+'-'+(hash>>>0).toString(36);
    const c = atualizarPrazo({
      id, cargo: cd.cargo, cargosContabeis:[cd.cargo], orgao:item.orgao || '-',
      estado:estados?.length ? estados.join('/') : item.estado || 'Nacional', estados, cidade:item.cidade || '', uf:estados?.length ? estados.join('/') : item.uf || item.estado || 'Nacional',
      salario:cd.salario || 'Ver edital', vagas:cd.vagas || 'Ver edital', nivel:cd.nivel || 'Consultar edital',
      inscricao:det.inscricao || item.inscricao || '-', inscricaoInicio:det.inscricaoInicio || item.inscricaoInicio,
      inscricaoAte:det.inscricaoAte || item.inscricaoAte || 'Ver edital', inscricaoFimHora:det.inscricaoFimHora,
      diasRestantes:-1, status:'Previsto', dataProva:det.dataProva || '-', dataResultado:det.dataResultado || '-',
      banca:det.banca || '-', linkNoticia:item.linkNoticia || '', linkEdital:det.linkEdital || item.linkNoticia || '',
      linkEditalPdf:det.linkEditalPdf, linkBanca:det.linkBanca,
      dataCaptura:now.toISOString(), requisito:cd.requisito || 'Consultar edital', relevancia,
      evidenciaCargo:cd.evidencia || cd.cargo, dadosValidados:true,
    }, now);
    const conferido = atualizarPrazo(aplicarConferencia(c), now);
    return conferido.status === 'Encerrado' ? [] : [conferido];
  });
}

export const fonteData = (s: string) => !s || s === '-' || s === 'Ver edital' || s === 'A consultar' ? 'Consultar edital' : s;
