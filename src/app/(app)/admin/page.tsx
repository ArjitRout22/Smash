"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search, ShieldAlert, Trash2 } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/ui/states";
import { Card, Badge, Button, Input } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { formatDate } from "@/lib/client/format";

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  role: { name: string };
  player: { id: string; displayName: string } | null;
};

export default function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isAdmin = user?.role === "ADMIN";

  const { data, isLoading, mutate } = useSWR<AdminUser[]>(
    isAdmin ? `/api/admin/users${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}` : null,
    swrFetcher
  );

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Admin" />
        <EmptyState title="Admins only" message="This area is for platform administrators." icon={ShieldAlert} />
      </div>
    );
  }

  async function remove() {
    if (!target) return;
    setDeleting(true);
    try {
      await api.del(`/api/admin/users/${target.id}`);
      toast.success(`Removed ${target.name ?? target.email ?? "account"}`);
      setTarget(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not remove");
    } finally {
      setDeleting(false);
    }
  }

  const users = data ?? [];

  return (
    <div>
      <PageHeader title="Admin · Accounts" subtitle="Review accounts and soft-delete test users (reversible — hides them everywhere and revokes login)." />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading && <ListSkeleton rows={8} />}
      {data && users.length === 0 && <EmptyState title="No accounts" message="Nothing matches your search." />}

      {users.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-medium text-foreground">{u.player?.displayName ?? u.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{u.email ?? "—"}</td>
                    <td className="px-4 py-3"><Badge color={u.role.name === "ADMIN" ? "green" : "slate"}>{u.role.name}</Badge></td>
                    <td className="px-4 py-3 text-muted">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== user?.id && u.role.name !== "ADMIN" && (
                        <Button size="sm" variant="ghost" onClick={() => setTarget(u)}>
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={remove}
        title="Remove this account?"
        message={`${target?.name ?? target?.email ?? "This account"} will be soft-deleted: hidden from the directory + leaderboard and logged out. Reversible by restoring the row.`}
        confirmLabel="Remove account"
        danger
        loading={deleting}
      />
    </div>
  );
}
