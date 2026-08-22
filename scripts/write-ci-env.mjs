/**
 * Writes .env.production so Expo/Metro inlines EXPO_PUBLIC_* in the JS bundle.
 * Secrets (GOOGLE_MAPS_API_KEY, GOOGLE_SERVICES_JSON) stay in process.env only.
 */
import fs from 'node:fs';

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? '').trim();
const mapsKey = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim();

if (!apiUrl) {
  console.error('ERROR: EXPO_PUBLIC_API_URL não está definido.');
  process.exit(1);
}

const lines = [
  `EXPO_PUBLIC_API_URL=${apiUrl}`,
  `EXPO_PUBLIC_WEB_URL=${webUrl || 'https://www.gmarketbissau.com'}`,
];

fs.writeFileSync('.env.production', `${lines.join('\n')}\n`, 'utf8');
console.log('.env.production escrito para o bundle Expo.');
console.log(`EXPO_PUBLIC_API_URL=${apiUrl}`);
console.log(`EXPO_PUBLIC_WEB_URL=${webUrl || 'https://www.gmarketbissau.com'}`);

if (!mapsKey) {
  console.warn(
    'WARN: GOOGLE_MAPS_API_KEY ausente — MapView nativo ficará em branco. Defina nas Environment variables do Codemagic.',
  );
} else {
  console.log('GOOGLE_MAPS_API_KEY está definido (valor não impresso).');
}
