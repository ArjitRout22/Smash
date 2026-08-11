import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient per process. This matters in BOTH environments:
//  - dev: avoids exhausting connections across hot-reloads.
//  - prod (serverless): each warm Vercel instance reuses one client (and its
//    connection pool) across invocations instead of opening a fresh pool every
//    request. Combined with a POOLED database URL (Neon `-pooler`/pgbouncer),
//    this prevents the connection-exhaustion + latency that surfaces as slow
//    pages and intermittent 500s under load.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

globalForPrisma.prisma = prisma;

export type { Prisma } from "@prisma/client";
