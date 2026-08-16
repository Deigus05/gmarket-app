import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

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

console.log('[deploy-web] Building Expo web for GitHub Pages…');
run('npx', ['expo', 'export', '--platform', 'web'], {
  DEPLOY_TARGET: 'gh-pages',
  NODE_ENV: 'production',
});

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('[deploy-web] dist/index.html em falta após o export.');
  process.exit(1);
}

// SPA fallback no GitHub Pages
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

console.log('[deploy-web] Publishing to gh-pages…');
// Windows: pass args as one string to avoid gh CLI / spawn mangling.
const publish = spawnSync(
  'npx --yes --package=gh-pages@6 gh-pages -d dist -t -m "Deploy GMarket web app"',
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  },
);
if (publish.status !== 0) {
  process.exit(publish.status ?? 1);
}

console.log('[deploy-web] Live: https://deigus05.github.io/gmarket-app/');
