import { route, type RouteContext } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { deleteComment } from "@/lib/services/comment.service";

type Ctx = RouteContext<{ id: string; commentId: string }>;

// Delete a casual-match comment (author, or a platform admin).
export const DELETE = route<{ id: string; commentId: string }>(async (_req, { params }: Ctx) => {
  const actor = await requireUser();
  const { commentId } = await params;
  return ok(await deleteComment(actor, commentId));
});
