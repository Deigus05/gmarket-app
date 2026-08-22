/**
 * Production APK/IPA must not depend on Metro / expo-dev-client.
 * Codemagic runs this after npm install.
 */
import fs from 'node:fs';

for (const file of ['package.json', 'app.json']) {
  if (!fs.existsSync(file)) continue;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (json.dependencies) delete json.dependencies['expo-dev-client'];
  if (json.devDependencies) delete json.devDependencies['expo-dev-client'];
  if (Array.isArray(json.expo?.plugins)) {
    json.expo.plugins = json.expo.plugins.filter((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      return name !== 'expo-dev-client';
    });
  }
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

console.log('Production config: expo-dev-client removed if present.');
