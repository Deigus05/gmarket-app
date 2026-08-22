# Publicar GMarket App (web)

## Agora (sem domínio pago)

### Opção A — GitHub Pages (activo)

Site público:

**https://deigus05.github.io/gmarket-app/**

```bash
npm run deploy:web
```

Requisitos: repo **público** + branch `gh-pages` (já configurado).

API: proxy Cloudflare `gmarket-api-proxy.puzzling-apricot.workers.dev`

### Opção B — Cloudflare Pages (quando tiveres token)

Não precisa de domínio pago — dá um `*.pages.dev` até ligares `gmarketbissau.com`.

1. Cria API token: [Create token](https://dash.cloudflare.com/profile/api-tokens)  
   Permissão: **Account → Cloudflare Pages → Edit**
2. No PowerShell:
   ```powershell
   $env:CLOUDFLARE_API_TOKEN="o_teu_token"
   npm run deploy:web:cf
   ```
3. Actualiza `.env.production` com o URL `*.pages.dev` que o Wrangler mostrar, rebuild e redeploy.

## Depois (domínio gmarketbissau.com na Cloudflare)

1. Comprar / adicionar `gmarketbissau.com` na Cloudflare.
2. Em **Pages → Custom domains** → `www.gmarketbissau.com` (e redirect `gmarketbissau.com` → `www`).
3. Actualizar `.env.production`:
   ```env
   EXPO_PUBLIC_API_URL=https://gmarket-api-proxy.puzzling-apricot.workers.dev
   EXPO_PUBLIC_WEB_URL=https://www.gmarketbissau.com
   ```
4. Rebuild **sem** `DEPLOY_TARGET=gh-pages` (base `/`):
   ```bash
   npm run deploy:web:cf
   ```
5. Confirmar Universal Links em `public/.well-known/`.

Ficheiro `public/_redirects` já está preparado para SPA no Cloudflare Pages.
