import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/authorize";
import { AuthProvider, type CurrentUser } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const initialUser: CurrentUser = {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    phone: user.phone,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    playerId: user.playerId,
    permissions: user.permissions,
  };

  return (
    <AuthProvider initialUser={initialUser}>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
