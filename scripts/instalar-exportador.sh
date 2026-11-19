#!/usr/bin/env bash
#
# Pone el exportador de este repositorio dentro de PrisonServer, que es donde
# Swift puede compilarlo.
#
# La copia buena es la de `exportador/`. Esto va en un solo sentido —de aquí al
# servidor, nunca al revés— y por eso las dos no pueden separarse: la del
# servidor es un artefacto, se sobrescribe sin preguntar.
#
# Lo llama `scripts/export.sh` antes de compilar, así que a mano solo hace falta
# si vas a compilar el exportador por tu cuenta.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="${PRISON_SERVER:-$HOME/Documents/PrisonServer}"
target="$SERVER/Sources/GuideExport"

[ -d "$SERVER" ] || {
  echo "✗ no encuentro PrisonServer en $SERVER (pon PRISON_SERVER)" >&2
  exit 1
}

mkdir -p "$target"
changed=0
for file in "$here"/exportador/*.swift; do
  name="$(basename "$file")"
  if ! cmp -s "$file" "$target/$name"; then
    cp "$file" "$target/$name"
    echo "  → Sources/GuideExport/$name"
    changed=1
  fi
done
[ "$changed" = 1 ] && echo "exportador actualizado en $SERVER"

# El producto tiene que estar declarado, y eso no se puede copiar: el
# Package.swift del servidor es suyo y lleva muchas otras cosas.
if ! grep -q 'name: "guide-export"' "$SERVER/Package.swift"; then
  cat >&2 <<'MSG'

✗ El Package.swift del servidor no declara el exportador. Añádele estas dos
  líneas, una en `products:` y otra en `targets:`

      .executable(name: "guide-export", targets: ["GuideExport"]),
      .executableTarget(name: "GuideExport", dependencies: ["SNS2", "Editor"]),

MSG
  exit 1
fi
