import Link from "next/link";
import type { Metadata } from "next";
import { all } from "@/lib/db";
import { levelBand, number } from "@/lib/model";
import type { Room } from "@/lib/model";
import { Badge, Empty, PageHead, Panel, RoomView } from "@/components/ui";

export const metadata: Metadata = { title: "Salas" };

type Listed = Room & {
  bots: number;
  interior: number;
  parent_label: string | null;
};

/**
 * Every room in the prison.
 *
 * The rooms are grouped by where they sit: the ones with a place on the floor
 * plan first, then the insides — the cells and the dungeons, which are only
 * reachable through a numbered door of another room and which the game's own 2D
 * map collapses into their module — and last the ones no door reaches at all.
 */
export default async function Salas() {
  const rows = all<Listed>(`
    select r.*,
           (select count(*) from placed_bot p where p.room_id = r.id) as bots,
           (select count(*) from room c where c.parent_room = r.id) as interior,
           (select label from room p where p.id = r.parent_room) as parent_label
      from room r
     order by r.label collate nocase`);

  const onPlan = rows.filter((row) => row.grid_cluster != null);
  const inside = rows.filter((row) => row.grid_cluster == null && row.parent_room != null);
  const loose = rows.filter((row) => row.grid_cluster == null && row.parent_room == null);

  return (
    <>
      <PageHead eyebrow="la cárcel" title="Salas">
        {number(rows.length)} salas y {number(2194)} puertas, de MAPINFO, que es
        la tabla que el cliente recibe. Las 64 puertas de celda de un módulo
        están ahí y no en el{" "}
        <code className="font-mono text-dim">*.gamedata</code>, que es de la v7.
      </PageHead>

      <div className="space-y-6">
        <Group
          title="En el plano"
          note={`${onPlan.length} salas que alguna puerta cardinal alcanza`}
          rows={onPlan}
        />
        <Group
          title="Interiores"
          note={`${inside.length} celdas y calabozos, dentro de otra sala`}
          rows={inside}
          showParent
        />
        {loose.length > 0 && (
          <Group
            title="Sin acceso"
            note={`${loose.length} salas a las que no llega ninguna puerta`}
            rows={loose}
          />
        )}
      </div>
    </>
  );
}

function Group({
  title, note, rows, showParent = false,
}: {
  title: string;
  note: string;
  rows: Listed[];
  showParent?: boolean;
}) {
  return (
    <Panel title={title} note={note}>
      {rows.length === 0 ? (
        <Empty>Ninguna.</Empty>
      ) : (
        <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/salas/${row.id}`}
                className="group flex gap-3 rounded border border-line-soft bg-ink-raised/60 p-2 hover:border-amber-dim"
              >
                {row.views > 0 ? (
                  <RoomView
                    scene={row.scene}
                    view={1}
                    thumb
                    alt=""
                    className="h-14 w-20 shrink-0 rounded"
                  />
                ) : (
                  <span className="h-14 w-20 shrink-0 rounded bg-ink-sunken" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text group-hover:text-amber">
                    {row.label || <span className="text-faint">sin etiqueta</span>}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-faint">
                    {row.scene}
                    {showParent && row.parent_label && ` · en ${row.parent_label}`}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {levelBand(row) && (
                      <Badge tone="red">nivel {levelBand(row)}</Badge>
                    )}
                    {row.is_safe_zone === 1 && <Badge tone="green">segura</Badge>}
                    {row.bots > 0 && <Badge tone="amber">{row.bots} NPC</Badge>}
                    {row.interior > 0 && (
                      <Badge tone="blue">{row.interior} dentro</Badge>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
