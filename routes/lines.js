const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/lines
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM assembly_lines ORDER BY name COLLATE NOCASE').all());
});

// POST /api/lines
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const info = db.prepare('INSERT INTO assembly_lines (name) VALUES (?)').run(String(name).trim());
    res.status(201).json(db.prepare('SELECT * FROM assembly_lines WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una línea con ese nombre' });
    throw err;
  }
});

// PUT /api/lines/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM assembly_lines WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Línea no encontrada' });
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    db.prepare('UPDATE assembly_lines SET name = ? WHERE id = ?').run(String(name).trim(), req.params.id);
    res.json(db.prepare('SELECT * FROM assembly_lines WHERE id = ?').get(req.params.id));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe una línea con ese nombre' });
    throw err;
  }
});

// DELETE /api/lines/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM assembly_lines WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Línea no encontrada' });
  db.prepare('DELETE FROM assembly_lines WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
