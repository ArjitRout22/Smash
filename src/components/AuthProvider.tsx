"use client";

import { createContext, useCallback, useContext } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { api, swrFetcher } from "@/lib/client/api";

export type CurrentUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  name: string | null;
  role: string;
  organizationId: string | null;
  playerId: string | null;
  permissions: string[];
};

type AuthCtx = {
  user: CurrentUser | null;
  isLoading: boolean;
  can: (permission: string) => boolean;
  refresh: () => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: CurrentUser | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<CurrentUser>("/api/auth/me", swrFetcher, {
    fallbackData: initialUser ?? undefined,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const user = data ?? null;

  const can = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user]
  );

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    await mutate(undefined, { revalidate: false });
    router.push("/login");
    router.refresh();
  }, [mutate, router]);

  return (
    <Ctx.Provider value={{ user, isLoading, can, refresh: () => mutate(), logout }}>
      {children}
    </Ctx.Provider>
  );
}
