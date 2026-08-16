import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import {
    GlassView,
    isGlassEffectAPIAvailable,
    isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    DeviceEventEmitter,
    LayoutChangeEvent,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthContext';
import { useAppTheme } from '@/components/tema';
import { HOME_TAB_PRESS_EVENT } from '@/components/tabs/homeTabPress';
import { getProfilePhotoUrl } from '@/lib/profilePhoto';

const ICONS: Record<
  string,
  { default: keyof typeof Ionicons.glyphMap; focused: keyof typeof Ionicons.glyphMap }
> = {
  index: { default: 'home-outline', focused: 'home' },
  imoveis: { default: 'business-outline', focused: 'business' },
  favorites: { default: 'heart-outline', focused: 'heart' },
  cart: { default: 'basket-outline', focused: 'basket' },
  profile: { default: 'person-outline', focused: 'person' },
};

const SPRING = { damping: 18, stiffness: 220, mass: 0.85 };
const PILL_INSET = 4;
const PILL_V_INSET = 8;

const canUseLiquidGlass =
  Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function FloatingGlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { ui, isDark } = useAppTheme();
  const { user } = useAuth();
  const profilePhotoUrl = getProfilePhotoUrl(user?.foto_url);
  const [rowWidth, setRowWidth] = useState(0);

  // Storefront desktop: navegação no header da home — esconde a tab bar flutuante.
  if (Platform.OS === 'web' && width >= 1024) {
    return null;
  }

  const tabCount = state.routes.length;
  const tabWidth = tabCount > 0 && rowWidth > 0 ? rowWidth / tabCount : 0;

  const indicatorX = useSharedValue(0);
  const liquidStretch = useSharedValue(1);
  const liquidSquash = useSharedValue(1);
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);

  useEffect(() => {
    if (tabWidth <= 0) return;

    const targetX = state.index * tabWidth + PILL_INSET;
    indicatorX.value = withSpring(targetX, SPRING);

    // Morph líquido ao trocar de aba
    liquidStretch.value = withSequence(
      withTiming(1.18, { duration: 90, easing: Easing.out(Easing.cubic) }),
      withSpring(1, SPRING)
    );
    liquidSquash.value = withSequence(
      withTiming(0.88, { duration: 90, easing: Easing.out(Easing.cubic) }),
      withSpring(1, SPRING)
    );

    rippleScale.value = 0;
    rippleOpacity.value = 0.55;
    rippleScale.value = withTiming(1.6, { duration: 420, easing: Easing.out(Easing.cubic) });
    rippleOpacity.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [state.index, tabWidth]);

  const onRowLayout = (e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width);
  };

  const pillStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: indicatorX.value },
      { scaleX: liquidStretch.value },
      { scaleY: liquidSquash.value },
    ],
    width: Math.max(tabWidth - PILL_INSET * 2, 0),
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacity.value,
    transform: [
      {
        translateX:
          indicatorX.value +
          Math.max(tabWidth - PILL_INSET * 2, 0) / 2 -
          18,
      },
      { scale: interpolate(rippleScale.value, [0, 1.6], [0.35, 1.6]) },
    ],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View
        style={[
          styles.shell,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.65)',
            backgroundColor: canUseLiquidGlass
              ? 'transparent'
              : isDark
                ? Platform.OS === 'android'
                  ? 'rgba(26,26,26,0.92)'
                  : 'rgba(20,20,20,0.55)'
                : Platform.OS === 'android'
                  ? 'rgba(255,255,255,0.72)'
                  : 'rgba(255,255,255,0.22)',
          },
        ]}
      >
        {canUseLiquidGlass ? (
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle="regular"
            isInteractive
            colorScheme={isDark ? 'dark' : 'light'}
            tintColor={isDark ? 'rgba(20,20,20,0.35)' : 'rgba(255,255,255,0.28)'}
          />
        ) : Platform.OS === 'ios' ? (
          <>
            <BlurView
              intensity={55}
              tint={isDark ? 'systemChromeMaterialDark' : 'systemUltraThinMaterialLight'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.glassTint,
                {
                  backgroundColor: isDark ? 'rgba(14,14,14,0.45)' : 'rgba(255,255,255,0.18)',
                },
              ]}
            />
          </>
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark ? 'rgba(26,26,26,0.96)' : 'rgba(255,255,255,0.94)',
              },
            ]}
          />
        )}

        <View style={styles.row} onLayout={onRowLayout}>
          {tabWidth > 0 ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activePill,
                  pillStyle,
                  {
                    backgroundColor: canUseLiquidGlass
                      ? 'transparent'
                      : isDark
                        ? 'rgba(102,187,106,0.18)'
                        : 'rgba(46,125,50,0.12)',
                  },
                ]}
              >
                {canUseLiquidGlass ? (
                  <GlassView
                    style={StyleSheet.absoluteFill}
                    glassEffectStyle="clear"
                    isInteractive
                    colorScheme={isDark ? 'dark' : 'light'}
                    tintColor={isDark ? 'rgba(102,187,106,0.35)' : 'rgba(46,125,50,0.28)'}
                  />
                ) : null}
              </Animated.View>

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.liquidRipple,
                  rippleStyle,
                  {
                    borderColor: isDark ? 'rgba(102,187,106,0.45)' : 'rgba(46,125,50,0.35)',
                    backgroundColor: isDark
                      ? 'rgba(102,187,106,0.12)'
                      : 'rgba(46,125,50,0.1)',
                  },
                ]}
              />
            </>
          ) : null}

          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : typeof options.title === 'string'
                  ? options.title
                  : route.name;
            const focused = state.index === index;
            const icons = ICONS[route.name] ?? { default: 'ellipse-outline', focused: 'ellipse' };
            const active = ui.tabActive;
            const inactive = ui.tabInactive;

            const pulseTab = () => {
              liquidStretch.value = withSequence(
                withTiming(1.12, { duration: 70 }),
                withSpring(1, SPRING)
              );
              liquidSquash.value = withSequence(
                withTiming(0.9, { duration: 70 }),
                withSpring(1, SPRING)
              );
              rippleScale.value = 0;
              rippleOpacity.value = 0.5;
              rippleScale.value = withTiming(1.5, {
                duration: 380,
                easing: Easing.out(Easing.cubic),
              });
              rippleOpacity.value = withTiming(0, {
                duration: 380,
                easing: Easing.out(Easing.quad),
              });
            };

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (event.defaultPrevented) return;

              // Home: always return to root home (and scroll to top if already there)
              if (route.name === 'index') {
                if (focused) {
                  DeviceEventEmitter.emit(HOME_TAB_PRESS_EVENT);
                  pulseTab();
                } else {
                  router.navigate('/(tabs)');
                }
                return;
              }

              if (!focused) {
                navigation.navigate(route.name, route.params);
              } else {
                pulseTab();
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TabItem
                key={route.key}
                focused={focused}
                label={label}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                iconName={focused ? icons.focused : icons.default}
                avatarUrl={route.name === 'profile' ? profilePhotoUrl : null}
                activeColor={active}
                inactiveColor={inactive}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabItem({
  focused,
  label,
  accessibilityLabel,
  iconName,
  avatarUrl,
  activeColor,
  inactiveColor,
  onPress,
  onLongPress,
}: {
  focused: boolean;
  label: string;
  accessibilityLabel?: string;
  iconName: keyof typeof Ionicons.glyphMap;
  avatarUrl?: string | null;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const press = useSharedValue(1);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const showAvatar = Boolean(avatarUrl) && !avatarFailed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        press.value = withSpring(0.88, { damping: 16, stiffness: 400 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, SPRING);
      }}
      style={styles.item}
    >
      <Animated.View style={[styles.itemInner, animatedStyle]}>
        {showAvatar ? (
          <View
            style={[
              styles.avatarWrap,
              focused && { borderColor: activeColor },
            ]}
          >
            <Image
              source={{ uri: avatarUrl! }}
              style={styles.avatar}
              contentFit="cover"
              recyclingKey={avatarUrl}
              onError={() => setAvatarFailed(true)}
            />
          </View>
        ) : (
          <Ionicons name={iconName} size={22} color={focused ? activeColor : inactiveColor} />
        )}
        <Text
          style={[styles.label, { color: focused ? activeColor : inactiveColor }, focused && styles.labelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    pointerEvents: 'box-none',
  },
  shell: {
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  itemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  avatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(120,120,120,0.25)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  activePill: {
    position: 'absolute',
    top: PILL_V_INSET,
    bottom: PILL_V_INSET,
    left: 0,
    borderRadius: 22,
    overflow: 'hidden',
    zIndex: 0,
  },
  liquidRipple: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth * 2,
    zIndex: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  labelActive: {
    fontWeight: '600',
  },
});
