import Foundation

/// What the guide gets. One file per catalogue, flat and boring on purpose:
/// the web side does the joining, so nothing here is nested for a particular
/// page's convenience.
///
/// Every field that the tables carry is exported, including the ones whose
/// meaning is not settled — `field17`, an article's `service`, an item's
/// `flags`. Dropping them would make the guide a second, poorer truth; they
/// travel with the name the Swift side gives them, which is either what the
/// client's code says or no name at all.
enum Payload {}

// MARK: - Items

extension Payload {
    struct Modifier: Codable {
        var stat: Int
        /// `SAL`, `FUE`… out of the client's own message table when it has a
        /// name there, and nothing when it does not.
        var statName: String?
        var value: Int
    }

    struct Item: Codable {
        var id: Int
        /// The singular, which is what a list shows.
        var name: String
        /// The plural, for "coges 3 camisas".
        var plural: String
        var type: Int
        /// The type's name, read out of the client's message table rather than
        /// invented. Nil for a type the table does not name.
        var typeName: String?
        var iconIndex: Int
        /// The icon's name in the table, which is the base name of a
        /// `data/objetos/<icon>.png` inside the paks.
        var icon: String?
        var level: Int
        var price: Int
        var weight: Int
        var handling: Int
        var effect: Int
        var modifier: Int
        var contains: Int
        var breakChance: Int
        var breaksInto: Int
        var flags: Int
        var relatedItem: Int
        /// Which crimes may use it, one bit each.
        var crimeMask: Int
        var soundType: Int
        var weaponSkill: Int
        var modifiers: [Modifier]
    }
}

// MARK: - NPCs

extension Payload {
    struct Loot: Codable {
        var item: Int
        /// A chance or a quantity — the table does not say which, so it is not
        /// named one.
        var value: Int
    }

    struct Npc: Codable {
        var id: Int
        var name: String
        var model: String
        var crime: Int
        var money: Int
        var health: Int
        var strength: Int
        var dexterity: Int
        /// +0x17. Deliberately unnamed: v7 calls it the level and v8 does not
        /// put the level there.
        var field17: Int
        /// +0x1B, which is the level.
        var level: Int
        var textCount: Int
        var aggressiveness: Int
        /// The supply it sells, 0 for a bot that sells nothing.
        var supply: Int
        var loot: [Loot]
    }
}

// MARK: - Supplies, which is also the crafting

extension Payload {
    struct Ingredient: Codable {
        var item: Int
        var quantity: Int
    }

    struct Result: Codable {
        var item: Int
        var quantity: Int
    }

    struct Article: Codable {
        var item: Int
        var level: Int
        var service: Int
        var givesExperience: Int
        var skill: Int
        var name: String
        var crimeMask: Int
        /// The reply the NPC gives, into the client's message table.
        var text: Int
        var textES: String?
        var textEN: String?
        var ingredients: [Ingredient]
        var results: [Result]
    }

    struct Supply: Codable {
        var id: Int
        var name: String
        var mode: Int
        var vendorText: Int
        /// Who the vendor is, out of the `;comment` beside the block in
        /// `ShopTxt.ini` — the only place that name is written down.
        var vendorNote: String?
        /// Everything the vendor can open with, all of it: the client picks one
        /// at random.
        var vendorLines: [String]
        var articles: [Article]
    }
}

// MARK: - Crimes, characteristics and skills

extension Payload {
    struct NamedStat: Codable {
        var id: Int
        var name: String
    }

    struct CrimeCharacteristic: Codable {
        var id: Int
        var name: String
        var initial: Int
    }

    struct CrimeSkill: Codable {
        var id: Int
        var name: String
        var initial: Int
        var ceiling: Int
        var level: Int
    }

    struct StartingItem: Codable {
        var item: Int
        var quantity: Int
    }

