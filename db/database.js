// Conexión e inicialización de la base de datos SQLite.
// Se crea automáticamente en /data/tooling.db (fuera del control de versiones).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'tooling.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    area TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assembly_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'herramienta' CHECK (category IN ('maquina','herramienta','proceso','equipo')),
    type TEXT,
    location TEXT,
    assembly_line_id INTEGER REFERENCES assembly_lines(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','en_mantenimiento','baja')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    maintenance_type TEXT NOT NULL,
    frequency_days INTEGER NOT NULL,
    assigned_technician_id INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
    shift TEXT CHECK (shift IS NULL OR shift IN ('Turno 1','Turno 2','Turno 3')),
    alert_days_before INTEGER NOT NULL DEFAULT 7,
    last_done_date TEXT,
    next_due_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS maintenance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    maintenance_type TEXT NOT NULL,
    technician_id INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
    shift TEXT,
    performed_date TEXT NOT NULL,
    description TEXT,
    parts_used TEXT,
    on_time INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS maintenance_log_checklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id INTEGER NOT NULL REFERENCES maintenance_logs(id) ON DELETE CASCADE,
    checklist_item_id INTEGER REFERENCES checklist_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
    tool_id INTEGER REFERENCES tools(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('overdue','upcoming')),
    due_date_snapshot TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(schedule_id, type, due_date_snapshot)
  );

  CREATE INDEX IF NOT EXISTS idx_schedules_tool ON maintenance_schedules(tool_id);
  CREATE INDEX IF NOT EXISTS idx_schedules_due ON maintenance_schedules(next_due_date);
  CREATE INDEX IF NOT EXISTS idx_schedules_tech ON maintenance_schedules(assigned_technician_id);
  CREATE INDEX IF NOT EXISTS idx_logs_tool ON maintenance_logs(tool_id);
  CREATE INDEX IF NOT EXISTS idx_checklist_schedule ON checklist_items(schedule_id);
  CREATE INDEX IF NOT EXISTS idx_log_checklist_log ON maintenance_log_checklist(log_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  CREATE INDEX IF NOT EXISTS idx_tools_line ON tools(assembly_line_id);
`);

module.exports = db;
