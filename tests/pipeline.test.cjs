const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.join(__dirname,'../src',id.slice(2)):id,...args)};
let rows;
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
const sb={from(){
 const q={key:'',action:'select',select(){return this},eq(_,v){this.key=v;return this},
  async maybeSingle(){return {data:rows.has(this.key)?{dados:copy(rows.get(this.key))}:null,error:null}},
  async single(){return this.maybeSingle()},
  async upsert(row){rows.set(row.chave,copy(row.dados));return {error:null}},
  delete(){this.action='delete';return this},
  then(ok){if(this.action==='delete')rows.delete(this.key);return Promise.resolve({error:null}).then(ok)}
 };return q;
}};
const dbPath=require.resolve('../src/lib/supabase.ts');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{getSupabase:()=>sb}};
const scraper=require('../src/lib/scraper.ts');
let failAt=-1;
const items=Array.from({length:12},(_,i)=>({orgao:'Prefeitura '+i,cargo:'Vários Cargos',linkNoticia:'https://example.com/'+i,inscricaoAte:'30/12/2099'}));
scraper.descobrirConcursos=async()=>copy(items);
scraper.scrapeDetalhe=async url=>{
 if(+url.split('/').pop()===failAt)throw Error('Fonte indisponível');
 return {dataProva:'-',dataResultado:'-',banca:'-',linkEdital:url,cargosContabeis:['Contador'],requisito:'-',ehProcessoSeletivo:false,cargosDetalhados:[{cargo:'Contador',vagas:'1 vaga',salario:'Ver edital',nivel:'Superior',requisito:'Consultar edital',evidencia:'Contador (1 vaga)'}]};
};
const {GET}=require('../src/app/api/scrape-lote/route.ts');
const get=async lote=>{const r=await GET(new Request('https://example.com/api/scrape-lote?lote='+lote));return {status:r.status,data:await r.json()}};
const original={concursos:[{id:'publicado'}],atualizadoEm:'anterior'};

test('processes all candidates, including those after the old eight-item limit, before publishing',async()=>{
 rows=new Map([['concursos:v20',copy(original)]]);failAt=-1;
 const first=await get(0);assert.equal(first.data.totalLotes,3);assert.equal(first.data.totalAcumulado,5);
 assert.deepEqual(rows.get('concursos:v20'),original);
 const second=await get(1);assert.equal(second.data.totalAcumulado,10);assert.deepEqual(rows.get('concursos:v20'),original);
 const last=await get(2);assert.equal(last.data.fim,true);assert.equal(rows.get('concursos:v20').concursos.length,12);
 assert.equal(rows.has('scrape-lote:progresso'),false);
});
test('a failed source or out-of-order chunk preserves published cards and the resume checkpoint',async()=>{
 rows=new Map([['concursos:v20',copy(original)]]);failAt=-1;
 await get(0);
 const outOfOrder=await get(2);assert.equal(outOfOrder.status,409);assert.deepEqual(rows.get('concursos:v20'),original);
 failAt=7;const failed=await get(1);assert.equal(failed.status,502);
 assert.equal(rows.get('scrape-lote:progresso').proximoLote,1);assert.deepEqual(rows.get('concursos:v20'),original);
 failAt=-1;await get(1);const done=await get(2);assert.equal(done.data.fim,true);
});
