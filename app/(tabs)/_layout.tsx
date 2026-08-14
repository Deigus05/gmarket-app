// app/(tabs)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from 'expo-router/unstable-native-tabs';

import { useAuth } from '@/components/AuthContext';
import { useLocale } from '@/components/LocaleContext';
import { useAppTheme } from '@/components/tema';

export default function TabsLayout() {
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
        <Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="home-outline" />,
            selected: <VectorIcon family={Ionicons} name="home" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="imoveis">
        <Label>{t('tabs.properties')}</Label>
        <Icon
          sf={{ default: 'building.2', selected: 'building.2.fill' }}
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="business-outline" />,
            selected: <VectorIcon family={Ionicons} name="business" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="favorites">
        <Label>{t('tabs.favorites')}</Label>
        <Icon
          sf={{ default: 'heart', selected: 'heart.fill' }}
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="heart-outline" />,
            selected: <VectorIcon family={Ionicons} name="heart" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="cart">
        <Label>{t('tabs.cart')}</Label>
        <Icon
          sf={{ default: 'cart', selected: 'cart.fill' }}
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="basket-outline" />,
            selected: <VectorIcon family={Ionicons} name="basket" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Label>{t('tabs.profile')}</Label>
        {profilePhotoUrl ? (
          <Icon src={{ uri: profilePhotoUrl }} />
        ) : (
          <Icon
            sf={{ default: 'person', selected: 'person.fill' }}
            androidSrc={{
              default: <VectorIcon family={Ionicons} name="person-outline" />,
              selected: <VectorIcon family={Ionicons} name="person" />,
            }}
          />
        )}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
