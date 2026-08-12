import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";
import { isPlatformAdmin } from "@/lib/auth/tenancy";
import { loadViewableTournament } from "@/lib/services/tournament.service";
import type { CreateCommentInput } from "@/lib/validation/schemas";

/**
 * Match comments — a lightweight discussion thread shared by tournament matches
 * ("match") and casual matches ("casual_match"). Access mirrors the rules for
 * viewing the underlying match:
 *  - tournament match: anyone who can VIEW the tournament (owner, public, or a
 *    participant) may read + post; the organizer/creator or a platform admin may
 *    moderate (delete) any comment.
 *  - casual match: only the (up to four) participants may read + post; a platform
 *    admin may moderate. In both cases you can always delete your own comment.
 */

export type CommentEntityType = "match" | "casual_match";

function assertEntityType(t: string): CommentEntityType {
  if (t === "match" || t === "casual_match") return t;
  throw Errors.validation("Unknown comment thread");
}

type Access = { canModerate: boolean };

async function assertCommentAccess(
  actor: AuthUser,
  entityType: CommentEntityType,
  entityId: string
): Promise<Access> {
  if (entityType === "match") {
    const m = await prisma.match.findFirst({
      where: { id: entityId, deletedAt: null },
      select: {
        tournamentId: true,
        tournament: { select: { organizerId: true, createdById: true } },
      },
    });
    if (!m) throw Errors.notFound("Match");
    // Throws unless the actor may view the tournament (owner / public / participant).
    await loadViewableTournament(actor, m.tournamentId);
    const canModerate =
      isPlatformAdmin(actor) ||
      actor.id === m.tournament.organizerId ||
      actor.id === m.tournament.createdById;
    return { canModerate };
  }

  // casual_match — only the (up to four) participants; don't reveal others.
  const c = await prisma.casualMatch.findUnique({
    where: { id: entityId },
    select: {
      challengerUserId: true,
      opponentUserId: true,
      challengerPartnerUserId: true,
      opponentPartnerUserId: true,
    },
  });
  if (!c) throw Errors.notFound("Match");
  const participants = [
    c.challengerUserId,
    c.opponentUserId,
    c.challengerPartnerUserId,
    c.opponentPartnerUserId,
  ];
  if (!participants.includes(actor.id)) throw Errors.notFound("Match");
  return { canModerate: isPlatformAdmin(actor) };
}

const authorSelect = {
  select: { id: true, name: true, player: { select: { displayName: true } } },
} as const;

type RawComment = {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: Date;
  author: { id: string; name: string | null; player: { displayName: string } | null };
};

function serialize(c: RawComment, actor: AuthUser, canModerate: boolean) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    author: {
      userId: c.authorUserId,
      name: c.author.player?.displayName ?? c.author.name ?? "Unknown",
    },
    isMine: c.authorUserId === actor.id,
    canDelete: c.authorUserId === actor.id || canModerate,
  };
}

export type CommentDTO = ReturnType<typeof serialize>;

export async function listComments(
  actor: AuthUser,
  entityType: CommentEntityType,
  entityId: string
): Promise<CommentDTO[]> {
  const { canModerate } = await assertCommentAccess(actor, entityType, entityId);
  const comments = await prisma.matchComment.findMany({
    where: { entityType, entityId, deletedAt: null },
    include: { author: authorSelect },
    orderBy: { createdAt: "asc" },
  });
  return comments.map((c) => serialize(c, actor, canModerate));
}

export async function addComment(
  actor: AuthUser,
  entityType: CommentEntityType,
  entityId: string,
  input: CreateCommentInput
): Promise<CommentDTO> {
  const { canModerate } = await assertCommentAccess(actor, entityType, entityId);
  const created = await prisma.matchComment.create({
    data: { entityType, entityId, authorUserId: actor.id, body: input.body },
    include: { author: authorSelect },
  });
  await audit({
    actorUserId: actor.id,
    action: "match_comment.created",
    entityType: "MatchComment",
    entityId: created.id,
    newValue: { threadType: entityType, threadId: entityId },
  });
  return serialize(created, actor, canModerate);
}

export async function deleteComment(actor: AuthUser, id: string): Promise<{ deleted: true }> {
  const c = await prisma.matchComment.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw Errors.notFound("Comment");
  const { canModerate } = await assertCommentAccess(
    actor,
    assertEntityType(c.entityType),
    c.entityId
  );
  if (c.authorUserId !== actor.id && !canModerate) {
    throw Errors.forbidden("You can only delete your own comments.");
  }
  await prisma.matchComment.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    actorUserId: actor.id,
    action: "match_comment.deleted",
    entityType: "MatchComment",
    entityId: id,
  });
  return { deleted: true };
}
