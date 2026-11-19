import { all, one } from "./db";
import type {
  ArticleKind, Crime, Item, ItemMod, Npc, Room,
} from "./model";

/**
 * Every query the guide makes, in one place.
 *
 * They are written out rather than generated so that what a page costs is
 * readable: the catalogue is 11 240 items and 2 874 NPCs in a 12 MB file, so a
 * query that touches the right index answers in well under a millisecond and a
 * page needs no cache in front of it.
 */

// MARK: - Crimes, which almost every other page needs

export function crimes(): Crime[] {
  return all<Crime>("select * from crime order by id");
}

// MARK: - Items

export interface ItemFilter {
  q?: string;
  grupo?: string;
  tipo?: number;
  nivelMin?: number;
  nivelMax?: number;
  delito?: number;
  conMod?: boolean;
  orden?: string;
  pagina?: number;
  porPagina?: number;
}

const ITEM_ORDERS: Record<string, string> = {
  nombre: "i.name collate nocase asc",
  nivel: "i.level desc, i.name collate nocase asc",
  "nivel-asc": "i.level asc, i.name collate nocase asc",
  precio: "i.price desc, i.name collate nocase asc",
  "precio-asc": "i.price asc, i.name collate nocase asc",
  peso: "i.weight desc, i.name collate nocase asc",
  id: "i.id asc",
};

/**
 * The catalogue, filtered.
 *
 * When there is something typed, the filter goes through FTS5 and the order
 * follows the match's rank unless the reader asked for another; with nothing
 * typed it is a plain indexed scan.
 */
