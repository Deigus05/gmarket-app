import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/components/AuthContext';
import { RippleWaveLoader } from '@/components/RippleWaveLoader';
import { useLocale } from '@/components/LocaleContext';
import { registerForPushNotificationsAsync } from '@/components/notifications';
import { useAppTheme, type AppUI } from '@/components/tema';
import { openSupportWhatsApp } from '@/lib/support';

const PUSH_PREF_KEY = '@gmarket:push_notifications';

interface MenuItem {
  id: string;
  name: string;
  icon: string;
  route?: string;
  badge?: string;
  isToggle?: boolean;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

function getInitials(nome: string, apelido: string) {
  const first = nome.trim().charAt(0);
  const last = apelido.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || 'GM';
}

export default function ProfileScreen() {
  const router = useRouter();
  const { ui } = useAppTheme();
  const { t } = useLocale();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { user, token, loading, isLoggedIn, logout } = useAuth();
  const [pushNotifications, setPushNotifications] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const menuSections: MenuSection[] = useMemo(
    () => [
      {
        title: t('profile.myAccount'),
        items: [
          { id: 'm1', name: t('profile.personalData'), icon: 'person-outline', route: 'dados' },
          { id: 'm2', name: t('profile.myListings'), icon: 'home-outline', route: 'anuncios' },
          {
            id: 'm3',
            name: t('profile.wallet'),
            icon: 'wallet-outline',
            badge: t('common.available'),
            route: 'carteira',
          },
        ],
      },
      {
        title: t('profile.opportunities'),
        items: [
          {
            id: 'm3b',
            name: t('profile.partnership'),
            icon: 'rocket-outline',
            route: 'parceria',
          },
        ],
      },
      {
        title: t('profile.settings'),
        items: [
          {
            id: 'm4a',
            name: t('profile.notificationInbox'),
            icon: 'notifications-outline',
            route: 'notificacoes',
          },
          { id: 'm4', name: t('profile.pushAlerts'), icon: 'phone-portrait-outline', isToggle: true },
          { id: 'm5', name: t('profile.theme'), icon: 'color-palette-outline', route: 'tema' },
          { id: 'm5b', name: t('profile.language'), icon: 'language-outline', route: 'idioma' },
          { id: 'm6', name: t('profile.security'), icon: 'lock-closed-outline', route: 'seguranca' },
        ],
      },
      {
        title: t('profile.support'),
        items: [
          { id: 'm7', name: t('profile.help'), icon: 'help-circle-outline', route: 'ajuda' },
          { id: 'm8', name: t('profile.whatsapp'), icon: 'logo-whatsapp', route: 'whatsapp' },
        ],
      },
    ],
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(PUSH_PREF_KEY).then((value) => {
        if (!active) return;
        if (value === null) setPushNotifications(true);
        else setPushNotifications(value === '1');
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const handlePushToggle = async (enabled: boolean) => {
    setPushNotifications(enabled);
    await AsyncStorage.setItem(PUSH_PREF_KEY, enabled ? '1' : '0');
    if (enabled && token) {
      const result = await registerForPushNotificationsAsync(token);
      if (!result.permission) {
        Alert.alert(t('profile.pushPermissionTitle'), t('profile.pushPermissionMessage'));
      } else if (!result.pushToken) {
        Alert.alert(t('profile.pushActiveTitle'), t('profile.pushActiveMessage'));
      }
    }
  };

  const handleLogout = () => {
    Alert.alert(t('profile.logoutConfirmTitle'), t('profile.logoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logoutAction'),
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logout();
          setLoggingOut(false);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.mainWrapper, styles.centered]}>
        <RippleWaveLoader color={ui.brand} />
      </View>
    );
  }

  if (!isLoggedIn || !user) {
    return (
      <ScrollView style={styles.mainWrapper} contentContainerStyle={styles.guestContent}>
        <View style={styles.guestCard}>
          <View style={styles.guestIcon}>
            <Ionicons name="person-outline" size={36} color={ui.brand} />
          </View>
          <Text style={styles.guestTitle}>{t('profile.guestTitle')}</Text>
          <Text style={styles.guestSubtitle}>{t('profile.guestSubtitle')}</Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.primaryBtnText}>{t('profile.login')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/register')}
          >
            <Text style={styles.secondaryBtnText}>{t('profile.createAccount')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitleGuest}>{t('profile.guestSettings')}</Text>
        <View style={styles.guestSettingsCard}>
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.6}
            onPress={() => router.push('/tema')}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="color-palette-outline" size={20} color={ui.brand} />
              </View>
              <Text style={styles.menuItemText}>{t('profile.theme')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={ui.muted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.6}
            onPress={() => router.push('/idioma')}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="language-outline" size={20} color={ui.brand} />
              </View>
              <Text style={styles.menuItemText}>{t('profile.language')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={ui.muted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>{t('profile.version')}</Text>
      </ScrollView>
    );
  }

  const fullName = `${user.nome} ${user.apelido}`.trim();
  const genderLabel = user.genero === 'masculino' ? t('profile.male') : t('profile.female');

  return (
    <ScrollView style={styles.mainWrapper} showsVerticalScrollIndicator={false}>
      <View style={styles.profileHeaderCard}>
        <View style={styles.avatarWrapper}>
          {user.foto_url ? (
            <Image source={{ uri: user.foto_url }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{getInitials(user.nome, user.apelido)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.userName}>{fullName}</Text>
        <Text style={styles.userEmail}>{user.telefone}</Text>
        <Text style={styles.userMeta}>{genderLabel}</Text>

        {user.endereco ? (
          <View style={styles.addressBox}>
            <Ionicons name="location-outline" size={14} color={ui.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addressLabel}>{user.endereco.label}</Text>
              <Text style={styles.addressDetails}>{user.endereco.details}</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addAddressChip}
            onPress={() => router.push('/adicionar-endereco')}
          >
            <Ionicons name="add" size={14} color={ui.brand} />
            <Text style={styles.addAddressText}>{t('profile.addAddress')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.menuContainer}>
        {menuSections.map((section) => (
          <View key={section.title} style={styles.sectionWrapper}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            <View style={styles.sectionCard}>
              {section.items.map((item, index) => (
                <View key={item.id}>
                  <TouchableOpacity
                    style={styles.menuItem}
                    activeOpacity={0.6}
                    onPress={async () => {
                      if (item.route === 'whatsapp') {
                        const ok = await openSupportWhatsApp(t('help.waPrefill'));
                        if (!ok) {
                          Alert.alert(t('help.openFailTitle'), t('help.openFailMessage'));
                        }
                      } else if (item.route === 'ajuda') {
                        router.push('/ajuda');
                      } else if (item.route === 'dados') {
                        router.push('/dados-pessoais');
                      } else if (item.route === 'seguranca') {
                        router.push('/seguranca');
                      } else if (item.route === 'anuncios') {
                        router.push('/meus-anuncios');
                      } else if (item.route === 'carteira') {
                        router.push('/gpay');
                      } else if (item.route === 'notificacoes') {
                        router.push('/notificacoes');
                      } else if (item.route === 'tema') {
                        router.push('/tema');
                      } else if (item.route === 'idioma') {
                        router.push('/idioma');
                      } else if (item.route === 'parceria') {
                        router.push('/parceria');
                      }
                    }}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={styles.iconBox}>
                        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={ui.brand} />
                      </View>
                      <Text style={styles.menuItemText}>{item.name}</Text>
                    </View>

                    <View style={styles.menuItemRight}>
                      {item.badge ? (
                        <View style={styles.badgeBox}>
                          <Text style={styles.badgeText}>{item.badge}</Text>
                        </View>
                      ) : null}

                      {item.isToggle ? (
                        <Switch
                          value={pushNotifications}
                          onValueChange={handlePushToggle}
                          trackColor={{ false: ui.border, true: ui.brand }}
                          thumbColor="#FFF"
                        />
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={ui.muted} />
                      )}
                    </View>
                  </TouchableOpacity>

                  {index < section.items.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut ? (
          <RippleWaveLoader size="small" color={ui.danger} />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color={ui.danger} />
            <Text style={styles.logoutText}>{t('profile.logout')}</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.versionText}>{t('profile.version')}</Text>
    </ScrollView>
  );
}

function createStyles(ui: AppUI) {
  return StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: ui.bg, paddingTop: 60 },
    centered: { justifyContent: 'center', alignItems: 'center' },
    guestContent: { paddingHorizontal: 16, paddingBottom: 120 },
    guestCard: {
      backgroundColor: ui.card,
      borderRadius: 24,
      padding: 28,
      borderWidth: 1,
      borderColor: ui.border,
      alignItems: 'center',
      marginTop: 20,
    },
    guestIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: ui.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    guestTitle: { fontSize: 20, fontWeight: '800', color: ui.text },
    guestSubtitle: {
      fontSize: 14,
      color: ui.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 8,
      marginBottom: 24,
    },
    primaryBtn: {
      width: '100%',
      height: 50,
      borderRadius: 14,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
    secondaryBtn: {
      width: '100%',
      height: 50,
      borderRadius: 14,
      backgroundColor: ui.card,
      borderWidth: 1,
      borderColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    secondaryBtnText: { color: ui.brand, fontSize: 15, fontWeight: '700' },
    sectionTitleGuest: {
      fontSize: 11,
      fontWeight: '600',
      color: ui.muted,
      letterSpacing: 1,
      marginTop: 28,
      marginBottom: 8,
      paddingLeft: 4,
    },
    guestSettingsCard: {
      backgroundColor: ui.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: ui.border,
      overflow: 'hidden',
    },
    profileHeaderCard: {
      backgroundColor: ui.card,
      marginHorizontal: 16,
      borderRadius: 24,
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: ui.border,
      marginBottom: 20,
    },
    avatarWrapper: { marginBottom: 12 },
    avatarImage: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: ui.iconBox,
    },
    avatarFallback: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: ui.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: { color: '#FFF', fontSize: 26, fontWeight: '800' },
    userName: { fontSize: 18, fontWeight: '700', color: ui.text },
    userEmail: { fontSize: 13, color: ui.muted, marginTop: 2 },
    userMeta: { fontSize: 12, color: ui.brand, fontWeight: '600', marginTop: 4 },
    addressBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: ui.brandSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 14,
      width: '100%',
    },
    addressLabel: { fontSize: 12, fontWeight: '700', color: ui.brand },
    addressDetails: { fontSize: 12, color: ui.text, marginTop: 2, lineHeight: 16 },
    addAddressChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: ui.brandSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      marginTop: 12,
    },
    addAddressText: { fontSize: 12, fontWeight: '600', color: ui.brand },
    menuContainer: { paddingHorizontal: 16 },
    sectionWrapper: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: ui.muted,
      letterSpacing: 1,
      marginBottom: 8,
      paddingLeft: 4,
    },
    sectionCard: {
      backgroundColor: ui.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: ui.border,
      overflow: 'hidden',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      height: 56,
    },
    menuItemLeft: { flexDirection: 'row', alignItems: 'center' },
    iconBox: {
      width: 34,
      height: 34,
      backgroundColor: ui.iconBox,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    menuItemText: { fontSize: 14, fontWeight: '500', color: ui.text },
    menuItemRight: { flexDirection: 'row', alignItems: 'center' },
    badgeBox: {
      backgroundColor: ui.successSoft,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      marginRight: 6,
    },
    badgeText: { fontSize: 10, color: ui.success, fontWeight: 'bold' },
    divider: { height: 1, backgroundColor: ui.divider, marginLeft: 62 },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.card,
      marginHorizontal: 16,
      height: 50,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: ui.dangerSoft,
      marginTop: 10,
    },
    logoutText: { fontSize: 14, fontWeight: '600', color: ui.danger, marginLeft: 6 },
    versionText: {
      fontSize: 11,
      color: ui.muted,
      textAlign: 'center',
      marginTop: 24,
      paddingBottom: 110,
    },
  });
}
