import { NextResponse } from "next/server";
import { search } from "@/lib/queries";

/**
 * What the search box talks to.
 *
 * FTS5 over the whole guide — items, NPCs, rooms, vendors and the named
 * recipes — with the `remove_diacritics 2` tokenizer, so "pantalon" finds
 * "pantalón" and "municion" finds "munición". That matters more in Spanish than
 * it sounds: most of the catalogue carries an accent somewhere.
 *
 * The query is quoted and prefixed inside `search()`, so nothing a reader types
 * reaches FTS5 as syntax.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(40, Math.max(1, Number(searchParams.get("n")) || 20));

  if (q.trim().length < 2) return NextResponse.json({ hits: [] });

  try {
    return NextResponse.json({ hits: search(q, limit) });
  } catch {
    // A malformed FTS expression should not be a 500 on every keystroke.
    return NextResponse.json({ hits: [] });
  }
}
