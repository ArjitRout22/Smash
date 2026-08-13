"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Button, Select, Input, Field } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { STAGE_TYPES } from "@/lib/domain/constants";
import { titleCase } from "@/lib/client/format";
import type { TournamentPlayerDTO, TeamDTO } from "./types";

/**
 * The three "build the draw" flows — Add stage, Generate fixtures (round-robin /
 * groups) and Generate bracket (knockout). Extracted so the unified Matches tab
 * can host them directly (they used to live on a separate Stages tab).
 */

export function CreateStageModal({
  tournamentId,
  onClose,
  onCreated,
}: {
  tournamentId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState("group");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/tournaments/${tournamentId}/stages`, { name: name.trim(), type });
      toast.success("Stage added");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not add stage");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add stage" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={!name.trim()}>Add</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Stage name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group Stage" /></Field>
        <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)}>{STAGE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}

const GROUP_LABELS = ["A", "B", "C", "D"];

export function GenerateFixturesModal({
  tournamentId,
  format,
  onClose,
  onDone,
}: {
  tournamentId: string;
  format: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const isTeam = format !== "singles";
  const matchType = isTeam ? "doubles" : "singles";

  const [mode, setMode] = useState<"round_robin" | "groups">("groups");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupCount, setGroupCount] = useState(2);
  const [groupOf, setGroupOf] = useState<Record<string, number>>({});
  const [rounds, setRounds] = useState<1 | 2>(2);
  const [bestOf, setBestOf] = useState("3");
  const [stageName, setStageName] = useState(isTeam ? "Group Stage" : "Round Robin");
  const [saving, setSaving] = useState(false);

  const { data: playersResp } = useSWR<TournamentPlayerDTO[]>(!isTeam ? `/api/tournaments/${tournamentId}/players` : null, swrFetcher);
  const { data: teams } = useSWR<TeamDTO[]>(isTeam ? `/api/teams?tournamentId=${tournamentId}` : null, swrFetcher);

  const options: { id: string; label: string }[] = isTeam
    ? (teams ?? []).map((t) => ({ id: t.id, label: t.name }))
    : (playersResp ?? []).map((tp) => ({ id: tp.player.id, label: tp.player.displayName }));

  function toggle(id: string) {
    if (selected.includes(id)) {
      setSelected((s) => s.filter((x) => x !== id));
      setGroupOf((g) => { const c = { ...g }; delete c[id]; return c; });
    } else {
      setSelected((s) => [...s, id]);
      setGroupOf((g) => ({ ...g, [id]: 0 }));
    }
  }

  const groups: string[][] = Array.from({ length: groupCount }, (_, gi) => selected.filter((id) => (groupOf[id] ?? 0) === gi));
  const nonEmptyGroups = groups.filter((g) => g.length > 0);

  let pairCount = 0;
  if (mode === "groups") {
    for (let i = 0; i < nonEmptyGroups.length; i++)
      for (let j = i + 1; j < nonEmptyGroups.length; j++) pairCount += nonEmptyGroups[i].length * nonEmptyGroups[j].length;
  } else {
    pairCount = (selected.length * (selected.length - 1)) / 2;
  }
  const matchCount = pairCount * rounds;
  const canSubmit = matchCount > 0 && (mode === "groups" ? nonEmptyGroups.length >= 2 : selected.length >= 2);

  async function save() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const body: { matchType: string; bestOf: number; rounds: 1 | 2; mode: string; stageName?: string; groups?: string[][]; participantIds?: string[] } = {
        matchType,
        bestOf: Number(bestOf),
        rounds,
        mode,
        stageName: stageName.trim() || undefined,
      };
      if (mode === "groups") body.groups = nonEmptyGroups;
      else body.participantIds = selected;
      const res = await api.post<{ created: number }>(`/api/tournaments/${tournamentId}/fixtures`, body);
      toast.success(`${res.created} matches created`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not generate fixtures");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Generate fixtures"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={!canSubmit}>Generate{matchCount ? ` (${matchCount})` : ""}</Button></>}
    >
      <div className="flex flex-col gap-4">
        <Field label="Format">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "round_robin" ? "primary" : "outline"} onClick={() => setMode("round_robin")}>All play all</Button>
            <Button type="button" size="sm" variant={mode === "groups" ? "primary" : "outline"} onClick={() => setMode("groups")}>Groups (cross-play)</Button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Each pairing">
            <Select value={String(rounds)} onChange={(e) => setRounds(e.target.value === "2" ? 2 : 1)}>
              <option value="1">Once</option>
              <option value="2">Twice (home &amp; away)</option>
            </Select>
          </Field>
          <Field label="Match format">
            <Select value={bestOf} onChange={(e) => setBestOf(e.target.value)}><option value="1">Best of 1</option><option value="3">Best of 3</option></Select>
          </Field>
        </div>
        <Field label="Stage name (optional)"><Input value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Group Stage" /></Field>
        {mode === "groups" && (
          <Field label="Number of groups">
            <Select value={String(groupCount)} onChange={(e) => setGroupCount(Number(e.target.value))}>
              {[2, 3, 4].map((n) => <option key={n} value={n}>{n} groups</option>)}
            </Select>
          </Field>
        )}

        <div>
          <p className="mb-1 text-sm font-medium">{isTeam ? "Teams" : "Players"}</p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1">
            {options.length === 0 && <p className="py-4 text-center text-sm text-muted">No {isTeam ? "teams" : "players"} available.</p>}
            {options.map((o) => {
              const checked = selected.includes(o.id);
              return (
                <div key={o.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <input type="checkbox" checked={checked} onChange={() => toggle(o.id)} className="h-4 w-4 accent-[var(--primary)]" />
                  <span className="flex-1 text-sm font-medium">{o.label}</span>
                  {checked && mode === "groups" && (
                    <Select value={String(groupOf[o.id] ?? 0)} onChange={(e) => setGroupOf((g) => ({ ...g, [o.id]: Number(e.target.value) }))} className="w-28">
                      {Array.from({ length: groupCount }, (_, gi) => <option key={gi} value={gi}>Group {GROUP_LABELS[gi]}</option>)}
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted">
          {mode === "groups" ? "Teams only play teams in other groups. " : "Everyone plays everyone. "}
          {matchCount > 0 ? `${matchCount} matches will be created.` : "Select participants to preview."}
        </p>
      </div>
    </Modal>
  );
}

export function GenerateBracketModal({
  tournamentId,
  format,
  onClose,
  onDone,
}: {
  tournamentId: string;
  format: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const isTeam = format !== "singles";
  const [name, setName] = useState("Knockout");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: playersResp } = useSWR<TournamentPlayerDTO[]>(!isTeam ? `/api/tournaments/${tournamentId}/players` : null, swrFetcher);
  const { data: teams } = useSWR<TeamDTO[]>(isTeam ? `/api/teams?tournamentId=${tournamentId}` : null, swrFetcher);

  const options: { id: string; label: string }[] = isTeam
    ? (teams ?? []).map((t) => ({ id: t.id, label: t.name }))
    : (playersResp ?? []).map((tp) => ({ id: tp.player.id, label: tp.player.displayName }));

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function save() {
    if (selected.length < 2) return;
    setSaving(true);
    try {
      await api.post(`/api/tournaments/${tournamentId}/bracket`, { name, participantIds: selected });
      toast.success("Bracket generated");
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not generate bracket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Generate knockout bracket"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={selected.length < 2}>Generate ({selected.length})</Button></>}
    >
      <div className="flex flex-col gap-3">
        <Field label="Bracket name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="text-xs text-muted">Select {isTeam ? "teams" : "players"} in seeding order (top seed first). Byes are added automatically for uneven counts.</p>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {options.map((o) => {
            const idx = selected.indexOf(o.id);
            return (
              <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                <input type="checkbox" checked={idx >= 0} onChange={() => toggle(o.id)} className="h-4 w-4 accent-[var(--primary)]" />
                <span className="flex-1 font-medium">{o.label}</span>
                {idx >= 0 && <span className="text-xs text-muted">seed {idx + 1}</span>}
              </label>
            );
          })}
          {options.length === 0 && <p className="py-4 text-center text-sm text-muted">No {isTeam ? "teams" : "players"} available.</p>}
        </div>
      </div>
    </Modal>
  );
}
