import type { Concurso } from './scraper';
import registros from './editais-conferidos.json';

export interface ConferenciaEdital {
  fonte: string;
  cargo: string;
  dataAnterior: string;
  dataProva: string;
  editalPdf: string;
  documento: string;
  pagina: number;
  evidencia: string;
  conferidoEm: string;
  observacao?: string;
  status?: 'divergencia';
  ajusteInscricao?: { anterior: string; inicio: string; fim: string };
  documentoSha256?: string;
}

/** Evidence is keyed to the exact announcement and role, never just the municipality. */
export function aplicarConferencia(c: Concurso, auditoria: ConferenciaEdital[] = registros as ConferenciaEdital[]): Concurso {
  const registro = auditoria.find(r => r.fonte === c.linkNoticia && r.cargo === c.cargo);
  const antigoPdf = /\.pdf(?:[?#]|$)/i.test(c.linkEdital || '');
  const base: Concurso = { ...c, linkEditalPdf: c.linkEditalPdf || (antigoPdf ? c.linkEdital : undefined),
    linkBanca: c.linkBanca || (!antigoPdf && c.linkEdital !== c.linkNoticia ? c.linkEdital : undefined) };
  if (!registro) return {...base, verificacaoProva: c.verificacaoProva || {status:'pendente',observacao:'Data informada na notícia; conferência no PDF pendente.'}};
  // A later source date must trigger a new review instead of being overwritten by an old audit.
  const mudou = c.dataProva !== registro.dataAnterior && c.dataProva !== registro.dataProva;
  const ajuste = registro.ajusteInscricao;
  const inscricao = ajuste && c.inscricaoAte === ajuste.anterior ? {inscricaoInicio:ajuste.inicio,inscricaoAte:ajuste.fim,inscricao:`${ajuste.inicio} a ${ajuste.fim}`} : {};
  return { ...base, ...inscricao, linkEditalPdf: registro.editalPdf, dataProva: mudou || registro.status ? c.dataProva : registro.dataProva,
    verificacaoProva: { status: mudou || registro.status ? 'divergencia' : 'conferida-pdf', conferidoEm:registro.conferidoEm,
      documento:registro.documento, pagina:registro.pagina, evidencia:registro.evidencia,
      observacao: mudou ? 'A notícia apresenta outra data. Confira os documentos e retificações na banca.' : registro.observacao } };
}
