// Android + web: tab bar flutuante de sempre.
import { Tabs } from 'expo-router';
import { FloatingGlassTabBar } from '@/components/FloatingGlassTabBar';
import { useLocale } from '@/components/LocaleContext';

export default function AppTabLayout() {
  const { t } = useLocale();

  return (
    <Tabs
      tabBar={(props) => <FloatingGlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2E7D32',
        tabBarInactiveTintColor: '#888888',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="imoveis" options={{ title: t('tabs.properties') }} />
      <Tabs.Screen name="favorites" options={{ title: t('tabs.favorites') }} />
      <Tabs.Screen name="cart" options={{ title: t('tabs.cart') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
