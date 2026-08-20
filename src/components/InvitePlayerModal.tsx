"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Check } from "lucide-react";
import { api, ApiClientError, swrFetcher, swrFetcherWithMeta } from "@/lib/client/api";
import { Modal } from "@/components/ui/Modal";
import { Button, Input, Select, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type TournamentLite = { id: string; name: string; status: string; format: string };
type PlayerLite = { id: string; displayName: string; fullName: string };

/**
 * Dashboard shortcut for the app's core action: invite a player into one of your
 * own (still-open) tournaments. Search a player with an account, pick a
 * tournament, send — the invitee gets an invitation email.
 */
export function InvitePlayerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [tournamentId, setTournamentId] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PlayerLite | null>(null);
  const [sending, setSending] = useState(false);

  const { data: tournaments, isLoading: loadingT } = useSWR<TournamentLite[]>(
    open ? "/api/tournaments/invitable" : null,
    swrFetcher
  );
  const { data: playersEnv, isLoading: loadingP } = useSWR<{ data: PlayerLite[] }>(
    open && search.trim().length > 0 ? `/api/players?scope=all&pageSize=20&search=${encodeURIComponent(search)}` : null,
    swrFetcherWithMeta
  );
  const players = playersEnv?.data ?? [];

  function reset() {
    setTournamentId("");
    setSearch("");
    setSelected(null);
  }
  function close() {
    reset();
    onClose();
  }

  async function send() {
    if (!tournamentId || !selected) return;
    setSending(true);
    try {
      const res = await api.post<{ status: string }>(`/api/tournaments/${tournamentId}/invite`, { playerId: selected.id });
      toast.success(res?.status === "registered" ? "Player added to the tournament" : "Invitation sent — they'll get an email");
      close();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not send the invite");
    } finally {
      setSending(false);
    }
  }

  const noTournaments = !loadingT && (tournaments?.length ?? 0) === 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite a player"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={send} loading={sending} disabled={!tournamentId || !selected || sending}>Send invite</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {noTournaments ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-muted">
            You don&apos;t have any open tournaments yet.{" "}
            <Link href="/tournaments/create" className="text-primary hover:underline" onClick={close}>Create one</Link> to start inviting players.
          </p>
        ) : (
          <>
            <Field label="Player">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-9"
                  placeholder="Search players with an account…"
                  value={selected ? selected.displayName : search}
                  onChange={(e) => { setSelected(null); setSearch(e.target.value); }}
                />
              </div>
              {!selected && search.trim().length > 0 && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)]">
                  {loadingP && <p className="px-3 py-3 text-sm text-muted">Searching…</p>}
                  {!loadingP && players.length === 0 && <p className="px-3 py-3 text-sm text-muted">No players found.</p>}
                  {players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setSelected(p); setSearch(""); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="min-w-0 truncate"><span className="font-medium text-foreground">{p.displayName}</span> <span className="text-muted">· {p.fullName}</span></span>
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <p className="mt-2 inline-flex items-center gap-1 text-sm text-primary">
                  <Check className="h-4 w-4" /> {selected.displayName} selected
                </p>
              )}
            </Field>

            <Field label="Tournament" hint="Only your open (not completed) tournaments.">
              <Select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} disabled={loadingT}>
                <option value="">{loadingT ? "Loading…" : "Select a tournament…"}</option>
                {tournaments?.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
