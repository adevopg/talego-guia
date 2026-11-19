import Foundation

/// The client's own text files, read as they are shipped.
///
/// None of this is in the `*.gamedata` or in the captured tables: it lives in
/// `game/Data/Config`, in plain files the client reads at startup. The guide
/// needs them because **the numbers in the tables are indices into these** —
/// an item's `type` is a message number, a supply's `vendorText` is a block in
/// `ShopTxt.ini`, an article's `text` is the reply the vendor gives.
///
/// Every one of them is **cp1252**, not UTF-8. Reading them as UTF-8 silently
/// fails on the first accented word, which in Spanish is the first line.
enum ClientText {
    /// cp1252, with latin-1 as the fallback. `String(contentsOfFile:)` with
    /// `.windowsCP1252` is what the client's own encoding is.
    static func read(_ path: String) -> String? {
        guard let data = FileManager.default.contents(atPath: path) else { return nil }
        if let text = String(data: data, encoding: .windowsCP1252) { return text }
        return String(data: data, encoding: .isoLatin1)
    }

    /// The lines of one of these files.
    ///
    /// **Not `split(separator: "\n")`.** Swift counts `"\r\n"` as one
    /// `Character`, so splitting a CRLF file on `"\n"` matches nothing and
    /// hands back the whole file as a single line — which is exactly what
    /// happened to `ShopTxt.ini`, `mapdpts.ini` and `npctxt.ini`, while
    /// `skilltrainers.txt` came out fine because it is LF. `isNewline` is true
    /// for that one grapheme and for a bare `\r`, so it reads all three.
    static func lines(of text: String) -> [String] {
        text.split(whereSeparator: \.isNewline).map(String.init)
    }

    // MARK: - The message table

    /// `ES_Lan_Messages.txt`: the whole of the client's text, as `[n]text`.
    ///
    /// Lines that do not start with a bracketed number are the translators'
    /// notes at the top of the file and are skipped. A message's text may be
    /// empty and that is meaningful — the client prints nothing — so an empty
    /// value is kept rather than dropped.
    static func messages(_ path: String) -> [Int: String] {
        guard let text = read(path) else { return [:] }
        var out: [Int: String] = [:]
        for line in lines(of: text) {
            guard line.hasPrefix("["), let close = line.firstIndex(of: "]") else { continue }
            let number = line[line.index(after: line.startIndex) ..< close]
            guard let id = Int(number) else { continue }
            var body = String(line[line.index(after: close)...])
            if body.hasSuffix("\r") { body.removeLast() }
            out[id] = body
        }
        return out
    }

    // MARK: - The vendors' own dialogue

    /// `ShopTxt.ini`: what a shop bot says, by the number a supply carries in
    /// its `vendorText`.
    ///
    ///     [1] ;PRESO FALSIFICADOR-LADRÓN
    ///     3
    ///     <line>
    ///     <line>
    ///     <line>
    ///
    /// The count is on its own line and the client picks one of the lines at
    /// random, so all of them are kept: the guide shows what the NPC *can*
    /// say, not one draw of it.
    static func shopDialogue(_ path: String) -> [Int: (note: String, lines: [String])] {
        guard let text = read(path) else { return [:] }
        var out: [Int: (String, [String])] = [:]
        var current: Int?
        var note = ""
        var want = 0
        var said: [String] = []

        func flush() {
            if let id = current { out[id] = (note, said) }
            current = nil; note = ""; want = 0; said = []
        }

        for line in lines(of: text) {

            if line.hasPrefix("[") , let close = line.firstIndex(of: "]"),
               let id = Int(line[line.index(after: line.startIndex) ..< close]) {
                flush()
                current = id
                // What follows the bracket is a `;comment` naming the vendor,
                // which is the only place that name is written down.
                let rest = line[line.index(after: close)...]
                    .trimmingCharacters(in: .whitespaces)
                note = rest.hasPrefix(";")
                    ? String(rest.dropFirst()).trimmingCharacters(in: .whitespaces)
                    : ""
                continue
            }
            guard current != nil else { continue }

            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix(";") { continue }
            if want == 0, let n = Int(trimmed) { want = n; continue }
            if said.count < want { said.append(trimmed) }
        }
        flush()
        return out
    }

