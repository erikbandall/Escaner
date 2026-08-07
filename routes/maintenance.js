const express = require('express');
const db = require('../db/database');

const router = express.Router();

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------------------- Schedules ---------------------------- */

// GET /api/maintenance/schedules?tool_id=&active=&due=(overdue|upcoming)
router.get('/schedules', (req, res) => {
  const { tool_id, active, due, upcoming_days } = req.query;
  let sql = `
    SELECT s.*, t.code AS tool_code, t.name AS tool_name, t.status AS tool_status
    FROM maintenance_schedules s
    JOIN tools t ON t.id = s.tool_id
  `;
  const clauses = [];
  const params = [];

  if (tool_id) { clauses.push('s.tool_id = ?'); params.push(tool_id); }
  if (active !== undefined) { clauses.push('s.active = ?'); params.push(active === 'true' || active === '1' ? 1 : 0); }
  if (due === 'overdue') { clauses.push('s.active = 1 AND s.next_due_date < ?'); params.push(today()); }
  if (due === 'upcoming') {
    const horizon = addDays(today(), upcoming_days || 7);
    clauses.push('s.active = 1 AND s.next_due_date >= ? AND s.next_due_date <= ?');
    params.push(today(), horizon);
  }

  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY s.next_due_date';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/maintenance/schedules/:id
router.get('/schedules/:id', (req, res) => {
  const row = db.prepare(`
    SELECT s.*, t.code AS tool_code, t.name AS tool_name
    FROM maintenance_schedules s JOIN tools t ON t.id = s.tool_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Programación no encontrada' });
  res.json(row);
});

// POST /api/maintenance/schedules
router.post('/schedules', (req, res) => {
  const { tool_id, maintenance_type, frequency_days, last_done_date, next_due_date, notes } = req.body;

  if (!tool_id) return res.status(400).json({ error: 'tool_id es obligatorio' });
  if (!maintenance_type || !String(maintenance_type).trim()) {
    return res.status(400).json({ error: 'maintenance_type es obligatorio' });
  }
  if (!frequency_days || Number(frequency_days) <= 0) {
    return res.status(400).json({ error: 'frequency_days debe ser un número mayor a 0' });
  }

  const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(tool_id);
  if (!tool) return res.status(404).json({ error: 'Herramienta no encontrada' });

  const due = next_due_date || addDays(last_done_date || today(), frequency_days);

  const info = db.prepare(`
    INSERT INTO maintenance_schedules (tool_id, maintenance_type, frequency_days, last_done_date, next_due_date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tool_id, String(maintenance_type).trim(), Number(frequency_days), last_done_date || null, due, notes || null);

  res.status(201).json(db.prepare('SELECT * FROM maintenance_schedules WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /api/maintenance/schedules/:id
router.put('/schedules/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Programación no encontrada' });

  const { maintenance_type, frequency_days, last_done_date, next_due_date, active, notes } = req.body;

  db.prepare(`
    UPDATE maintenance_schedules SET
      maintenance_type = ?, frequency_days = ?, last_done_date = ?, next_due_date = ?, active = ?, notes = ?
    WHERE id = ?
  `).run(
    maintenance_type !== undefined && maintenance_type !== '' ? String(maintenance_type).trim() : existing.maintenance_type,
    frequency_days !== undefined && frequency_days !== '' ? Number(frequency_days) : existing.frequency_days,
    last_done_date !== undefined ? last_done_date : existing.last_done_date,
    next_due_date !== undefined && next_due_date !== '' ? next_due_date : existing.next_due_date,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    notes !== undefined ? notes : existing.notes,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM maintenance_schedules WHERE id = ?').get(req.params.id));
});

// DELETE /api/maintenance/schedules/:id
router.delete('/schedules/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Programación no encontrada' });
  db.prepare('DELETE FROM maintenance_schedules WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

/* ------------------------------ Logs -------------------------------- */

// GET /api/maintenance/logs?tool_id=&limit=
router.get('/logs', (req, res) => {
  const { tool_id, limit } = req.query;
  let sql = `
    SELECT l.*, t.code AS tool_code, t.name AS tool_name
    FROM maintenance_logs l
    JOIN tools t ON t.id = l.tool_id
  `;
  const params = [];
  if (tool_id) { sql += ' WHERE l.tool_id = ?'; params.push(tool_id); }
  sql += ' ORDER BY l.performed_date DESC, l.id DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  res.json(db.prepare(sql).all(...params));
});

// POST /api/maintenance/logs
// Registra una intervención. Si trae schedule_id, actualiza esa programación
// (last_done_date = performed_date, next_due_date = performed_date + frequency_days).
router.post('/logs', (req, res) => {
  const { tool_id, schedule_id, maintenance_type, technician, performed_date, description, parts_used } = req.body;

  if (!tool_id) return res.status(400).json({ error: 'tool_id es obligatorio' });
  if (!maintenance_type || !String(maintenance_type).trim()) {
    return res.status(400).json({ error: 'maintenance_type es obligatorio' });
  }

  const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(tool_id);
  if (!tool) return res.status(404).json({ error: 'Herramienta no encontrada' });

  let schedule = null;
  if (schedule_id) {
    schedule = db.prepare('SELECT * FROM maintenance_schedules WHERE id = ? AND tool_id = ?').get(schedule_id, tool_id);
    if (!schedule) return res.status(404).json({ error: 'Programación no encontrada para esta herramienta' });
  }

  const doneDate = performed_date || today();

  const insertLog = db.prepare(`
    INSERT INTO maintenance_logs (tool_id, schedule_id, maintenance_type, technician, performed_date, description, parts_used)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const runAll = db.transaction(() => {
    const info = insertLog.run(
      tool_id,
      schedule ? schedule.id : null,
      String(maintenance_type).trim(),
      technician || null,
      doneDate,
      description || null,
      parts_used || null
    );

    if (schedule) {
      const nextDue = addDays(doneDate, schedule.frequency_days);
      db.prepare(`
        UPDATE maintenance_schedules SET last_done_date = ?, next_due_date = ? WHERE id = ?
      `).run(doneDate, nextDue, schedule.id);
    }

    return info.lastInsertRowid;
  });

  const id = runAll();
  const log = db.prepare(`
    SELECT l.*, t.code AS tool_code, t.name AS tool_name
    FROM maintenance_logs l JOIN tools t ON t.id = l.tool_id
    WHERE l.id = ?
  `).get(id);

  res.status(201).json(log);
});

// DELETE /api/maintenance/logs/:id
router.delete('/logs/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Registro no encontrado' });
  db.prepare('DELETE FROM maintenance_logs WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
