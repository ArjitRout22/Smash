"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/client/api";
import { PageHeader } from "@/components/ui/states";
import { Card, Button, Input, Textarea, Select, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { TOURNAMENT_FORMATS } from "@/lib/domain/constants";
import { titleCase } from "@/lib/client/format";

export default function CreateTournamentPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    location: "",
    startDate: "",
    endDate: "",
    format: "singles",
    visibility: "private",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        format: form.format,
        visibility: form.visibility,
      };
      const t = await api.post<{ id: string }>("/api/tournaments", body);
      toast.success("Tournament created");
      router.push(`/tournaments/${t.id}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not create tournament");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create tournament" subtitle="Set up a new event. You can add players, stages and matches next." />
      <Card className="p-6">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Field label="Tournament name" htmlFor="name" required>
            <Input id="name" value={form.name} onChange={set("name")} placeholder="Summer Club Championship" required minLength={2} autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Format" htmlFor="format" hint="Singles uses players; doubles/mixed use teams.">
              <Select id="format" value={form.format} onChange={set("format")}>
                {TOURNAMENT_FORMATS.map((f) => <option key={f} value={f}>{titleCase(f)}</option>)}
              </Select>
            </Field>
            <Field label="Visibility" htmlFor="visibility" hint="Public tournaments appear in Discover and accept join requests.">
              <Select id="visibility" value={form.visibility} onChange={set("visibility")}>
                <option value="private">Private (only your workspace)</option>
                <option value="public">Public (discoverable + joinable)</option>
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" value={form.description} onChange={set("description")} placeholder="Optional details about the event…" />
          </Field>
          <Field label="Location" htmlFor="location">
            <Input id="location" value={form.location} onChange={set("location")} placeholder="City Sports Arena, Court 3" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="startDate">
              <Input id="startDate" type="date" value={form.startDate} onChange={set("startDate")} />
            </Field>
            <Field label="End date" htmlFor="endDate">
              <Input id="endDate" type="date" value={form.endDate} onChange={set("endDate")} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" loading={loading} disabled={form.name.trim().length < 2}>Create tournament</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