    struct Crime: Codable {
        var id: Int
        var maleName: String
        var femaleName: String
        var abbreviation: String
        var characteristics: [CrimeCharacteristic]
        var skills: [CrimeSkill]
        /// What the crime starts the game with. **The client is never told
        /// this**, so it only exists where the map already carried it.
        var startingItems: [StartingItem]
    }

    struct Skills: Codable {
        var characteristics: [NamedStat]
        var skills: [NamedStat]
        var crimes: [Crime]
    }
}

// MARK: - The world

extension Payload {
    struct Door: Codable {
        /// The 3D object's name — "p3", "pn"…
        var name: String
        /// The byte that travels in a PASSDOOR.
        var selector: Int
        /// "norte", "sur", "este", "oeste" or nil for a numbered door.
        var cardinal: String?
        /// The room it leads to. 0 means the table does not say, and then the
        /// door cannot be crossed from here.
        var to: Int
        /// The item it is forced with. 0 means it cannot be forced.
        var pickLockItem: Int
    }

    struct Room: Codable {
        var id: Int
        var label: String
        /// `GFX\NGE\<scene>.R3D`, and the base name of the backgrounds.
        var scene: String
        var roomType: Int
        /// Which cardinal exits are open, as the byte the client calls its
        /// access mask: pn 1, ps 2, pe 4, po 8.
        var accessMask: Int
        var doors: [Door]
        /// The name the v7 `*.gamedata` gives the same room, where it has one.
        var gameName: String?
        var zoneType: Int?
        var isSafeZone: Bool?
        /// The enemy level band the client shows on the 2D map.
        var levelLow: Int?
        var levelHigh: Int?
        var levelLow2: Int?
        var levelHigh2: Int?
        /// How many camera views the room has, from the backgrounds shipped
        /// for its scene.
        var views: Int
    }
}

// MARK: - What stands in the rooms

extension Payload {
    struct Point: Codable {
        var x: Float
        var y: Float
        var z: Float
    }

    /// A bot standing in the world: which NPC, in which room, through which
    /// door, walking which route.
    struct PlacedBotOut: Codable {
        var room: Int
        var npc: Int
        var door: Int
        var route: Int?
        var position: Point?
        var angle: Float
    }

    /// A vendor, a box or a locker with a supply behind it. **This is how an
    /// object reaches a room** — the game has no loose object on the floor.
    struct PlacedShopOut: Codable {
        var room: Int
        var id: Int
        var name: String
        var npc: Int
        var position: Point
        var angle: Float
        var flags: Int
        var supply: Int
        var uniqueSupply: Int
    }

    /// A clickable rectangle on one view of a room, with a supply behind it.
    struct PlacedBoxOut: Codable {
        var room: Int
        var view: Int
        var x: Int
        var y: Int
        var width: Int
        var height: Int
        var supply: Int
        var unique: Int
        var nameES: String
        var nameEN: String
        var standX: Int
        var standY: Int
    }

    struct Placed: Codable {
        var bots: [PlacedBotOut]
        var shops: [PlacedShopOut]
        var boxes: [PlacedBoxOut]
    }
}

// MARK: - Routes

extension Payload {
    struct RouteNode: Codable {
        var position: Point
        var angle: Float
        /// Where the game's own timing says this leg takes; 0 means it does not
        /// say and the walker's speed decides.
        var eta: Int
        var flag: Bool
        var waypoints: [Point]
    }

    struct Route: Codable {
        var index: Int
        var name: String
        var nodes: [RouteNode]
    }

    struct RoomRoutes: Codable {
        var room: Int
        var routes: [Route]
    }
}

// MARK: - The run itself

extension Payload {
    /// What was read, from where, and how much of it. Written beside the data
    /// so a guide build can say which map it was made from.
    struct Meta: Codable {
        var exportedAt: String
        var map: String
        var mapBytes: Int
        var gameDirectory: String?
        var counts: [String: Int]
        /// Anything that could not be read. An empty list is the only clean
        /// run; the web build refuses to go on without the catalogues.
        var missing: [String]
    }
}
