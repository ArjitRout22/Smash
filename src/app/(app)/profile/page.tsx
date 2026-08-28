"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { User } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { PageHeader, EmptyState, CardGridSkeleton, BrandedLoader } from "@/components/ui/states";
import { Button, Card, CardHeader, Badge, Select, Input, PasswordInput, Field, Avatar } from "@/components/ui/primitives";
import { ShareButton } from "@/components/ShareButton";
import { InstallCard } from "@/components/InstallCard";
import { LocationPicker, ViewOnMapButton, type PlaceValue } from "@/components/LocationPicker";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { titleCase, pct } from "@/lib/client/format";

const APP_SHARE_URL = "https://smashhero.app";

const SKILL_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "pro", label: "Pro" },
];

type Statistics = {
  playerId: string;
  displayName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  totalPoints: number;
  tournamentsPlayed: number;
  titles: number;
  currentRank: number | null;
  bestRank: number | null;
};

export default function ProfilePage() {
  const { user, isLoading, logout, refresh } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const playerId = user?.playerId ?? null;
  const { data: stats, isLoading: statsLoading } = useSWR<Statistics>(
    playerId ? `/api/players/${playerId}/statistics` : null,
    swrFetcher
  );
  const { data: player, mutate: mutatePlayer } = useSWR<{
    skillLevel: string | null;
    fullName: string;
    displayName: string;
    photoUrl: string | null;
    phone: string | null;
    locationName: string | null;
    locationLat: number | null;
    locationLng: number | null;
    discoverable: boolean;
  }>(playerId ? `/api/players/${playerId}` : null, swrFetcher);

  if (isLoading) {
    return <BrandedLoader />;
  }

  if (!user) {
    return (
      <div>
        <PageHeader title="Profile" />
        <EmptyState title="Not signed in" message="Please log in to view your profile." icon={User} />
      </div>
    );
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your account details."
        actions={
          <ShareButton
            url={APP_SHARE_URL}
            title="Smash — Badminton Tournaments & Matches"
            text="Run badminton tournaments, casual matches and a global leaderboard on Smash."
            label="Share Smash"
          />
        }
      />

      {playerId && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar src={player?.photoUrl ?? null} name={player?.displayName ?? user.name ?? "You"} size={64} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-foreground">{player?.displayName ?? user.name ?? "You"}</p>
              {player?.fullName && <p className="truncate text-sm text-muted">{player.fullName}</p>}
            </div>
          </div>
          <NameCard
            fullName={player?.fullName ?? user.name ?? ""}
            displayName={player?.displayName ?? ""}
            onSaved={() => {
              mutatePlayer();
              refresh();
            }}
          />
        </div>
      )}

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Account"
          action={
            <Button variant="outline" size="sm" loading={loggingOut} onClick={handleLogout}>
              Log out
            </Button>
          }
        />
        <dl className="divide-y divide-[var(--border)]">
          <Row label="Email" value={user.email ?? "—"} />
          <Row label="Role" value={<Badge color="blue">{titleCase(user.role)}</Badge>} />
        </dl>
      </Card>

      <div className="mt-6">
        <PasswordCard />
      </div>

      <div className="mt-6">
        <InstallCard />
      </div>

      {playerId && (
        <div className="mt-6">
          <ContactLocationCard
            phone={player?.phone ?? ""}
            locationName={player?.locationName ?? ""}
            locationLat={player?.locationLat ?? null}
            locationLng={player?.locationLng ?? null}
            onSaved={() => mutatePlayer()}
          />
        </div>
      )}

      {playerId && (
        <div className="mt-6">
          <DiscoverableCard discoverable={player?.discoverable ?? false} onSaved={() => mutatePlayer()} />
        </div>
      )}

      {playerId && (
        <div className="mt-6">
          <SkillLevelCard currentLevel={player?.skillLevel ?? null} onSaved={() => mutatePlayer()} />
        </div>
      )}

      {playerId ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">My stats</h2>
            <Link href={`/players/${playerId}`} className="text-sm text-primary hover:underline">
              View full profile
            </Link>
          </div>
          {statsLoading && <CardGridSkeleton count={8} />}
          {stats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Matches" value={stats.matchesPlayed} />
              <Stat label="Wins" value={stats.wins} />
              <Stat label="Losses" value={stats.losses} />
              <Stat label="Win %" value={pct(stats.winPercentage)} />
              <Stat label="Points" value={stats.totalPoints} />
              <Stat label="Tournaments" value={stats.tournamentsPlayed} />
              <Stat label="Current rank" value={stats.currentRank ?? "—"} />
              <Stat label="Best rank" value={stats.bestRank ?? "—"} />
              <Stat label="Titles" value={stats.titles} />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No player profile linked"
            message="Your account is not linked to a player record, so match statistics are unavailable."
            icon={User}
          />
        </div>
      )}
    </div>
  );
}

