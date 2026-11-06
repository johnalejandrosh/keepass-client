# Bóveda · tablero para KeePassXC

Tablero web local que lee de tu **KeePassXC abierto** usando el mismo protocolo que la extensión KeePassXC-Browser.
La contraseña maestra nunca pasa por el tablero: tú desbloqueas en KeePassXC y apruebas la conexión una vez.

## Requisitos

- KeePassXC 2.7+ abierto, con **Ajustes → Integración con navegador → Activar integración con navegador**.
- Node 20.9+.

## Uso

```bash
pnpm install
pnpm dev             # Next.js (web + API) en http://localhost:4717
```

Producción:

```bash
pnpm build && pnpm start     # http://localhost:4717
```

1. Abre el tablero y pulsa **Asociar con KeePassXC**.
2. KeePassXC muestra un diálogo: ponle un nombre (p. ej. `dashboard`) y acepta.
3. Busca por dominio (`github.com`). La primera vez, KeePassXC puede pedir que permitas el acceso a esas entradas.

## Qué puede hacer

| Función | Acción del protocolo |
|---|---|
| Estado / desbloquear / bloquear | `get-databasehash`, `triggerUnlock`, `lock-database` |
| Asociar | `associate`, `test-associate` |
| Buscar por URL | `get-logins` (sin contraseñas en el listado) |
| Ver / copiar contraseña y TOTP | `get-logins` bajo demanda (`/api/reveal`) |
| Grupos | `get-database-groups` |
| Crear entrada (pestaña Por sitio) | `set-login` |

**Limitación del protocolo:** KeePassXC solo devuelve entradas que coinciden con una URL, así que no hay forma de listar toda la base. Para eso está la pestaña **Bóveda completa**.

## Bóveda completa (lectura de toda la base)

La pestaña **Bóveda completa** abre el `.kdbx` con `keepassxc-cli export -f xml`. Escribes la contraseña maestra en Bóveda (opcionalmente con archivo de clave) y obtienes:

- Todas las entradas, con un árbol de grupos y filtro instantáneo por título, usuario, URL, grupo o etiqueta. No distingue tildes.
- Contraseña, notas, campos personalizados y TOTP de cada entrada, que se piden una por una al pulsar Ver o Copiar. El TOTP se calcula en el backend (RFC 6238).
- Se omite la papelera de reciclaje.

### Editar desde la bóveda completa

Con la bóveda abierta puedes cambiar la base sin salir del tablero (se usa `keepassxc-cli`):

- **Entradas**: crear (botón *Nueva entrada* o `N`), editar título, usuario, contraseña (con generador), sitio, notas y carpeta, y eliminar.
- **Carpetas**: crear y eliminar (con todo su contenido). Las carpetas vacías también se muestran. Cada tarjeta adelanta su contenido (avatares de las entradas y subcarpetas).
- **Mover**: arrastra una entrada sobre una carpeta (tarjeta, árbol lateral o ruta de arriba), o usa *Mover a…*. El aviso trae **Deshacer**. Si mantienes la entrada sobre una carpeta cerrada del árbol, esta se despliega sola.
- **Menú contextual** (clic derecho o `⋯`): copiar usuario, contraseña o TOTP, abrir el sitio, editar, mover y eliminar. En carpetas: abrir, crear entrada o subcarpeta y eliminar.
- **Adjuntos**: se muestran como tarjetas con miniatura. Al pulsarlas se abren en un visor, sin descargarlas, y puedes pasar de una a otra con ← →. También se pueden descargar, quitar y adjuntar (arrastrando o eligiendo varios a la vez; máx. 16 MB).
  - Vista previa de: imágenes, PDF, audio, vídeo, texto y código, JSON (formateado), CSV (como tabla), contenido de ZIP, y documentos de oficina **odt/ods/odp** y **docx/xlsx/pptx**. De estos últimos se muestran el texto, los títulos, las listas y las tablas, más la miniatura de la primera página si el archivo la incluye. Se leen en el navegador sin librerías externas y nunca se insertan como HTML.
  - Los archivos abiertos se guardan solo en la memoria de la pestaña y se borran al cerrar la bóveda.

Cada cambio guarda el `.kdbx` y lo vuelve a leer (tarda unos segundos). Si tienes la base abierta en KeePassXC, allí se recarga sola.
Lo que se elimina va a la papelera de KeePassXC si está activada.

