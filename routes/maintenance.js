const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db/database');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.pdf`)
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Solo se admiten archivos PDF'));
    cb(null, true);
  }
});

const VALID_SHIFT = ['Turno 1', 'Turno 2', 'Turno 3'];

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const SCHEDULE_JOIN = `
  SELECT s.*, t.code AS tool_code, t.name AS tool_name, t.status AS tool_status,
         l.name AS line_name, tech.name AS technician_name
  FROM maintenance_schedules s
  JOIN tools t ON t.id = s.tool_id
  LEFT JOIN assembly_lines l ON l.id = t.assembly_line_id
  LEFT JOIN technicians tech ON tech.id = s.assigned_technician_id
`;

/* ---------------------------- Schedules ---------------------------- */

// GET /api/maintenance/schedules?tool_id=&active=&due=(overdue|upcoming)&assembly_line_id=&assigned_technician_id=
router.get('/schedules', (req, res) => {
  const { tool_id, active, due, upcoming_days, assembly_line_id, assigned_technician_id } = req.query;
  let sql = SCHEDULE_JOIN;
  const clauses = [];
  const params = [];

  if (tool_id) { clauses.push('s.tool_id = ?'); params.push(tool_id); }
  if (assembly_line_id) { clauses.push('t.assembly_line_id = ?'); params.push(assembly_line_id); }
  if (assigned_technician_id) { clauses.push('s.assigned_technician_id = ?'); params.push(assigned_technician_id); }
  if (active !== undefined) { clauses.push('s.active = ?'); params.push(active === 'true' || active === '1' ? 1 : 0); }
  if (due === 'overdue') { clauses.push('s.active = 1 AND s.next_due_date < ?'); params.push(today()); }
  if (due === 'upcoming') {
    clauses.push('s.active = 1 AND s.next_due_date >= ? AND julianday(s.next_due_date) - julianday(?) <= s.alert_days_before');
    params.push(today(), today());
  }

  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY s.next_due_date';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/maintenance/schedules/:id
router.get('/schedules/:id', (req, res) => {
  const row = db.prepare(`${SCHEDULE_JOIN} WHERE s.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Programación no encontrada' });
  row.checklist = db.prepare('SELECT * FROM checklist_items WHERE schedule_id = ? ORDER BY sort_order, id').all(req.params.id);
  res.json(row);
});

function validateShift(shift) {
  if (shift && !VALID_SHIFT.includes(shift)) return `Turno inválido. Usa: ${VALID_SHIFT.join(', ')}`;
  return null;
}

// POST /api/maintenance/schedules
// body: { tool_id, maintenance_type, frequency_days, assigned_technician_id?, shift?, alert_days_before?,
//         last_done_date?, next_due_date?, notes?, checklist?: string[] }
router.post('/schedules', (req, res) => {
  const {
    tool_id, maintenance_type, frequency_days, assigned_technician_id, shift, alert_days_before,
    last_done_date, next_due_date, notes, checklist
  } = req.body;

  if (!tool_id) return res.status(400).json({ error: 'tool_id es obligatorio' });
  if (!maintenance_type || !String(maintenance_type).trim()) {
    return res.status(400).json({ error: 'maintenance_type es obligatorio' });
  }
  if (!frequency_days || Number(frequency_days) <= 0) {
    return res.status(400).json({ error: 'frequency_days debe ser un número mayor a 0' });
  }
  const shiftErr = validateShift(shift);
  if (shiftErr) return res.status(400).json({ error: shiftErr });

  const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(tool_id);
  if (!tool) return res.status(404).json({ error: 'Herramienta no encontrada' });

  if (assigned_technician_id) {
    const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(assigned_technician_id);
    if (!tech) return res.status(404).json({ error: 'Técnico asignado no encontrado' });
  }

  const due = next_due_date || addDays(last_done_date || today(), frequency_days);

  const runAll = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO maintenance_schedules
        (tool_id, maintenance_type, frequency_days, assigned_technician_id, shift, alert_days_before, last_done_date, next_due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tool_id,
      String(maintenance_type).trim(),
      Number(frequency_days),
      assigned_technician_id || null,
      shift || null,
      alert_days_before != null && alert_days_before !== '' ? Number(alert_days_before) : 7,
      last_done_date || null,
      due,
      notes || null
    );
    const scheduleId = info.lastInsertRowid;

    if (Array.isArray(checklist)) {
      const insertItem = db.prepare('INSERT INTO checklist_items (schedule_id, description, sort_order) VALUES (?, ?, ?)');
      checklist.filter(c => c && String(c).trim()).forEach((desc, idx) => insertItem.run(scheduleId, String(desc).trim(), idx));
    }

    return scheduleId;
  });

  const id = runAll();
  const row = db.prepare(`${SCHEDULE_JOIN} WHERE s.id = ?`).get(id);
  row.checklist = db.prepare('SELECT * FROM checklist_items WHERE schedule_id = ? ORDER BY sort_order, id').all(id);
  res.status(201).json(row);
});

// PUT /api/maintenance/schedules/:id
// body puede incluir checklist?: string[] -- si viene, reemplaza por completo la plantilla de checklist.
router.put('/schedules/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Programación no encontrada' });

  const {
    maintenance_type, frequency_days, assigned_technician_id, shift, alert_days_before,
    last_done_date, next_due_date, active, notes, checklist
  } = req.body;

  const shiftErr = validateShift(shift);
  if (shiftErr) return res.status(400).json({ error: shiftErr });

  if (assigned_technician_id) {
    const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(assigned_technician_id);
    if (!tech) return res.status(404).json({ error: 'Técnico asignado no encontrado' });
  }

  const runAll = db.transaction(() => {
    db.prepare(`
      UPDATE maintenance_schedules SET
        maintenance_type = ?, frequency_days = ?, assigned_technician_id = ?, shift = ?, alert_days_before = ?,
        last_done_date = ?, next_due_date = ?, active = ?, notes = ?
      WHERE id = ?
    `).run(
      maintenance_type !== undefined && maintenance_type !== '' ? String(maintenance_type).trim() : existing.maintenance_type,
      frequency_days !== undefined && frequency_days !== '' ? Number(frequency_days) : existing.frequency_days,
      assigned_technician_id !== undefined ? (assigned_technician_id || null) : existing.assigned_technician_id,
      shift !== undefined ? (shift || null) : existing.shift,
      alert_days_before !== undefined && alert_days_before !== '' ? Number(alert_days_before) : existing.alert_days_before,
      last_done_date !== undefined ? (last_done_date || null) : existing.last_done_date,
      next_due_date !== undefined && next_due_date !== '' ? next_due_date : existing.next_due_date,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );

    if (Array.isArray(checklist)) {
      db.prepare('DELETE FROM checklist_items WHERE schedule_id = ?').run(req.params.id);
      const insertItem = db.prepare('INSERT INTO checklist_items (schedule_id, description, sort_order) VALUES (?, ?, ?)');
      checklist.filter(c => c && String(c).trim()).forEach((desc, idx) => insertItem.run(req.params.id, String(desc).trim(), idx));
    }
  });
  runAll();

  const row = db.prepare(`${SCHEDULE_JOIN} WHERE s.id = ?`).get(req.params.id);
  row.checklist = db.prepare('SELECT * FROM checklist_items WHERE schedule_id = ? ORDER BY sort_order, id').all(req.params.id);
  res.json(row);
});

// DELETE /api/maintenance/schedules/:id
router.delete('/schedules/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_schedules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Programación no encontrada' });
  db.prepare('DELETE FROM maintenance_schedules WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

/* ------------------------------ Logs -------------------------------- */

const LOG_JOIN = `
  SELECT l.*, t.code AS tool_code, t.name AS tool_name, tech.name AS technician_name
  FROM maintenance_logs l
  JOIN tools t ON t.id = l.tool_id
  LEFT JOIN technicians tech ON tech.id = l.technician_id
`;

// GET /api/maintenance/logs?tool_id=&limit=
router.get('/logs', (req, res) => {
  const { tool_id, limit } = req.query;
  let sql = LOG_JOIN;
  const params = [];
  if (tool_id) { sql += ' WHERE l.tool_id = ?'; params.push(tool_id); }
  sql += ' ORDER BY l.performed_date DESC, l.id DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  res.json(db.prepare(sql).all(...params));
});

// GET /api/maintenance/logs/:id  (incluye el checklist completado)
router.get('/logs/:id', (req, res) => {
  const row = db.prepare(`${LOG_JOIN} WHERE l.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Registro no encontrado' });
  row.checklist = db.prepare('SELECT * FROM maintenance_log_checklist WHERE log_id = ? ORDER BY id').all(req.params.id);
  res.json(row);
});

// POST /api/maintenance/logs
// body: { tool_id, schedule_id?, maintenance_type, technician_id?, shift?, performed_date?, description?, parts_used?,
//         checklist?: [{ checklist_item_id?, description, completed, notes? }] }
router.post('/logs', (req, res) => {
  const { tool_id, schedule_id, maintenance_type, technician_id, shift, performed_date, description, parts_used, checklist } = req.body;

  if (!tool_id) return res.status(400).json({ error: 'tool_id es obligatorio' });
  if (!maintenance_type || !String(maintenance_type).trim()) {
    return res.status(400).json({ error: 'maintenance_type es obligatorio' });
  }
  const shiftErr = validateShift(shift);
  if (shiftErr) return res.status(400).json({ error: shiftErr });

  const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(tool_id);
  if (!tool) return res.status(404).json({ error: 'Herramienta no encontrada' });

  if (technician_id) {
    const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(technician_id);
    if (!tech) return res.status(404).json({ error: 'Técnico no encontrado' });
  }

  let schedule = null;
  if (schedule_id) {
    schedule = db.prepare('SELECT * FROM maintenance_schedules WHERE id = ? AND tool_id = ?').get(schedule_id, tool_id);
    if (!schedule) return res.status(404).json({ error: 'Programación no encontrada para esta herramienta' });
  }

  const doneDate = performed_date || today();
  const onTime = schedule ? (doneDate <= schedule.next_due_date ? 1 : 0) : null;

  const runAll = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO maintenance_logs (tool_id, schedule_id, maintenance_type, technician_id, shift, performed_date, description, parts_used, on_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tool_id,
      schedule ? schedule.id : null,
      String(maintenance_type).trim(),
      technician_id || null,
      shift || null,
      doneDate,
      description || null,
      parts_used || null,
      onTime
    );
    const logId = info.lastInsertRowid;

    if (Array.isArray(checklist)) {
      const insertItem = db.prepare(`
        INSERT INTO maintenance_log_checklist (log_id, checklist_item_id, description, completed, notes)
        VALUES (?, ?, ?, ?, ?)
      `);
      checklist.forEach(item => {
        if (!item || !item.description) return;
        insertItem.run(logId, item.checklist_item_id || null, String(item.description).trim(), item.completed ? 1 : 0, item.notes || null);
      });
    }

    if (schedule) {
      const nextDue = addDays(doneDate, schedule.frequency_days);
      db.prepare('UPDATE maintenance_schedules SET last_done_date = ?, next_due_date = ? WHERE id = ?').run(doneDate, nextDue, schedule.id);
      // Limpia notificaciones pendientes de este ciclo: ya se atendió.
      db.prepare("DELETE FROM notifications WHERE schedule_id = ? AND due_date_snapshot = ?").run(schedule.id, schedule.next_due_date);
    }

    return logId;
  });

  const id = runAll();
  const row = db.prepare(`${LOG_JOIN} WHERE l.id = ?`).get(id);
  row.checklist = db.prepare('SELECT * FROM maintenance_log_checklist WHERE log_id = ? ORDER BY id').all(id);
  res.status(201).json(row);
});

// DELETE /api/maintenance/logs/:id
router.delete('/logs/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Registro no encontrado' });
  if (existing.evidence_filename) {
    fs.unlink(path.join(UPLOADS_DIR, existing.evidence_filename), () => {});
  }
  db.prepare('DELETE FROM maintenance_logs WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

/* -------------------- Evidencia PDF del checklist -------------------- */

// POST /api/maintenance/logs/:id/evidence  (multipart/form-data, campo "evidence")
router.post('/logs/:id/evidence', (req, res) => {
  upload.single('evidence')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir el archivo' });

    const log = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
    if (!log) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    if (!req.file) return res.status(400).json({ error: 'Adjunta un archivo PDF' });

    // Si ya había una evidencia previa, se reemplaza.
    if (log.evidence_filename) {
      fs.unlink(path.join(UPLOADS_DIR, log.evidence_filename), () => {});
    }

    db.prepare('UPDATE maintenance_logs SET evidence_filename = ?, evidence_original_name = ? WHERE id = ?')
      .run(req.file.filename, req.file.originalname, req.params.id);

    res.status(201).json(db.prepare(`
      SELECT l.*, t.code AS tool_code, t.name AS tool_name, tech.name AS technician_name
      FROM maintenance_logs l JOIN tools t ON t.id = l.tool_id
      LEFT JOIN technicians tech ON tech.id = l.technician_id
      WHERE l.id = ?
    `).get(req.params.id));
  });
});

// GET /api/maintenance/logs/:id/evidence  -- ver/descargar el PDF
router.get('/logs/:id/evidence', (req, res) => {
  const log = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
  if (!log || !log.evidence_filename) return res.status(404).json({ error: 'Sin evidencia adjunta' });
  const filePath = path.join(UPLOADS_DIR, log.evidence_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'El archivo ya no está disponible' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(log.evidence_original_name || 'evidencia.pdf').replace(/"/g, '')}"`);
  fs.createReadStream(filePath).pipe(res);
});

// DELETE /api/maintenance/logs/:id/evidence
router.delete('/logs/:id/evidence', (req, res) => {
  const log = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
  if (!log) return res.status(404).json({ error: 'Registro no encontrado' });
  if (log.evidence_filename) {
    fs.unlink(path.join(UPLOADS_DIR, log.evidence_filename), () => {});
    db.prepare('UPDATE maintenance_logs SET evidence_filename = NULL, evidence_original_name = NULL WHERE id = ?').run(req.params.id);
  }
  res.status(204).end();
});

module.exports = router;
