"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search, ShieldAlert, Trash2, Bell } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/ui/states";
import { Card, Badge, Button, Input, Select, Field } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
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
  const [remindOpen, setRemindOpen] = useState(false);
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

      <Card className="mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Tournament reminders</h2>
          <p className="text-sm text-muted">Pick a tournament and choose who gets a reminder email. Sent on demand — no scheduled job.</p>
        </div>
        <Button onClick={() => setRemindOpen(true)} className="shrink-0"><Bell className="h-4 w-4" /> Send reminders</Button>
      </Card>

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

      {remindOpen && <RemindersModal onClose={() => setRemindOpen(false)} />}
    </div>
  );
}

type RemindTarget = { id: string; name: string; startDate: string | null; players: { playerId: string; name: string }[] };

// Admin picks a tournament + which registered players get a reminder email.
function RemindersModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { data, isLoading } = useSWR<RemindTarget[]>("/api/admin/reminders", swrFetcher);
  const targets = data ?? [];
  const [tid, setTid] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const current = targets.find((t) => t.id === tid) ?? null;

  // Default to every player selected whenever the chosen tournament changes.
  const [syncedTid, setSyncedTid] = useState<string | null>(null);
  if (tid !== syncedTid) {
    setSyncedTid(tid);
    setSelected(new Set(current ? current.players.map((p) => p.playerId) : []));
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function send() {
    if (!tid || selected.size === 0) return;
    setSending(true);
    try {
      const res = await api.post<{ emailsSent: number }>("/api/admin/reminders", {
        tournamentId: tid,
        playerIds: [...selected],
      });
      toast.success(`Sent ${res.emailsSent} reminder${res.emailsSent === 1 ? "" : "s"}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not send reminders");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Send tournament reminders"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={send} loading={sending} disabled={!tid || selected.size === 0}>Send {selected.size || ""}</Button>
        </>
      }
    >
      {isLoading && <ListSkeleton rows={3} />}
      {!isLoading && targets.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No upcoming tournaments with registered players to remind.</p>
      )}
      {!isLoading && targets.length > 0 && (
        <div className="flex flex-col gap-4">
          <Field label="Tournament">
            <Select value={tid} onChange={(e) => setTid(e.target.value)}>
              <option value="">Select a tournament…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · {t.players.length} player{t.players.length === 1 ? "" : "s"}</option>
              ))}
            </Select>
          </Field>
          {current && (
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Recipients</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setSelected(new Set(selected.size === current.players.length ? [] : current.players.map((p) => p.playerId)))}
                >
                  {selected.size === current.players.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1">
                {current.players.map((p) => (
                  <label key={p.playerId} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2">
                    <input type="checkbox" checked={selected.has(p.playerId)} onChange={() => toggle(p.playerId)} className="h-4 w-4 accent-[var(--primary)]" />
                    <span className="text-sm">{p.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Only players with an account are listed — they can receive email.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