Limitaciones de `keepassxc-cli`:
- Identifica las entradas por **ruta** (`carpeta/título`), así que no se pueden editar entradas con título vacío, con `/` en el título, ni con el mismo título que otra en la misma carpeta. Renómbralas en KeePassXC.
- No puede **vaciar** un campo (usuario, sitio o notas); el tablero avisa antes de guardar.
- Los campos personalizados, el TOTP, las etiquetas y la caducidad solo se pueden cambiar en KeePassXC; al editar se conservan.
- Si el `.kdbx` cambió fuera del tablero desde la última lectura, la escritura se cancela, se recarga la vista y se pide repetir la operación.

Seguridad de este modo:
- La contraseña maestra se pasa a `keepassxc-cli` por stdin. No se escribe a disco. Se conserva en la memoria del backend mientras la bóveda está abierta (para poder guardar cambios) y se descarta al cerrarla.
- Los textos que editas (título, usuario, sitio y notas) van a `keepassxc-cli` como argumentos de línea de comandos, así que otros procesos del equipo los podrían ver un instante con `ps`. La contraseña de la entrada no: va por stdin.
- `keepassxc-cli` solo importa y exporta adjuntos a través de un archivo. Al adjuntar o descargar, el contenido pasa un instante por un directorio temporal privado (permisos 0700/0600) que se borra al terminar.
- El contenido descifrado vive solo en la memoria del backend y nunca se escribe a disco. El listado no incluye contraseñas.
- Se cierra sola tras 5 min sin uso (`VAULT_IDLE_MS`), al pulsar Cerrar o el candado, y al bloquear la base en KeePassXC.
- Es una foto del momento de abrir: los cambios hechos desde el tablero se ven al instante, pero si cambias algo en KeePassXC, ciérrala y ábrela de nuevo para verlo.

## Atajos

| Tecla | Acción |
|---|---|
| `⌘K` o `/` | Ir al buscador |
| `N` | Nueva entrada |
| `⌫` | Subir a la carpeta anterior (bóveda completa) |
| `↑ ↓ ← →` | Moverse entre carpetas y entradas (`↓` desde el buscador entra en la lista) |
| Clic derecho o `⋯` | Menú de la carpeta o la entrada |
| `Esc` | Cerrar panel |

## Seguridad

- El servidor solo escucha en `127.0.0.1`. Rechaza peticiones con otro `Host` (para evitar DNS rebinding) y las que no traen la cabecera `X-Requested-With` (para evitar CSRF).
- La asociación (id + clave) se guarda en `~/.config/keepassxc-dashboard/associations.json` con permisos `0600`. Funciona como una credencial. Para revocarla, bórrala en KeePassXC → Base de datos → Configuración → Integración con navegador.
- Las contraseñas copiadas se borran del portapapeles a los 30 s, y las reveladas se ocultan a los 15 s.

## Variables de entorno

| Variable | Por defecto |
|---|---|
| `PORT` | `4717` |
| `KEEPASSXC_SOCKET` | macOS: `$TMPDIR/org.keepassxc.KeePassXC.BrowserServer` |
| `KPX_DASHBOARD_HOME` | `~/.config/keepassxc-dashboard` |
| `KEEPASSXC_CLI` | `keepassxc-cli` |
| `VAULT_IDLE_MS` | `300000` (5 min) |

## Estructura

Proyecto Next.js 16 (App Router, Turbopack). La página y la API corren en el mismo proceso.

```
app/
  layout.tsx, page.tsx  shell HTML (tema sin parpadeo) y página; el tablero se renderiza solo en cliente
  globals.css           Tailwind CSS 4
  api/**/route.ts       Route Handlers (una carpeta por endpoint)
proxy.ts                rechaza Host ajeno en páginas y estáticos (la API lo comprueba en server/http.ts)
server/                 solo servidor (`server-only`)
  keepassxc.ts          cliente del protocolo (socket + NaCl crypto_box)
  kpx.ts                cliente singleton (globalThis) y helpers de asociación
  http.ts               envoltorio de rutas: Host, X-Requested-With, límites de cuerpo y errores
  store.ts              persistencia de asociaciones
  vault.ts              bóveda completa: keepassxc-cli export + parseo XML + TOTP + edición y adjuntos
components/             React (App, Header, VaultView, VaultEntryDrawer, Attachments, Dialog, Drawer, …)
lib/                    api, hooks (tema, atajos), secrets (generador, fuerza, portapapeles), preview
```

El estado en memoria (conexión con KeePassXC y bóveda abierta) vive en `globalThis` para que lo compartan
todas las rutas y sobreviva a las recargas en caliente de `pnpm dev`.