    // MARK: - The 2D map's departments

    /// `mapdpts.ini`: the departments of the in-game 2D map, by the index the
    /// map grid compiles into `MGRD`.
    ///
    ///     idpt=nombre[,png]
    ///
    /// The file's own header says the order is historical and must never be
    /// rearranged, only appended to, so the index is the identity here.
    static func departments(_ path: String) -> [Int: (name: String, image: String)] {
        guard let text = read(path) else { return [:] }
        var out: [Int: (String, String)] = [:]
        for raw in lines(of: text) {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty, !line.hasPrefix(";"),
                  let equals = line.firstIndex(of: "="),
                  let id = Int(line[line.startIndex ..< equals]) else { continue }
            let rest = String(line[line.index(after: equals)...])
            let parts = rest.split(separator: ",", maxSplits: 1).map {
                $0.trimmingCharacters(in: .whitespaces)
            }
            let name = parts.first ?? ""
            // Without a png the thumbnail is named after the department.
            out[id] = (name, parts.count > 1 ? parts[1] : name)
        }
        return out
    }

    // MARK: - Who teaches a skill

    /// `skilltrainers.txt`: the quest-unlocked skills, who teaches each one and
    /// where.
    ///
    ///     skillIndex roomIDs(comma) \t trainer ES \t trainer EN \t dept ES \t dept EN
    struct Trainer: Codable {
        var skill: Int
        var rooms: [UInt32]
        var nameES: String
        var nameEN: String
        var departmentES: String
        var departmentEN: String
    }

    static func trainers(_ path: String) -> [Trainer] {
        guard let text = read(path) else { return [] }
        var out: [Trainer] = []
        for line in lines(of: text) {
            guard !line.hasPrefix("#"), line.contains("\t") else { continue }
            let columns = line.split(separator: "\t", omittingEmptySubsequences: false)
                .map { String($0) }
            guard columns.count >= 5 else { continue }
            // The first column is "skill rooms", space separated.
            let head = columns[0].split(separator: " ").map { String($0) }
            guard let skill = Int(head.first ?? "") else { continue }
            let rooms = head.count > 1
                ? head[1].split(separator: ",").compactMap { UInt32($0) }
                : []
            out.append(Trainer(skill: skill, rooms: rooms,
                               nameES: columns[1], nameEN: columns[2],
                               departmentES: columns[3], departmentEN: columns[4]))
        }
        return out
    }

    // MARK: - Fight phrases

    /// `npctxt.ini`: what an NPC says in a fight, by the block a bot's crime
    /// points at.
    ///
    ///     [1]; POLICÍA:
    ///     n = 12
    ///     1 = ¡Prepárate a morir!
    static func fightPhrases(_ path: String) -> [Int: (note: String, lines: [String])] {
        guard let text = read(path) else { return [:] }
        var out: [Int: (String, [String])] = [:]
        var current: Int?
        var note = ""
        var said: [String] = []

        func flush() {
            if let id = current { out[id] = (note, said) }
            current = nil; note = ""; said = []
        }

        for line in lines(of: text) {

            if line.hasPrefix("["), let close = line.firstIndex(of: "]"),
               let id = Int(line[line.index(after: line.startIndex) ..< close]) {
                flush()
                current = id
                let rest = line[line.index(after: close)...]
                    .trimmingCharacters(in: .whitespaces)
                note = rest.hasPrefix(";")
                    ? String(rest.dropFirst()).trimmingCharacters(in: .whitespaces)
                        .trimmingCharacters(in: CharacterSet(charactersIn: ":"))
                    : ""
                continue
            }
            guard current != nil, let equals = line.firstIndex(of: "=") else { continue }
            let key = line[line.startIndex ..< equals].trimmingCharacters(in: .whitespaces)
            guard Int(key) != nil else { continue }  // "n = 12" is the count
            said.append(String(line[line.index(after: equals)...])
                .trimmingCharacters(in: .whitespaces))
        }
        flush()
        return out
    }
}
