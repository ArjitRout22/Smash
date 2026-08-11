import { z } from "zod";

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z.string().max(50).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type Pagination = z.infer<typeof PaginationQuery>;

export function parsePagination(searchParams: URLSearchParams): Pagination {
  return PaginationQuery.parse(Object.fromEntries(searchParams.entries()));
}

export function paginationMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasNext: page * pageSize < total,
    hasPrev: page > 1,
  };
}

export function skipTake(p: Pick<Pagination, "page" | "pageSize">) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}
