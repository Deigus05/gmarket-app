/**
 * Prepara google-services.json para push Android em CI (Codemagic).
 * Define GOOGLE_SERVICES_JSON no Codemagic com o conteúdo do ficheiro Firebase.
 */
import fs from 'node:fs';

const json = process.env.GOOGLE_SERVICES_JSON?.trim();
if (!json) {
  console.log('AVISO: GOOGLE_SERVICES_JSON não definido — push Android em background pode falhar.');
  process.exit(0);
}

fs.writeFileSync('google-services.json', json, 'utf8');

const appJsonPath = 'app.json';
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.googleServicesFile = './google-services.json';
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

console.log('google-services.json configurado para push Android.');
