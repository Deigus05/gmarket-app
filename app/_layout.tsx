import 'react-native-gesture-handler';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Image } from 'expo-image';

import AppLaunchIntro from '@/components/AppLaunchIntro';
import { AuthProvider } from '@/components/AuthContext';
import { LocaleProvider } from '@/components/LocaleContext';
import { NotificationBootstrap } from '@/components/NotificationBootstrap';
import { PresenceBootstrap } from '@/components/PresenceBootstrap';
import { PromoInterstitialBootstrap } from '@/components/PromoInterstitialBootstrap';
import '@/components/notifications';
import { ThemeProvider, useAppTheme } from '@/components/tema';
import { hideNativeSplashSafe, keepNativeSplash } from '@/lib/splash';
import { prefetchPlatformContacts } from '@/lib/support';

export {
    // Catch any errors thrown by the Layout component.
    ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Manter splash nativo até a intro (logo + texto) estar no ecrã.
keepNativeSplash();

// Intro com logo + frase animada (“Você merece os melhores produtos!”).
// Mantém timeouts de segurança no AppLaunchIntro para não ficar preso.
const SHOW_LAUNCH_INTRO = true;

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [introVisible, setIntroVisible] = useState(SHOW_LAUNCH_INTRO);
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  const appReady = loaded || fontsTimedOut;

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) {
      console.warn('[GMarket] Falha ao carregar fontes:', error);
    }
  }, [error]);

  // Timeout impede que uma fonte com erro deixe a árvore React vazia.
  useEffect(() => {
    const t1 = setTimeout(() => {
      setFontsTimedOut(true);
    }, 1200);
    return () => clearTimeout(t1);
  }, []);

  // Sem intro: esconde splash assim que a UI monta.
  // Com intro: o AppLaunchIntro esconde o splash só depois do overlay branco
  // estar no ecrã (evita apagão entre splash nativo e a animação).
  useEffect(() => {
    if (!appReady || SHOW_LAUNCH_INTRO) return;
    void hideNativeSplashSafe();
  }, [appReady]);

  // Rede de segurança: nunca deixar o splash nativo mais de ~4s.
  useEffect(() => {
    const safety = setTimeout(() => {
      void hideNativeSplashSafe();
    }, 4000);
    return () => clearTimeout(safety);
  }, []);

  const onIntroFinished = useCallback(() => {
    setIntroVisible(false);
  }, []);

  // Placeholder branco + logo (não `null`) — evita frame preto enquanto as fontes carregam.
  if (!appReady) {
    return (
      <View style={styles.boot}>
        <Image
          source={require('../assets/images/gmarket-splash.png')}
          style={styles.bootLogo}
          contentFit="contain"
        />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.root, introVisible ? styles.rootWhileIntro : null]}>
      <RootLayoutNav introDone={!introVisible} />
      {SHOW_LAUNCH_INTRO ? (
        <AppLaunchIntro visible={introVisible} onFinished={onIntroFinished} />
      ) : null}
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
        <Stack.Screen name="gpay" options={{ headerShown: false }} />
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
  rootWhileIntro: {
    backgroundColor: '#FFFFFF',
  },
  boot: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootLogo: {
    width: 280,
    height: 280,
  },
});
