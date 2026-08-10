/**
 * Expo config — injeta a Google Maps API key no Android/iOS.
 * Sem esta key, o MapView fica em branco em builds nativos
 * (APK/AAB/dev client). No Expo Go a key da Expo cobre o mapa.
 *
 * Defina GOOGLE_MAPS_API_KEY no .env (local) ou no EAS Environment
 * (development / preview / production).
 */
const appJson = require('./app.json');

module.exports = () => {
  const expo = appJson.expo;
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const isEasBuild = process.env.EAS_BUILD === 'true';

  if (isEasBuild && !googleMapsApiKey) {
    console.warn(
      '[GMarket] GOOGLE_MAPS_API_KEY ausente neste build EAS — MapView ficará em branco. ' +
        'Adicione com: eas env:create --name GOOGLE_MAPS_API_KEY --environment <development|preview|production> --visibility sensitive'
    );
  }

  return {
    ...expo,
    ios: {
      ...expo.ios,
      config: {
        ...(expo.ios?.config ?? {}),
        ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
      },
    },
    android: {
      ...expo.android,
      config: {
        ...(expo.android?.config ?? {}),
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};
