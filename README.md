# Mantenimiento de Tooling de Proceso

Aplicación web para gestionar el mantenimiento del herramental de proceso
(moldes, troqueles, calibres, plantillas, etc.): inventario, programación de
mantenimiento preventivo y bitácora de intervenciones realizadas.

## Funcionalidad

- **Dashboard**: resumen del estado del herramental, mantenimientos vencidos
  y próximos (7 días), y mantenimientos recientes.
- **Herramientas**: inventario con código, nombre, tipo, ubicación y estado
  (activo / en mantenimiento / baja). Cada herramienta tiene una vista de
  detalle con sus programaciones y bitácora.
- **Mantenimiento**: programaciones recurrentes (tipo, frecuencia en días,
  próxima fecha) y bitácora de mantenimientos realizados. Registrar un
  mantenimiento contra una programación actualiza automáticamente su
  próxima fecha de vencimiento.

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
server.js              Punto de entrada Express
db/database.js         Conexión SQLite + esquema
routes/tools.js         API de herramientas (inventario)
routes/maintenance.js   API de programaciones y bitácora de mantenimiento
routes/dashboard.js     API de resumen para el dashboard
public/                 Frontend (index.html, css/, js/)
```

## API (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/tools` | Listar / crear herramientas |
| GET/PUT/DELETE | `/api/tools/:id` | Detalle / editar / eliminar herramienta |
| GET | `/api/tools/lookup/:code` | Buscar herramienta por código |
| GET | `/api/tools/:id/schedules` \| `/logs` | Programaciones / bitácora de una herramienta |
| GET/POST | `/api/maintenance/schedules` | Programaciones de mantenimiento |
| PUT/DELETE | `/api/maintenance/schedules/:id` | Editar / eliminar programación |
| GET/POST | `/api/maintenance/logs` | Bitácora de mantenimiento |
| GET | `/api/dashboard/summary` | Resumen para el dashboard |

## Notas

- La base de datos SQLite es de archivo único; para uso multiusuario en red
  basta con correr el servidor en una máquina accesible por la red local.
