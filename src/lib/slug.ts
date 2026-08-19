import { prisma } from "@/lib/db/prisma";

/**
 * Turn arbitrary text into a URL-safe slug fragment: lowercase, ASCII words
 * joined by single hyphens, trimmed. Returns "" for input with no usable chars.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * A tournament slug that is unique across the table. Bases it on the name and,
 * on collision (or empty base), appends a short numeric suffix. `prisma` may be
 * a transaction client so this can run inside the create transaction.
 */
export async function uniqueTournamentSlug(
  name: string,
  db: { tournament: { findFirst: (a: unknown) => Promise<{ id: string } | null> } } = prisma as never,
): Promise<string> {
  const base = slugify(name) || "tournament";
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const clash = await db.tournament.findFirst({ where: { slug: candidate }, select: { id: true } } as never);
    if (!clash) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  // Extremely unlikely fallback: guaranteed-unique random suffix.
  return `${base}-${Math.abs(hashString(name + candidate)).toString(36).slice(0, 6)}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
