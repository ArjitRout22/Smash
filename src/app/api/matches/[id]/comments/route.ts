import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { CreateCommentSchema } from "@/lib/validation/schemas";
import { listComments, addComment } from "@/lib/services/comment.service";

type Ctx = RouteContext<{ id: string }>;

// Comments on a tournament match. Read/post allowed for anyone who can view the
// tournament (owner, public, or a participant) — enforced in the service.
export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  return ok(await listComments(actor, "match", id));
});

export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  const input = CreateCommentSchema.parse(await readJson(req));
  return created(await addComment(actor, "match", id, input));
});
