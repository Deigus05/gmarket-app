import { Alert, Linking, Platform } from 'react-native';

type DirectionsLabels = {
  title: string;
  googleMaps: string;
  appleMaps: string;
  waze: string;
  cancel: string;
  fail: string;
};

/**
 * Abre navegação até ao destino na app de mapas disponível
 * (Google Maps, Apple Maps, Waze ou browser).
 */
export async function openMapsDirections(
  latitude: number,
  longitude: number,
  label: string,
  texts: DirectionsLabels,
): Promise<void> {
  const dest = `${latitude},${longitude}`;
  const encodedLabel = encodeURIComponent(label || dest);

  // Android: https resolve para a app Maps se instalada.
  // O scheme google.navigation falha em canOpenURL sem <queries> no manifesto.
  const googleUrl =
    Platform.OS === 'ios'
      ? `comgooglemaps://?daddr=${dest}&directionsmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  const googleWeb = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  const appleMaps = `http://maps.apple.com/?daddr=${dest}&q=${encodedLabel}&dirflg=d`;
  const waze = `https://waze.com/ul?ll=${dest}&navigate=yes`;
  const geo = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`;

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(texts.title, texts.fail);
    }
  };

  // Android: tenta o seletor nativo (geo:) e cai para Google Maps https
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(geo);
      return;
    } catch {
      await open(googleWeb);
      return;
    }
  }

  const options: { label: string; url: string }[] = [];

  try {
    if (await Linking.canOpenURL(googleUrl)) {
      options.push({ label: texts.googleMaps, url: googleUrl });
    }
  } catch {
    // canOpenURL may throw without LSApplicationQueriesSchemes
  }

  options.push({ label: texts.appleMaps, url: appleMaps });

  try {
    if (await Linking.canOpenURL('waze://')) {
      options.push({ label: texts.waze, url: waze });
    }
  } catch {
    // ignore
  }

  if (!options.some((o) => o.url === googleUrl || o.url === googleWeb)) {
    options.push({ label: texts.googleMaps, url: googleWeb });
  }

  if (options.length === 1) {
    await open(options[0].url);
    return;
  }

  Alert.alert(
    texts.title,
    undefined,
    [
      ...options.map((opt) => ({
        text: opt.label,
        onPress: () => {
          void open(opt.url);
        },
      })),
      { text: texts.cancel, style: 'cancel' as const },
    ],
    { cancelable: true },
  );
}
