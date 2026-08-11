/**
 * Expo config — injeta a Google Maps API key no Android/iOS.
 * Sem esta key, o MapView fica em branco em builds nativos
 * (APK/AAB/dev client). No Expo Go a key da Expo cobre o mapa.
 *
 * Defina GOOGLE_MAPS_API_KEY no .env (local) ou no EAS Environment
 * (development / preview / production).
 */
module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const isEasBuild = process.env.EAS_BUILD === 'true';

  if (isEasBuild && !googleMapsApiKey) {
    console.warn(
      '[GMarket] GOOGLE_MAPS_API_KEY ausente neste build EAS — MapView ficará em branco. ' +
        'Adicione com: eas env:create --name GOOGLE_MAPS_API_KEY --environment <development|preview|production> --visibility sensitive'
    );
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};
