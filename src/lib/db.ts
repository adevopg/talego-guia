import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

/**
 * The guide's database, opened read-only.
 *
 * It is a build artefact: `scripts/build-db.mjs` makes it from what
 * `guide-export` read out of the server's own `*.gamedata`. Nothing in the web
 * app writes to it, and nothing in it is user data — so it is opened read-only
 * and kept open for the life of the process.
 *
 * `node:sqlite` rather than a native module on purpose: it ships with Node, so
 * there is nothing to compile, nothing to rebuild when Node moves, and no
 * install script to approve. Node 26 carries SQLite 3.54 with FTS5 and the
 * `remove_diacritics 2` tokenizer, which is what makes "pantalon" find
 * "pantalón".
 */
const file = resolve(process.cwd(), "data/prison.db");

/**
 * Hot reload in development re-evaluates this module on every edit, and each
 * evaluation would open another handle. Hanging the one connection off the
 * global keeps it to one.
 */
const globalForDb = globalThis as unknown as { prisonDb?: DatabaseSync };

function open(): DatabaseSync {
  const db = new DatabaseSync(file, { readOnly: true });
  // Reads only, so there is nothing to protect against a crash mid-write; this
  // is purely to stop SQLite doing work it does not need to.
  db.exec("pragma query_only = true");
  db.exec("pragma cache_size = -32000");
  return db;
}

export const db = (globalForDb.prisonDb ??= open());

/** Every row of a query, typed by the caller. */
export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

/** The first row, or undefined. */
export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

/** A single value out of a one-column, one-row query. */
export function scalar<T>(sql: string, ...params: unknown[]): T | undefined {
  const row = one<Record<string, T>>(sql, ...params);
  return row ? Object.values(row)[0] : undefined;
}

/**
 * What the build put in `meta`: the counts, when it ran, which map it was made
 * from. The home page and the footer say so, because a guide that does not name
 * its source is asking to be believed rather than checked.
 */
export function meta(): Record<string, string> {
  const rows = all<{ key: string; value: string }>("select key, value from meta");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