function NameCard({ fullName, displayName, onSaved }: { fullName: string; displayName: string; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(fullName);
  const [display, setDisplay] = useState(displayName);
  const [saving, setSaving] = useState(false);
  // Sync once the fetched values arrive.
  const [synced, setSynced] = useState(fullName + "|" + displayName);
  if (fullName + "|" + displayName !== synced) {
    setSynced(fullName + "|" + displayName);
    setName(fullName);
    setDisplay(displayName);
  }
  const dirty = name.trim() !== fullName || display.trim() !== displayName;
  const valid = name.trim().length >= 2 && display.trim().length >= 1;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await api.put("/api/me/player", { fullName: name.trim(), displayName: display.trim() });
      toast.success("Name updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Your name" subtitle="Shown across matches, tournaments and the leaderboard." />
      <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arjit Rout" />
        </Field>
        <Field label="Display name">
          <Input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="e.g. Arjit" />
        </Field>
      </div>
      <div className="flex justify-end border-t border-[var(--border)] px-5 py-3">
        <Button size="sm" onClick={save} loading={saving} disabled={!dirty || !valid}>Save name</Button>
      </div>
    </Card>
  );
}

function ContactLocationCard({
  phone,
  locationName,
  locationLat,
  locationLng,
  onSaved,
}: {
  phone: string;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [phoneVal, setPhoneVal] = useState(phone);
  const [place, setPlace] = useState<PlaceValue>({ name: locationName, lat: locationLat, lng: locationLng });
  const [saving, setSaving] = useState(false);

  // Sync once the fetched values arrive.
  const fingerprint = `${phone}|${locationName}|${locationLat}|${locationLng}`;
  const [synced, setSynced] = useState(fingerprint);
  if (fingerprint !== synced) {
    setSynced(fingerprint);
    setPhoneVal(phone);
    setPlace({ name: locationName, lat: locationLat, lng: locationLng });
  }

  const dirty =
    phoneVal.trim() !== phone.trim() ||
    place.name.trim() !== locationName.trim() ||
    place.lat !== locationLat ||
    place.lng !== locationLng;

  async function save() {
    setSaving(true);
    try {
      await api.put("/api/me/player", {
        phone: phoneVal.trim() === "" ? null : phoneVal.trim(),
        locationName: place.name.trim() === "" ? null : place.name.trim(),
        locationLat: place.name.trim() === "" ? null : place.lat,
        locationLng: place.name.trim() === "" ? null : place.lng,
      });
      toast.success("Contact & location updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Contact & location" subtitle="Add a phone number and your home location so others can find and reach you." />
      <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
        <Field label="Phone (optional)">
          <Input type="tel" value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} placeholder="e.g. +91 98765 43210" />
        </Field>
        <Field label="Location (optional)">
          <LocationPicker value={place} onChange={setPlace} placeholder="Search your city or club…" />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
        <ViewOnMapButton location={place.name || null} lat={place.lat} lng={place.lng} label="View my map" />
        <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>Save</Button>
      </div>
    </Card>
  );
}

function SkillLevelCard({ currentLevel, onSaved }: { currentLevel: string | null; onSaved: () => void }) {
  const toast = useToast();
  const [level, setLevel] = useState<string>(currentLevel ?? "");
  const [saving, setSaving] = useState(false);
  // Keep the select in sync when the fetched value first arrives.
  const [synced, setSynced] = useState(currentLevel ?? "");
  if ((currentLevel ?? "") !== synced) {
    setSynced(currentLevel ?? "");
    setLevel(currentLevel ?? "");
  }
  const dirty = level !== (currentLevel ?? "");

  async function save() {
    setSaving(true);
    try {
      await api.put("/api/me/player", { skillLevel: level === "" ? null : level });
      toast.success("Skill level updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Playing profile" subtitle="Set your own standard so others know your level." />
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Skill level</span>
          {currentLevel ? (
            <Badge color={currentLevel === "pro" ? "green" : currentLevel === "intermediate" ? "blue" : "slate"}>
              {titleCase(currentLevel)}
            </Badge>
          ) : (
            <span className="text-sm text-muted">Not set</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-44">
            {SKILL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>Save</Button>
        </div>
      </div>
    </Card>
  );
}

function DiscoverableCard({ discoverable, onSaved }: { discoverable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [on, setOn] = useState(discoverable);
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(discoverable);
  if (discoverable !== synced) {
    setSynced(discoverable);
    setOn(discoverable);
  }

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      await api.put("/api/me/player", { discoverable: next });
      toast.success(next ? "You're now discoverable to nearby players" : "You're hidden from nearby search");
      onSaved();
    } catch (err) {
      setOn(!next);
      toast.error(err instanceof ApiClientError ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Find players to play" subtitle="Let nearby players discover you and send a request to play. Uses your home location; only an approximate distance is ever shown." />
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="text-sm font-medium text-foreground">Discoverable to nearby players</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={busy}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${on ? "bg-primary" : "bg-surface-2 border border-[var(--border)]"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
    </Card>
  );
}

/** Set or change the account password. */
function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.post("/api/auth/password/set", { password: next, currentPassword: current || undefined });
      toast.success("Password updated");
      setCurrent("");
      setNext("");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Password" subtitle="Set or change the password you use to log in." />
      <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
        <Field label="Current password" hint="Leave blank if you haven't set one yet.">
          <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} placeholder="••••••••" autoComplete="new-password" minLength={8} />
        </Field>
      </div>
      <div className="flex justify-end border-t border-[var(--border)] px-5 py-3">
        <Button size="sm" onClick={save} loading={saving} disabled={next.length < 8}>Save password</Button>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-bold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}
