# Guía de La Prisión

Una guía web del juego — objetos, NPCs, recetas, vendedores, salas y el plano de
la cárcel — sacada del propio `*.gamedata` del servidor.

**La idea entera cabe en una frase: aquí no se vuelve a leer ni un formato del
juego.** Los lectores ya existen, en Swift, dentro de `~/Documents/PrisonServer`:
veinte mil líneas con 169 pruebas y las notas de formato ganadas a pulso —las
longitudes de cadena que cuentan el terminador, el `u32` donde parecía haber un
`u16`, el campo `+0x1B` que resulta ser el nivel. Portar eso a JavaScript sería
crear una segunda verdad que se iría separando de la primera. En su lugar hay un
exportador de un solo uso que usa esos mismos lectores y escribe JSON.

Por eso la guía y el servidor no pueden discrepar: no hay dos lectores, hay uno.

## La cadena

```
PRISONMAP_DEFAULT.gamedata ─┐
mapinfo_v8_official.bin     ├─► guide-export (Swift) ─► data/export/*.json ─┐
game/Data/Config/*          ─┘                                              │
                                                                            ├─► build-db.mjs ─► data/prison.db
game/*.pak ─► plpak extract ─► PNG ─► build-media.mjs ─► public/iconos       │
                                                        public/salas  ──────┘
```

Un solo comando la ejecuta entera:

```bash
scripts/export.sh
```

Si solo cambió el mapa y no el arte, sáltate la parte lenta:

```bash
scripts/export.sh --sin-imagenes
```

Las rutas se mueven con `PRISON_SERVER`, `PRISON_PAKKIT`, `PRISON_GAME` y
`PRISON_MAP`.

El exportador en Swift está en [`exportador/`](exportador/), aunque se compile
dentro de `PrisonServer` —un paquete de Swift solo compila lo que tiene dentro—.
La copia buena es la de aquí y `export.sh` la instala allí antes de compilar,
que es lo que impide que las dos se separen.

## Qué hay dentro

Un solo fichero, `PRISONMAP_DEFAULT.gamedata`, lleva nueve secciones:

| Sección | Qué es |
|---|---|
| `OBJE` | 11 240 objetos con sus 45 227 modificadores |
| `NPCS` | 2 874 NPCs y **24 512 entradas de botín** |
| `SUPP` | 541 vendedores con 15 490 artículos, de los que 14 418 son recetas |
| `SKIL` | 12 delitos × 7 atributos × 48 habilidades, en ES y EN |
| `PATH` | 267 rutas de patrulla, 953 nodos |
| `MOBS` | 267 bots colocados en el mundo |
| `BOXE`, `SBOX` | las cajas clicables |
| `MAPT` | la cola sin descifrar de MAPINFO |

Las salas y las puertas vienen de `mapinfo_v8_official.bin`: **466 salas y 2 194
puertas**, que es la tabla que el cliente recibe de verdad. El `*.gamedata` es de
la v7 y trae 888 puertas — las 64 puertas de celda de un módulo solo están en
MAPINFO.

Y del cliente instalado salen cosas que no están en ninguna tabla: los nombres de
tipo de objeto (`ES_Lan_Messages.txt`), los diálogos de los vendedores
(`ShopTxt.ini`), los niveles de enemigo por sala (`moblevels.txt`), quién enseña
cada habilidad (`skilltrainers.txt`) y los 44 departamentos del mapa 2D
(`mapdpts.ini`).

## Las decisiones que no son obvias

**Los tipos de objeto 15 al 37 no tienen nombre de cliente.** El cliente nombra
los tipos 1 a 14 con los mensajes 213 a 226 y para el resto mostraría
`NoTypeString?`: son tipos añadidos al editar este mapa. Las etiquetas de esos
viven en [`data/categories.json`](data/categories.json), editables y marcadas
como derivadas, con el razonamiento de cada una. No se dedujeron a ojo: los
tipos 23, 24, 36 y 37 no llevan ni un modificador y sus 375 objetos valen
exactamente 1000, así que son cosméticos; el 19 lleva modificador en los 268 y
vale 120, así que son las chapas.

**El `stat` de un modificador son tres familias en un byte.** Del 1 al 9 son los
atributos que el cliente abrevia SAL, FUE, DES, EXP, AGI, CON, INT, CAR y PRO;
del 20 al 48 son ids de habilidad del CLASSINFO, y eso no es una suposición: el
20 cae en Química, el 42 en Traumatismo y el 43 en Gangrenación, uno por uno. Del
100 en adelante no se sabe qué son, y la guía los muestra como el número que son.

**El dinero es el objeto 1**, y de ahí sale toda la clasificación de artículos:
el que solo pide dinero es una compra, el que pide objetos de verdad es una
receta, el que devuelve dinero es una venta.

**`article.item` no es un id global de objeto.** Un artículo llamado «+++guantes
ASE» que produce guantes lleva ahí un 184, que es «un anillo de compromiso». Los
números son pequeños y propios de cada vendedor. Viaja en crudo, como
`item_raw`, y nunca se une a `item(id)`.

