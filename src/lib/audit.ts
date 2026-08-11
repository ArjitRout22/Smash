import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditInput = {
  actorUserId?: string | null;
  action: string; // e.g. "match.score.updated"
  entityType: string; // e.g. "Match"
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
};

/**
 * Record an important change. Accepts a transaction client so audit rows are
 * committed atomically with the change they describe.
 */
export async function audit(input: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousValue: (input.previousValue ?? undefined) as Prisma.InputJsonValue,
      newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue,
    },
  });
}
