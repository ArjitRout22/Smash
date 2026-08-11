"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/client/api";
import { Card, CardHeader, Button, Input, Textarea, Select, Field } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/AuthProvider";
import { PERMS } from "@/lib/client/perms";
import { TOURNAMENT_STATUSES } from "@/lib/domain/constants";
import { titleCase } from "@/lib/client/format";
import type { TournamentDetail } from "./types";

export function SettingsTab({ tournament, onChanged }: { tournament: TournamentDetail; onChanged: () => void }) {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const canEdit = can(PERMS.TOURNAMENT_EDIT);
  const canDelete = can(PERMS.TOURNAMENT_DELETE);

  const [form, setForm] = useState({
    name: tournament.name,
    description: tournament.description ?? "",
    location: tournament.location ?? "",
    status: tournament.status,
    visibility: tournament.visibility,
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!canEdit && !canDelete) {
    return <Card className="p-6"><p className="text-sm text-muted">You don&apos;t have permission to edit this tournament.</p></Card>;
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/tournaments/${tournament.id}`, {
        name: form.name,
        description: form.description || null,
        location: form.location || null,
        status: form.status,
        visibility: form.visibility,
      });
      toast.success("Saved");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.del(`/api/tournaments/${tournament.id}`);
      toast.success("Tournament deleted");
      router.push("/tournaments");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader title="Tournament settings" subtitle="Status changes follow allowed transitions (e.g. draft → upcoming → ongoing → completed)." />
          <div className="space-y-4 p-5">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {TOURNAMENT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
              <Field label="Visibility" hint="Public = discoverable + accepts join requests.">
                <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </Select>
              </Field>
            </div>
            <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="flex justify-end">
              <Button onClick={save} loading={saving} disabled={form.name.trim().length < 2}>Save changes</Button>
            </div>
          </div>
        </Card>
      )}

      {canDelete && (
        <Card className="border-[var(--danger)]/40">
          <CardHeader title="Danger zone" />
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="font-medium">Delete tournament</p>
              <p className="text-sm text-muted">Soft-deletes the tournament and hides it from listings.</p>
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this tournament?"
        message="It will be removed from listings. This action can only be reversed by an administrator."
        confirmLabel="Delete tournament"
        danger
        loading={deleting}
      />
    </div>
  );
}
