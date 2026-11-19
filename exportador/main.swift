import Editor
import Foundation
import SNS2

/// `guide-export` — the world, as JSON, for the web guide.
///
/// The parsers are the server's and the editor's own: nothing here reads a byte
/// of the game's formats itself. That is the whole point of the tool. The
/// guide's data and the server's data cannot drift apart, because they come out
/// of the same code and out of the same `*.gamedata` the server loads.
///
///     swift run guide-export \
///         --map GameData/PRISONMAP_DEFAULT.gamedata \
///         --game ~/Downloads/"Prison Legacy"/game \
///         --out ~/Documents/TalegoGuia/data/export
///
/// What comes out is one JSON file per catalogue plus a `meta.json` saying what
/// was read. The images are not this tool's job: `plpak extract` already does
/// that, and `scripts/export.sh` runs both.

// MARK: - The command line

struct Options {
    var map = "GameData/PRISONMAP_DEFAULT.gamedata"
    var game: String?
    var out = "export"
    /// Where `gfx/fondos` was extracted to, if it was. Only used to count how
    /// many camera views a room has.
    var fondos: String?
    var quiet = false
}

func parseOptions() -> Options {
    var options = Options()
    var arguments = Array(CommandLine.arguments.dropFirst())

    while let argument = arguments.first {
        arguments.removeFirst()
        func value(_ name: String) -> String {
            guard let next = arguments.first else {
                FileHandle.standardError.write(Data("falta el valor de \(name)\n".utf8))
                exit(2)
            }
            arguments.removeFirst()
            return (next as NSString).expandingTildeInPath
        }
        switch argument {
        case "--map": options.map = value("--map")
        case "--game": options.game = value("--game")
        case "--out": options.out = value("--out")
        case "--fondos": options.fondos = value("--fondos")
        case "--quiet", "-q": options.quiet = true
        case "--help", "-h":
            print("""
            guide-export — exporta el mundo a JSON para la guía web

              --map <fichero.gamedata>   el mapa compilado (por omisión GameData/PRISONMAP_DEFAULT.gamedata)
              --game <carpeta game>      la instalación del juego, para sus textos
              --out <carpeta>            dónde escribir el JSON (por omisión ./export)
              --fondos <carpeta>         gfx/fondos ya extraído, para contar las vistas de cada sala
              --quiet                    sin el informe por pantalla
            """)
            exit(0)
        default:
            FileHandle.standardError.write(Data("no entiendo «\(argument)»\n".utf8))
            exit(2)
        }
    }
    return options
}

let options = parseOptions()
var missing: [String] = []

func say(_ line: String) {
    guard !options.quiet else { return }
    print(line)
}

func note(_ what: String) {
    missing.append(what)
    FileHandle.standardError.write(Data("  ·  falta: \(what)\n".utf8))
}

// MARK: - The map, and the catalogues inside it

let mapPath = (options.map as NSString).expandingTildeInPath
guard FileManager.default.fileExists(atPath: mapPath) else {
    FileHandle.standardError.write(Data("no encuentro el mapa en \(mapPath)\n".utf8))
    exit(1)
}
let mapBytes = (try? FileManager.default
    .attributesOfItem(atPath: mapPath)[.size] as? Int) ?? 0

let gameData = GameDataFile()
let loadedMap = gameData.load(path: mapPath)
if !loadedMap { note("el *.gamedata no se pudo leer entero") }
say("mapa · \(gameData.roomCount) salas, \(gameData.doorCount) puertas (v7)")

/// The catalogues live in the file's trailer, each one carrying its own length.
let (_, sections) = GameDataSections.read(trailer: gameData.trailer)
say("secciones · \(sections.keys.sorted().joined(separator: " "))")

// MARK: - Where the client's own files are

/// Beside the map is where the captured tables sit, and they are the fallback
/// for anything the map has no section for.
let beside = (mapPath as NSString).deletingLastPathComponent
let gameDirectory = options.game.map { ($0 as NSString).expandingTildeInPath }
let config = gameDirectory.map { $0 + "/Data/Config" }
let languages = config.map { $0 + "/languages" }

// MARK: - The client's text

