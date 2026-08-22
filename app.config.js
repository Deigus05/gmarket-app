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
 *
 * Canal OTA (EAS Update):
 * 1) EXPO_UPDATES_CHANNEL
 * 2) EAS_BUILD_PROFILE (development | preview | production)
 * 3) CI/Codemagic → production
 * EAS Build também grava o canal a partir de eas.json.
 */
function resolveUpdateChannel() {
  const explicit = process.env.EXPO_UPDATES_CHANNEL?.trim();
  if (explicit) return explicit;

  const profile = process.env.EAS_BUILD_PROFILE?.trim();
  if (profile === 'production') return 'production';
  if (profile === 'preview') return 'preview';
  if (profile === 'development' || profile === 'development-simulator') {
    return 'development';
  }

  if (process.env.CI === '1' || Boolean(process.env.CM_BUILD_DIR)) {
    return 'production';
  }

  return null;
}

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const isEasBuild = process.env.EAS_BUILD === 'true';
  const deployTarget = process.env.DEPLOY_TARGET ?? '';
  const webOrigin = (
    process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://www.gmarketbissau.com'
  ).replace(/\/$/, '');
  const baseUrl = deployTarget === 'gh-pages' ? '/gmarket-app' : '';

  const isCiBuild = isEasBuild || process.env.CI === '1' || Boolean(process.env.CM_BUILD_DIR);
  const updateChannel = resolveUpdateChannel();
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
    updates: {
      ...(config.updates ?? {}),
      ...(updateChannel
        ? {
            requestHeaders: {
              ...(config.updates?.requestHeaders ?? {}),
              'expo-channel-name': updateChannel,
            },
          }
        : {}),
    },
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
