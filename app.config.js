/**
 * Expo config — injeta a Google Maps API key no Android/iOS.
 * Sem esta key, o MapView fica em branco em builds nativos
 * (APK/AAB/dev client). No Expo Go a key da Expo cobre o mapa.
 *
 * Defina GOOGLE_MAPS_API_KEY no .env (local), no Codemagic
 * (Environment variables) ou no EAS Environment.
 *
 * DEPLOY_TARGET=gh-pages → baseUrl /gmarket-app (GitHub Pages).
 * Cloudflare / domínio próprio → sem DEPLOY_TARGET (raiz /).
 */
module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const isEasBuild = process.env.EAS_BUILD === 'true';
  const deployTarget = process.env.DEPLOY_TARGET ?? '';
  const webOrigin = (
    process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://www.gmbissau.com'
  ).replace(/\/$/, '');
  const baseUrl = deployTarget === 'gh-pages' ? '/gmarket-app' : '';

  const isCiBuild = isEasBuild || process.env.CI === '1' || Boolean(process.env.CM_BUILD_DIR);
  if (isCiBuild && !googleMapsApiKey) {
    console.warn(
      '[GMarket] GOOGLE_MAPS_API_KEY ausente neste build — MapView ficará em branco. ' +
        'Codemagic: Environment variables → GOOGLE_MAPS_API_KEY. ' +
        'EAS: eas env:create --name GOOGLE_MAPS_API_KEY --environment <development|preview|production> --visibility sensitive'
    );
  }

  const plugins = (config.plugins ?? []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-router') {
      return [
        'expo-router',
        {
          ...(plugin[1] ?? {}),
          origin: webOrigin,
        },
      ];
    }
    return plugin;
  });

  return {
    ...config,
    plugins,
    experiments: {
      ...(config.experiments ?? {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
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
