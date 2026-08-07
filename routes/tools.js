const express = require('express');
const db = require('../db/database');

const router = express.Router();

const VALID_STATUS = ['activo', 'en_mantenimiento', 'baja'];

function serializeTool(row) {
  return row;
}

// GET /api/tools?status=&q=
router.get('/', (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM tools';
  const clauses = [];
  const params = [];

  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (q) {
    clauses.push('(code LIKE ? OR name LIKE ? OR type LIKE ? OR location LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY name COLLATE NOCASE';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(serializeTool));
});

// GET /api/tools/:id
router.get('/:id', (req, res) => {
  const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(req.params.id);
  if (!tool) return res.status(404).json({ error: 'Herramienta no encontrada' });
  res.json(tool);
});

// GET /api/tools/lookup/:code  -- busca por código exacto
router.get('/lookup/:code', (req, res) => {
  const tool = db.prepare('SELECT * FROM tools WHERE code = ?').get(req.params.code);
  if (!tool) return res.status(404).json({ error: 'No existe una herramienta con ese código' });
  res.json(tool);
});

// POST /api/tools
router.post('/', (req, res) => {
  const { code, name, type, location, status, notes } = req.body;

  if (!code || !String(code).trim()) return res.status(400).json({ error: 'El código es obligatorio' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Usa: ${VALID_STATUS.join(', ')}` });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO tools (code, name, type, location, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      String(code).trim(),
      String(name).trim(),
      type || null,
      location || null,
      status || 'activo',
      notes || null
    );
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(tool);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Ya existe una herramienta con ese código' });
    }
    throw err;
  }
});

// PUT /api/tools/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Herramienta no encontrada' });

  const { code, name, type, location, status, notes } = req.body;
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Usa: ${VALID_STATUS.join(', ')}` });
  }

  try {
    db.prepare(`
      UPDATE tools SET
        code = ?, name = ?, type = ?, location = ?, status = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      code != null && code !== '' ? String(code).trim() : existing.code,
      name != null && name !== '' ? String(name).trim() : existing.name,
      type !== undefined ? type : existing.type,
      location !== undefined ? location : existing.location,
      status || existing.status,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(req.params.id);
    res.json(tool);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Ya existe otra herramienta con ese código' });
    }
    throw err;
  }
});

// DELETE /api/tools/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Herramienta no encontrada' });
  db.prepare('DELETE FROM tools WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// GET /api/tools/:id/schedules
router.get('/:id/schedules', (req, res) => {
  const rows = db.prepare('SELECT * FROM maintenance_schedules WHERE tool_id = ? ORDER BY next_due_date').all(req.params.id);
  res.json(rows);
});

// GET /api/tools/:id/logs
router.get('/:id/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM maintenance_logs WHERE tool_id = ? ORDER BY performed_date DESC').all(req.params.id);
  res.json(rows);
});

module.exports = router;
