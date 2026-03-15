# 📊 Concursos Contábeis

Painel de monitoramento e geração de posts para o Instagram **@concursos.contabeis**.

Faz scraping automático do [pciconcursos.com.br](https://pciconcursos.com.br) buscando concursos para:

- Contador / Contadora
- Técnico em Contabilidade
- Analista Contábil
- Auditor Fiscal
- Fiscal de Tributos
- Ciências Contábeis (nível superior)

---

## 🚀 Deploy no Vercel (passo a passo)

### 1. Suba para o GitHub

```bash
git init
git add .
git commit -m "feat: painel concursos contabeis"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/concursos-contabeis.git
git push -u origin main
```

### 2. Conecte ao Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **"Add New Project"**
3. Importe o repositório `concursos-contabeis`
4. Clique em **Deploy** — o Vercel detecta Next.js automaticamente

### 3. Acesse o painel

Após o deploy, você terá uma URL como:
`https://concursos-contabeis.vercel.app`

---

## 🔄 Como funciona o scraping

- A rota `/api/concursos` roda no servidor Vercel (serverless)
- O cache é de **6 horas** (revalidate = 21600)
- Para forçar atualização, clique no botão **"Atualizar"** no painel

---

## 📸 Funcionalidades

| Feature | Descrição |
|---|---|
| **Scraping automático** | Busca múltiplos cargos contábeis |
| **Cards Instagram** | Visual 1:1 pronto para download (PNG) |
| **Legenda automática** | Texto formatado com hashtags |
| **Filtros** | Por status: Abertas / Previstos / Encerrados |
| **Link do Edital** | Direto para o pciconcursos |

---

## 🛠️ Desenvolvimento local

```bash
npm install
npm run dev
```

Acesse: http://localhost:3000

---

## 📱 Como postar no Instagram

1. Acesse o painel
2. Na aba **Cards Instagram**, clique em **⬇️ Baixar PNG**
3. Clique em **📋 Legenda** para copiar o texto
4. Abra o Instagram no celular, crie um novo post
5. Selecione a imagem baixada + cole a legenda
6. Publique! 🎉

> **Dica:** Use o [Buffer](https://buffer.com) ou [Later](https://later.com) para agendar posts com antecedência.
