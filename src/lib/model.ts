/**
 * What the guide's rows look like, and the few conversions the tables need
 * before a page can show them.
 *
 * The rule throughout: a number whose meaning is known gets turned into words;
 * a number whose meaning is not known is shown as the number, labelled, and
 * never dressed up as something it might be.
 */

export type Group = "ARMAS" | "ROPA" | "CONSUMIBLES" | "CHAPAS" | "ESTILO" | "OTROS";

/** The game's own six inventory tabs, in the game's own order (messages 2078…2083). */
export const GROUPS: Group[] = [
  "ARMAS", "ROPA", "CONSUMIBLES", "CHAPAS", "ESTILO", "OTROS",
];

export interface Item {
  id: number;
  /** The label: the article taken off and the first letter raised. */
  name: string;
  plural: string;
  /** Exactly what the game's table holds, article and all. */
  name_raw: string;
  plural_raw: string;
  type: number;
  type_name: string | null;
  label: string;
  label_source: string;
  grp: Group;
  icon: string | null;
  level: number;
  price: number;
  weight: number;
  handling: number;
  effect: number;
  modifier: number;
  contains: number;
  break_chance: number;
  breaks_into: number;
  flags: number;
  related_item: number;
  crime_mask: number;
  sound_type: number;
  weapon_skill: number;
}

export interface ItemMod {
  item_id: number;
  stat: number;
  name: string | null;
  kind: "atributo" | "habilidad" | "desconocido";
  value: number;
}

export interface Npc {
  id: number;
  /** The label, same rule as an item's. */
  name: string;
  name_raw: string;
  model: string;
  crime: number;
  money: number;
  health: number;
  strength: number;
  dexterity: number;
  field17: number;
  level: number;
  text_count: number;
  aggressiveness: number;
  supply: number;
}

export interface Room {
  id: number;
  label: string;
  scene: string;
  room_type: number;
  access_mask: number;
  game_name: string | null;
  zone_type: number | null;
  is_safe_zone: number | null;
  level_low: number | null;
  level_high: number | null;
  level_low2: number | null;
  level_high2: number | null;
  views: number;
  grid_x: number | null;
  grid_y: number | null;
  grid_cluster: number | null;
  parent_room: number | null;
  interior_index: number | null;
}

export interface Crime {
  id: number;
  male_name: string;
  female_name: string;
  abbreviation: string;
}

export type ArticleKind = "receta" | "compra" | "venta" | "servicio" | "charla";

/** Money is item 1. Several things in the tables only make sense knowing that. */
export const MONEY_ITEM = 1;

/**
 * Which crimes an item allows, out of its `crime_mask`: **crime N is bit N−1**.
 *
 * The masks say so themselves — 4095 is 0xFFF, the twelve bits of the twelve
 * crimes, and it is the second most common value in the catalogue; 65535 sets
 * bits nothing uses and means the same "anybody". 256 is bit 8, the ninth
 * crime, Narcotraficante.
 */
export function crimesOf(mask: number, crimes: Crime[]): Crime[] {
  return crimes.filter((crime) => (mask & (1 << (crime.id - 1))) !== 0);
}

/** Whether the mask lets every crime through, which is most of the catalogue. */
export function allCrimes(mask: number, crimes: Crime[]): boolean {
  return crimes.every((crime) => (mask & (1 << (crime.id - 1))) !== 0);
}

/**
 * An NPC's `crime` is **zero-based** into the crime table, where an item's mask
 * is one-based.
 *
 * Two things in the data say so rather than one guess: `crime` 10 lands on
 * Caníbal and its NPCs are the ones called "devorador", and `crime` 11 lands on
 * Pandillero and its NPCs are the "macarra" ones. The field never goes past 11,
 * and there are twelve crimes.
 */
export function crimeOfNpc(crime: number, crimes: Crime[]): Crime | undefined {
  return crimes.find((c) => c.id === crime + 1);
}

/**
 * Which cardinal ways out of a room are open, out of the access mask the client
 * uses: **pn 1, ps 2, pe 4, po 8**. A cardinal door whose bit is missing is the
 * one the game covers with police tape and stops being clickable.
 */
export function exitsOf(mask: number): string[] {
  const out: string[] = [];
  if (mask & 1) out.push("norte");
  if (mask & 2) out.push("sur");
  if (mask & 4) out.push("este");
  if (mask & 8) out.push("oeste");
  return out;
}

const money = new Intl.NumberFormat("es-ES");

/** Prices are shown the way the game writes them: `$1.234.-` */
export function pesetas(value: number): string {
  return `$${money.format(value)}.-`;
}

export function number(value: number): string {
  return money.format(value);
}

/** `+3` / `−5`, with a real minus sign, for a modifier. */
export function signed(value: number): string {
  return value < 0 ? `−${money.format(-value)}` : `+${money.format(value)}`;
}

/**
 * A room's level band, as the game's own 2D map shows it. Some rooms carry a
 * second band with real weight; both are shown rather than averaged.
 */
export function levelBand(room: Room): string | null {
  if (room.level_low == null || room.level_high == null) return null;
  const first = room.level_low === room.level_high
    ? `${room.level_low}`
    : `${room.level_low}–${room.level_high}`;
  if (!room.level_low2 || !room.level_high2) return first;
  const second = room.level_low2 === room.level_high2
    ? `${room.level_low2}`
    : `${room.level_low2}–${room.level_high2}`;
  return `${first} y ${second}`;
}

/** The slug a room's background picture is filed under. */
export function roomView(scene: string, view: number): string {
  return `${scene.toLowerCase()}${view}`;
}

/** The slug an item's icon is filed under. */
export function iconFile(icon: string | null): string | null {
  return icon ? `${icon.toLowerCase()}.webp` : null;
}
