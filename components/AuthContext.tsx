import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  Customer,
  changeCustomerPassword,
  deleteCustomerAccount,
  fetchCurrentCustomer,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  saveCustomerAddress,
  updateCustomerProfile,
  uploadCustomerPhoto,
} from '@/components/api';
import { unregisterPushForCurrentSession } from '@/components/notifications';
import {
  AccountDataKey,
  bindAccount,
  getAccountItem,
  setAccountItem,
  unbindAccount,
} from '@/lib/accountStorage';
import { isRemotePhotoUrl, persistProfilePhotoLocally } from '@/lib/profilePhoto';

const AUTH_TOKEN_KEY = '@gmarket:auth_token';
const AUTH_USER_CACHE_KEY = '@gmarket:auth_user_cache';

async function readAuthToken(): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (secure) return secure;
  } catch {
    // SecureStore pode falhar em alguns ambientes; cai no AsyncStorage.
  }
  try {
    const legacy = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (legacy) {
      try {
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, legacy);
        await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      } catch {
        // Mantém legado se SecureStore não gravar.
      }
      return legacy;
    }
  } catch {
    // ignore
  }
  return null;
}

async function writeAuthToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  } catch {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

async function clearAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function writeCachedUser(user: Customer): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

async function readCachedUser(): Promise<Customer | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Customer;
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function clearCachedUser(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_USER_CACHE_KEY);
  } catch {
    // ignore
  }
}

function isUnauthorizedResult(result: { success: false; reason?: string; message: string }) {
  if (result.reason === 'unauthorized') return true;
  return /sessão inválida|expirada|não autorizado|unauthorized/i.test(result.message);
}

function isTransientAuthFailure(result: { success: false; reason?: string; message: string }) {
  if (result.reason === 'network') return true;
  return /sem ligação|timeout|abort|network request failed|failed to fetch/i.test(result.message);
}

async function withLocalPhoto(customer: Customer): Promise<Customer> {
  // Só confiar em URL remota do servidor; URIs de cache/galeria somem.
  if (isRemotePhotoUrl(customer.foto_url)) return customer;

  let localPhoto = await getAccountItem(AccountDataKey.profilePhoto);
  if (!localPhoto) return customer;

  // Migra URI temporária (cache/picker) para Documents, se o ficheiro ainda existir.
  try {
    const durable = await persistProfilePhotoLocally(localPhoto, customer.id);
    if (durable !== localPhoto) {
      await setAccountItem(AccountDataKey.profilePhoto, durable);
      localPhoto = durable;
    }
  } catch {
    // Ficheiro temporário já apagado — mantém o que estiver gravado.
  }

  return { ...customer, foto_url: localPhoto };
}