/// The message table is what names an item's type and a modifier's stat, and
/// what an article's `text` indexes. Without it those stay numbers.
let messagesES = languages.map { ClientText.messages($0 + "/ES_Lan_Messages.txt") } ?? [:]
let messagesEN = languages.map { ClientText.messages($0 + "/EN_Lan_Messages.txt") } ?? [:]
if messagesES.isEmpty { note("ES_Lan_Messages.txt (los tipos y los stats se quedan en números)") }
say("textos · \(messagesES.count) mensajes ES, \(messagesEN.count) EN")

/// An item's **type 1 names itself with message 213**, and the run is
/// contiguous from there: Arma, Spray, Comida, Medicamento, Carga, Dinero,
/// Especial, Combinador, the four Protecciones, Camisa, Pantalón. The client
/// turns the number into the word itself and shows "NoTypeString?" outside its
/// range, so a type with no message here is left unnamed rather than guessed.
let firstTypeMessage = 213
let namedTypes = 14

func typeName(_ type: Int, _ table: [Int: String]) -> String? {
    guard type >= 1, type <= namedTypes else { return nil }
    return table[firstTypeMessage + type - 1]
}

/// The nine stat abbreviations follow the types: SAL, FUE, DES, EXP, AGI, CON,
/// INT, CAR, PRO at 227…235. A modifier's `stat` is 1-based into that run.
let firstStatMessage = 227
let namedStats = 9

func statName(_ stat: Int, _ table: [Int: String]) -> String? {
    guard stat >= 1, stat <= namedStats else { return nil }
    return table[firstStatMessage + stat - 1]
}

// MARK: - OBJECTINFO

var items: [Payload.Item] = []
var iconNames: [String] = []

if let body = sections[GameDataSections.objects],
   let table = try? ObjectInfoTable(body: body) {
    iconNames = table.icons
    items = table.items.map { item in
        Payload.Item(
            id: Int(item.id),
            name: item.singular,
            plural: item.plural,
            type: Int(item.type),
            typeName: typeName(Int(item.type), messagesES),
            iconIndex: Int(item.iconIndex),
            icon: Int(item.iconIndex) < table.icons.count
                ? table.icons[Int(item.iconIndex)] : nil,
            level: Int(item.level),
            price: Int(item.price),
            weight: Int(item.weight),
            handling: Int(item.handling),
            effect: Int(item.effect),
            modifier: Int(item.modifier),
            contains: Int(item.contains),
            breakChance: Int(item.breakChance),
            breaksInto: Int(item.breaksInto),
            flags: Int(item.flags),
            relatedItem: Int(item.relatedItem),
            crimeMask: Int(item.crimeMask),
            soundType: Int(item.soundType),
            weaponSkill: Int(item.weaponSkill),
            modifiers: item.modifiers.map {
                Payload.Modifier(stat: Int($0.stat),
                                 statName: statName(Int($0.stat), messagesES),
                                 value: Int($0.value))
            })
    }
    say("objetos · \(items.count), \(table.icons.count) iconos")
} else {
    note("la sección OBJE del mapa")
}

// MARK: - BOTSINFO

var npcs: [Payload.Npc] = []

if let body = sections[GameDataSections.npcs],
   let table = try? BotsInfoTable(body: body) {
    npcs = table.bots.map { bot in
        Payload.Npc(
            id: Int(bot.id),
            name: table.name(of: bot),
            model: table.model(of: bot),
            crime: Int(bot.crime),
            money: Int(bot.money),
            health: Int(bot.health),
            strength: Int(bot.strength),
            dexterity: Int(bot.dexterity),
            field17: Int(bot.field17),
            level: Int(bot.level),
            textCount: Int(bot.textCount),
            aggressiveness: Int(bot.aggressiveness),
            supply: Int(bot.supply),
            loot: bot.loot.map { Payload.Loot(item: Int($0.item), value: Int($0.value)) })
    }
    let loot = npcs.reduce(0) { $0 + $1.loot.count }
    say("NPCs · \(npcs.count), \(table.models.count) modelos, \(loot) de botín")
} else {
    note("la sección NPCS del mapa")
}

// MARK: - SUPPLIESINFO, which is also every recipe in the game

