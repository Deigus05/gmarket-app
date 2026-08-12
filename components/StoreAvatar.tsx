import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { API_URL, getStoreById } from '@/components/api';
import { useAppTheme } from '@/components/tema';
import { optimizedImageUrl } from '@/lib/imageOptimization';

type Props = {
  storeId?: string | null;
  logoUrl?: string | null;
  size?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

async function fetchLogoDirect(storeId: string): Promise<string | null> {
  try {
    // Pedido directo (sem cache) — evita logo antigo/nulo guardado no telemóvel
    const response = await fetch(
      `${API_URL}/api/stores/${encodeURIComponent(storeId)}?_=${Date.now()}`,
    );
    const result = await response.json();
    if (response.ok && result.success && result.data?.logo_url) {
      return String(result.data.logo_url).trim() || null;
    }
  } catch {
    // fallback abaixo
  }
  const store = await getStoreById(storeId, { forceRefresh: true });
  return store?.logo_url?.trim() || null;
}

/**
 * Avatar da loja: mostra logoUrl de imediato e confirma/atualiza via API pelo storeId.
 */
export function StoreAvatar({
  storeId,
  logoUrl,
  size = 42,
  borderRadius = 10,
  style,
}: Props) {
  const { ui } = useAppTheme();
  const initial = typeof logoUrl === 'string' && logoUrl.trim() ? logoUrl.trim() : null;
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const fromProp = typeof logoUrl === 'string' && logoUrl.trim() ? logoUrl.trim() : null;
    if (fromProp) {
      setResolvedUrl(fromProp);
      setFailed(false);
    }

    if (!storeId) return;

    let cancelled = false;
    (async () => {
      const next = await fetchLogoDirect(storeId);
      if (cancelled || !next) return;
      setResolvedUrl(next);
      setFailed(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, logoUrl]);

  const uri = resolvedUrl && !failed ? optimizedImageUrl(resolvedUrl, 'thumb') : '';
  const boxStyle = {
    width: size,
    height: size,
    borderRadius,
    backgroundColor: ui.input,
  };

  if (!uri) {
    return (
      <View style={[styles.fallback, boxStyle, style]}>
        <Ionicons name="storefront" size={Math.max(14, Math.round(size * 0.42))} color={ui.brand} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[boxStyle, style] as StyleProp<ImageStyle>}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={`store-avatar-${storeId || 'x'}-${resolvedUrl}`}
      transition={120}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
