import { route, readJson, type RouteContext } from "@/lib/api/handler";
import { ok, created } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/authorize";
import { CreateCommentSchema } from "@/lib/validation/schemas";
import { listComments, addComment } from "@/lib/services/comment.service";

type Ctx = RouteContext<{ id: string }>;

// Chat between two CONNECTED players (access enforced in comment.service).
export const GET = route<{ id: string }>(async (_req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  return ok(await listComments(actor, "play_request", id));
});

export const POST = route<{ id: string }>(async (req, { params }: Ctx) => {
  const actor = await requireUser();
  const { id } = await params;
  const input = CreateCommentSchema.parse(await readJson(req));
  return created(await addComment(actor, "play_request", id, input));
});
