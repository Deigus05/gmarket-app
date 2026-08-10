export type AppearanceMode = 'system' | 'light' | 'dark';
export type PaletteId = 'mint' | 'blue' | 'pink' | 'yellow';
export type ColorScheme = 'light' | 'dark';

/** Cores do hero / página inicial (variam por paleta). */
export type HomePalette = {
  deep: string;
  mid: string;
  soft: string;
  mist: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  shadow: string;
  address: string;
};

/** Cores de UI do app inteiro (cinza muito escuro no dark). */
export type AppUI = {
  bg: string;
  card: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  brand: string;
  brandSoft: string;
  input: string;
  divider: string;
  iconBox: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  onBrand: string;
  overlay: string;
  tabActive: string;
  tabInactive: string;
  statusBar: 'light' | 'dark';
};

export type ThemePreset = {
  id: PaletteId;
  name: string;
  light: HomePalette;
  dark: HomePalette;
};

/** UI global — dark = cinza muito escuro (#0E0E0E / #1A1A1A). */
export const APP_UI: Record<ColorScheme, AppUI> = {
  light: {
    bg: '#F5F5F7',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    border: '#E8E8ED',
    text: '#1C1C1E',
    muted: '#8E8E93',
    brand: '#0D47A1',
    brandSoft: '#E3F2FD',
    input: '#F2F2F7',
    divider: '#F0F0F0',
    iconBox: '#F4F7FA',
    danger: '#D32F2F',
    dangerSoft: '#FFEBEE',
    success: '#2E7D32',
    successSoft: '#E8F5E9',
    onBrand: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.45)',
    tabActive: '#2E7D32',
    tabInactive: '#8E8E93',
    statusBar: 'dark',
  },
  dark: {
    bg: '#0E0E0E',
    card: '#1A1A1A',
    elevated: '#222222',
    border: '#2C2C2E',
    text: '#F2F2F2',
    muted: '#C7C7CC',
    brand: '#64B5F6',
    brandSoft: '#1A2433',
    input: '#242426',
    divider: '#2A2A2C',
    iconBox: '#242426',
    danger: '#EF5350',
    dangerSoft: '#2A1515',
    success: '#66BB6A',
    successSoft: '#142019',
    onBrand: '#0E0E0E',
    overlay: 'rgba(0,0,0,0.65)',
    tabActive: '#66BB6A',
    tabInactive: '#C7C7CC',
    statusBar: 'light',
  },
};

/** Azul-esverdiado atual da página inicial + 3 variantes pastel. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'mint',
    name: 'Menta',
    light: {
      deep: '#B8E4DE',
      mid: '#D2EFEA',
      soft: '#EAF7F4',
      mist: '#F5FBFA',
      surface: '#FFFFFF',
      ink: '#111111',
      muted: '#6B7280',
      accent: '#0F766E',
      shadow: '#0F766E',
      address: '#1F2937',
    },
    dark: {
      deep: '#1A5C54',
      mid: '#154840',
      soft: '#123530',
      mist: '#102420',
      surface: '#0E0E0E',
      ink: '#F2F2F2',
      muted: '#C7C7CC',
      accent: '#5EEAD4',
      shadow: '#0F766E',
      address: '#E5E7EB',
    },
  },
  {
    id: 'blue',
    name: 'Azul',
    light: {
      deep: '#A9C8F5',
      mid: '#C5DBF8',
      soft: '#E2EDFB',
      mist: '#F3F8FD',
      surface: '#FFFFFF',
      ink: '#111111',
      muted: '#6B7280',
      accent: '#1565C0',
      shadow: '#1565C0',
      address: '#1F2937',
    },
    dark: {
      deep: '#1A4A8C',
      mid: '#163A6E',
      soft: '#122C54',
      mist: '#0F1F3A',
      surface: '#0E0E0E',
      ink: '#F2F2F2',
      muted: '#C7C7CC',
      accent: '#60A5FA',
      shadow: '#1565C0',
      address: '#E5E7EB',
    },
  },
  {
    id: 'pink',
    name: 'Rosa',
    light: {
      deep: '#F5C2D4',
      mid: '#F8D7E3',
      soft: '#FCEAF1',
      mist: '#FEF5F8',
      surface: '#FFFFFF',
      ink: '#111111',
      muted: '#6B7280',
      accent: '#C2185B',
      shadow: '#C2185B',
      address: '#1F2937',
    },
    dark: {
      deep: '#8C2A52',
      mid: '#6E2142',
      soft: '#541933',
      mist: '#3A1224',
      surface: '#0E0E0E',
      ink: '#F2F2F2',
      muted: '#C7C7CC',
      accent: '#F472B6',
      shadow: '#C2185B',
      address: '#E5E7EB',
    },
  },
  {
    id: 'yellow',
    name: 'Amarelo',
    light: {
      deep: '#F3E4A4',
      mid: '#F7EDC4',
      soft: '#FBF5E0',
      mist: '#FDFBF1',
      surface: '#FFFFFF',
      ink: '#111111',
      muted: '#6B7280',
      accent: '#CA8A04',
      shadow: '#CA8A04',
      address: '#1F2937',
    },
    dark: {
      deep: '#8A6A12',
      mid: '#6B5210',
      soft: '#4E3C0E',
      mist: '#32270C',
      surface: '#0E0E0E',
      ink: '#F2F2F2',
      muted: '#C7C7CC',
      accent: '#FBBF24',
      shadow: '#CA8A04',
      address: '#E5E7EB',
    },
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = 'mint';
export const DEFAULT_APPEARANCE: AppearanceMode = 'system';

export function getPreset(id: PaletteId): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}

export function resolvePalette(paletteId: PaletteId, scheme: ColorScheme): HomePalette {
  const preset = getPreset(paletteId);
  return scheme === 'dark' ? preset.dark : preset.light;
}

export function resolveAppUI(scheme: ColorScheme): AppUI {
  return APP_UI[scheme];
}

export function resolveScheme(
  appearance: AppearanceMode,
  systemScheme: ColorScheme | null | undefined,
): ColorScheme {
  if (appearance === 'light') return 'light';
  if (appearance === 'dark') return 'dark';
  return systemScheme === 'dark' ? 'dark' : 'light';
}
