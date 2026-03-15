# Deploy no Railway — Guia Completo

Este guia explica como sair do Vercel e hospedar o sistema no **Railway**, que suporta Playwright (necessário para publicar no Instagram).

---

## Por que Railway e não Vercel?

| | Vercel | Railway |
|---|---|---|
| Next.js | ✅ | ✅ |
| Playwright / Chrome | ❌ (timeout 10s, sem Chrome) | ✅ |
| Cron jobs | ❌ (pago) | ✅ (grátis) |
| Preço | Grátis (limitado) | ~$5/mês ou grátis com $5 crédito |

---

## Passo 1 — Conta no Railway

1. Acesse [railway.app](https://railway.app)
2. Clique em **"Login with GitHub"**
3. Autorize o Railway no GitHub

---

## Passo 2 — Preparar o repositório

Se ainda não tem o código no GitHub:

```bash
# Na pasta do projeto
git init
git add .
git commit -m "primeiro commit"

# Crie um repositório no github.com e siga as instruções
git remote add origin https://github.com/SEU_USUARIO/concursos-contabeis.git
git push -u origin main
```

---

## Passo 3 — Criar projeto no Railway

1. No Railway, clique em **"New Project"**
2. Selecione **"Deploy from GitHub repo"**
3. Escolha o repositório `concursos-contabeis`
4. Railway detecta Next.js automaticamente → clique **Deploy**

---

## Passo 4 — Configurar variáveis de ambiente

No Railway → seu projeto → aba **"Variables"** → clique em **"RAW Editor"** e cole:

```env
NEXT_PUBLIC_SUPABASE_URL=https://XXXXX.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

IG_USERNAME=concursos.contabeis
IG_PASSWORD=sua_senha_aqui

WORKER_SECRET=cole_aqui_uma_string_aleatoria_longa

NEXT_PUBLIC_APP_URL=https://seu-app.up.railway.app
```

> **Como gerar o WORKER_SECRET:** Abra o terminal e rode `openssl rand -hex 32`  
> (ou use qualquer senha longa aleatória)

> **Como saber a URL do Railway:** Aparece na aba "Settings" → "Domains" após o primeiro deploy

---

## Passo 5 — Configurar banco Supabase

No [Supabase Dashboard](https://app.supabase.com) → SQL Editor → New Query → cole o conteúdo de `supabase-setup.sql` → Execute.

Isso cria a tabela `agendamentos` (nova) além das que já existiam.

---

## Passo 6 — Configurar o Cron (worker automático)

O Railway precisa do cron para processar a fila a cada 5 minutos.

1. No Railway → seu projeto → clique em **"+ New"** → **"Cron Job"**
2. Configure:
   - **Schedule:** `*/5 * * * *`
   - **Command:** 
     ```
     curl -s -X POST $NEXT_PUBLIC_APP_URL/api/publicar/worker \
       -H "Authorization: Bearer $WORKER_SECRET" \
       -H "Content-Type: application/json"
     ```
3. Clique em **"Create"**

Pronto — a cada 5 minutos o Railway verifica se tem posts pendentes na fila e publica automaticamente.

---

## Passo 7 — Instalar Playwright no build

O `railway.toml` já cuida disso com:
```
startCommand = "npx playwright install chromium --with-deps && npm start"
```

Isso instala o Chromium no container antes de iniciar o servidor.

---

## Como usar após o deploy

### Publicar agora
1. Abra seu painel no Railway
2. Vá na aba **📸 Publicar**
3. Clique em **"Publicar agora"** no concurso desejado
4. O worker processa em até 5 minutos

### Agendar para um horário
1. Na aba **📸 Publicar**, escolha um horário (09:00, 12:00, 18:00, 21:00)
2. O post fica na fila com o horário definido
3. O worker publica automaticamente no horário certo

### Acompanhar status
A fila mostra em tempo real:
- ⏳ **Pendente** — aguardando o worker
- 🔄 **Publicando** — Playwright está rodando agora
- ✅ **Publicado** — foi para o Instagram
- ❌ **Erro** — algo deu errado (veja a mensagem de erro)

---

## Troubleshooting

**"IG_USERNAME e IG_PASSWORD não configurados"**
→ Verifique as variáveis de ambiente no Railway → Variables

**"Instagram não logou / captcha"**
→ O Instagram pode pedir verificação na primeira vez. Faça login manual na conta uma vez, depois o Playwright consegue logar.

**Worker não está rodando**
→ Verifique o Cron Job no Railway → se o status estiver "failed", veja os logs

**"Concurso não encontrado" ao gerar imagem**
→ Limpe o cache (botão "Limpar cache" no painel) e atualize

---

## Migrar do Vercel para Railway

Se você já tinha o projeto no Vercel:

1. Faça o deploy no Railway seguindo este guia
2. Teste se tudo funciona na URL do Railway
3. No Vercel: Settings → Domains → remova o domínio customizado (se tiver)
4. Adicione o domínio customizado no Railway (opcional)
5. Pronto — pode deletar o projeto do Vercel
