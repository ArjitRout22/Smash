"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Plus, Search, Users } from "lucide-react";
import { api, ApiClientError, swrFetcherWithMeta } from "@/lib/client/api";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Button, Card, Input, Select, Field, Avatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";

type Ranking = {
  totalPoints: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  rank: number | null;
  tournamentsPlayed: number;
  titles: number;
  bestRank: number | null;
};

type Player = {
  id: string;
  fullName: string;
  displayName: string;
  phone?: string;
  photoUrl?: string;
  gender?: string;
  dateOfBirth?: string;
  city?: string;
  ranking?: Ranking | null;
};

type Meta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export default function PlayersPage() {
  const { can } = useAuth();
  const { success, error: errorToast } = useToast();
  const params = useSearchParams();
  const canManage = can(PERMS.PLAYER_MANAGE);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  // Open the create modal when arriving via ?new=1 (derived, not an effect).
  const [modalOpen, setModalOpen] = useState(() => params.get("new") === "1");

  const { data, error, isLoading, mutate } = useSWR<{ data: Player[]; meta?: Meta }>(
    `/api/players?page=${page}&pageSize=20&scope=${scope}&search=${encodeURIComponent(search)}`,
    swrFetcherWithMeta
  );

  const players = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <PageHeader
        title="Players"
        subtitle={scope === "mine" ? "Players in your workspace." : "Everyone across Smash — view any player's profile."}
        actions={
          canManage && scope === "mine" ? (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> New player
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 inline-flex rounded-lg bg-surface-2 p-1 text-sm font-medium">
        {(["mine", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setScope(s); setPage(1); }}
            className={`rounded-md px-3 py-1.5 transition ${scope === s ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
          >
            {s === "mine" ? "My workspace" : "All players"}
          </button>
        ))}
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9"
          placeholder="Search players…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading && <ListSkeleton rows={6} />}
      {error && <ErrorState onRetry={() => mutate()} />}

      {!isLoading && !error && players.length === 0 && (
        <EmptyState
          title="No players found"
          message={search ? "Try a different search." : "Add your first player to get started."}
          icon={Users}
          action={
            canManage ? (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> New player
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && players.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Record</th>
                  <th className="px-4 py-3 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border)] hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link href={`/players/${p.id}`} className="flex items-center gap-3">
                        <Avatar src={p.photoUrl} name={p.displayName} size={32} />
                        <span>
                          <span className="font-medium text-foreground">{p.displayName}</span>
                          <span className="block text-xs text-muted">{p.fullName}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.city ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {p.ranking ? `${p.ranking.wins}W · ${p.ranking.losses}L` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {p.ranking ? p.ranking.totalPoints : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {canManage && (
        <CreatePlayerModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            success("Player created");
            setModalOpen(false);
            mutate();
          }}
          onError={(m) => errorToast(m)}
        />
      )}
    </div>
  );
}

function CreatePlayerModal({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFullName("");
    setDisplayName("");
    setEmail("");
    setEmailError(undefined);
    setPhone("");
    setGender("");
    setCity("");
    setDateOfBirth("");
    setFieldError(undefined);
  }

  async function submit() {
    if (fullName.trim().length < 2) {
      setFieldError("Full name must be at least 2 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(undefined);
    setFieldError(undefined);
    setSubmitting(true);
    try {
      await api.post("/api/players", {
        fullName: fullName.trim(),
        displayName: displayName.trim() || undefined,
        email: email.trim(),
        phone: phone.trim() || undefined,
        gender: gender || undefined,
        city: city.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
      });
      reset();
      onCreated();
    } catch (err) {
      // A duplicate email (existing account or player) is shown inline on the field.
      if (err instanceof ApiClientError && err.code === "CONFLICT") {
        setEmailError(err.message);
      } else {
        onError(err instanceof ApiClientError ? err.message : "Failed to create player");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New player"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Create player
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Full name" htmlFor="fullName" required error={fieldError}>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" />
        </Field>
        <Field label="Display name" htmlFor="displayName" hint="Optional — shown on leaderboards.">
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane" />
        </Field>
        <Field label="Email" htmlFor="email" required error={emailError} hint="Links to their account if they already have one, so you never create a duplicate.">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <Select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Not specified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="London" />
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth">
          <Input id="dateOfBirth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