type AuthContextValue = {
  user: Customer | null;
  token: string | null;
  loading: boolean;
  isLoggedIn: boolean;
  login: (telefone: string, senha: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  register: (input: {
    nome: string;
    apelido: string;
    genero: 'masculino' | 'feminino';
    telefone: string;
    senha: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  saveAddress: (input: {
    label: string;
    details: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  changePassword: (input: {
    senhaAtual: string;
    novaSenha: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  updatePhoto: (imageUri: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  updateProfile: (input: {
    nome?: string;
    apelido?: string;
    genero?: 'masculino' | 'feminino';
    telefone?: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
  deleteAccount: (input?: {
    senha?: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const refreshingRef = useRef(false);

  const persistSession = useCallback(async (nextToken: string, nextUser: Customer) => {
    // Isola dados locais desta conta antes de qualquer UI ler cache.
    await bindAccount(nextUser.id);
    await writeAuthToken(nextToken);
    const withPhoto = await withLocalPhoto(nextUser);
    await writeCachedUser(withPhoto);
    setToken(nextToken);
    setUser(withPhoto);
  }, []);

  const clearSession = useCallback(async (authToken?: string | null) => {
    await unregisterPushForCurrentSession(authToken);
    await clearAuthToken();
    await clearCachedUser();
    await unbindAccount();
    setToken(null);
    setUser(null);
  }, []);

  const applyAuthenticatedUser = useCallback(async (authToken: string, nextUser: Customer) => {
    await bindAccount(nextUser.id);
    const withPhoto = await withLocalPhoto(nextUser);
    await writeCachedUser(withPhoto);
    setToken(authToken);
    setUser(withPhoto);
  }, []);

  const refreshUser = useCallback(async () => {
    const authToken = tokenRef.current;
    if (!authToken || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const result = await fetchCurrentCustomer(authToken);
      if (result.success) {
        await applyAuthenticatedUser(authToken, result.data);
        return;
      }
      // Rede lenta / troca de Wi‑Fi: NÃO faz logout.
      if (isTransientAuthFailure(result)) return;
      // Só limpa quando o servidor confirma sessão inválida.
      if (isUnauthorizedResult(result)) {
        await clearSession(authToken);
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [applyAuthenticatedUser, clearSession]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const storedToken = await readAuthToken();
        if (!storedToken) return;

        // Restaura UI imediatamente com o último perfil conhecido enquanto valida a rede.
        const cached = await readCachedUser();
        if (cached && active) {
          await bindAccount(cached.id);
          if (!active) return;
          setToken(storedToken);
          setUser(await withLocalPhoto(cached));
        }

        const result = await fetchCurrentCustomer(storedToken);
        if (!active) return;

        if (result.success) {
          await applyAuthenticatedUser(storedToken, result.data);
          return;
        }

        if (isTransientAuthFailure(result)) {
          // Mantém token (+ cache) para não “expulsar” o utilizador offline.
          if (!cached && active) {
            setToken(storedToken);
          }
          return;
        }

        if (isUnauthorizedResult(result)) {
          await clearAuthToken();
          await clearCachedUser();
          await unbindAccount();
          if (active) {
            setToken(null);
            setUser(null);
          }
        }
      } catch (error) {
        console.log('Erro ao restaurar sessão:', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [applyAuthenticatedUser]);

  // Ao voltar ao primeiro plano, revalida sem forçar logout em falhas de rede.
  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active' && tokenRef.current) {
        void refreshUser();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [refreshUser]);

  const login = useCallback(async (telefone: string, senha: string) => {
    const result = await loginCustomer({ telefone, senha });
    if (!result.success) return { ok: false as const, message: result.message };
    // Troca de conta no mesmo telemóvel: remove push da sessão anterior.
    if (token) await unregisterPushForCurrentSession(token);
    await persistSession(result.data.token, result.data.user);
    return { ok: true as const };
  }, [persistSession, token]);

  const register = useCallback(async (input: {
    nome: string;
    apelido: string;
    genero: 'masculino' | 'feminino';
    telefone: string;
    senha: string;
  }) => {
    const result = await registerCustomer(input);
    if (!result.success) return { ok: false as const, message: result.message };
    if (token) await unregisterPushForCurrentSession(token);
    await persistSession(result.data.token, result.data.user);
    return { ok: true as const };
  }, [persistSession, token]);

  const saveAddress = useCallback(async (input: {
    label: string;
    details: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => {
    if (!token) return { ok: false as const, message: 'Sessão inválida.' };
    const result = await saveCustomerAddress(token, input);
    if (!result.success) return { ok: false as const, message: result.message };
    const withPhoto = await withLocalPhoto(result.data);
    await writeCachedUser(withPhoto);
    setUser(withPhoto);
    return { ok: true as const };
  }, [token]);

  const changePassword = useCallback(async (input: {
    senhaAtual: string;
    novaSenha: string;
  }) => {
    if (!token) return { ok: false as const, message: 'Sessão inválida.' };
    const result = await changeCustomerPassword(token, input);
    if (!result.success) return { ok: false as const, message: result.message };
    return { ok: true as const };
  }, [token]);

  const updatePhoto = useCallback(async (imageUri: string) => {
    if (!token || !user) return { ok: false as const, message: 'Sessão inválida.' };

    // Grava cópia permanente (Documents) — a URI da galeria/cache é temporária.
    let durableUri = imageUri;
    try {
      durableUri = await persistProfilePhotoLocally(imageUri, user.id);
    } catch (error) {
      console.log('Erro ao persistir foto de perfil localmente:', error);
    }
    await setAccountItem(AccountDataKey.profilePhoto, durableUri);

    const result = await uploadCustomerPhoto(token, durableUri);
    if (result.success) {
      const remote = isRemotePhotoUrl(result.data.foto_url) ? result.data.foto_url : null;
      const next: Customer = {
        ...result.data,
        foto_url: remote || durableUri,
      };
      await writeCachedUser(next);
      setUser(next);
      return { ok: true as const };
    }

    // Fallback local se o endpoint de foto ainda não existir / falhar no backend.
    setUser((prev) => {
      const next = prev ? { ...prev, foto_url: durableUri } : prev;
      if (next) void writeCachedUser(next);
      return next;
    });
    return { ok: true as const };
  }, [token, user]);

  const updateProfile = useCallback(async (input: {
    nome?: string;
    apelido?: string;
    genero?: 'masculino' | 'feminino';
    telefone?: string;
  }) => {
    if (!token) return { ok: false as const, message: 'Sessão inválida.' };
    const result = await updateCustomerProfile(token, input);
    if (!result.success) return { ok: false as const, message: result.message };
    const withPhoto = await withLocalPhoto(result.data);
    await writeCachedUser(withPhoto);
    setUser(withPhoto);
    return { ok: true as const };
  }, [token]);

  const logout = useCallback(async () => {
    const current = token;
    if (current) await logoutCustomer(current);
    await clearSession(current);
  }, [token, clearSession]);

  const deleteAccount = useCallback(async (input?: { senha?: string }) => {
    if (!token) return { ok: false as const, message: 'Sessão inválida.' };
    const current = token;
    const result = await deleteCustomerAccount(current, input);
    if (!result.success) return { ok: false as const, message: result.message };
    await clearSession(current);
    return { ok: true as const };
  }, [token, clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isLoggedIn: Boolean(token && user),
      login,
      register,
      saveAddress,
      changePassword,
      updatePhoto,
      updateProfile,
      logout,
      deleteAccount,
      refreshUser,
    }),
    [
      user,
      token,
      loading,
      login,
      register,
      saveAddress,
      changePassword,
      updatePhoto,
      updateProfile,
      logout,
      deleteAccount,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