var supplies: [Payload.Supply] = []

let shopDialogue = config.map { ClientText.shopDialogue($0 + "/ShopTxt.ini") } ?? [:]
if shopDialogue.isEmpty { note("ShopTxt.ini (los vendedores se quedan sin diálogo)") }

if let body = sections[GameDataSections.supplies],
   let table = try? SuppliesInfoTable(body: body) {
    supplies = table.supplies.map { supply in
        let dialogue = shopDialogue[Int(supply.vendorText)]
        return Payload.Supply(
            id: Int(supply.id),
            name: supply.name,
            mode: Int(supply.mode),
            vendorText: Int(supply.vendorText),
            vendorNote: dialogue?.note,
            vendorLines: dialogue?.lines ?? [],
            articles: supply.articles.map { article in
                Payload.Article(
                    item: Int(article.item),
                    level: Int(article.level),
                    service: Int(article.service),
                    givesExperience: Int(article.givesExperience),
                    skill: Int(article.skill),
                    name: article.name,
                    crimeMask: Int(article.crimeMask),
                    text: Int(article.text),
                    textES: messagesES[Int(article.text)],
                    textEN: messagesEN[Int(article.text)],
                    ingredients: article.ingredients.map {
                        Payload.Ingredient(item: Int($0.item), quantity: Int($0.quantity))
                    },
                    results: article.results.map {
                        Payload.Result(item: Int($0.item), quantity: Int($0.quantity))
                    })
            })
    }
    say("supplies · \(supplies.count), \(table.articleCount) artículos")
} else {
    note("la sección SUPP del mapa")
}

// MARK: - CLASSINFO: the crimes

var skills: Payload.Skills?

if let body = sections[GameDataSections.skills],
   let catalogue = SkillsCatalogue(section: body) {
    skills = Payload.Skills(
        characteristics: catalogue.allCharacteristics.map {
            Payload.NamedStat(id: Int($0.id), name: $0.name)
        },
        skills: catalogue.allSkills.map {
            Payload.NamedStat(id: Int($0.id), name: $0.name)
        },
        crimes: catalogue.crimes.map { crime in
            Payload.Crime(
                id: Int(crime.id),
                maleName: crime.maleName,
                femaleName: crime.femaleName,
                abbreviation: crime.abbreviation,
                characteristics: crime.characteristics.map {
                    Payload.CrimeCharacteristic(id: Int($0.id), name: $0.name,
                                                initial: $0.initial)
                },
                skills: crime.skills.map {
                    Payload.CrimeSkill(id: Int($0.id), name: $0.name,
                                       initial: $0.initial, ceiling: $0.ceiling,
                                       level: $0.level)
                },
                startingItems: crime.startingItems.map {
                    Payload.StartingItem(item: Int($0.item), quantity: $0.quantity)
                })
        })
    say("delitos · \(catalogue.count), \(catalogue.allSkills.count) habilidades")
} else {
    note("la sección SKIL del mapa")
}

// MARK: - The rooms, out of MAPINFO

/// **MAPINFO is the authority on the map**, not the `*.gamedata`: it is v8's
/// own table, it is the one the client is handed, and it carries 2194 doors
/// against the gamedata's 888 — a module's 64 cell doors are only here. The
/// gamedata is read alongside it for the room names it has, and resolves
/// nothing.
var rooms: [Payload.Room] = []

let mapInfoCandidates = [
    beside + "/mapinfo_v8_official.bin",
    beside + "/mapinfo_generado.bin",
]
let mapInfoPath = mapInfoCandidates.first {
    FileManager.default.fileExists(atPath: $0)
}

/// How many camera views a scene has: one background per view, named
/// `<scene><n>_fullhd.png`. Counted from what was extracted rather than
/// assumed, because the count differs per room — `al_pasillo` has nine.
func viewCount(scene: String, in directory: String?) -> Int {
    guard let directory,
          let entries = try? FileManager.default.contentsOfDirectory(atPath: directory)
    else { return 0 }
    let prefix = scene.lowercased()
    var highest = 0
    for entry in entries {
        let name = entry.lowercased()
        guard name.hasPrefix(prefix), name.hasSuffix(".png") else { continue }
        // What sits between the scene's name and the extension is the view's
        // number, with the HD suffix behind it.
        var middle = String(name.dropFirst(prefix.count).dropLast(4))
        if let underscore = middle.firstIndex(of: "_") { middle = String(middle[..<underscore]) }
        if let n = Int(middle), n > highest { highest = n }
    }
    return highest
}

