"use client";

import { useState } from "react";
import useSWR from "swr";
import { Handshake, MessageSquare } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Card, CardHeader, Button, Badge } from "@/components/ui/primitives";
import { MatchComments } from "@/components/MatchComments";
import { useToast } from "@/components/ui/Toast";

type Party = { id: string; displayName: string };
type Req = { id: string; status: string; note: string | null; createdAt: string; other: Party };
type Inbox = { incoming: Req[]; connected: Req[]; outgoing: Req[] };

/**
 * Incoming "let's play" requests (accept / decline) and connected players you can
 * message. Chat reuses the polymorphic comment thread, so it adds no new store.
 */
export function PlayRequests() {
  const toast = useToast();
  const { data, mutate } = useSWR<Inbox>("/api/play-requests", swrFetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [openChat, setOpenChat] = useState<string | null>(null);

  if (!data) return null;
  const { incoming, connected } = data;
  if (incoming.length === 0 && connected.length === 0) return null;

  async function act(id: string, action: "accept" | "decline", msg: string) {
    setBusy(id);
    try {
      await api.post(`/api/play-requests/${id}`, { action });
      toast.success(msg);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6 border-[var(--primary)]/40">
      <CardHeader title={<span className="flex items-center gap-2"><Handshake className="h-4 w-4" /> Play requests</span>} />
      <div className="divide-y divide-[var(--border)]">
        {incoming.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.other.displayName} wants to play</p>
              {r.note && <p className="truncate text-xs text-muted">“{r.note}”</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" loading={busy === r.id} onClick={() => act(r.id, "accept", "Connected — say hi!")}>Accept</Button>
              <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, "decline", "Request declined")}>Decline</Button>
            </div>
          </div>
        ))}

        {connected.map((r) => (
          <div key={r.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{r.other.displayName} <Badge color="green">Connected</Badge></p>
              <button
                type="button"
                onClick={() => setOpenChat(openChat === r.id ? null : r.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-foreground transition hover:bg-surface-2"
              >
                <MessageSquare className="h-4 w-4 text-muted" /> {openChat === r.id ? "Hide chat" : "Message"}
              </button>
            </div>
            {openChat === r.id && <MatchComments basePath={`/api/play-requests/${r.id}`} />}
          </div>
        ))}
      </div>
    </Card>
  );
}
