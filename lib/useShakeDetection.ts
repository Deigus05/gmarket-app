import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

type Options = {
  /** When false, sensor is unsubscribed. */
  enabled?: boolean;
  /** Acceleration magnitude (g) above which a shake is detected. */
  threshold?: number;
  /** Minimum time between shake callbacks. */
  cooldownMs?: number;
};

/**
 * Calls `onShake` when the device is shaken (iPhone / Android).
 * No-op on web or when the accelerometer is unavailable.
 */
export function useShakeDetection(
  onShake: () => void,
  { enabled = true, threshold = 1.85, cooldownMs = 1800 }: Options = {},
) {
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;
  const lastShakeAt = useRef(0);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const available = await Accelerometer.isAvailableAsync();
        if (!available || cancelled) return;

        const permission = await Accelerometer.getPermissionsAsync();
        if (!permission.granted) {
          const requested = await Accelerometer.requestPermissionsAsync();
          if (!requested.granted || cancelled) return;
        }

        Accelerometer.setUpdateInterval(100);
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          if (magnitude < threshold) return;
          const now = Date.now();
          if (now - lastShakeAt.current < cooldownMs) return;
          lastShakeAt.current = now;
          onShakeRef.current();
        });
      } catch {
        // Sensor unavailable — ignore.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, threshold, cooldownMs]);
}
