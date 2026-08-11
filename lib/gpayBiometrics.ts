import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/** GPay exige Face ID / biometria ao entrar — só no iPhone. */
export function shouldRequireGPayBiometrics() {
  return Platform.OS === 'ios';
}

/**
 * Expo Go não inclui o NSFaceIDUsageDescription da app — Face ID real
 * só funciona em development/production builds.
 */
export function canUseNativeFaceId() {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

export async function authenticateGPayAccess(options: {
  promptMessage: string;
  cancelLabel: string;
  fallbackLabel?: string;
}): Promise<{ success: true } | { success: false; error?: string }> {
  if (!shouldRequireGPayBiometrics()) {
    return { success: true };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();

    if (!hasHardware || enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
      return { success: false, error: 'not_available' };
    }

    // Em builds nativos: Face ID primeiro. disableDeviceFallback true evita
    // cair no código do dispositivo sem tentar biometria.
    // No Expo Go a plist não tem NSFaceIDUsageDescription → missing_usage_description;
    // nesse caso repetimos com fallback para o código (único fluxo possível aí).
    const preferBiometricsOnly = canUseNativeFaceId();

    let result = await LocalAuthentication.authenticateAsync({
      promptMessage: options.promptMessage,
      cancelLabel: options.cancelLabel,
      fallbackLabel: options.fallbackLabel,
      disableDeviceFallback: preferBiometricsOnly,
    });

    if (
      !result.success &&
      String(result.error) === 'missing_usage_description' &&
      preferBiometricsOnly
    ) {
      result = await LocalAuthentication.authenticateAsync({
        promptMessage: options.promptMessage,
        cancelLabel: options.cancelLabel,
        fallbackLabel: options.fallbackLabel,
        disableDeviceFallback: false,
      });
    }

    if (result.success) return { success: true };
    return { success: false, error: result.error };
  } catch {
    return { success: false, error: 'unknown' };
  }
}
