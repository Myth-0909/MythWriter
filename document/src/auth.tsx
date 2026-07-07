import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { api, isLoggedIn } from "@/api";
import type { FontFamilyKey } from "@/lib/fontCatalog";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  fontFamilyKey: FontFamilyKey;
}

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  updateUser: (data: Partial<UserInfo>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  refreshUser: async () => {},
  updateUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshUser = useCallback(async () => {
    if (!isLoggedIn()) return;
    setLoading(true);
    try {
      const res = await api.getProfile();
      setUser({
        id: res.user.id,
        name: res.user.name,
        email: res.user.email,
        avatar: res.user.avatar,
        fontFamilyKey: res.user.fontFamilyKey,
      });
    } catch {
      // Token invalid or expired
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback((data: Partial<UserInfo>) => {
    setUser((prev) => ({ ...prev, ...data } as UserInfo));
  }, []);

  useEffect(() => {
    if (isLoggedIn()) {
      refreshUser();
    }
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
