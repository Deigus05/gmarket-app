import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';
import { CONTENT_MAX_WIDTH } from '@/hooks/useBreakpoint';
import {
  AccountDataKey,
  getAccountItem,
  subscribeAccountScope,
} from '@/lib/accountStorage';

export type DesktopShortcut = {
  id: string;
  name: string;
  icon: string;
  route: string;
};

type Props = {
  shortcuts?: DesktopShortcut[];
  notificationsUnread?: number;
  chatUnread?: number;
  cartCount?: number;
  activeDeliveries?: number;
  addressLabel?: string;
  onAddressPress?: () => void;
  onCatalog?: () => void;
  onSearch?: () => void;
  onChat?: () => void;
  onNotifications?: () => void;
};

const SHORTCUT_FA: Record<string, React.ComponentProps<typeof FontAwesome>['name']> = {
  '1': 'credit-card',
  '2': 'shopping-bag',
  '3': 'bicycle',
  '4': 'bolt',
  '5': 'music',
  '6': 'star',
};

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

export const HomeDesktopHeader = memo(function HomeDesktopHeader({
  shortcuts = [],
  notificationsUnread = 0,
  chatUnread = 0,
  cartCount = 0,
  activeDeliveries = 0,
  addressLabel,
  onAddressPress,
  onCatalog,
  onSearch,
  onChat,
  onNotifications,
}: Props) {
  const router = useRouter();
  const { t } = useLocale();
  const { ui, isDark } = useAppTheme();
  const [localAddress, setLocalAddress] = useState('');

  useEffect(() => {
    if (addressLabel !== undefined) return;
    let active = true;
    const load = async () => {
      try {
        const saved = await getAccountItem(AccountDataKey.homeAddress, { allowGuest: true });
        if (active) setLocalAddress(saved?.trim() || '');
      } catch {
        if (active) setLocalAddress('');
      }
    };
    void load();
    return subscribeAccountScope(() => {
      void load();
    });
  }, [addressLabel]);

  const address = addressLabel ?? localAddress;
  const iconColor = ui.text;
  const muted = ui.muted;
  const catalogBg = '#F5C518';
  const catalogText = '#111111';

  const defaultShortcuts = useMemo<DesktopShortcut[]>(
    () =>
      shortcuts.length
        ? shortcuts
        : [
            { id: '1', name: 'GPay', icon: 'card', route: '/gpay' },
            { id: '2', name: t('home.shortcutStores'), icon: 'store', route: '/listaLojas' },
            { id: '3', name: t('home.shortcutDelivery'), icon: 'bike', route: '/entrega' },
            { id: '4', name: t('home.shortcutSpecials'), icon: 'flash', route: '' },
            { id: '5', name: t('home.shortcutEvents'), icon: 'music', route: '/eventos' },
            { id: '6', name: t('home.shortcutReviews'), icon: 'star', route: '/avaliacao' },
          ],
    [shortcuts, t],
  );

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: ui.bg,
          borderBottomColor: ui.border,
        },
      ]}
    >
      <View style={[styles.mainBar, { backgroundColor: ui.bg }]}>
        <View style={styles.inner}>
          <TouchableOpacity
            style={styles.brand}
            onPress={() => router.push('/')}
            activeOpacity={0.85}
          >
            <Text style={[styles.brandG, { color: ui.brand }]}>G</Text>
            <Text style={[styles.brandRest, { color: ui.text }]}>Market</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.catalogBtn, { backgroundColor: catalogBg }]}
            onPress={onCatalog ?? (() => router.push('/search'))}
            activeOpacity={0.9}
          >
            <FontAwesome name="bars" size={15} color={catalogText} />
            <Text style={[styles.catalogText, { color: catalogText }]}>Catálogo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.search,
              {
                backgroundColor: isDark ? ui.input : '#FFFFFF',
                borderColor: catalogBg,
              },
            ]}
            onPress={onSearch ?? (() => router.push('/search'))}
            activeOpacity={0.9}
          >
            <FontAwesome name="search" size={14} color={muted} />
            <Text style={[styles.searchPlaceholder, { color: muted }]} numberOfLines={1}>
              {t('home.searchPlaceholder')}
            </Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.action}
              onPress={onChat ?? (() => router.push('/chat'))}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <FontAwesome name="comment-o" size={18} color={iconColor} />
                <Badge count={chatUnread} />
              </View>
              <Text style={[styles.actionLabel, { color: iconColor }]}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.action}
              onPress={onNotifications ?? (() => router.push('/notificacoes'))}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <FontAwesome name="bell-o" size={18} color={iconColor} />
                <Badge count={notificationsUnread} />
              </View>
              <Text style={[styles.actionLabel, { color: iconColor }]}>Alertas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.action}
              onPress={() => router.push('/favorites')}
              activeOpacity={0.85}
            >
              <FontAwesome name="heart-o" size={18} color={iconColor} />
              <Text style={[styles.actionLabel, { color: iconColor }]}>{t('tabs.favorites')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.action}
              onPress={() => router.push('/cart')}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <FontAwesome name="shopping-cart" size={18} color={iconColor} />
                <Badge count={cartCount} />
              </View>
              <Text style={[styles.actionLabel, { color: iconColor }]}>{t('tabs.cart')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.action}
              onPress={() => router.push('/profile')}
              activeOpacity={0.85}
            >
              <FontAwesome name="user-o" size={18} color={iconColor} />
              <Text style={[styles.actionLabel, { color: iconColor }]}>{t('tabs.profile')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.catsBar, { borderTopColor: ui.border }]}>
        <View style={styles.inner}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catsInner}
            style={styles.catsScroll}
          >
            {defaultShortcuts.map((cat) => {
              const showDeliveryBadge = cat.route === '/entrega' && activeDeliveries > 0;
              const fa = SHORTCUT_FA[cat.id] ?? 'circle';
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.catChip}
                  activeOpacity={0.8}
                  onPress={() => (cat.route ? router.push(cat.route as any) : null)}
                >
                  <FontAwesome name={fa} size={12} color={ui.brand} />
                  <Text style={[styles.catLabel, { color: ui.text }]}>{cat.name}</Text>
                  {showDeliveryBadge ? (
                    <View style={styles.chipBadge}>
                      <Text style={styles.badgeText}>
                        {activeDeliveries > 99 ? '99+' : String(activeDeliveries)}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Pressable
            style={styles.locChip}
            onPress={onAddressPress ?? (() => router.push('/adicionar-endereco'))}
          >
            <FontAwesome name="map-marker" size={12} color={muted} />
            <Text style={[styles.locText, { color: muted }]} numberOfLines={1}>
              {address || t('home.addAddress')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    zIndex: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mainBar: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  catsBar: {
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginRight: 2,
  },
  brandG: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandRest: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  catalogBtn: {
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catalogText: {
    fontSize: 13,
    fontWeight: '800',
  },
  search: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
    minWidth: 180,
    maxWidth: 560,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  action: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  actionIconWrap: {
    position: 'relative',
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
  },
  catsScroll: {
    flex: 1,
  },
  catsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  locChip: {
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  locText: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
});
