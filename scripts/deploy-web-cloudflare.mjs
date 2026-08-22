import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Deploy para Cloudflare Pages (raiz / — sem DEPLOY_TARGET=gh-pages).
 * Requer CLOUDFLARE_API_TOKEN (e opcionalmente CLOUDFLARE_ACCOUNT_ID).
 *
 * Uso:
 *   node scripts/deploy-web-cloudflare.mjs
 *   # ou: npm run deploy:web:cf
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const projectName = process.env.CF_PAGES_PROJECT || 'gmarket-app';

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error(
    '[deploy-web:cf] Defina CLOUDFLARE_API_TOKEN.\n' +
      'Cria em: https://dash.cloudflare.com/profile/api-tokens\n' +
      'Permissões: Account.Cloudflare Pages — Edit'
  );
  process.exit(1);
}

console.log('[deploy-web:cf] Building Expo web for Cloudflare Pages (base /)…');
run('npx', ['expo', 'export', '--platform', 'web'], {
  DEPLOY_TARGET: '',
  NODE_ENV: 'production',
});

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('[deploy-web:cf] dist/index.html em falta após o export.');
  process.exit(1);
}

fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));

console.log(`[deploy-web:cf] Publishing to Cloudflare Pages project "${projectName}"…`);
run('npx', ['--yes', 'wrangler', 'pages', 'deploy', 'dist', `--project-name=${projectName}`]);

console.log('[deploy-web:cf] Depois liga www.gmarketbissau.com em Pages → Custom domains.');
