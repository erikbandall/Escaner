const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/technicians?active=true
router.get('/', (req, res) => {
  const { active } = req.query;
  let sql = 'SELECT * FROM technicians';
  const params = [];
  if (active !== undefined) {
    sql += ' WHERE active = ?';
    params.push(active === 'true' || active === '1' ? 1 : 0);
  }
  sql += ' ORDER BY name COLLATE NOCASE';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/technicians
router.post('/', (req, res) => {
  const { name, area } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const info = db.prepare('INSERT INTO technicians (name, area) VALUES (?, ?)').run(String(name).trim(), area || null);
  res.status(201).json(db.prepare('SELECT * FROM technicians WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /api/technicians/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Técnico no encontrado' });
  const { name, area, active } = req.body;
  db.prepare('UPDATE technicians SET name = ?, area = ?, active = ? WHERE id = ?').run(
    name != null && name !== '' ? String(name).trim() : existing.name,
    area !== undefined ? area : existing.area,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id));
});

// DELETE /api/technicians/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Técnico no encontrado' });
  db.prepare('DELETE FROM technicians WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
