# Mantenimiento de Tooling de Proceso

Aplicación web para gestionar el mantenimiento preventivo del herramental de
proceso: máquinas, herramientas y procesos, con programación por frecuencia,
técnico asignado, línea de ensamble y turno, checklist de ejecución, alertas
de vencimiento y un dashboard interactivo.

## Diseño

Interfaz estilo **Microsoft 365 / Fluent** (barra superior con selector de
apps, nav rail clara, tarjetas con sombra suave, azul Microsoft) para que se
sienta como el resto de las herramientas de oficina que ya usa el equipo.

## Funcionalidad

- **Dashboard**: panel de mantenimientos preventivos **requeridos vs.
  realizados por línea de ensamble** (mes en curso) con badges de alerta
  (vencidas/próximas) para entender la situación de cada línea de un
  vistazo; KPIs (activos, vencidas, próximas a vencer, cumplimiento a 90
  días); filtros por línea y técnico; tablas de vencidos/próximos/recientes.
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

## Alojarla en un servidor local de la empresa (solo red interna)

Ideal si todos los que van a usar la app están conectados a la red/WiFi de la
planta y no se necesita acceso desde fuera. No requiere ningún cambio de
código ni gastos de nube: la base de datos y las fotos/PDFs quedan
completamente dentro de la empresa, en el disco de ese equipo.

1. **Elige el equipo que hará de "servidor".** Puede ser una PC de
   escritorio normal (no necesita ser potente) que se quede encendida
   durante el horario de uso, de preferencia conectada por cable de red
   (más estable que WiFi). Instálale [Node.js LTS](https://nodejs.org)
   (versión 18 o superior).

2. **Copia el proyecto ahí** y instala dependencias:
   ```bash
   git clone https://github.com/erikbandall/Escaner.git
   cd Escaner
   npm install
   ```
   (o copia la carpeta sin `node_modules/` ni `data/` y corre `npm install`
   ahí mismo).

3. **Dale una IP fija a ese equipo**, para que la dirección no cambie al
   reiniciar el router: reserva esa IP por su dirección MAC en la
   configuración del router (recomendado), o configúrale una IP estática
   manual en las propiedades de red. Anótala, por ejemplo `192.168.1.50`.

4. **Abre el puerto en el firewall** para que otros equipos de la red
   puedan conectarse:
   - Windows: Firewall de Windows Defender → Configuración avanzada →
     Reglas de entrada → Nueva regla → Puerto → TCP → `3000` → Permitir la
     conexión.
   - Linux: `sudo ufw allow 3000/tcp`.

5. **Corre la app de forma permanente**, no solo en una terminal abierta
   (si la cierras o el usuario cierra sesión, `npm start` se detiene). Usa
   [PM2](https://pm2.keymetrics.io/), que funciona igual en Windows, Linux
   o Mac:
   ```bash
   npm install -g pm2
   pm2 start server.js --name toolmaint
   pm2 save
   pm2 startup    # sigue las instrucciones que imprime para arrancar con el sistema
   ```

6. **Accede desde cualquier equipo de la red** abriendo en el navegador
   `http://192.168.1.50:3000` (cambia la IP por la del equipo servidor).
   Guarda esa dirección como acceso directo/marcador en cada equipo que la
   use.

7. **Respaldos.** Como los datos ya no viven en la nube, conviene
   respaldar periódicamente `data/tooling.db` (la base de datos) y
   `data/uploads/` (fotos y PDFs de evidencia) — por ejemplo copiándolos a
   diario a una carpeta compartida de red o a un USB, con una tarea
   programada.

Si más adelante necesitas que alguien acceda desde fuera de la planta (otra
sucursal, celular con datos, casa), las opciones son una VPN hacia la red de
la empresa, o migrar el backend a la nube (ver issues/roadmap).

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
demo/preview.html            Vista previa autocontenida sin backend (ver demo/README.md)
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