let mobLevels = config.flatMap { MobLevels(path: $0 + "/moblevels.txt") }
if mobLevels == nil { note("moblevels.txt (las salas se quedan sin nivel de enemigos)") }

func cardinal(_ selector: DoorSelector) -> String? {
    switch selector {
    case .north: "norte"
    case .south: "sur"
    case .east: "este"
    case .west: "oeste"
    default: nil
    }
}

if let mapInfoPath, let mapInfo = MapInfoTable(path: mapInfoPath) {
    let world = WorldMap(mapInfo: mapInfo, gameData: loadedMap ? gameData : nil)
    rooms = mapInfo.allTemplates.map { template in
        let legacy = gameData.room(template.id)
        let band = mobLevels?.band(of: template.id)
        return Payload.Room(
            id: Int(template.id),
            label: template.label,
            scene: template.sceneFile,
            roomType: Int(template.roomType),
            accessMask: Int(world.accessMask(room: template.id)),
            doors: template.doors.map {
                Payload.Door(name: $0.name, selector: Int($0.selector.value),
                             cardinal: cardinal($0.selector),
                             to: Int($0.destinationTemplate),
                             pickLockItem: Int($0.pickLockItem))
            },
            gameName: legacy?.gameName,
            zoneType: legacy.map { Int($0.zoneType) },
            isSafeZone: legacy?.isSafeZone,
            levelLow: band?.lowest,
            levelHigh: band?.highest,
            levelLow2: band?.second?.lowest,
            levelHigh2: band?.second?.highest,
            views: viewCount(scene: template.sceneFile, in: options.fondos))
    }
    say("salas · \(rooms.count), \(mapInfo.doorCount) puertas (MAPINFO v8)")
} else {
    note("mapinfo_v8_official.bin — sin él no hay mapa")
}

// MARK: - What stands in the rooms

var placed = Payload.Placed(bots: [], shops: [], boxes: [])

if let body = sections[GameDataSections.bots],
   let bots = [PlacedBot].bots(section: body) {
    placed.bots = bots.map {
        Payload.PlacedBotOut(
            room: Int($0.room), npc: Int($0.aspect), door: Int($0.door),
            route: $0.route.map(Int.init),
            position: $0.position.map { Payload.Point(x: $0.x, y: $0.y, z: $0.z) },
            angle: $0.angle)
    }
    say("bots colocados · \(placed.bots.count)")
}

if let body = sections[GameDataSections.shops],
   let shops = [PlacedShop].shops(section: body) {
    placed.shops = shops.map {
        Payload.PlacedShopOut(
            room: Int($0.room), id: Int($0.id), name: $0.name, npc: Int($0.aspect),
            position: Payload.Point(x: $0.position.x, y: $0.position.y,
                                    z: $0.position.z),
            angle: $0.angle, flags: Int($0.flags), supply: Int($0.supply),
            uniqueSupply: Int($0.uniqueSupply))
    }
    say("puestos · \(placed.shops.count)")
}

if let body = sections[GameDataSections.placedBoxes],
   let boxes = [PlacedBox].boxes(section: body) {
    placed.boxes = boxes.map {
        Payload.PlacedBoxOut(
            room: Int($0.room), view: $0.view, x: Int($0.x), y: Int($0.y),
            width: Int($0.width), height: Int($0.height), supply: Int($0.supply),
            unique: Int($0.unique), nameES: $0.spanish, nameEN: $0.english,
            standX: Int($0.standX), standY: Int($0.standY))
    }
    say("cajas · \(placed.boxes.count)")
}

// MARK: - The patrol routes

var routes: [Payload.RoomRoutes] = []

