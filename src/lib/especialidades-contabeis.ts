// Reconhece o nome do cargo, nunca apenas uma matéria do conteúdo programático.
export function nomeCargoParaCard(cargo: string, compacto = false): string {
  return extrairEspecialidadesContabeis(cargo).length
    ? (compacto ? "Analista - Contabilidade" : "Analista Judiciário - Contabilidade")
    : cargo;
}

export function extrairEspecialidadesContabeis(texto: string): string[] {
  const normalizado = texto.replace(/\s+/g, " ");
  const re = /\b(Analista\s+Judici[aá]rio\s*[-–—]\s*[ÁA]rea\s+(?:Administrativa|(?:de\s+)?Apoio\s+Especializado)\s*[-–—]\s*Especialidade\s*:?\s*Contabilidade)\b/gi;
  return [...new Set([...normalizado.matchAll(re)].map(m =>
    m[1].replace(/\s*[-–—]\s*/g, " - ").trim()
  ))];
}

export function extrairDetalhesEspecialidade(texto: string) {
  const normalizado = texto.replace(/\s*[-–—]\s*/g, " - ").replace(/\s+/g, " ");
  return extrairEspecialidadesContabeis(texto).map(cargo => {
    const inicio = normalizado.toLowerCase().indexOf(cargo.toLowerCase());
    const trecho = inicio < 0 ? "" : normalizado.slice(inicio + cargo.length, inicio + cargo.length + 650);
    // A remuneração só é herdada quando explicitamente vinculada à carreira.
    const salario = normalizado.match(/ANALISTA\s+ENSINO\s+SUPERIOR\s+COMPLETO\s*:?\s*Valor\s+da\s+inscri[çc][ãa]o[\s\S]{0,200}?Remunera[çc][ãa]o\s+inicial\s*:\s*R\$\s*([\d.,]+)/i)?.[1]
      || normalizado.match(/R\$\s*([\d.,]+)\s+para\s+Analista\s+Judici[aá]rio/i)?.[1];
    return {
      cargo,
      vagas: /^(?:\s*\(Cadastro\s+(?:de\s+)?Reserva\))|\bCR\b/i.test(trecho) ? "Cadastro Reserva" : "Ver edital",
      salario: salario ? "R$ " + salario : "Ver edital",
      nivel: "Superior",
      requisito: /registro\s+no\s+respectivo\s+[óo]rg[ãa]o\s+de\s+Classe/i.test(trecho)
        ? "Graduação em Contabilidade e registro no órgão de classe" : "Ver edital",
    };
  });
}