**Los nombres se guardan con el artículo, y eso no es descuido.** La tabla dice
`"un Crazy Bat novato"`, `"el hacha Excaliboor"`, `"unas braguitas raídas"`,
porque el cliente mete esa cadena dentro de frases que compone: «Te pones %s»,
«EXAMINAR A %s». Lo llevan 11.189 de los 11.240 objetos y 2.673 de los 2.874
NPCs. Como etiqueta sobra, y además estropea el orden alfabético —un tercio del
catálogo se archivaba bajo la U de «un»—, así que la columna `name` guarda la
etiqueta sin artículo y `name_raw` lo que dice la tabla exactamente; las fichas
enseñan las dos. Se quitan **solo los ocho artículos**: los 51 objetos que
empiezan por «su» o «tu» —`"su garra"`, `"tu propia oreja cortada por Frank"`—
son armas naturales de NPC y el posesivo es parte del nombre.

Después se pone **cada palabra en mayúscula**, que es como el juego los muestra
—«Crazy Bat Novato»— y lo que unifica una lista donde la tabla capitaliza a su
aire. Nada se pasa nunca a minúscula, así que `ASU`, `RedDevil`, `GuíaDeLuz` y
`22M1` sobreviven intactos; los enlaces se quedan abajo («Casco de Especialista
ASU», «Capitán de los RedDevil»), porque en castellano un título no los sube.

**Los iconos de objeto no tienen canal alfa: tienen magenta.** Salen de los
`.pak` como 180×128 RGB con el fondo en `255, 0, 255`, que es como se marcaba la
transparencia en 1999. Escritos tal cual a WebP se ven como rectángulos rosas.
`scripts/png.mjs` los decodifica y **rellena el fondo desde los bordes**, no por
color: un objeto puede ser rosa, y solo el magenta que toca el borde es fondo.
La clave tampoco es un valor único — vale `252, 2, 252` donde la compresión BC
del pak la movió — así que se busca una banda, y se quita además la orla de un
píxel donde el magenta se mezcló con el dibujo.

**El plano se deduce de las puertas cardinales.** Una sala cuya `pn` lleva a B
pone a B una celda al norte; `ps`, `pe` y `po` igual. Caminando eso desde la sala
mejor conectada salen 204 salas en 40 trozos. Otras 209 son celdas y calabozos a
los que solo se entra por puertas numeradas, así que cuelgan de su módulo — que
es exactamente lo que hace el mapa 2D del juego, según dice `mapdpts.ini`.
Quedan 53 salas a las que no llega ninguna puerta.

El mapa de verdad está en el bloque `MGRD`, dentro de los 17 KB de cola de
MAPINFO que nadie ha descifrado. Cuando se descifre, esto deja de ser una
deducción.

## El montaje

Next.js 16 con React 19 y Tailwind 4. La base es SQLite leída con `node:sqlite`,
el módulo que Node trae de serie: sin dependencia nativa, sin nada que
recompilar al cambiar de versión de Node y sin scripts de instalación que
aprobar. El buscador es FTS5 con el tokenizador `unicode61 remove_diacritics 2`,
que es lo que hace que «pantalon» encuentre «pantalón» — en español eso no es un
detalle.

```bash
npm run dev     # desarrollo
npm run build   # producción
npm start
```

### La parte en vivo

Opcional y apagada por omisión. Con estas variables lee el MySQL del servidor
para los rankings y el estado de las prisiones:

```
PRISON_MYSQL_HOST=127.0.0.1
PRISON_MYSQL_USER=guia
PRISON_MYSQL_PASSWORD=…
PRISON_MYSQL_DATABASE=prison
```

Lee nombres, niveles y cuentas. Ninguna consulta trae un hash de contraseña, y
si MySQL no contesta la guía sigue entera: todo lo demás sale de un fichero.
Dale a ese usuario de MySQL permiso de solo lectura y solo sobre lo que hace
falta.

## Lo que no lleva el repositorio

**Nada del juego.** `data/export/`, `data/prison.db`, `public/iconos/` y
`public/salas/` son unos 135 MB —103 de ellos las 525 vistas de sala— que
`scripts/export.sh` saca del `*.gamedata` y de los `.pak`. Aquí no hay ni una
imagen ni una tabla del juego: lo que hay es el código que las lee, y cada
quien reconstruye lo demás a partir de su propia copia.

Tampoco está el servidor. De `PrisonServer` solo sale el exportador, que es
código escrito para esta guía, y la guía no necesita más que eso: `exportador/`
y dos líneas en el `Package.swift` del servidor.

Y no hay ninguna credencial. La parte en vivo se configura por entorno, nunca
por fichero, y `.gitignore` deja fuera cualquier `.env`.

## Pendiente

- Descifrar `MGRD` para tener el mapa 2D real en vez de la deducción.
- Este mapa no trae sección `SHOP`, así que no consta dónde están los puestos de
  venta; los vendedores se localizan por los NPCs que los llevan.
- Solo 267 de los 2 874 NPCs están colocados en alguna sala. La guía lo dice en
  cada ficha en lugar de disimularlo.

## Licencia

[MIT](LICENSE). Cógelo, cámbialo, úsalo en lo que quieras, cóbralo si te
apetece: la única condición es que el aviso de copyright viaje con la copia.
Sin garantía de nada, que es la otra mitad del trato.

Eso cubre **el código de este repositorio**. No cubre el juego: los objetos,
los NPCs, los nombres, los iconos y los fondos que `scripts/export.sh` saca de
tu copia de La Prisión son de quien sean, y aquí no se distribuyen ni se
licencian — por eso el repositorio trae el programa que los lee y no los datos
que lee.
