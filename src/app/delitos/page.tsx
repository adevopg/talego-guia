import Link from "next/link";
import type { Metadata } from "next";
import { all } from "@/lib/db";
import { crimes } from "@/lib/queries";
import { PageHead, Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Delitos" };

/**
 * The twelve crimes a player can be in for, and what each one starts with.
 *
 * All of it is out of the client's own CLASSINFO — the table the live server
 * sends before it lets anybody in — and not out of a database. The one thing
 * CLASSINFO does not carry is the items a crime starts the game with: the
 * client is never told those.
 */
export default async function Delitos() {
  const everyCrime = crimes();
  const stats = all<{ crime_id: number; name: string; initial: number }>(
    "select crime_id, name, initial from crime_characteristic order by crime_id, stat_id");
  const names = all<{ name: string }>(
    "select name from characteristic order by id").map((row) => row.name);

  const byCrime = new Map<number, Map<string, number>>();
  for (const row of stats) {
    const map = byCrime.get(row.crime_id) ?? new Map();
    map.set(row.name, row.initial);
    byCrime.set(row.crime_id, map);
  }

  return (
    <>
      <PageHead eyebrow="personajes" title="Delitos">
        Los doce delitos con los que se entra, con lo que cada uno trae de
        serie. Todo sale del CLASSINFO del cliente, que es la tabla que el
        servidor manda antes de dejar entrar a nadie.
      </PageHead>

      <Panel title="Atributos iniciales" note="el tope es 250 para todos">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wide text-faint uppercase">
                <th className="px-4 py-2 font-medium">Delito</th>
                {names.map((name) => (
                  <th key={name} className="px-2 py-2 text-right font-medium">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {everyCrime.map((crime) => {
                const row = byCrime.get(crime.id);
                const top = Math.max(...names.map((name) => row?.get(name) ?? 0));
                return (
                  <tr
                    key={crime.id}
                    className="border-b border-line-soft last:border-0 hover:bg-ink-raised"
                  >
                    <td className="px-4 py-1.5">
                      <Link
                        href={`/delitos/${crime.id}`}
                        className="text-text hover:text-amber"
                      >
                        {crime.male_name}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-faint">
                        {crime.abbreviation}
                      </span>
                    </td>
                    {names.map((name) => {
                      const value = row?.get(name) ?? 0;
                      return (
                        <td
                          key={name}
                          className={`tnum px-2 py-1.5 text-right font-mono ${
                            value === top ? "text-amber" : "text-dim"
                          }`}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-snug text-faint">
          El valor más alto de cada fila va en ámbar. El tope no es por delito:
          en la tabla es 0 en todas las filas y el 250 que muestra el editor es
          el mismo para cada atributo, así que solo el número inicial es dato.
        </p>
      </Panel>
    </>
  );
}
