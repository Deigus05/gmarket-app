import { useAppTheme } from '@/components/tema';

/** Respeita a preferência do app (Sistema / Clara / Escura). */
export function useColorScheme() {
  return useAppTheme().scheme;
}
