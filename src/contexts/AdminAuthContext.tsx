import { createContext, useContext, type ReactNode } from 'react';
import { trpc } from '@/providers/trpc';

type LoginResult =
  | { ok: true }
  | { ok: false; requiresTotp: true; pendingToken: string }
  | { ok: false; requiresTotp: false };

interface AdminAuthContextType {
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTotp: (pendingToken: string, code: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  isAdmin: false,
  isLoading: true,
  login: async () => ({ ok: false, requiresTotp: false }),
  verifyTotp: async () => false,
  logout: async () => {},
});

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  // authedQuery — fails with UNAUTHORIZED when there's no valid session
  // cookie yet; that's expected for logged-out visitors, not a real error.
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const loginMutation = trpc.auth.login.useMutation();
  const verifyTotpMutation = trpc.auth.loginVerifyTotp.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const isAdmin = meQuery.data?.role === 'admin';

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await loginMutation.mutateAsync({ email, password });
      if (res.requiresTotp && res.pendingToken) {
        return { ok: false, requiresTotp: true, pendingToken: res.pendingToken };
      }
      await utils.auth.me.invalidate();
      return { ok: true };
    } catch {
      return { ok: false, requiresTotp: false };
    }
  };

  const verifyTotp = async (pendingToken: string, code: string): Promise<boolean> => {
    try {
      await verifyTotpMutation.mutateAsync({ pendingToken, code });
      await utils.auth.me.invalidate();
      return true;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      await utils.auth.me.invalidate();
    }
  };

  return (
    <AdminAuthContext.Provider value={{ isAdmin, isLoading: meQuery.isLoading, login, verifyTotp, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
