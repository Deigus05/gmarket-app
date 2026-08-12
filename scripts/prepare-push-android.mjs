/**
 * Prepara google-services.json para push Android em CI (Codemagic).
 *
 * No Codemagic, defina a variável secreta GOOGLE_SERVICES_JSON com o conteúdo
 * completo do ficheiro Firebase (package com.gmarket.app).
 *
 * Não colocar o ficheiro no Git.
 *
 * REQUIRE_ANDROID_FCM=1 (default no workflow android-apk) falha o build se faltar.
 */
import fs from 'node:fs';

const EXPECTED_PACKAGE = 'com.gmarket.app';
const requireFcm = process.env.REQUIRE_ANDROID_FCM === '1' || process.env.REQUIRE_ANDROID_FCM === 'true';
const json = process.env.GOOGLE_SERVICES_JSON?.trim();

if (!json) {
  const msg =
    'GOOGLE_SERVICES_JSON não definido — push Android em background/fechado pode falhar.';
  if (requireFcm) {
    console.error(`ERROR: ${msg}`);
    console.error(
      'No Codemagic → Environment variables, adicione GOOGLE_SERVICES_JSON (secret) com o JSON do Firebase para com.gmarket.app.',
    );
    process.exit(1);
  }
  console.warn(`AVISO: ${msg}`);
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(json);
} catch {
  console.error('ERROR: GOOGLE_SERVICES_JSON não é JSON válido.');
  process.exit(1);
}

const clients = Array.isArray(parsed?.client) ? parsed.client : [];
const packages = clients
  .map((c) => c?.client_info?.android_client_info?.package_name)
  .filter((name) => typeof name === 'string' && name.trim());

if (!packages.includes(EXPECTED_PACKAGE)) {
  console.error(
    `ERROR: google-services.json não contém package "${EXPECTED_PACKAGE}". Encontrado: ${
      packages.length ? packages.join(', ') : '(nenhum)'
    }`,
  );
  process.exit(1);
}

fs.writeFileSync('google-services.json', `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

const appJsonPath = 'app.json';
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.googleServicesFile = './google-services.json';
if (appJson.expo.android.package && appJson.expo.android.package !== EXPECTED_PACKAGE) {
  console.error(
    `ERROR: app.json android.package="${appJson.expo.android.package}" difere de ${EXPECTED_PACKAGE}.`,
  );
  process.exit(1);
}
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

console.log(`google-services.json OK para ${EXPECTED_PACKAGE} (FCM).`);
