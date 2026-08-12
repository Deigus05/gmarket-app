import * as SplashScreen from 'expo-splash-screen';

let hideStarted = false;

/**
 * Mantém o splash nativo até a intro JS estar pronta.
 * Tem de correr no scope do módulo (não dentro de useEffect).
 */
export function keepNativeSplash(): void {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

/** Esconde o splash sem rebentar o app (iOS Sideloadly / Expo Go). */
export async function hideNativeSplashSafe(): Promise<void> {
  if (hideStarted) return;
  hideStarted = true;
  try {
    await SplashScreen.hideAsync();
  } catch {
    // "No native splash screen registered..." — inofensivo; splash já sumiu.
  }
}
