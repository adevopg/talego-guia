import mysql from "mysql2/promise";

/**
 * The live side: the server's own MySQL.
 *
 * Everything else in this guide comes out of a file and cannot change while
 * somebody is reading it. This can, which makes it a different kind of thing and
 * is why it lives apart from `db.ts`.
 *
 * Three rules it keeps:
 *
 * 1. **It is optional.** Without `PRISON_MYSQL_*` set, every function here
 *    returns nothing and the pages that use it say the live side is off. A guide
 *    whose item pages break because a database is down is a bad guide.
 * 2. **It never reads a credential.** The queries below select names, levels and
 *    counts. They do not touch `accounts`, and a password hash is never in a
 *    projection — the server's own notes make the same point about its login
 *    path, and the reason is the same: a hash that is never loaded cannot be
 *    leaked by this process.
 * 3. **It fails quietly.** A short connect timeout and a caught error, because
 *    this is a sidebar on a page about objects, not the page.
 */

const settings = {
  host: process.env.PRISON_MYSQL_HOST,
  port: Number(process.env.PRISON_MYSQL_PORT ?? 3306),
  user: process.env.PRISON_MYSQL_USER,
  password: process.env.PRISON_MYSQL_PASSWORD,
  database: process.env.PRISON_MYSQL_DATABASE ?? "prison",
};

export const liveConfigured = Boolean(
  settings.host && settings.user && settings.database,
);

const globalForPool = globalThis as unknown as { prisonPool?: mysql.Pool };

function pool(): mysql.Pool | undefined {
  if (!liveConfigured) return undefined;
  return (globalForPool.prisonPool ??= mysql.createPool({
    ...settings,
    waitForConnections: true,
    connectionLimit: 4,
    // A page must not hang on a server that is not there.
    connectTimeout: 2500,
    // Read-only work, so nothing here needs a transaction.
    namedPlaceholders: false,
  }));
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const handle = pool();
  if (!handle) return [];
  try {
    const [rows] = await handle.query(sql, params);
    return rows as T[];
  } catch {
    // Nothing a reader can do about it, and nothing worth breaking the page for.
    return [];
  }
}

export interface LiveCharacter {
  name: string;
  level: number;
  crime: number | null;
  prison: number | null;
}

/**
 * The top characters.
 *
 * The column names are not guessed at run time: anything missing makes the
 * query fail and `query` returns nothing, which the page already handles. The
 * schema is the emulator's, so a different deployment may name these otherwise
 * — adjust here and nowhere else.
 */
export async function topCharacters(limit = 20): Promise<LiveCharacter[]> {
  return query<LiveCharacter>(
    `select name, level, crime, prison
       from characters
      where level > 0
      order by level desc, name asc
      limit ?`, [limit]);
}

export interface LivePrison {
  id: number;
  name: string | null;
  flag: number | null;
}

export async function prisons(): Promise<LivePrison[]> {
  return query<LivePrison>(
    "select id, name, flag from game_servers order by id");
}

export interface LiveCounts {
  characters: number;
  accounts: number;
}

/** How big the server is, as two numbers and nothing identifying anybody. */
export async function counts(): Promise<LiveCounts | undefined> {
  const [characters] = await query<{ n: number }>(
    "select count(*) as n from characters");
  const [accounts] = await query<{ n: number }>(
    "select count(*) as n from accounts");
  if (!characters && !accounts) return undefined;
  return { characters: characters?.n ?? 0, accounts: accounts?.n ?? 0 };
}
