# Territory Run

Jogo de corrida por território: feche um perímetro correndo pra conquistar a área. Sobreponha o perímetro de outro jogador pra roubar o território dele.

## Stack

- **React + TypeScript + Vite** — frontend
- **MapLibre GL JS** — mapa (renderização WebGL, leve e open-source)
- **Turf.js** — geometria: fechamento de loop, união/subtração de polígonos
- **Zustand** — estado global (territórios, usuário atual)
- **Supabase** — Postgres + PostGIS (banco geoespacial), Auth, Realtime
- **vite-plugin-pwa** — instalável como app no celular

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar projeto no Supabase

1. Crie uma conta/projeto em https://supabase.com
2. Vá em **Project Settings > API** e copie a `Project URL` e a `anon public key`
3. Copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. No **SQL Editor** do Supabase, rode o conteúdo de `supabase/schema.sql` — isso cria as tabelas `profiles`, `territories`, `runs`, habilita PostGIS e configura Row Level Security.

### 3. Rodar localmente

```bash
npm run dev -- --host
```

O `--host` expõe o servidor na rede local — abra a URL mostrada no terminal (algo como `http://192.168.x.x:5173`) no navegador do celular, desde que celular e computador estejam na mesma Wi-Fi. Isso é essencial pra testar geolocalização real.

> **Nota:** geolocalização (`navigator.geolocation`) só funciona em contexto seguro (HTTPS) ou em `localhost`. Pra testar no celular via IP local, alguns navegadores bloqueiam — se isso acontecer, use um túnel como `ngrok` ou faça deploy num ambiente de preview (Vercel/Netlify) que já serve em HTTPS.

### 4. Build de produção

```bash
npm run build
npm run preview
```

## Estrutura

```
src/
  components/GameMap.tsx    # mapa MapLibre, camadas de trajeto e territórios
  hooks/useGeolocation.ts   # rastreamento GPS + wake lock
  lib/supabase.ts           # cliente Supabase
  lib/territoryUtils.ts     # lógica de fechamento de loop e conquista de território (Turf.js)
  store/useGameStore.ts     # estado global (Zustand)
  types/                    # tipos compartilhados
supabase/schema.sql         # schema PostGIS + RLS pra rodar no Supabase
```

## Limitação conhecida: GPS em segundo plano

Navegadores mobile restringem rastreamento de GPS quando a aba não está em foco.
O app usa a **Wake Lock API** pra manter a tela ligada durante a corrida como
contorno. Rastreamento real em segundo plano (com tela apagada) exigiria
empacotar o app com **Capacitor** pra virar um app nativo — isso pode ser uma
evolução futura do projeto.

## Próximos passos (ainda não implementados)

- [x] Conectar `pathToPolygon` + captura ao fim de cada corrida (feito via função Postgres `claim_territory`, não via Turf no client — mais robusto)
- [x] Persistir territórios no Supabase (validado server-side dentro da função, evita trapaça)
- [x] Autenticação (Supabase Auth, email+senha)
- [ ] Tela de ranking (usando a view `leaderboard`)
- [x] Realtime: territórios de outros jogadores já atualizam ao vivo no mapa
- [ ] Code-splitting (o bundle já passou de 500kB por causa do MapLibre + Turf)
- [ ] Feedback visual de sucesso/falha ao conquistar (hoje só aparece um texto no HUD)
