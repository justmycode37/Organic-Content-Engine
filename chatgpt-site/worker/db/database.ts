export type Db = D1Database;
export type Row = Record<string, unknown>;

/** Rows changed by a write. D1 has no interactive transactions; atomic groups go through `batch`. */
export const changed = (result: D1Result): number => Number(result.meta.changes ?? 0);
