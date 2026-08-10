import 'react-native-gesture-handler';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import AppLaunchIntro from '@/components/AppLaunchIntro';
import { AuthProvider } from '@/components/AuthContext';
import { DeliveryLiveActivityBootstrap } from '@/components/DeliveryLiveActivityBootstrap';
import { LocaleProvider } from '@/components/LocaleContext';
import { NotificationBootstrap } from '@/components/NotificationBootstrap';
import { PresenceBootstrap } from '@/components/PresenceBootstrap';
import { PromoInterstitialBootstrap } from '@/components/PromoInterstitialBootstrap';
import '@/components/notifications';
import { ThemeProvider, useAppTheme } from '@/components/tema';
import { prefetchPlatformContacts } from '@/lib/support';

export {
    // Catch any errors thrown by the Layout component.
    ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [introVisible, setIntroVisible] = useState(true);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  const onIntroFinished = useCallback(() => {
    setIntroVisible(false);
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <RootLayoutNav introDone={!introVisible} />
      <AppLaunchIntro visible={introVisible} onFinished={onIntroFinished} />
    </GestureHandlerRootView>
  );
}

function RootLayoutNav({ introDone }: { introDone: boolean }) {
  useEffect(() => {
    prefetchPlatformContacts();
  }, []);

  return (
    <AuthProvider>
      <LocaleProvider>
        <ThemeProvider>
          <NotificationBootstrap />
          <PresenceBootstrap />
          <DeliveryLiveActivityBootstrap />
          <PromoInterstitialBootstrap enabled={introDone} />
          <ThemedNavigation />
        </ThemeProvider>
      </LocaleProvider>
    </AuthProvider>
  );
}

function ThemedNavigation() {
  const { scheme, ui } = useAppTheme();
  const navTheme = scheme === 'dark'
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: ui.bg,
          card: ui.card,
          border: ui.border,
          text: ui.text,
          primary: ui.brand,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: ui.bg,
          card: ui.card,
          border: ui.border,
          text: ui.text,
          primary: ui.brand,
        },
      };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={ui.statusBar} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="productDetail" options={{ headerShown: false }} />
        <Stack.Screen name="propertyDetail" options={{ headerShown: false }} />
        <Stack.Screen name="anunciar-imovel" options={{ headerShown: false }} />
        <Stack.Screen name="meus-anuncios" options={{ headerShown: false }} />
        <Stack.Screen name="editar-imovel" options={{ headerShown: false }} />
        <Stack.Screen name="filtros-imoveis" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="checkout" options={{ headerShown: false }} />
        <Stack.Screen name="entrega" options={{ headerShown: false }} />
        <Stack.Screen name="avaliacao" options={{ headerShown: false }} />
        <Stack.Screen name="notificacoes" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="tema" options={{ headerShown: false }} />
        <Stack.Screen name="idioma" options={{ headerShown: false }} />
        <Stack.Screen name="dados-pessoais" options={{ headerShown: false }} />
        <Stack.Screen name="seguranca" options={{ headerShown: false }} />
        <Stack.Screen name="ajuda" options={{ headerShown: false }} />
        <Stack.Screen name="parceria" options={{ headerShown: false }} />
        <Stack.Screen name="termos" options={{ headerShown: false }} />
        <Stack.Screen name="regulamento-gcoin" options={{ headerShown: false }} />
        <Stack.Screen name="privacidade" options={{ headerShown: false }} />
        <Stack.Screen name="loja" options={{ headerShown: false }} />
        <Stack.Screen name="listaLojas" options={{ headerShown: false }} />
        <Stack.Screen name="eventos" options={{ headerShown: false }} />
        <Stack.Screen name="evento-detalhe" options={{ headerShown: false }} />
        <Stack.Screen name="bilhete-dados" options={{ headerShown: false }} />
        <Stack.Screen name="bilhete-pagamento" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="register" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="adicionar-endereco" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </NavThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
