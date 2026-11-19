#!/usr/bin/env node
// Turns the exporter's JSON into the guide's SQLite database.
//
// Nothing here parses a game format: `guide-export` already did that with the
// server's own Swift parsers. This is the join — it works out what the JSON
// only implies (which NPC drops an item, which recipes it goes into, where the
// prison's rooms sit on a floor plan) and leaves it in a file the web app opens
// read-only.
//
//   node scripts/build-db.mjs [--export data/export] [--out data/prison.db]
//
// Re-runnable: it drops and rebuilds everything, so it is safe to run on every
// re-export.

import { DatabaseSync } from "node:sqlite";
import {
  readFileSync, readdirSync, existsSync, mkdirSync, rmSync, statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

// MARK: - Arguments

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const exportDir = resolve(root, flag("--export", "data/export"));
const outPath = resolve(root, flag("--out", "data/prison.db"));

function read(name, fallback) {
  const path = join(exportDir, name);
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    console.error(`falta ${path} — ejecuta antes guide-export`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const meta = read("meta.json");
const items = read("items.json");
const npcs = read("npcs.json");
const supplies = read("supplies.json");
const skillsDoc = read("skills.json", null);
const rooms = read("rooms.json");
const placed = read("placed.json", { bots: [], shops: [], boxes: [] });
const routes = read("routes.json", []);
const trainers = read("trainers.json", []);
const departments = read("departments.json", {});
const categories = JSON.parse(
  readFileSync(resolve(root, "data/categories.json"), "utf8"),
);

/**
 * The name as a label, out of the name as a sentence fragment.
 *
 * **The tables store the article**: "un Crazy Bat novato", "el hacha
 * Excaliboor", "unas braguitas raídas". That is not sloppiness, it is what the
 * field is for — the client drops these straight into sentences it builds, like
 * "Te pones %s" or the menu's "EXAMINAR A %s", and without the article those
 * would read as broken Spanish. 11 189 of the 11 240 items carry one, and 2 673
 * of the 2 874 NPCs.
 *
 * Shown as a title or a row in a table, though, the article is noise, and it
 * wrecks the sort: alphabetical order files a third of the catalogue under U
 * for "un". So a label gets it taken off, and the exact stored string is kept
 * beside it in `name_raw` for anyone who wants what the table really says.
 *
 * **Only the eight articles go.** The fifty-one items that begin with "su" or
 * "tu" — "su garra", "tu propia oreja cortada por Frank" — are NPCs' natural
 * weapons and things done to the player, and the possessive is the name. Taking
 * it off would leave "Garra", which means something else.
 */
const ARTICLE = /^(?:un|una|unos|unas|el|la|los|las)\s+/i;

/**
 * The connecting words that stay lowercase unless they open the name.
 *
 * Without this, raising every word gives "Casco De Especialista ASU" and
 * "Capitán De Los RedDevil", which is not how Spanish writes a title — and the
 * second one is a name the table already capitalised correctly by hand.
 */
const SMALL = new Set([
  "a", "al", "ante", "bajo", "con", "contra", "de", "del", "desde", "e", "el",
  "en", "entre", "hacia", "hasta", "la", "las", "los", "o", "para", "por",
  "sin", "sobre", "tras", "u", "un", "una", "unas", "unos", "y",
]);

/**
 * Raises the first letter of a word, leaving the rest exactly as it was.
 *
 * The rest matters: `ASU`, `NAR`, `TO2`, `RedDevil` and `GuíaDeLuz` are all in
 * these names and all carry capitals the author put there on purpose. Anything
 * that lowercased the tail would destroy them.
 *
 * The first *letter*, not the first character, so `"Jason"` comes out as
 * `"Jason"` and not with the quote mark uppercased and the J left alone.
 */
function raise(word) {
  const at = word.search(/\p{L}/u);
  if (at < 0) return word;
  return word.slice(0, at) + word[at].toUpperCase() + word.slice(at + 1);
}

/**
 * The name as a label, out of the name as a sentence fragment.
 *
 * **The tables store the article**: "un Crazy Bat novato", "el hacha
 * Excaliboor", "unas braguitas raídas". That is not sloppiness, it is what the
 * field is for — the client drops these straight into sentences it builds, like
 * "Te pones %s" or the menu's "EXAMINAR A %s", and without the article those
 * would read as broken Spanish. 11 189 of the 11 240 items carry one, and 2 673
 * of the 2 874 NPCs.
 *
 * Shown as a title or a row in a table, though, the article is noise, and it
 * wrecks the sort: alphabetical order files a third of the catalogue under U
 * for "un". So a label gets it taken off, and the exact stored string is kept
 * beside it in `name_raw` for anyone who wants what the table really says.
 *
 * **Only the eight articles go.** The fifty-one items that begin with "su" or
 * "tu" — "su garra", "tu propia oreja cortada por Frank" — are NPCs' natural
 * weapons and things done to the player, and the possessive is the name. Taking
 * it off would leave "Garra", which means something else.
 *
 * **Then every word that is not a connecting word is raised**, because that is
 * how the game shows these: "Crazy Bat Novato", not "Crazy Bat novato". The
 * capitalisation in the tables is inconsistent — some names were authored in
 * title case and some were not — and this is what makes a list of them read as
 * one thing. Nothing is ever lowercased, so the capitals the authors put inside
 * words survive untouched.
 */
function label(name) {
  if (!name) return name;
  // A plural can arrive with the separator still on it: the field is
  // "singular_plural" and 2914 of them end the plural with a further "_".
  const trimmed = name.replace(/_+$/, "").trim();
  const bare = trimmed.replace(ARTICLE, "");
  // A name that is nothing but an article keeps what it had.
  const text = bare || trimmed;

  // A slash separates two alternatives and the second one is a word of its own:
  // thirteen items are "pantalones/falda <colour>". A hyphen is not — Spanish
  // keeps the second half of a compound lowercase, so "aprendiz-arcano" stays
  // as it is.
  return text
    .split(/(\s+|\/)/)
    .map((part, index) => {
      if (!part || /^(?:\s+|\/)$/.test(part)) return part;
      // index 0 is the first word; the rest alternate word, separator, word.
      const first = index === 0;
      return first || !SMALL.has(part.toLowerCase()) ? raise(part) : part;
    })
    .join("");
}

// MARK: - The database

mkdirSync(dirname(outPath), { recursive: true });
rmSync(outPath, { force: true });
rmSync(`${outPath}-wal`, { force: true });
rmSync(`${outPath}-shm`, { force: true });

const db = new DatabaseSync(outPath);
db.exec("pragma journal_mode = wal");
db.exec("pragma synchronous = off");

db.exec(`
create table meta (
  key text primary key,
  value text not null
);

-- MARK: items

create table item (
  id integer primary key,
  -- The label: the article taken off and the first letter raised. This is what
  -- every list, link and search result shows.
  name text not null,
  plural text not null,
  -- Exactly what the table holds, article and all, because that is the string
  -- the client puts in a sentence.
  name_raw text not null,
  plural_raw text not null,
  type integer not null,
  -- What the client itself calls the type, when it names it at all.
  type_name text,
  -- Our label, which equals type_name for the types the client names.
  label text not null,
  -- 'cliente' or 'derivada': whether the label is the client's or ours.
  label_source text not null,
  -- One of the game's own six inventory tabs.
  grp text not null,
  icon text,
  level integer not null,
  price integer not null,
  weight integer not null,
  handling integer not null,
  effect integer not null,
  modifier integer not null,
  contains integer not null,
  break_chance integer not null,
  breaks_into integer not null,
  flags integer not null,
  related_item integer not null,
  crime_mask integer not null,
  sound_type integer not null,
  weapon_skill integer not null
);

create table item_mod (
  item_id integer not null references item(id),
  stat integer not null,
  name text,
  -- 'atributo' for the SAL/FUE/DES… run, 'habilidad' for a CLASSINFO skill id,
  -- 'desconocido' for the 100+ family nothing explains yet.
  kind text not null,
  value integer not null
);

-- MARK: NPCs

create table npc (
  id integer primary key,
  -- The label, same rule as an item's.
  name text not null,
  name_raw text not null,
  model text not null,
  crime integer not null,
  money integer not null,
  health integer not null,
  strength integer not null,
  dexterity integer not null,
  -- +0x17, deliberately unnamed upstream.
  field17 integer not null,
  level integer not null,
  text_count integer not null,
  aggressiveness integer not null,
  supply integer not null
);

create table npc_loot (
  npc_id integer not null references npc(id),
  item_id integer not null,
  -- A chance or a quantity; the table does not say which.
  value integer not null
);

-- MARK: vendors, and every recipe in the game

create table supply (
  id integer primary key,
  name text not null,
  mode integer not null,
  vendor_text integer not null,
  vendor_note text
);

create table supply_line (
  supply_id integer not null references supply(id),
  idx integer not null,
  text text not null
);

create table article (
  id integer primary key,
  supply_id integer not null references supply(id),
  idx integer not null,
  -- +0x00 of the article's header. **Not a global item id**, however much it
  -- looks like one: an article named "+++guantes ASE" that produces gloves
  -- carries 184 here, which is "un anillo de compromiso". The numbers are small
  -- and local to each supply, so this is an ordinal or an index into something
  -- per-vendor. It is carried raw and never joined to item(id); what an article
  -- actually trades is its ingredients and its results.
  item_raw integer not null,
  level integer not null,
  service integer not null,
  gives_experience integer not null,
  skill integer not null,
  name text not null,
  crime_mask integer not null,
  text integer not null,
  text_es text,
  text_en text,
  -- Derived, and the whole point of this table for a guide. **Money is item 1**,
  -- so an article whose only ingredient is money is a purchase and one that
  -- asks for real items is a recipe:
  --   'receta'   ingredients include something other than money
  --   'compra'   ingredients are money alone
  --   'venta'    the player hands items over and gets money back
  --   'servicio' a service code, paid for and with nothing to carry away
  --   'charla'   neither ingredients nor results: a line of dialogue
  kind text not null,
  has_ingredients integer not null,
  has_results integer not null
);

create table article_ingredient (
  article_id integer not null references article(id),
  item_id integer not null,
  quantity integer not null
);

create table article_result (
  article_id integer not null references article(id),
  item_id integer not null,
  quantity integer not null
);

-- MARK: the world

create table room (
  id integer primary key,
  label text not null,
  scene text not null,
  room_type integer not null,
  -- pn 1, ps 2, pe 4, po 8.
  access_mask integer not null,
  game_name text,
  zone_type integer,
  is_safe_zone integer,
  level_low integer,
  level_high integer,
  level_low2 integer,
  level_high2 integer,
  views integer not null,
  -- Where the room lands on the floor plan worked out from its cardinal doors.
  -- Null when no cardinal door ever reached it.
  grid_x integer,
  grid_y integer,
  grid_cluster integer,
  -- For a room with no cell of its own on the plan — a cell, a dungeon, an
  -- inside — the room whose numbered door leads into it. That is how the game's
  -- own 2D map shows them: a module collapses its zones into one box.
  parent_room integer,
  -- Its place among the rooms that share that parent, so a module's 64 cells
  -- can be laid out in a predictable order.
  interior_index integer
);

-- A cardinal door between two rooms that are both on the plan but not in
-- adjacent cells — stairs, a corridor that wraps round. The grid cannot draw it
-- as a shared wall, so the map draws it as a line and says where it goes.
create table plan_jump (
  from_room integer not null,
  to_room integer not null,
  cardinal text not null,
  door text not null
);

create table door (
  room_id integer not null references room(id),
  name text not null,
  selector integer not null,
  cardinal text,
  to_room integer not null,
  pick_lock_item integer not null
);

create table placed_bot (
  room_id integer not null references room(id),
  npc_id integer not null,
  door integer not null,
  route integer,
  x real, y real, z real,
  angle real not null
);

create table placed_shop (
  room_id integer not null references room(id),
  shop_id integer not null,
  name text not null,
  npc_id integer not null,
  supply_id integer not null,
  unique_supply integer not null,
  x real, y real, z real,
  angle real not null,
  flags integer not null
);

create table placed_box (
  room_id integer not null references room(id),
  view integer not null,
  x integer not null, y integer not null,
  width integer not null, height integer not null,
  supply_id integer not null,
  unique_id integer not null,
  name_es text not null,
  name_en text not null,
  stand_x integer not null,
  stand_y integer not null
);

-- MARK: crimes, characteristics, skills

create table characteristic (id integer primary key, name text not null);
create table skill (id integer primary key, name text not null);

create table crime (
  id integer primary key,
  male_name text not null,
  female_name text not null,
  abbreviation text not null
);

create table crime_characteristic (
  crime_id integer not null references crime(id),
  stat_id integer not null,
  name text not null,
  initial integer not null
);

create table crime_skill (
  crime_id integer not null references crime(id),
  skill_id integer not null,
  name text not null,
  initial integer not null,
  ceiling integer not null,
  level integer not null
);

create table crime_starting_item (
  crime_id integer not null references crime(id),
  item_id integer not null,
  quantity integer not null
);

create table trainer (
  skill_id integer not null,
  room_id integer not null,
  name_es text not null,
  name_en text not null,
  dept_es text not null,
  dept_en text not null
);

create table department (
  id integer primary key,
  name text not null,
  image text not null
);

-- MARK: patrol routes

create table route (
  room_id integer not null references room(id),
  idx integer not null,
  name text not null,
  nodes integer not null,
  primary key (room_id, idx)
);

create table route_node (
  room_id integer not null,
  route_idx integer not null,
  idx integer not null,
  x real not null, y real not null, z real not null,
  angle real not null,
  eta integer not null,
  flag integer not null
);
`);

// MARK: - Items

{
  const insert = db.prepare(`
    insert into item (id, name, plural, name_raw, plural_raw, type, type_name,
      label, label_source, grp, icon, level, price, weight, handling, effect,
      modifier, contains, break_chance, breaks_into, flags, related_item,
      crime_mask, sound_type, weapon_skill)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertMod = db.prepare(
    `insert into item_mod (item_id, stat, name, kind, value) values (?,?,?,?,?)`,
  );

  // A modifier's `stat` is three families in one byte: 1…9 is the SAL, FUE,
  // DES, EXP, AGI, CON, INT, CAR, PRO run the client names in messages
  // 227…235, which the exporter already resolved; 20…48 is a CLASSINFO skill
  // id, checked against the skill table rather than assumed — stat 20 is
  // Química, 42 Traumatismo, 43 Gangrenación, and they line up one for one;
  // and the 100+ family nothing observed explains, which stays unnamed.
  const skillNames = new Map(
    (skillsDoc?.skills ?? []).map((s) => [s.id, s.name]),
  );

  const unknownTypes = new Set();
  db.exec("begin");
  for (const item of items) {
    const category = categories.tipos[String(item.type)];
    if (!category) unknownTypes.add(item.type);
    insert.run(
      item.id, label(item.name), label(item.plural), item.name, item.plural,
      item.type, item.typeName ?? null,
      category?.etiqueta ?? `Tipo ${item.type}`,
      category?.fuente ?? "desconocida",
      category?.grupo ?? "OTROS",
      item.icon ?? null, item.level, item.price, item.weight, item.handling,
      item.effect, item.modifier, item.contains, item.breakChance,
      item.breaksInto, item.flags, item.relatedItem, item.crimeMask,
      item.soundType, item.weaponSkill,
    );
    for (const mod of item.modifiers) {
      let name = mod.statName ?? null;
      let kind = "desconocido";
      if (mod.statName) {
        kind = "atributo";
      } else if (skillNames.has(mod.stat) && mod.stat >= 20) {
        name = skillNames.get(mod.stat);
        kind = "habilidad";
      }
      insertMod.run(item.id, mod.stat, name, kind, mod.value);
    }
  }
  db.exec("commit");
  if (unknownTypes.size) {
    console.warn(
      `  ! tipos sin entrada en categories.json: ${[...unknownTypes].sort((a, b) => a - b).join(", ")}`,
    );
  }
}

// MARK: - NPCs

{
  const insert = db.prepare(`
    insert into npc (id, name, name_raw, model, crime, money, health, strength,
      dexterity, field17, level, text_count, aggressiveness, supply)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertLoot = db.prepare(
    `insert into npc_loot (npc_id, item_id, value) values (?,?,?)`,
  );
  db.exec("begin");
  for (const npc of npcs) {
    insert.run(npc.id, label(npc.name), npc.name, npc.model, npc.crime,
      npc.money, npc.health,
      npc.strength, npc.dexterity, npc.field17, npc.level, npc.textCount,
      npc.aggressiveness, npc.supply);
    for (const loot of npc.loot) insertLoot.run(npc.id, loot.item, loot.value);
  }
  db.exec("commit");
}

// MARK: - Vendors and recipes

{
  const insertSupply = db.prepare(
    `insert into supply (id, name, mode, vendor_text, vendor_note) values (?,?,?,?,?)`,
  );
  const insertLine = db.prepare(
    `insert into supply_line (supply_id, idx, text) values (?,?,?)`,
  );
  const insertArticle = db.prepare(`
    insert into article (id, supply_id, idx, item_raw, level, service,
      gives_experience, skill, name, crime_mask, text, text_es, text_en,
      kind, has_ingredients, has_results)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertIngredient = db.prepare(
    `insert into article_ingredient (article_id, item_id, quantity) values (?,?,?)`,
  );
  const insertResult = db.prepare(
    `insert into article_result (article_id, item_id, quantity) values (?,?,?)`,
  );

  // An article has no id of its own in the table — it is the nth article of a
  // supply — so the guide gives it one and keeps (supply, idx) beside it.
  let articleId = 0;
  db.exec("begin");
  for (const supply of supplies) {
    insertSupply.run(supply.id, supply.name, supply.mode, supply.vendorText,
      supply.vendorNote || null);
    supply.vendorLines.forEach((line, idx) =>
      insertLine.run(supply.id, idx, line));
    supply.articles.forEach((article, idx) => {
      const id = ++articleId;
      // Money is item 1, which is what separates a purchase from a recipe.
      const MONEY = 1;
      const ingredients = article.ingredients;
      const results = article.results;
      const wantsItems = ingredients.some((i) => i.item !== MONEY);
      const paysMoneyOnly =
        results.length > 0 && results.every((r) => r.item === MONEY);
      const kind =
        ingredients.length === 0 && results.length === 0
          ? "charla"
          : paysMoneyOnly
            ? "venta"
            : article.service > 0 && results.length === 0
              ? "servicio"
              : wantsItems
                ? "receta"
                : "compra";
      insertArticle.run(id, supply.id, idx, article.item, article.level,
        article.service, article.givesExperience, article.skill, article.name,
        article.crimeMask, article.text, article.textES ?? null,
        article.textEN ?? null, kind, ingredients.length ? 1 : 0,
        results.length ? 1 : 0);
      for (const i of article.ingredients) insertIngredient.run(id, i.item, i.quantity);
      for (const r of article.results) insertResult.run(id, r.item, r.quantity);
    });
  }
  db.exec("commit");
}

// MARK: - Crimes

if (skillsDoc) {
  const insertCharacteristic = db.prepare(
    `insert into characteristic (id, name) values (?,?)`);
  const insertSkill = db.prepare(`insert into skill (id, name) values (?,?)`);
  const insertCrime = db.prepare(
    `insert into crime (id, male_name, female_name, abbreviation) values (?,?,?,?)`);
  const insertCrimeCharacteristic = db.prepare(`
    insert into crime_characteristic (crime_id, stat_id, name, initial)
    values (?,?,?,?)`);
  const insertCrimeSkill = db.prepare(`
    insert into crime_skill (crime_id, skill_id, name, initial, ceiling, level)
    values (?,?,?,?,?,?)`);
  const insertStartingItem = db.prepare(`
    insert into crime_starting_item (crime_id, item_id, quantity) values (?,?,?)`);

  db.exec("begin");
  for (const c of skillsDoc.characteristics) insertCharacteristic.run(c.id, c.name);
  for (const s of skillsDoc.skills) insertSkill.run(s.id, s.name);
  for (const crime of skillsDoc.crimes) {
    insertCrime.run(crime.id, crime.maleName, crime.femaleName, crime.abbreviation);
    for (const c of crime.characteristics)
      insertCrimeCharacteristic.run(crime.id, c.id, c.name, c.initial);
    for (const s of crime.skills)
      insertCrimeSkill.run(crime.id, s.id, s.name, s.initial, s.ceiling, s.level);
    for (const i of crime.startingItems)
      insertStartingItem.run(crime.id, i.item, i.quantity);
  }
  db.exec("commit");
}

// MARK: - The floor plan

/// **The map is a grid, and the cardinal doors say so.** A room whose `pn`
/// leads to B puts B one cell north of it; `ps`, `pe` and `po` do the same for
/// the other three. Walking that from a seed room reconstructs the prison's own
/// plan — the thing the game draws on its 2D map — instead of the arbitrary
/// blob a force-directed layout would give.
///
/// The numbered doors (`p3`, `p17`…) are deliberately ignored here: they are a
/// room's inside, the cell doors of a module above all, and they do not move
/// anything on a floor plan.
///
/// Rooms that no cardinal door ever reaches, and the ones a second path would
/// put somewhere else, are left without coordinates rather than forced into a
/// cell that is not theirs. The count of both is reported.
function floorPlan(rooms) {
  const step = {
    norte: [0, -1],
    sur: [0, 1],
    este: [1, 0],
    oeste: [-1, 0],
  };
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const placedAt = new Map(); // id -> {x, y, cluster}
  const taken = new Map(); // "cluster:x,y" -> id
  const jumps = [];
  let cluster = 0;

  // Seeding from the best-connected room first keeps the biggest piece of the
  // prison in cluster 0, which is the one worth looking at.
  const order = [...rooms].sort(
    (a, b) =>
      b.doors.filter((d) => d.cardinal).length -
      a.doors.filter((d) => d.cardinal).length,
  );

  for (const seed of order) {
    if (placedAt.has(seed.id)) continue;
    if (!seed.doors.some((d) => d.cardinal && d.to)) continue;

    const here = cluster++;
    placedAt.set(seed.id, { x: 0, y: 0, cluster: here });
    taken.set(`${here}:0,0`, seed.id);
    const queue = [seed.id];

    while (queue.length) {
      const id = queue.shift();
      const room = byId.get(id);
      const at = placedAt.get(id);
      for (const door of room.doors) {
        const move = door.cardinal && step[door.cardinal];
        if (!move || !door.to || !byId.has(door.to)) continue;
        const x = at.x + move[0];
        const y = at.y + move[1];
        const already = placedAt.get(door.to);
        if (already) {
          // The same room reached twice at different cells: the prison is not
          // a perfect grid (stairs, a corridor that wraps). The first cell
          // wins, and the door becomes a drawn line instead of a shared wall.
          if (already.x !== x || already.y !== y || already.cluster !== here) {
            jumps.push({ from: id, to: door.to, cardinal: door.cardinal, door: door.name });
          }
          continue;
        }
        const key = `${here}:${x},${y}`;
        if (taken.has(key)) {
          // Two different rooms want the same cell. The one already there
          // keeps it; this door is a line too.
          jumps.push({ from: id, to: door.to, cardinal: door.cardinal, door: door.name });
          continue;
        }
        placedAt.set(door.to, { x, y, cluster: here });
        taken.set(key, door.to);
        queue.push(door.to);
      }
    }
  }

  // Each cluster is its own connected piece with its own origin. Shifting every
  // one so its own top-left is at 0,0 lets the web lay them out side by side
  // without negative coordinates.
  const bounds = new Map();
  for (const { x, y, cluster } of placedAt.values()) {
    const box = bounds.get(cluster) ?? { minX: x, minY: y, maxX: x, maxY: y };
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
    bounds.set(cluster, box);
  }
  for (const spot of placedAt.values()) {
    const box = bounds.get(spot.cluster);
    spot.x -= box.minX;
    spot.y -= box.minY;
  }

  // Everything the grid could not take — the cells, the dungeons, a room's
  // inside — hangs off the room whose numbered door leads into it. Preferring a
  // parent that is itself on the plan keeps a cell under the module it belongs
  // to rather than under another cell.
  const interior = new Map(); // id -> {parent, index}
  const children = new Map();
  for (const room of rooms) {
    if (placedAt.has(room.id)) continue;
    let parent = null;
    for (const candidate of rooms) {
      if (candidate.id === room.id) continue;
      if (!candidate.doors.some((d) => !d.cardinal && d.to === room.id)) continue;
      if (placedAt.has(candidate.id)) { parent = candidate.id; break; }
      if (parent === null) parent = candidate.id;
    }
    if (parent === null) continue;
    const siblings = children.get(parent) ?? [];
    interior.set(room.id, { parent, index: siblings.length });
    siblings.push(room.id);
    children.set(parent, siblings);
  }

  return { placedAt, interior, jumps, clusters: bounds };
}

const plan = floorPlan(rooms);

/**
 * How many camera views a room has.
 *
 * Counted from the pictures that are actually in `public/salas` rather than
 * taken from the export: the two can only disagree when one step was re-run and
 * the other was not, and this number exists so a page knows how many thumbnails
 * to draw. A room is not one picture but one per camera — `al_pasillo` has
 * nine, which is the "vista 7 de 9" the game shows.
 */
function viewsByScene() {
  const dir = resolve(root, "public/salas");
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".webp")) continue;
    const stem = name.slice(0, -".webp".length);
    const digits = stem.match(/(\d+)$/);
    if (!digits) continue;
    const scene = stem.slice(0, -digits[1].length);
    out.set(scene, Math.max(out.get(scene) ?? 0, Number(digits[1])));
  }
  return out;
}

const views = viewsByScene();

// MARK: - Rooms and doors

{
  const insert = db.prepare(`
    insert into room (id, label, scene, room_type, access_mask, game_name,
      zone_type, is_safe_zone, level_low, level_high, level_low2, level_high2,
      views, grid_x, grid_y, grid_cluster, parent_room, interior_index)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertDoor = db.prepare(`
    insert into door (room_id, name, selector, cardinal, to_room, pick_lock_item)
    values (?,?,?,?,?,?)`);
  const insertJump = db.prepare(`
    insert into plan_jump (from_room, to_room, cardinal, door) values (?,?,?,?)`);

  db.exec("begin");
  for (const room of rooms) {
    const at = plan.placedAt.get(room.id);
    const inside = plan.interior.get(room.id);
    insert.run(room.id, room.label, room.scene, room.roomType, room.accessMask,
      room.gameName ?? null, room.zoneType ?? null,
      room.isSafeZone === undefined ? null : room.isSafeZone ? 1 : 0,
      room.levelLow ?? null, room.levelHigh ?? null, room.levelLow2 ?? null,
      room.levelHigh2 ?? null,
      views.get(room.scene.toLowerCase()) ?? room.views,
      at?.x ?? null, at?.y ?? null, at?.cluster ?? null,
      inside?.parent ?? null, inside?.index ?? null);
    for (const door of room.doors) {
      insertDoor.run(room.id, door.name, door.selector, door.cardinal ?? null,
        door.to, door.pickLockItem);
    }
  }
  for (const jump of plan.jumps) {
    insertJump.run(jump.from, jump.to, jump.cardinal, jump.door);
  }
  db.exec("commit");
}

// MARK: - What stands in the rooms

{
  const knownRoom = new Set(rooms.map((r) => r.id));
  db.exec("begin");

  const insertBot = db.prepare(`
    insert into placed_bot (room_id, npc_id, door, route, x, y, z, angle)
    values (?,?,?,?,?,?,?,?)`);
  let strayBots = 0;
  for (const bot of placed.bots) {
    if (!knownRoom.has(bot.room)) { strayBots++; continue; }
    insertBot.run(bot.room, bot.npc, bot.door, bot.route ?? null,
      bot.position?.x ?? null, bot.position?.y ?? null, bot.position?.z ?? null,
      bot.angle);
  }

  const insertShop = db.prepare(`
    insert into placed_shop (room_id, shop_id, name, npc_id, supply_id,
      unique_supply, x, y, z, angle, flags)
    values (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const shop of placed.shops) {
    if (!knownRoom.has(shop.room)) continue;
    insertShop.run(shop.room, shop.id, shop.name, shop.npc, shop.supply,
      shop.uniqueSupply, shop.position.x, shop.position.y, shop.position.z,
      shop.angle, shop.flags);
  }

  const insertBox = db.prepare(`
    insert into placed_box (room_id, view, x, y, width, height, supply_id,
      unique_id, name_es, name_en, stand_x, stand_y)
    values (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const box of placed.boxes) {
    if (!knownRoom.has(box.room)) continue;
    insertBox.run(box.room, box.view, box.x, box.y, box.width, box.height,
      box.supply, box.unique, box.nameES, box.nameEN, box.standX, box.standY);
  }

  db.exec("commit");
  if (strayBots) console.warn(`  ! ${strayBots} bot(s) en salas que no existen`);
}

// MARK: - Routes

{
  const insertRoute = db.prepare(
    `insert into route (room_id, idx, name, nodes) values (?,?,?,?)`);
  const insertNode = db.prepare(`
    insert into route_node (room_id, route_idx, idx, x, y, z, angle, eta, flag)
    values (?,?,?,?,?,?,?,?,?)`);
  db.exec("begin");
  for (const entry of routes) {
    for (const route of entry.routes) {
      insertRoute.run(entry.room, route.index, route.name, route.nodes.length);
      route.nodes.forEach((node, idx) =>
        insertNode.run(entry.room, route.index, idx, node.position.x,
          node.position.y, node.position.z, node.angle, node.eta,
          node.flag ? 1 : 0));
    }
  }
  db.exec("commit");
}

// MARK: - The client's own odds and ends

{
  const insertTrainer = db.prepare(`
    insert into trainer (skill_id, room_id, name_es, name_en, dept_es, dept_en)
    values (?,?,?,?,?,?)`);
  const insertDepartment = db.prepare(
    `insert into department (id, name, image) values (?,?,?)`);
  db.exec("begin");
  for (const t of trainers) {
    for (const room of t.rooms) {
      insertTrainer.run(t.skill, room, t.nameES, t.nameEN, t.departmentES,
        t.departmentEN);
    }
  }
  for (const [id, d] of Object.entries(departments)) {
    insertDepartment.run(Number(id), d.name, d.image);
  }
  db.exec("commit");
}

// MARK: - Indexes

db.exec(`
create index item_type on item(type);
create index item_group on item(grp);
create index item_level on item(level);
create index item_price on item(price);
create index item_related on item(related_item);
create index item_breaks_into on item(breaks_into);
create index item_mod_item on item_mod(item_id);
create index item_mod_stat on item_mod(stat);

create index npc_level on npc(level);
create index npc_supply on npc(supply);
create index npc_loot_npc on npc_loot(npc_id);
create index npc_loot_item on npc_loot(item_id);

create index article_supply on article(supply_id);
create index article_skill on article(skill);
create index article_kind on article(kind);
create index ingredient_article on article_ingredient(article_id);
create index ingredient_item on article_ingredient(item_id);
create index result_article on article_result(article_id);
create index result_item on article_result(item_id);
create index supply_line_supply on supply_line(supply_id);

create index door_room on door(room_id);
create index door_to on door(to_room);
create index room_scene on room(scene);
create index room_cluster on room(grid_cluster);
create index room_parent on room(parent_room);
create index plan_jump_from on plan_jump(from_room);

create index placed_bot_room on placed_bot(room_id);
create index placed_bot_npc on placed_bot(npc_id);
create index placed_shop_room on placed_shop(room_id);
create index placed_shop_supply on placed_shop(supply_id);
create index placed_box_room on placed_box(room_id);
create index placed_box_supply on placed_box(supply_id);

create index crime_characteristic_crime on crime_characteristic(crime_id);
create index crime_skill_crime on crime_skill(crime_id);
create index crime_skill_skill on crime_skill(skill_id);
create index trainer_skill on trainer(skill_id);
create index route_node_route on route_node(room_id, route_idx);
`);

// MARK: - Search

// `remove_diacritics 2` is the point of this: without it "pantalon" does not
// find "pantalón", which in Spanish is most of the catalogue. It is the newer
// of the two unicode61 diacritic rules and the one that folds the whole Latin
// range rather than only latin-1.
db.exec(`
create virtual table search using fts5(
  kind unindexed,
  ref unindexed,
  name,
  extra,
  tokenize = 'unicode61 remove_diacritics 2'
);

insert into search (kind, ref, name, extra)
  select 'objeto', id, name, label || ' ' || grp || ' nivel ' || level from item;

insert into search (kind, ref, name, extra)
  select 'npc', id, name, model || ' nivel ' || level from npc;

insert into search (kind, ref, name, extra)
  select 'sala', id, label, scene || coalesce(' ' || game_name, '') from room;

insert into search (kind, ref, name, extra)
  select 'vendedor', id, name, coalesce(vendor_note, '') from supply;

insert into search (kind, ref, name, extra)
  -- A recipe is searchable by its own label and by what it makes, which is
  -- what somebody actually types: "huevo duro", not the vendor's number.
  select 'receta', a.id, a.name, coalesce(group_concat(i.name, ' '), '')
    from article a
    left join article_result r on r.article_id = a.id
    left join item i on i.id = r.item_id
   where a.kind = 'receta' and a.name not in ('', 'VOID', '<VOID>')
   group by a.id;
`);

// MARK: - Meta

{
  const insert = db.prepare(`insert into meta (key, value) values (?,?)`);
  const count = (table) =>
    db.prepare(`select count(*) as n from ${table}`).get().n;

  const rows = {
    built_at: new Date().toISOString(),
    export_at: meta.exportedAt,
    map: meta.map,
    items: count("item"),
    item_mods: count("item_mod"),
    npcs: count("npc"),
    loot: count("npc_loot"),
    supplies: count("supply"),
    articles: count("article"),
    recipes: db.prepare(
      `select count(*) as n from article where kind = 'receta'`).get().n,
    purchases: db.prepare(
      `select count(*) as n from article where kind = 'compra'`).get().n,
    services: db.prepare(
      `select count(*) as n from article where kind = 'servicio'`).get().n,
    rooms: count("room"),
    doors: count("door"),
    placed_bots: count("placed_bot"),
    placed_shops: count("placed_shop"),
    placed_boxes: count("placed_box"),
    routes: count("route"),
    crimes: count("crime"),
    skills: count("skill"),
    trainers: count("trainer"),
    departments: count("department"),
    search_rows: count("search"),
    room_views: db.prepare(
      `select coalesce(sum(views), 0) as n from room`).get().n,
    plan_placed: plan.placedAt.size,
    plan_clusters: plan.clusters.size,
    plan_interior: plan.interior.size,
    plan_jumps: plan.jumps.length,
  };
  db.exec("begin");
  for (const [key, value] of Object.entries(rows)) insert.run(key, String(value));
  db.exec("commit");

  db.exec("pragma wal_checkpoint(truncate)");
  db.exec("vacuum");
  db.close();

  const size = statSync(outPath).size;
  console.log(`\n${outPath}  ${(size / 1024 / 1024).toFixed(1)} MB\n`);
  for (const [key, value] of Object.entries(rows)) {
    console.log(`  ${key.padEnd(16)} ${value}`);
  }
  const loose = rooms.length - plan.placedAt.size - plan.interior.size;
  if (loose) {
    console.log(
      `\n  ${loose} sala(s) ni en el plano ni dentro de otra: ninguna puerta llega a ellas`);
  }
}
