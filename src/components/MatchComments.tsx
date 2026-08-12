"use client";

import { useState } from "react";
import useSWR from "swr";
import { Trash2, Send } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/client/api";
import { Button, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/client/format";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { userId: string; name: string };
  isMine: boolean;
  canDelete: boolean;
};

/**
 * A self-contained comment thread for a match. `basePath` is the match's API
 * base — `/api/matches/<id>` (tournament) or `/api/casual-matches/<id>`
 * (casual); comments live at `<basePath>/comments`. Access is enforced server-
 * side, so the component simply renders whatever the API returns.
 */
export function MatchComments({ basePath }: { basePath: string }) {
  const toast = useToast();
  const key = `${basePath}/comments`;
  const { data, isLoading, mutate } = useSWR<Comment[]>(key, swrFetcher);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const comments = data ?? [];

  async function post() {
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    try {
      await api.post(key, { body: text });
      setBody("");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not post comment");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`${key}/${id}`);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete comment");
    }
  }

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      {isLoading && <p className="text-xs text-muted">Loading comments…</p>}
      {!isLoading && comments.length === 0 && (
        <p className="text-xs text-muted">No comments yet — start the conversation.</p>
      )}
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs">
                  <span className="font-medium text-foreground">{c.author.name}</span>
                  <span className="text-muted"> · {formatDateTime(c.createdAt)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{c.body}</p>
              </div>
              {c.canDelete && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label="Delete comment"
                  className="shrink-0 text-muted transition hover:text-[var(--danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-end gap-2">
        <Textarea
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
          }}
          placeholder="Add a comment…"
          className="min-h-[38px] resize-y"
        />
        <Button size="sm" onClick={post} loading={posting} disabled={!body.trim()} aria-label="Post comment">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
