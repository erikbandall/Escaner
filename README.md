# Mantenimiento de Tooling de Proceso

Aplicación web para gestionar el mantenimiento preventivo del herramental de
proceso: máquinas, herramientas y procesos, con programación por frecuencia,
técnico asignado, línea de ensamble y turno, checklist de ejecución, alertas
de vencimiento y un dashboard interactivo.

## Funcionalidad

- **Dashboard**: KPIs (activos, vencidas, próximas a vencer, cumplimiento a
  90 días), gráfico de estado de mantenimiento por línea de ensamble,
  filtros por línea y técnico, tablas de vencidos/próximos/recientes.
- **Herramientas**: inventario de máquinas, herramientas, procesos y equipos
  — código, categoría, línea de ensamble, ubicación y estado. Vista de
  detalle con sus programaciones y bitácora.
- **Mantenimiento**:
  - *Programaciones*: tipo, frecuencia en días, técnico asignado, turno,
    anticipación de alerta configurable y checklist de ítems a realizar.
  - *Bitácora*: registro de cada mantenimiento con técnico, turno, y el
    checklist marcado ítem por ítem (con notas). Registrar contra una
    programación recalcula automáticamente su próxima fecha y marca si se
    hizo a tiempo o tarde.
- **Configuración**: gestión de técnicos de manufactura y líneas de
  ensamble, usados en los formularios y filtros de todo el sistema.
- **Notificaciones**: centro de alertas (campana con contador) que genera
  avisos de mantenimientos vencidos y próximos a vencer según la fecha y la
  anticipación configurada por programación. No envía correo/SMS — ver
  Notas.

## Stack

- Backend: Node.js + Express + SQLite (`better-sqlite3`), API REST bajo `/api`.
- Frontend: SPA en HTML/CSS/JS sin frameworks, servida como estático desde `/public`.
- Base de datos: archivo SQLite en `data/tooling.db` (se crea automáticamente
  al arrancar el servidor; no se versiona).

## Cómo correr la app

```bash
npm install
npm start
```

La app queda disponible en `http://localhost:3000` (o el puerto definido en
la variable de entorno `PORT`).

Para desarrollo con recarga automática del servidor:

```bash
npm run dev
```

## Estructura

```
server.js                  Punto de entrada Express
db/database.js             Conexión SQLite + esquema
routes/tools.js             API de activos (máquinas/herramientas/procesos)
routes/technicians.js       API de técnicos de manufactura
routes/lines.js              API de líneas de ensamble
routes/maintenance.js        API de programaciones (+ checklist) y bitácora
routes/notifications.js      API de notificaciones (generación + lectura)
routes/dashboard.js          API de resumen y desglose por línea
public/                      Frontend (index.html, css/, js/)
```

## API (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/tools` | Listar / crear activos |
| GET/PUT/DELETE | `/api/tools/:id` | Detalle / editar / eliminar activo |
| GET | `/api/tools/lookup/:code` | Buscar activo por código |
| GET | `/api/tools/:id/schedules` \| `/logs` | Programaciones / bitácora de un activo |
| GET/POST | `/api/technicians` | Listar / crear técnicos |
| PUT/DELETE | `/api/technicians/:id` | Editar / eliminar técnico |
| GET/POST | `/api/lines` | Listar / crear líneas de ensamble |
| PUT/DELETE | `/api/lines/:id` | Editar / eliminar línea |
| GET/POST | `/api/maintenance/schedules` | Programaciones (con checklist embebido) |
| GET/PUT/DELETE | `/api/maintenance/schedules/:id` | Detalle / editar / eliminar programación |
| GET/POST | `/api/maintenance/logs` | Bitácora (con checklist completado embebido) |
| GET/DELETE | `/api/maintenance/logs/:id` | Detalle / eliminar registro |
| GET | `/api/notifications` | Notificaciones (genera nuevas automáticamente) |
| GET | `/api/notifications/count` | Contador de no leídas |
| POST | `/api/notifications/:id/read` \| `/read-all` | Marcar leídas |
| GET | `/api/dashboard/summary` | Resumen con filtros por línea/técnico |
| GET | `/api/dashboard/by-line` | Desglose de estado por línea (gráfico) |

## Notas

- La base de datos SQLite es de archivo único; para uso multiusuario en red
  basta con correr el servidor en una máquina accesible por la red local.
- Las notificaciones son un centro **dentro de la app** (no se envía correo
  ni SMS). Conectar un canal externo real requeriría credenciales de un
  servicio de correo/SMS (ej. SMTP) que no están configuradas aquí.
