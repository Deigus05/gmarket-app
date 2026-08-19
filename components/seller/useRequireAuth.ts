import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/components/AuthContext';

export function useRequireAuth(redirect: string) {
  const router = useRouter();
  const { isLoggedIn, loading, token, user } = useAuth();
  const loginRequestedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (isLoggedIn) {
      loginRequestedRef.current = false;
      return;
    }
    if (loginRequestedRef.current) return;
    loginRequestedRef.current = true;
    router.push({ pathname: '/login', params: { redirect } });
  }, [loading, isLoggedIn, redirect, router]);

  return {
    ready: Boolean(isLoggedIn && !loading),
    token,
    user,
    loading,
    isLoggedIn,
  };
}
