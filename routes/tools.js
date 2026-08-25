const express = require('express');
const db = require('../db/database');

const router = express.Router();

const VALID_STATUS = ['activo', 'en_mantenimiento', 'baja'];
const VALID_CATEGORY = ['maquina', 'herramienta', 'proceso', 'equipo'];

const SELECT_WITH_JOINS = `
  SELECT t.*, l.name AS line_name
  FROM tools t LEFT JOIN assembly_lines l ON l.id = t.assembly_line_id
`;

// GET /api/tools?status=&q=&category=&assembly_line_id=
router.get('/', (req, res) => {
  const { status, q, category, assembly_line_id } = req.query;
  let sql = SELECT_WITH_JOINS;
  const clauses = [];
  const params = [];

  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (category) { clauses.push('t.category = ?'); params.push(category); }
  if (assembly_line_id) { clauses.push('t.assembly_line_id = ?'); params.push(assembly_line_id); }
  if (q) {
    clauses.push('(t.code LIKE ? OR t.name LIKE ? OR t.type LIKE ? OR t.location LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY t.name COLLATE NOCASE';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/tools/:id
router.get('/:id', (req, res) => {
  const tool = db.prepare(`${SELECT_WITH_JOINS} WHERE t.id = ?`).get(req.params.id);
  if (!tool) return res.status(404).json({ error: 'Herramienta no encontrada' });
  res.json(tool);
});

// GET /api/tools/lookup/:code
router.get('/lookup/:code', (req, res) => {
  const tool = db.prepare(`${SELECT_WITH_JOINS} WHERE t.code = ?`).get(req.params.code);
  if (!tool) return res.status(404).json({ error: 'No existe una herramienta con ese código' });
  res.json(tool);
});

function validate(body) {
  const { code, name, category, status } = body;
  if (!code || !String(code).trim()) return 'El código es obligatorio';
  if (!name || !String(name).trim()) return 'El nombre es obligatorio';
  if (category && !VALID_CATEGORY.includes(category)) return `Categoría inválida. Usa: ${VALID_CATEGORY.join(', ')}`;
  if (status && !VALID_STATUS.includes(status)) return `Estado inválido. Usa: ${VALID_STATUS.join(', ')}`;
  return null;
}

// POST /api/tools
router.post('/', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const { code, name, category, type, location, assembly_line_id, status, notes } = req.body;

  try {
    const info = db.prepare(`
      INSERT INTO tools (code, name, category, type, location, assembly_line_id, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(code).trim(),
      String(name).trim(),
      category || 'herramienta',
      type || null,
      location || null,
      assembly_line_id || null,
      status || 'activo',
      notes || null
    );
    res.status(201).json(db.prepare(`${SELECT_WITH_JOINS} WHERE t.id = ?`).get(info.lastInsertRowid));
  } catch (err2) {
    if (err2.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una herramienta con ese código' });
    throw err2;
  }
});

// PUT /api/tools/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Herramienta no encontrada' });

  const { code, name, category, status } = req.body;
  if (category && !VALID_CATEGORY.includes(category)) {
    return res.status(400).json({ error: `Categoría inválida. Usa: ${VALID_CATEGORY.join(', ')}` });
  }
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Usa: ${VALID_STATUS.join(', ')}` });
  }

  const { type, location, assembly_line_id, notes } = req.body;
  try {
    db.prepare(`
      UPDATE tools SET
        code = ?, name = ?, category = ?, type = ?, location = ?, assembly_line_id = ?, status = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      code != null && code !== '' ? String(code).trim() : existing.code,
      name != null && name !== '' ? String(name).trim() : existing.name,
      category || existing.category,
      type !== undefined ? type : existing.type,
      location !== undefined ? location : existing.location,
      assembly_line_id !== undefined ? (assembly_line_id || null) : existing.assembly_line_id,
      status || existing.status,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );
    res.json(db.prepare(`${SELECT_WITH_JOINS} WHERE t.id = ?`).get(req.params.id));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe otra herramienta con ese código' });
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
  const rows = db.prepare(`
    SELECT s.*, tech.name AS technician_name
    FROM maintenance_schedules s LEFT JOIN technicians tech ON tech.id = s.assigned_technician_id
    WHERE s.tool_id = ? ORDER BY s.next_due_date
  `).all(req.params.id);
  res.json(rows);
});

// GET /api/tools/:id/logs
router.get('/:id/logs', (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, tech.name AS technician_name
    FROM maintenance_logs l LEFT JOIN technicians tech ON tech.id = l.technician_id
    WHERE l.tool_id = ? ORDER BY l.performed_date DESC
  `).all(req.params.id);
  res.json(rows);
});

module.exports = router;
