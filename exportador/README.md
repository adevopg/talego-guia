# El exportador

Las tres fuentes del `guide-export`, el programa que lee el mundo del juego y
escribe el JSON del que sale `data/prison.db`.

| Fichero | Qué hace |
|---|---|
| `main.swift` | abre el `*.gamedata` y el MAPINFO con los lectores del servidor y escribe los catorce JSON |
| `Payload.swift` | la forma de ese JSON, y nada más: los `Codable` que se serializan |
| `ClientText.swift` | lo que solo está en el cliente instalado, no en ninguna tabla — nombres de tipo, diálogos de tienda, maestros de habilidad, departamentos |

**Viven aquí, pero se compilan dentro de `PrisonServer`.** No es capricho: el
exportador no parsea nada, solo llama a los lectores del servidor (`SNS2` y
`Editor`), y un paquete de Swift solo compila fuentes que estén dentro de él.
Tener la copia buena en este repositorio y no allí es lo que evita la única
pega de duplicar un fichero: que las dos copias se separen. Esta manda, la otra
se sobrescribe.

`scripts/export.sh` lo instala solo antes de compilar, así que normalmente no
hay que hacer nada. A mano:

```bash
scripts/instalar-exportador.sh
```

Lo que hace es copiar estos `.swift` a `PrisonServer/Sources/GuideExport/` y
comprobar que el `Package.swift` del servidor declara el producto. Si no lo
declara, dice qué dos líneas faltan:

```swift
.executable(name: "guide-export", targets: ["GuideExport"]),
.executableTarget(name: "GuideExport", dependencies: ["SNS2", "Editor"]),
```

Es el único cambio que este proyecto necesita en el servidor, y es aditivo:
nada de lo que el servidor ya hacía pasa por aquí.
