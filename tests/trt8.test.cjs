const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the same TypeScript functions used by both scraping paths.
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { extrairEspecialidadesContabeis, extrairDetalhesEspecialidade, nomeCargoParaCard } = require('../src/lib/especialidades-contabeis.ts');
const { extrairTabelaCargos } = require('../src/lib/pdf-extractor.ts');

test('TRT-8: preserves specialty, salary and reserve from the supplied PDF', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures/trt8-cargos.txt'), 'utf8');
  const cargos = extrairTabelaCargos(text, text);
  assert.equal(cargos.length, 1);
  assert.equal(cargos[0].cargo, 'Analista Judiciário - Área Administrativa - Especialidade Contabilidade');
  assert.equal(cargos[0].salario, 'R$ 16.040,88');
  assert.equal(cargos[0].vagas, 'Cadastro Reserva');
  assert.equal(cargos[0].nivel, 'Superior');
});

test('accepts the PCI role list without needing a PDF download', () => {
  const text = 'Analista Judiciário - Área Administrativa - Especialidade Contabilidade (Cadastro Reserva). As remunerações iniciais são de R$ 16.040,88 para Analista Judiciário e de R$ 9.776,71 para Técnico Judiciário.';
  const [cargo] = extrairDetalhesEspecialidade(text);
  assert.equal(cargo.salario, 'R$ 16.040,88');
  assert.equal(cargo.vagas, 'Cadastro Reserva');
});

test('a syllabus mentioning Contabilidade does not establish an accounting role', () => {
  assert.deepEqual(extrairEspecialidadesContabeis('Analista Judiciário - Área Administrativa. Conhecimentos específicos: Contabilidade Geral.'), []);
  assert.deepEqual(extrairEspecialidadesContabeis('Analista Judiciário - Área Apoio Especializado - Especialidade Estatística. Contabilidade.'), []);
});

test('does not invent salary or vacancies when the source does not associate them', () => {
  const [cargo] = extrairDetalhesEspecialidade('Analista Judiciário - Área Administrativa - Especialidade Contabilidade. Outros cargos: 20 vagas, R$ 9.000,00.');
  assert.equal(cargo.salario, 'Ver edital');
  assert.equal(cargo.vagas, 'Ver edital');
});

test('the specialty stays visible on both feed and stories cards', () => {
  const cargo = 'Analista Judiciário - Área Administrativa - Especialidade Contabilidade';
  assert.ok(nomeCargoParaCard(cargo).length <= 36);
  assert.ok(nomeCargoParaCard(cargo, true).length <= 28);
  assert.match(nomeCargoParaCard(cargo, true), /Contabilidade$/);
});

test('PCI discovery does not mistake Técnico in the job name for schooling', async () => {
  const { scrapeListagem } = require('../src/lib/scraper.ts');
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('<div id="concursos">'+fs.readFileSync(path.join(__dirname, 'fixtures/pci-trt8-listagem.html'), 'utf8')+'</div>');
  try {
    const [item] = await scrapeListagem('/vagas/analista-judiciario');
    assert.ok(item);
    assert.equal(item.inscricaoAte, '05/11/2026');
    assert.match(item.nivel, /Superior/);
    assert.equal(item.vagas, 'Ver edital'); // summary is for all roles, not the accountant
  } finally { global.fetch = originalFetch; }
});

test('live PCI: discovers TRT-8 and extracts only the accounting specialty', { skip: !process.env.TEST_PCI_LIVE }, async () => {
  const { scrapeListagem, scrapeDetalhe } = require('../src/lib/scraper.ts');
  const list = await scrapeListagem('/vagas/analista-judiciario');
  const item = list.find(c => /trt.*8|trabalho.*8/i.test(c.orgao));
  assert.ok(item, 'TRT-8 must be discovered from the judicial listing');
  assert.equal(item.inscricaoAte, '05/11/2026');
  const detail = await scrapeDetalhe(item.linkNoticia);
  assert.deepEqual(detail.cargosContabeis, ['Analista Judiciário - Área Administrativa - Especialidade Contabilidade']);
  assert.equal(detail.cargosDetalhados[0].salario, 'R$ 16.040,88');
  assert.equal(detail.cargosDetalhados[0].vagas, 'Cadastro Reserva');
  assert.equal(detail.dataProva, '17/01/2027');
});