export function items(filter: ItemFilter): { rows: Item[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  let from = "item i";

  const q = filter.q?.trim();
  if (q) {
    from = `item i join search s on s.ref = i.id and s.kind = 'objeto'`;
    where.push("search match ?");
    params.push(ftsQuery(q));
  }
  if (filter.grupo) { where.push("i.grp = ?"); params.push(filter.grupo); }
  if (filter.tipo != null) { where.push("i.type = ?"); params.push(filter.tipo); }
  if (filter.nivelMin != null) { where.push("i.level >= ?"); params.push(filter.nivelMin); }
  if (filter.nivelMax != null) { where.push("i.level <= ?"); params.push(filter.nivelMax); }
  if (filter.delito != null) {
    // Crime N is bit N−1 of the mask.
    where.push("(i.crime_mask & ?) <> 0");
    params.push(1 << (filter.delito - 1));
  }
  if (filter.conMod) {
    where.push("exists (select 1 from item_mod m where m.item_id = i.id)");
  }

  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const total = one<{ n: number }>(
    `select count(*) as n from ${from} ${clause}`, ...params)?.n ?? 0;

  const order = ITEM_ORDERS[filter.orden ?? ""]
    ?? (q ? "s.rank" : ITEM_ORDERS.nombre);
  const perPage = filter.porPagina ?? 60;
  const page = Math.max(1, filter.pagina ?? 1);

  const rows = all<Item>(
    `select i.* from ${from} ${clause} order by ${order} limit ? offset ?`,
    ...params, perPage, (page - 1) * perPage);

  return { rows, total };
}

export function item(id: number): Item | undefined {
  return one<Item>("select * from item where id = ?", id);
}

export function itemMods(id: number): ItemMod[] {
  return all<ItemMod>(
    `select * from item_mod where item_id = ?
      order by case kind when 'atributo' then 0 when 'habilidad' then 1 else 2 end,
               abs(value) desc`, id);
}

/**
 * The modifiers of a page of items, in one query.
 *
 * A list shows 60 items and each can carry up to ten modifiers. Asking per row
 * would be 60 statements; asking with a join would fan the list out and need
 * regrouping anyway. This asks once and groups once.
 */
export function modsByItem(ids: number[]): Map<number, ItemMod[]> {
  const out = new Map<number, ItemMod[]>();
  if (!ids.length) return out;
  const holes = ids.map(() => "?").join(",");
  const rows = all<ItemMod>(
    `select * from item_mod where item_id in (${holes})
      order by case kind when 'atributo' then 0 when 'habilidad' then 1 else 2 end,
               abs(value) desc`, ...ids);
  for (const row of rows) {
    const list = out.get(row.item_id);
    if (list) list.push(row);
    else out.set(row.item_id, [row]);
  }
  return out;
}

/** How many items there are in each group, for the filter bar's counts. */
export function itemGroupCounts(): { grp: string; n: number }[] {
  return all("select grp, count(*) as n from item group by grp order by n desc");
}

/** Every type that exists, with its label and how many items use it. */
export function itemTypes(): {
  type: number; label: string; label_source: string; grp: string; n: number;
}[] {
  return all(
    `select type, label, label_source, grp, count(*) as n
       from item group by type order by grp, label`);
}

// MARK: - Where an item comes from, and what it is for

export interface Dropper {
  id: number;
  name: string;
  level: number;
  value: number;
  places: number;
}

/**
 * Which NPCs carry the item. The second number in a loot row is a chance or a
 * quantity — the table does not say which — so it travels under its own name
 * and is not called either.
 *
 * `places` is how many rooms that NPC actually stands in, which is the
 * difference between "this exists on a bot somewhere" and "you can go and get
 * it".
 */
export function droppedBy(itemId: number): Dropper[] {
  return all<Dropper>(
    `select n.id, n.name, n.level, l.value,
            (select count(*) from placed_bot p where p.npc_id = n.id) as places
       from npc_loot l join npc n on n.id = l.npc_id
      where l.item_id = ?
      order by places desc, n.level asc, n.name collate nocase`, itemId);
}

export interface RecipeRow {
  id: number;
  name: string;
  kind: ArticleKind;
  level: number;
  skill: number;
  skill_name: string | null;
  supply_id: number;
  supply_name: string;
  vendor_note: string | null;
  quantity: number;
}

/** The recipes and purchases that hand the item over. */
export function madeBy(itemId: number): RecipeRow[] {
  return all<RecipeRow>(
    `select a.id, a.name, a.kind, a.level, a.skill, k.name as skill_name,
            s.id as supply_id, s.name as supply_name, s.vendor_note,
            r.quantity
       from article_result r
       join article a on a.id = r.article_id
       join supply s on s.id = a.supply_id
       left join skill k on k.id = a.skill
      where r.item_id = ?
      order by a.level asc, a.name collate nocase`, itemId);
}

/** The recipes that consume the item. */
export function usedIn(itemId: number): RecipeRow[] {
  return all<RecipeRow>(
    `select a.id, a.name, a.kind, a.level, a.skill, k.name as skill_name,
            s.id as supply_id, s.name as supply_name, s.vendor_note,
            g.quantity
       from article_ingredient g
       join article a on a.id = g.article_id
       join supply s on s.id = a.supply_id
       left join skill k on k.id = a.skill
      where g.item_id = ?
      order by a.level asc, a.name collate nocase`, itemId);
}

/** The crimes that start the game carrying it. */
export function startsWith(itemId: number): { id: number; male_name: string; quantity: number }[] {
  return all(
    `select c.id, c.male_name, k.quantity
       from crime_starting_item k join crime c on c.id = k.crime_id
      where k.item_id = ? order by c.id`, itemId);
}

/** What the item breaks into, and what breaks into it. */
export function breakage(it: Item): { into: Item | undefined; from: Item[] } {
  return {
    into: it.breaks_into ? item(it.breaks_into) : undefined,
    from: all<Item>(
      "select * from item where breaks_into = ? order by name collate nocase", it.id),
  };
}

// MARK: - Articles, which are the recipes

export interface ArticleDetail {
  id: number;
  supply_id: number;
  supply_name: string;
  vendor_note: string | null;
  idx: number;
  item_raw: number;
  level: number;
  service: number;
  gives_experience: number;
  skill: number;
  skill_name: string | null;
  name: string;
  crime_mask: number;
  text: number;
  text_es: string | null;
  text_en: string | null;
  kind: ArticleKind;
}

export function article(id: number): ArticleDetail | undefined {
  return one<ArticleDetail>(
    `select a.*, s.name as supply_name, s.vendor_note, k.name as skill_name
       from article a join supply s on s.id = a.supply_id
       left join skill k on k.id = a.skill
      where a.id = ?`, id);
}

export interface Part {
  item_id: number;
  quantity: number;
  name: string | null;
  icon: string | null;
  level: number | null;
  price: number | null;
}

export function ingredients(articleId: number): Part[] {
  return all<Part>(
    `select g.item_id, g.quantity, i.name, i.icon, i.level, i.price
       from article_ingredient g left join item i on i.id = g.item_id
      where g.article_id = ? order by g.rowid`, articleId);
}

export function results(articleId: number): Part[] {
  return all<Part>(
    `select r.item_id, r.quantity, i.name, i.icon, i.level, i.price
       from article_result r left join item i on i.id = r.item_id
      where r.article_id = ? order by r.rowid`, articleId);
}

export interface RecipeFilter {
  q?: string;
  kind?: ArticleKind;
  skill?: number;
  nivelMax?: number;
  pagina?: number;
  porPagina?: number;
}

/**
 * The recipe book. Only the ones with a real label are listed by default: the
 * table carries 12 094 articles whose name is `VOID`, which are the vendors'
 * own plumbing and not something a reader can look up.
 */
export function recipes(filter: RecipeFilter): {
  rows: (RecipeRow & { makes: string | null; wants: string | null })[];
  total: number;
} {
  const where: string[] = ["a.name not in ('', 'VOID', '<VOID>')"];
  const params: unknown[] = [];
  let from = "article a";

  const q = filter.q?.trim();
  if (q) {
    from = "article a join search s on s.ref = a.id and s.kind = 'receta'";
    where.push("search match ?");
    params.push(ftsQuery(q));
  }
  if (filter.kind) { where.push("a.kind = ?"); params.push(filter.kind); }
  else { where.push("a.kind in ('receta','compra','venta')"); }
  if (filter.skill != null) { where.push("a.skill = ?"); params.push(filter.skill); }
  if (filter.nivelMax != null) { where.push("a.level <= ?"); params.push(filter.nivelMax); }

  const clause = `where ${where.join(" and ")}`;
  const total = one<{ n: number }>(
    `select count(*) as n from ${from} ${clause}`, ...params)?.n ?? 0;

  const rows = all<RecipeRow & { makes: string | null; wants: string | null }>(
    `select a.id, a.name, a.kind, a.level, a.skill, k.name as skill_name,
            p.id as supply_id, p.name as supply_name, p.vendor_note,
            1 as quantity,
            (select group_concat(i.name, ', ') from article_result r
               left join item i on i.id = r.item_id where r.article_id = a.id) as makes,
            (select group_concat(i.name, ', ') from article_ingredient g
               left join item i on i.id = g.item_id where g.article_id = a.id) as wants
       from ${from}
       join supply p on p.id = a.supply_id
       left join skill k on k.id = a.skill
       ${clause}
      order by ${q ? "s.rank" : "a.level asc, a.name collate nocase"}
      limit ? offset ?`,
    ...params, filter.porPagina ?? 50,
    (Math.max(1, filter.pagina ?? 1) - 1) * (filter.porPagina ?? 50));

  return { rows, total };
}

// MARK: - NPCs

export interface NpcFilter {
  q?: string;
  nivelMin?: number;
  nivelMax?: number;
  soloColocados?: boolean;
  soloVendedores?: boolean;
  orden?: string;
  pagina?: number;
  porPagina?: number;
}

const NPC_ORDERS: Record<string, string> = {
  nombre: "n.name collate nocase asc",
  nivel: "n.level desc, n.name collate nocase asc",
  "nivel-asc": "n.level asc, n.name collate nocase asc",
  salud: "n.health desc, n.name collate nocase asc",
  botin: "(select count(*) from npc_loot l where l.npc_id = n.id) desc",
  id: "n.id asc",
};

export function npcs(filter: NpcFilter): {
  rows: (Npc & { loot_count: number; places: number })[];
  total: number;
} {
  const where: string[] = [];
  const params: unknown[] = [];
  let from = "npc n";

  const q = filter.q?.trim();
  if (q) {
    from = "npc n join search s on s.ref = n.id and s.kind = 'npc'";
    where.push("search match ?");
    params.push(ftsQuery(q));
  }
  if (filter.nivelMin != null) { where.push("n.level >= ?"); params.push(filter.nivelMin); }
  if (filter.nivelMax != null) { where.push("n.level <= ?"); params.push(filter.nivelMax); }
  if (filter.soloColocados) {
    where.push("exists (select 1 from placed_bot p where p.npc_id = n.id)");
  }
  if (filter.soloVendedores) where.push("n.supply > 0");

  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const total = one<{ n: number }>(
    `select count(*) as n from ${from} ${clause}`, ...params)?.n ?? 0;

  const order = NPC_ORDERS[filter.orden ?? ""]
    ?? (q ? "s.rank" : NPC_ORDERS.nivel);
  const perPage = filter.porPagina ?? 60;

  const rows = all<Npc & { loot_count: number; places: number }>(
    `select n.*,
            (select count(*) from npc_loot l where l.npc_id = n.id) as loot_count,
            (select count(*) from placed_bot p where p.npc_id = n.id) as places
       from ${from} ${clause} order by ${order} limit ? offset ?`,
    ...params, perPage, (Math.max(1, filter.pagina ?? 1) - 1) * perPage);

  return { rows, total };
}

export function npc(id: number): Npc | undefined {
  return one<Npc>("select * from npc where id = ?", id);
}

export function npcLoot(id: number): (Part & { value: number })[] {
  return all<Part & { value: number }>(
    `select l.item_id, 1 as quantity, l.value, i.name, i.icon, i.level, i.price
       from npc_loot l left join item i on i.id = l.item_id
      where l.npc_id = ?
      order by i.price desc, i.name collate nocase`, id);
}

export function npcPlaces(id: number): (Room & { door: number; route: number | null })[] {
  return all(
    `select r.*, p.door, p.route
       from placed_bot p join room r on r.id = p.room_id
      where p.npc_id = ? order by r.label collate nocase`, id);
}

// MARK: - Rooms

export function rooms(): Room[] {
  return all<Room>("select * from room order by label collate nocase");
}

export function room(id: number): Room | undefined {
  return one<Room>("select * from room where id = ?", id);
}

export interface DoorRow {
  room_id: number;
  name: string;
  selector: number;
  cardinal: string | null;
  to_room: number;
  pick_lock_item: number;
  to_label: string | null;
  to_scene: string | null;
  key_name: string | null;
}

export function doorsOf(id: number): DoorRow[] {
  return all<DoorRow>(
    `select d.*, r.label as to_label, r.scene as to_scene, i.name as key_name
       from door d
       left join room r on r.id = d.to_room
       left join item i on i.id = d.pick_lock_item
      where d.room_id = ?
      order by case d.cardinal when 'norte' then 0 when 'sur' then 1
                               when 'este' then 2 when 'oeste' then 3
                               else 4 end, d.selector`, id);
}

/** Which rooms have a door into this one — the way back. */
export function doorsInto(id: number): DoorRow[] {
  return all<DoorRow>(
    `select d.*, r.label as to_label, r.scene as to_scene, null as key_name
       from door d join room r on r.id = d.room_id
      where d.to_room = ? order by r.label collate nocase`, id);
}

export function botsIn(id: number): (Npc & { door: number; route: number | null })[] {
  return all(
    `select n.*, p.door, p.route
       from placed_bot p join npc n on n.id = p.npc_id
      where p.room_id = ? order by n.level desc, n.name collate nocase`, id);
}

export function boxesIn(id: number): {
  view: number; x: number; y: number; width: number; height: number;
  supply_id: number; name_es: string; supply_name: string | null;
}[] {
  return all(
    `select b.view, b.x, b.y, b.width, b.height, b.supply_id, b.name_es,
            s.name as supply_name
       from placed_box b left join supply s on s.id = b.supply_id
      where b.room_id = ? order by b.view, b.y, b.x`, id);
}

export function shopsIn(id: number): {
  shop_id: number; name: string; npc_id: number; supply_id: number;
  npc_name: string | null; supply_name: string | null;
}[] {
  return all(
    `select p.shop_id, p.name, p.npc_id, p.supply_id,
            n.name as npc_name, s.name as supply_name
       from placed_shop p
       left join npc n on n.id = p.npc_id
       left join supply s on s.id = p.supply_id
      where p.room_id = ? order by p.name collate nocase`, id);
}

export function interiorOf(id: number): Room[] {
  return all<Room>(
    "select * from room where parent_room = ? order by interior_index", id);
}

export function routesOf(id: number): { idx: number; name: string; nodes: number }[] {
  return all("select idx, name, nodes from route where room_id = ? order by idx", id);
}

// MARK: - The floor plan

export interface PlanRoom {
  id: number;
  label: string;
  scene: string;
  grid_x: number;
  grid_y: number;
  grid_cluster: number;
  level_low: number | null;
  level_high: number | null;
  is_safe_zone: number | null;
  views: number;
  bots: number;
  interior: number;
  boxes: number;
}

/** Every room that has a cell on the plan, with what is in it. */
export function plan(): PlanRoom[] {
  return all<PlanRoom>(
    `select r.id, r.label, r.scene, r.grid_x, r.grid_y, r.grid_cluster,
            r.level_low, r.level_high, r.is_safe_zone, r.views,
            (select count(*) from placed_bot p where p.room_id = r.id) as bots,
            (select count(*) from room c where c.parent_room = r.id) as interior,
            (select count(*) from placed_box b where b.room_id = r.id) as boxes
       from room r
      where r.grid_cluster is not null
      order by r.grid_cluster, r.grid_y, r.grid_x`);
}

/** The cardinal doors the grid could not draw as a shared wall. */
export function planJumps(): {
  from_room: number; to_room: number; cardinal: string; door: string;
}[] {
  return all("select * from plan_jump");
}

// MARK: - Crimes in detail

export function crimeDetail(id: number) {
  return {
    crime: one<Crime>("select * from crime where id = ?", id),
    characteristics: all<{ stat_id: number; name: string; initial: number }>(
      `select stat_id, name, initial from crime_characteristic
        where crime_id = ? order by stat_id`, id),
    skills: all<{
      skill_id: number; name: string; initial: number; ceiling: number; level: number;
    }>(
      `select skill_id, name, initial, ceiling, level from crime_skill
        where crime_id = ? order by skill_id`, id),
    startingItems: all<{ item_id: number; quantity: number; name: string | null }>(
      `select k.item_id, k.quantity, i.name from crime_starting_item k
         left join item i on i.id = k.item_id
        where k.crime_id = ? order by k.item_id`, id),
  };
}

export function skills(): { id: number; name: string }[] {
  return all("select id, name from skill order by id");
}

export function trainersOf(skillId: number) {
  return all<{ room_id: number; name_es: string; dept_es: string; label: string | null }>(
    `select t.room_id, t.name_es, t.dept_es, r.label
       from trainer t left join room r on r.id = t.room_id
      where t.skill_id = ?`, skillId);
}

// MARK: - Vendors

export function supply(id: number) {
  return one<{
    id: number; name: string; mode: number; vendor_text: number;
    vendor_note: string | null;
  }>("select * from supply where id = ?", id);
}

export function supplyLines(id: number): string[] {
  return all<{ text: string }>(
    "select text from supply_line where supply_id = ? order by idx", id)
    .map((r) => r.text);
}

export function supplyArticles(id: number) {
  return all<{
    id: number; name: string; kind: ArticleKind; level: number;
    skill_name: string | null; makes: string | null; wants: string | null;
  }>(
    `select a.id, a.name, a.kind, a.level, k.name as skill_name,
            (select group_concat(i.name, ', ') from article_result r
               left join item i on i.id = r.item_id where r.article_id = a.id) as makes,
            (select group_concat(i.name, ', ') from article_ingredient g
               left join item i on i.id = g.item_id where g.article_id = a.id) as wants
       from article a left join skill k on k.id = a.skill
      where a.supply_id = ? order by a.idx`, id);
}

/** Who sells this supply, and where they stand. */
export function supplyVendors(id: number) {
  return all<{ id: number; name: string; level: number; places: number }>(
    `select n.id, n.name, n.level,
            (select count(*) from placed_bot p where p.npc_id = n.id) as places
       from npc n where n.supply = ? order by places desc, n.name collate nocase`, id);
}

// MARK: - Search

/**
 * What goes into `search match`.
 *
 * Everything the reader typed is quoted and given a `*`, so each word is a
 * prefix and nothing they type can be read as FTS5 syntax — a bare `"` or a
 * `NEAR` would otherwise either throw or quietly mean something else.
 */
function ftsQuery(text: string): string {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
  if (!words.length) return '""';
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(" ");
}

export interface Hit {
  kind: string;
  ref: number;
  name: string;
  extra: string;
}

export function search(text: string, limit = 24): Hit[] {
  const q = text.trim();
  if (!q) return [];
  return all<Hit>(
    `select kind, ref, name, extra from search
      where search match ? order by rank limit ?`, ftsQuery(q), limit);
}
