import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const FONT_SRC_FRAGMENT =
  'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/';
const FONT_DEST_FRAGMENT = 'assets/icon-fonts/';

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

/** gh-pages / .gitignore ignoram qualquer pasta `node_modules` → fontes 404. */
function flattenIconFonts() {
  const fontsSrc = path.join(
    dist,
    'assets',
    'node_modules',
    '@expo',
    'vector-icons',
    'build',
    'vendor',
    'react-native-vector-icons',
    'Fonts',
  );
  const fontsDest = path.join(dist, 'assets', 'icon-fonts');

  if (fs.existsSync(fontsSrc)) {
    fs.mkdirSync(fontsDest, { recursive: true });
    for (const name of fs.readdirSync(fontsSrc)) {
      fs.copyFileSync(path.join(fontsSrc, name), path.join(fontsDest, name));
    }
    console.log('[deploy-web] Icon fonts copiadas para assets/icon-fonts/');
  }

  const rewriteFile = (filePath) => {
    if (!/\.(html|js|css|json)$/i.test(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.includes(FONT_SRC_FRAGMENT)) return;
    fs.writeFileSync(filePath, raw.split(FONT_SRC_FRAGMENT).join(FONT_DEST_FRAGMENT));
  };

  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else rewriteFile(full);
    }
  };
  walk(dist);
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

flattenIconFonts();

// SPA fallback no GitHub Pages
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
// Evita que o publisher herde ignores de node_modules do repo.
fs.writeFileSync(path.join(dist, '.gitignore'), '# publish all exported assets\n');

console.log('[deploy-web] Publishing to gh-pages…');
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
