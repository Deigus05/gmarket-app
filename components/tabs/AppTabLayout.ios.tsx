// iPhone: NativeTabs (liquid glass / tab bar nativa).
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAuth } from '@/components/AuthContext';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';

export default function IosAppTabLayout() {
  const { t } = useLocale();
  const { ui, isDark } = useAppTheme();
  const { user } = useAuth();
  const profilePhotoUrl = user?.foto_url?.trim() || null;

  return (
    <NativeTabs
      tintColor={ui.tabActive}
      iconColor={ui.tabInactive}
      labelStyle={{
        fontSize: 10,
        fontWeight: '500',
        color: ui.tabInactive,
      }}
      blurEffect={isDark ? 'systemChromeMaterialDark' : 'systemUltraThinMaterialLight'}
      indicatorColor={isDark ? 'rgba(102,187,106,0.35)' : 'rgba(46,125,50,0.28)'}
      minimizeBehavior="onScrollDown"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger
        name="index"
        options={{ overrideScrollViewContentInsetAdjustmentBehavior: false }}
      >
        <Label>{t('tabs.home')}</Label>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="imoveis"
        options={{ overrideScrollViewContentInsetAdjustmentBehavior: false }}
      >
        <Label>{t('tabs.properties')}</Label>
        <Icon sf={{ default: 'building.2', selected: 'building.2.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="favorites"
        options={{ overrideScrollViewContentInsetAdjustmentBehavior: false }}
      >
        <Label>{t('tabs.favorites')}</Label>
        <Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="cart">
        <Label>{t('tabs.cart')}</Label>
        <Icon sf={{ default: 'cart', selected: 'cart.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="profile"
        options={{ overrideScrollViewContentInsetAdjustmentBehavior: false }}
      >
        <Label>{t('tabs.profile')}</Label>
        {profilePhotoUrl ? (
          <Icon src={{ uri: profilePhotoUrl }} />
        ) : (
          <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        )}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
