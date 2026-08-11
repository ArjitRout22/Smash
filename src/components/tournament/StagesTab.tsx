"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, GitBranch, Layers } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Card, Button, Badge, statusColor, Select, Input, Field } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { STAGE_TYPES } from "@/lib/domain/constants";
import { titleCase } from "@/lib/client/format";
import type { StageDTO, TournamentPlayerDTO, TeamDTO } from "./types";

export function StagesTab({ tournamentId, format }: { tournamentId: string; format: string }) {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [bracket, setBracket] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<StageDTO[]>(
    `/api/tournaments/${tournamentId}/stages`,
    swrFetcher
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        {can(PERMS.STAGE_MANAGE) && (
          <>
            <Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add stage</Button>
            <Button onClick={() => setBracket(true)}><GitBranch className="h-4 w-4" /> Generate bracket</Button>
          </>
        )}
      </div>

      {isLoading && <ListSkeleton rows={3} />}
      {error && <ErrorState onRetry={() => mutate()} />}
      {data && data.length === 0 && (
        <EmptyState
          title="No stages yet"
          message="Add stages manually (Group, Quarterfinal…) or generate a single-elimination bracket."
          icon={Layers}
        />
      )}

      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((s) => (
            <Card key={s.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">{s.order + 1}</span>
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted">{titleCase(s.type)} · {s._count.matches} matches</p>
                </div>
              </div>
              <Badge color={statusColor(s.status)}>{titleCase(s.status)}</Badge>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateStageModal tournamentId={tournamentId} onClose={() => setCreating(false)} onCreated={() => { mutate(); }} />
      )}
      {bracket && (
        <GenerateBracketModal tournamentId={tournamentId} format={format} onClose={() => setBracket(false)} onDone={() => { mutate(); }} />
      )}
    </div>
  );
}

function CreateStageModal({ tournamentId, onClose, onCreated }: { tournamentId: string; onClose: () => void; onCreated: () => void }) {
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

function GenerateBracketModal({ tournamentId, format, onClose, onDone }: { tournamentId: string; format: string; onClose: () => void; onDone: () => void }) {
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
