const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {lerNoticiaPCI,extrairPeriodo,lerListagemPCI}=require('../src/lib/pci-parser.ts');
const {montarConcursos,atualizarPrazo,diaNumero,tipoRelevancia}=require('../src/lib/concurso-dados.ts');
const noticia=(html)=>lerNoticiaPCI(`<h1>Concurso público</h1><div itemprop="articleBody">${html}</div>`,'https://www.pciconcursos.com.br/noticias/exemplo');
const item={orgao:'Câmara de Exemplo',estado:'SP',linkNoticia:'https://www.pciconcursos.com.br/noticias/exemplo',inscricaoAte:'05/11/2026',vagas:'200 vagas',salario:'R$ 30.000,00'};
const detalhe=d=>({dataProva:'-',dataResultado:'-',banca:'-',linkEdital:'',cargosContabeis:[],requisito:'-',ehProcessoSeletivo:false,...d});
const agora=new Date('2026-10-18T15:00:00-03:00');

test('cards retain every glyph when rendered repeatedly in the same process',()=>{
 const {renderCardServer}=require('../src/lib/card-renderer-server.ts');
 const [c]=montarConcursos(item,detalhe(noticia('<ul><li>Contador (1 vaga)</li></ul>')),agora);
 const first=renderCardServer(c,'feed');
 renderCardServer({...c,cargo:'Coordenador de Controle Interno'},'stories');
 const repeated=renderCardServer(c,'feed');
 assert.equal(require('node:crypto').createHash('sha256').update(first).digest('hex'),require('node:crypto').createHash('sha256').update(repeated).digest('hex'));
});

