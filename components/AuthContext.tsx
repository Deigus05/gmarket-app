import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
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

const AUTH_TOKEN_KEY = '@gmarket:auth_token';

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

async function withLocalPhoto(customer: Customer): Promise<Customer> {
  if (customer.foto_url) return customer;
  const localPhoto = await getAccountItem(AccountDataKey.profilePhoto);
  if (!localPhoto) return customer;
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

  const persistSession = useCallback(async (nextToken: string, nextUser: Customer) => {
    // Isola dados locais desta conta antes de qualquer UI ler cache.
    await bindAccount(nextUser.id);
    await writeAuthToken(nextToken);
    setToken(nextToken);
    setUser(await withLocalPhoto(nextUser));
  }, []);

  const clearSession = useCallback(async (authToken?: string | null) => {
    await unregisterPushForCurrentSession(authToken);
    await clearAuthToken();
    await unbindAccount();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const result = await fetchCurrentCustomer(token);
    if (result.success) {
      await bindAccount(result.data.id);
      setUser(await withLocalPhoto(result.data));
    } else {
      await clearSession(token);
    }
  }, [token, clearSession]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const storedToken = await readAuthToken();
        if (!storedToken) return;

        const result = await fetchCurrentCustomer(storedToken);
        if (!active) return;

        if (result.success) {
          await bindAccount(result.data.id);
          if (!active) return;
          setToken(storedToken);
          setUser(await withLocalPhoto(result.data));
        } else {
          // Só limpa sessão se o servidor respondeu (token inválido).
          // Sem rede, mantém o token e deixa entrar como visitante até haver ligação.
          const offline = result.message.includes('Sem ligação');
          if (!offline) {
            await clearAuthToken();
            await unbindAccount();
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
  }, []);

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
    setUser(await withLocalPhoto(result.data));
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
    if (!token) return { ok: false as const, message: 'Sessão inválida.' };
    const result = await uploadCustomerPhoto(token, imageUri);
    if (result.success) {
      setUser(await withLocalPhoto(result.data));
      return { ok: true as const };
    }
    // Fallback local se o endpoint de foto ainda não existir no backend.
    await setAccountItem(AccountDataKey.profilePhoto, imageUri);
    setUser((prev) => (prev ? { ...prev, foto_url: imageUri } : prev));
    return { ok: true as const };
  }, [token]);

  const updateProfile = useCallback(async (input: {
    nome?: string;
    apelido?: string;
    genero?: 'masculino' | 'feminino';
    telefone?: string;
  }) => {
    if (!token) return { ok: false as const, message: 'Sessão inválida.' };
    const result = await updateCustomerProfile(token, input);
    if (!result.success) return { ok: false as const, message: result.message };
    setUser(await withLocalPhoto(result.data));
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
