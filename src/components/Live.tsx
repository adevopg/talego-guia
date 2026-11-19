import { crimes } from "@/lib/queries";
import { crimeOfNpc, number } from "@/lib/model";
import { counts, liveConfigured, prisons, topCharacters } from "@/lib/live";
import { Badge, Level, Panel } from "@/components/ui";

/**
 * The live side, from the server's own MySQL.
 *
 * It is the only thing on these pages that can be slow or missing, so it streams
 * in on its own and says plainly when it is off. The guide is complete without
 * it: the catalogue does not need a database to be read.
 *
 * `no-store` because the point of it is to be current. Everything else in the
 * guide comes out of a file that only changes when somebody re-exports the map.
 */
export const dynamic = "force-dynamic";

export default async function Live() {
  if (!liveConfigured) {
    return (
      <Panel title="En vivo" className="mb-8">
        <div className="px-4 py-3 text-[13px] leading-relaxed text-faint">
          <p>
            La parte en vivo está apagada. Para encenderla, pon estas variables
            y reinicia:
          </p>
          <pre className="mt-2 overflow-x-auto rounded border border-line bg-ink-sunken p-2.5 font-mono text-[11px] text-dim">
{`PRISON_MYSQL_HOST=127.0.0.1
PRISON_MYSQL_USER=guia
PRISON_MYSQL_PASSWORD=…
PRISON_MYSQL_DATABASE=prison`}
          </pre>
          <p className="mt-2">
            La guía lee de ahí solo nombres, niveles y cuentas. No toca la tabla
            de cuentas para nada que no sea contarlas, y ninguna consulta trae
            un hash de contraseña.
          </p>
        </div>
      </Panel>
    );
  }

  const [top, howMany, servers] = await Promise.all([
    topCharacters(10),
    counts(),
    prisons(),
  ]);
  const everyCrime = crimes();

  if (!top.length && !howMany) {
    return (
      <Panel title="En vivo" className="mb-8">
        <p className="px-4 py-3 text-[13px] text-faint">
          No se pudo hablar con MySQL. La guía sigue entera: todo lo demás sale
          de un fichero.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="En vivo"
      note={
        howMany
          ? `${number(howMany.characters)} personajes · ${number(howMany.accounts)} cuentas`
          : undefined
      }
      className="mb-8"
    >
      <div className="grid gap-x-6 gap-y-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <div>
          <p className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">
            Los personajes de más nivel
          </p>
          {top.length === 0 ? (
            <p className="text-[13px] text-faint">Todavía no hay ninguno.</p>
          ) : (
            <ol className="space-y-0.5">
              {top.map((character, index) => {
                const crime =
                  character.crime != null
                    ? crimeOfNpc(character.crime, everyCrime)
                    : undefined;
                return (
                  <li
                    key={`${character.name}-${index}`}
                    className="flex items-baseline gap-2 text-[13px]"
                  >
                    <span className="tnum w-5 shrink-0 text-right font-mono text-[11px] text-faint">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text">
                      {character.name}
                    </span>
                    {crime && (
                      <span className="hidden text-[11px] text-faint sm:block">
                        {crime.male_name}
                      </span>
                    )}
                    <Level value={character.level} />
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">
            Prisiones
          </p>
          {servers.length === 0 ? (
            <p className="text-[13px] text-faint">Ninguna declarada.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {servers.map((server) => (
                <li key={server.id}>
                  <Badge tone={server.flag ? "green" : "neutral"}>
                    {server.name ?? `prisión ${server.id}`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-snug text-faint">
            El puerto del mundo es 25000 más el id de la prisión; el login, el
            25666.
          </p>
        </div>
      </div>
    </Panel>
  );
}