if let body = sections[GameDataSections.routes],
   let byRoom = [UInt32: RouteFile].routes(section: body) {
    routes = byRoom.keys.sorted().map { room in
        let file = byRoom[room]!
        return Payload.RoomRoutes(
            room: Int(room),
            routes: file.routes.enumerated().map { index, route in
                Payload.Route(
                    index: index, name: route.name,
                    nodes: route.nodes.map { node in
                        Payload.RouteNode(
                            position: Payload.Point(x: node.position.x,
                                                    y: node.position.y,
                                                    z: node.position.z),
                            angle: node.angle, eta: Int(node.eta), flag: node.flag,
                            waypoints: node.waypoints.map {
                                Payload.Point(x: $0.x, y: $0.y, z: $0.z)
                            })
                    })
            })
    }
    let nodes = routes.reduce(0) { $0 + $1.routes.reduce(0) { $0 + $1.nodes.count } }
    say("rutas · \(routes.reduce(0) { $0 + $1.routes.count }) en \(routes.count) sala(s), \(nodes) nodos")
}

// MARK: - The rest of the client's own files

let departments = config.map { ClientText.departments($0 + "/mapdpts.ini") } ?? [:]
let trainers = config.map { ClientText.trainers($0 + "/skilltrainers.txt") } ?? []
let fightPhrases = config.map { ClientText.fightPhrases($0 + "/npctxt.ini") } ?? [:]
say("cliente · \(departments.count) departamentos, \(trainers.count) maestros, "
    + "\(fightPhrases.count) bloques de frases")

// MARK: - Writing it out

let out = URL(fileURLWithPath: (options.out as NSString).expandingTildeInPath)
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

let encoder = JSONEncoder()
// Sorted keys so a re-export of the same map produces the same bytes and a
// diff shows what actually changed.
encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]

func write<T: Encodable>(_ value: T, _ name: String) throws {
    let url = out.appendingPathComponent(name)
    try encoder.encode(value).write(to: url, options: .atomic)
    let size = (try? FileManager.default
        .attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    say(String(format: "  → %-20@ %7.1f KB", name as NSString,
               Double(size) / 1024))
}

try write(items, "items.json")
try write(npcs, "npcs.json")
try write(supplies, "supplies.json")
if let skills { try write(skills, "skills.json") }
try write(rooms, "rooms.json")
try write(placed, "placed.json")
try write(routes, "routes.json")
try write(iconNames, "icons.json")
try write(messagesES, "strings-es.json")
try write(messagesEN, "strings-en.json")
try write(trainers, "trainers.json")
try write(departments.mapValues { ["name": $0.name, "image": $0.image] },
          "departments.json")
try write(fightPhrases.mapValues { ["note": [$0.note], "lines": $0.lines] },
          "fight-phrases.json")

let formatter = ISO8601DateFormatter()
let meta = Payload.Meta(
    exportedAt: formatter.string(from: Date()),
    map: (mapPath as NSString).lastPathComponent,
    mapBytes: mapBytes,
    gameDirectory: gameDirectory,
    counts: [
        "items": items.count,
        "icons": iconNames.count,
        "npcs": npcs.count,
        "loot": npcs.reduce(0) { $0 + $1.loot.count },
        "supplies": supplies.count,
        "articles": supplies.reduce(0) { $0 + $1.articles.count },
        "recipes": supplies.reduce(0) {
            $0 + $1.articles.filter { !$0.ingredients.isEmpty }.count
        },
        "crimes": skills?.crimes.count ?? 0,
        "skills": skills?.skills.count ?? 0,
        "rooms": rooms.count,
        "doors": rooms.reduce(0) { $0 + $1.doors.count },
        "placedBots": placed.bots.count,
        "placedShops": placed.shops.count,
        "placedBoxes": placed.boxes.count,
        "routes": routes.reduce(0) { $0 + $1.routes.count },
        "departments": departments.count,
        "trainers": trainers.count,
        "messagesES": messagesES.count,
        "messagesEN": messagesEN.count,
    ],
    missing: missing)
try write(meta, "meta.json")

if missing.isEmpty {
    say("\nlisto, sin nada que falte → \(out.path)")
} else {
    say("\nlisto, pero faltan \(missing.count) cosa(s) → \(out.path)")
}