test('Acari: auditor gets his own salary and vacancy, never the legal adviser salary',()=>{
 const d=noticia('<ul><li>Assessor Jurídico (1 vaga)</li><li>Auditor de Controle Interno (1 vaga)</li></ul><p>As remunerações são de R$ 2.750,00 para Assessor Jurídico e de R$ 2.350,00 para Auditor de Controle Interno.</p>');
 const [c]=montarConcursos(item,detalhe(d),agora);
 assert.equal(c.cargo,'Auditor de Controle Interno');assert.equal(c.salario,'R$ 2.350,00');assert.equal(c.vagas,'1 vaga');
});
test('Serranos: preserves Contador and does not transfer global vacancies or max salary',()=>{
 const d=noticia('<ul><li>Agente Administrativo (1 vaga)</li><li>Auxiliar Técnico Legislativo (1 vaga)</li><li>Contador (1 vaga)</li></ul><p>A remuneração varia de R$ 1.714,44 a R$ 3.280,60.</p>');
 const [c]=montarConcursos(item,detalhe(d),agora);assert.equal(c.cargo,'Contador');assert.equal(c.vagas,'1 vaga');assert.equal(c.salario,'Ver edital');
});
test('accepts a generic title when the same role accepts Accounting among several degrees',()=>{
 const d=noticia('<p>Controlador Interno exige graduação em Direito, Administração ou Ciências Contábeis.</p><ul><li>Controlador Interno (1 vaga)</li></ul>');
 const [c]=montarConcursos(item,detalhe(d),agora);assert.equal(c.relevancia,'formacao-contabil');assert.match(c.requisito,/Ciências Contábeis/);
});
test('Jaborá: single-position requirements in a separate paragraph are associated with that role',()=>{
 const d=noticia('<p>Concurso para profissionais com ensino superior em Administração, Ciências Contábeis, Economia ou Direito.</p><ul><li>Coordenador de Controle Interno (1 vaga + cadastro reserva)</li></ul><p>A remuneração é de R$ 2.231,20.</p>');
 const [c]=montarConcursos(item,detalhe(d),agora);assert.equal(c.relevancia,'formacao-contabil');assert.equal(c.vagas,'1 vaga + CR');assert.equal(c.salario,'R$ 2.231,20');
});
test('Contagem: does not merge different auditor specializations',()=>{
 const d=noticia('<ul><li>Auditor de Controle Interno - Ciências Contábeis (1 vaga)</li><li>Auditor de Controle Interno - Direito (1 vaga)</li><li>Auditor de Controle Interno - Tecnologia da Informação (1 vaga)</li><li>Auditor de Controle Interno - Engenharia Civil (1 vaga)</li></ul>');
 assert.deepEqual(d.cargosContabeis,['Auditor de Controle Interno - Ciências Contábeis']);
});
test('SEMA: recognizes a degree nested under the official role heading',()=>{
 const d=noticia('<p>Analista de Desenvolvimento Econômico e Social</p><ul><li>Administração</li><li>Ciências Contábeis</li><li>Direito</li></ul><p>A jornada para ambos os cargos tem remuneração de R$ 10.491,97.</p>');
 assert.equal(d.cargosDetalhados[0].cargo,'Analista de Desenvolvimento Econômico e Social - Ciências Contábeis');assert.equal(d.cargosDetalhados[0].salario,'R$ 10.491,97');
});
test('SEFAZ: keeps the exact accounting specialization and its 20 vacancies',()=>{
 const d=noticia('<ul><li>Auditor Estadual de Finanças Públicas - Direito (8 vagas)</li><li>Auditor Estadual de Finanças Públicas - Ciências Contábeis (20 vagas)</li></ul><p>A remuneração inicial é de R$ 25.337,61.</p>');
 assert.equal(d.cargosDetalhados.length,1);assert.equal(d.cargosDetalhados[0].vagas,'20 vagas');assert.equal(d.cargosDetalhados[0].salario,'R$ 25.337,61');
});
test('does not invent roles from a syllabus, footer or unrelated news',()=>{
 const html='<div itemprop="articleBody"><ul><li>Analista de Sistemas (2 vagas)</li></ul><p>Conteúdo programático: Contabilidade Geral e Auditoria.</p></div><aside>Contador (50 vagas)</aside>';
 assert.deepEqual(lerNoticiaPCI(html,'https://example.com').cargosContabeis,[]);
 assert.equal(tipoRelevancia('Analista Fiscal - Biólogo'),undefined);
});
test('does not transfer an accountant requirement to another role in the same list',()=>{
 const d=noticia('<ul><li>Contador (1 vaga)</li><li>Analista Administrativo (1 vaga)</li></ul><p>Contador exige Ciências Contábeis e CRC.</p>');
 assert.deepEqual(d.cargosContabeis,['Contador']);
});
test('temporary military recruitment is excluded even when the headline omits temporário',()=>{
 const d=lerNoticiaPCI('<h1>Marinha abre vagas para Oficiais RM2</h1><div itemprop="articleBody"><p>Serviço Militar Voluntário para oficiais temporários.</p><ul><li>Contador (3 vagas)</li></ul></div>','https://example.com');
 assert.equal(d.ehProcessoSeletivo,true);assert.deepEqual(montarConcursos(item,detalhe(d),agora),[]);
});
test('enrollment periods cross the year boundary and include the closing time',()=>{
 const d=extrairPeriodo('As inscrições vão das 9h do dia 16 de dezembro de 2026 até às 16h do dia 18 de janeiro de 2027.');
 assert.equal(d.inscricaoInicio,'16/12/2026');assert.equal(d.inscricaoAte,'18/01/2027');assert.equal(d.inscricaoFimHora,'16:00');
});
test('future enrollment is never classified as open',()=>{
 const c=atualizarPrazo({...item,inscricaoInicio:'16/12/2026',inscricaoAte:'18/01/2027',dataProva:'21/02/2027'},agora);
 assert.equal(c.status,'Inscricoes em breve');
});
test('deadline uses Brazilian timezone and explicit hour on the last day',()=>{
 const c={...item,inscricaoAte:'18/10/2026',inscricaoFimHora:'16:00',dataProva:'29/11/2026'};
 assert.equal(atualizarPrazo(c,new Date('2026-10-18T18:59:00Z')).status,'Inscricoes Abertas');
 assert.equal(atualizarPrazo(c,new Date('2026-10-18T19:01:00Z')).status,'Aguardando Prova');
 assert.equal(atualizarPrazo({...c,inscricaoFimHora:undefined},new Date('2026-10-19T01:00:00Z')).diasRestantes,0);
});
test('invalid and yearless dates do not roll into a new year',()=>{
 assert.equal(diaNumero('31/02/2026'),null);assert.equal(diaNumero('01/01'),null);
});
test('multi-state contests stay discoverable in each state',()=>{
 const html='<div id="concursos"><div class="na"><div class="ca"><a href="https://www.pciconcursos.com.br/noticias/trt-8-exemplo" title="TRT - PA/AP abre concurso">TRT 8</a><div class="cc">PA</div><div class="cd">Cadastro Reserva até R$ 16.040,88<br><span>Analista Judiciário, Técnico Judiciário<br><span>Médio / Técnico / Superior</span></span></div><div class="ce">05/11/2026</div></div></div></div>';
 const [c]=lerListagemPCI(html);assert.deepEqual(c.estados,['PA','AP']);assert.equal(c.salario,'Ver edital');assert.match(c.nivel,/Superior/);
});
test('objective exam date is kept separate from a later practical test',()=>{
 const d=noticia('<ul><li>Técnico em Contabilidade (CR)</li></ul><p>A prova objetiva está prevista para o dia 10 de janeiro de 2027. Haverá prova prática para Motorista no dia 14 de fevereiro de 2027.</p>');
 assert.equal(d.dataProva,'10/01/2027');assert.equal(d.cargosDetalhados[0].vagas,'Cadastro Reserva');
});
test('a qualification table keeps the generic role name and its own degree alternatives',()=>{
 const d=noticia('<table><tr><th>Cargo</th><th>Vagas</th><th>Requisitos</th><th>Salário</th></tr><tr><td>Analista Administrativo</td><td>2</td><td>Superior em Administração ou Ciências Contábeis</td><td>R$ 5.000,00</td></tr><tr><td>Analista de TI</td><td>3</td><td>Superior em Informática</td><td>R$ 6.000,00</td></tr></table>');
 const [c]=montarConcursos(item,detalhe(d),agora);
 assert.equal(c.cargo,'Analista Administrativo');assert.equal(c.vagas,'2 vagas');assert.equal(c.salario,'R$ 5.000,00');assert.equal(c.relevancia,'formacao-contabil');
});
test('PDF table requirements can reveal an accounting-qualified generic role',()=>{
 const {extrairTabelaCargos}=require('../src/lib/pdf-extractor.ts');
 const [c]=extrairTabelaCargos('Analista Administrativo 2 R$ 5.000,00 Superior em Ciências Contábeis');
 assert.equal(c.cargo,'Analista Administrativo');assert.match(c.requisito,/Ciências Contábeis/);
});
test('an explicit extension overrides the old enrollment deadline',()=>{
 const d=noticia('<p>As inscrições foram prorrogadas até 5 de novembro de 2026.</p><ul><li>Contador (1 vaga)</li></ul><p>As inscrições seriam realizadas de 1 de outubro de 2026 a 31 de outubro de 2026.</p>');
 assert.equal(d.inscricaoInicio,'01/10/2026');assert.equal(d.inscricaoAte,'05/11/2026');
});
test('an explicitly rescheduled objective test overrides the old date',()=>{
 const d=noticia('<ul><li>Contador (1 vaga)</li></ul><p>A prova objetiva foi alterada de 10 de novembro de 2026 para 24 de novembro de 2026.</p><p>A prova objetiva estava prevista para 10 de novembro de 2026.</p>');
 assert.equal(d.dataProva,'24/11/2026');
});
