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
  CREATE TABLE IF NOT EXISTS tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT,
    location TEXT,
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
    last_done_date TEXT,
    next_due_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS maintenance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    maintenance_type TEXT NOT NULL,
    technician TEXT,
    performed_date TEXT NOT NULL,
    description TEXT,
    parts_used TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_schedules_tool ON maintenance_schedules(tool_id);
  CREATE INDEX IF NOT EXISTS idx_schedules_due ON maintenance_schedules(next_due_date);
  CREATE INDEX IF NOT EXISTS idx_logs_tool ON maintenance_logs(tool_id);
`);

module.exports = db;
