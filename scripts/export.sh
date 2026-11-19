#!/usr/bin/env bash
#
# The whole chain, from the server's map to the guide's database.
#
#   scripts/export.sh [--map <fichero.gamedata>] [--sin-imagenes]
#
# Four steps, each of which can be run on its own:
#
#   1. guide-export   the *.gamedata and the client's config → JSON
#   2. plpak extract  the paks → PNG (icons and room backgrounds)
#   3. build-media    those PNGs → WebP in public/
#   4. build-db       the JSON → data/prison.db
#
# Steps 2 and 3 are the slow ones and they are idempotent: build-media skips a
# file it already wrote, so re-running after a map change is quick. Pass
# --sin-imagenes to skip them entirely, which is what you want when only the map
# changed and no art did.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Where the pieces live. Override with the environment if yours are elsewhere.
SERVER="${PRISON_SERVER:-$HOME/Documents/PrisonServer}"
PAKKIT="${PRISON_PAKKIT:-$HOME/Documents/PLPakKit}"
GAME="${PRISON_GAME:-$HOME/Downloads/Prison Legacy/game}"
MAP="${PRISON_MAP:-$SERVER/GameData/PRISONMAP_DEFAULT.gamedata}"

# The decoded PNGs are an intermediate, not an input and not an output: they are
# 3 GB and everything that survives is the WebP in public/.
WORK="${PRISON_WORK:-${TMPDIR:-/tmp}/talego-guia}"

images=1
while [ $# -gt 0 ]; do
  case "$1" in
    --map) MAP="$2"; shift 2 ;;
    --sin-imagenes) images=0; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "no entiendo «$1»" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$MAP" ] || die "no encuentro el mapa en $MAP"
[ -d "$SERVER" ] || die "no encuentro PrisonServer en $SERVER (pon PRISON_SERVER)"

# MARK: 1 — the world as JSON

say "1/4  exportando el mundo desde $(basename "$MAP")"
# El exportador vive en este repositorio y se compila en el del servidor, así
# que antes de compilar se copia. Sin esto, un cambio aquí no se notaría.
"$here/scripts/instalar-exportador.sh"
(
  cd "$SERVER"
  # Release, because this reads 2.9 MB of compressed tables and the debug build
  # spends most of its time in bounds checks.
  swift build -c release --product guide-export
  .build/release/guide-export \
    --map "$MAP" \
    --game "$GAME" \
    --out "$here/data/export"
)

# MARK: 2 — the pictures out of the paks

if [ "$images" = 1 ]; then
  [ -d "$PAKKIT" ] || die "no encuentro PLPakKit en $PAKKIT (pon PRISON_PAKKIT)"
  [ -d "$GAME" ] || die "no encuentro el juego en $GAME (pon PRISON_GAME)"

  say "2/4  sacando las imágenes de los .pak"
  mkdir -p "$WORK/iconos" "$WORK/fondos"
  (
    cd "$PAKKIT"
    swift build -c release --product plpak
    # --set resuelve el apilado de parches como lo hace el cliente (el .pNNN
    # más alto gana, y se respetan los borrados). --png descomprime el BC7 con
    # Metal; sin eso, sips saca una imagen de dos colores.
    .build/release/plpak extract "$GAME" -o "$WORK/iconos" \
      --filter "data/objetos/*" --set --png --flat -q
    .build/release/plpak extract "$GAME" -o "$WORK/fondos" \
      --filter "gfx/fondos/*" --set --png --flat -q
  )

  say "3/4  convirtiendo a WebP"
  node "$here/scripts/build-media.mjs" \
    --icons "$WORK/iconos" --rooms "$WORK/fondos"
else
  say "2-3/4  saltando las imágenes (--sin-imagenes)"
fi

# MARK: 4 — the database

say "4/4  construyendo data/prison.db"
node "$here/scripts/build-db.mjs"

say "listo"
echo "  npm run dev   para verlo"
