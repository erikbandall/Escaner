const express = require('express');
const db = require('../db/database');

const router = express.Router();

const DEFAULT_OFFSET = 251.525;

// Calcula el valor a partir de un código escaneado, replicando la lógica original:
// se toman los últimos 5 dígitos, los primeros 3 son la parte entera (mm) y los
// últimos 2 la parte decimal; al valor resultante se le resta el offset de calibración.
function computeFromCode(raw, offset) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 5) {
    const err = new Error(`El código "${raw}" tiene solo ${digits.length} dígito(s). Se necesitan al menos 5.`);
    err.status = 400;
    throw err;
  }
  const last5 = digits.slice(-5);
  const intPart = last5.slice(0, 3);
  const decPart = last5.slice(3, 5);
  const scanned = parseFloat(`${intPart}.${decPart}`);
  // Redondeo para evitar residuos de coma flotante (p.ej. 291.68500000000006).
  const result = Math.round((scanned - offset) * 1000) / 1000;
  return { digits, last5, intPart, decPart, scanned, result };
}

// GET /api/measurements?tool_id=&limit=
router.get('/', (req, res) => {
  const { tool_id, limit } = req.query;
  let sql = `
    SELECT m.*, t.code AS tool_code, t.name AS tool_name
    FROM measurements m
    LEFT JOIN tools t ON t.id = m.tool_id
  `;
  const params = [];
  if (tool_id) {
    sql += ' WHERE m.tool_id = ?';
    params.push(tool_id);
  }
  sql += ' ORDER BY m.created_at DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }
  res.json(db.prepare(sql).all(...params));
});

// POST /api/measurements
// body: { raw_code, tool_id? , tool_code? }
// Si se manda tool_id o tool_code y existe la herramienta, se usa su calibration_offset
// y la medición queda asociada a ella. Si no, se calcula con el offset por defecto y
// queda sin asociar (tool_id = null).
router.post('/', (req, res) => {
  const { raw_code, tool_id, tool_code } = req.body;
  if (!raw_code || !String(raw_code).trim()) {
    return res.status(400).json({ error: 'raw_code es obligatorio' });
  }

  let tool = null;
  if (tool_id) {
    tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(tool_id);
    if (!tool) return res.status(404).json({ error: 'Herramienta no encontrada' });
  } else if (tool_code) {
    tool = db.prepare('SELECT * FROM tools WHERE code = ?').get(tool_code);
  }

  const offset = tool ? tool.calibration_offset : DEFAULT_OFFSET;

  let calc;
  try {
    calc = computeFromCode(raw_code, offset);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const info = db.prepare(`
    INSERT INTO measurements (tool_id, raw_code, scanned_value, result_value, unit)
    VALUES (?, ?, ?, ?, 'mm')
  `).run(tool ? tool.id : null, String(raw_code).trim(), calc.scanned, calc.result);

  const measurement = db.prepare(`
    SELECT m.*, t.code AS tool_code, t.name AS tool_name
    FROM measurements m LEFT JOIN tools t ON t.id = m.tool_id
    WHERE m.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json({
    ...measurement,
    breakdown: { digits: calc.digits, last5: calc.last5, intPart: calc.intPart, decPart: calc.decPart },
    offset_used: offset,
    matched_tool: !!tool
  });
});

// POST /api/measurements/preview  -- calcula sin guardar (útil para vista previa en UI)
router.post('/preview', (req, res) => {
  const { raw_code, tool_id, tool_code } = req.body;
  if (!raw_code || !String(raw_code).trim()) {
    return res.status(400).json({ error: 'raw_code es obligatorio' });
  }

  let tool = null;
  if (tool_id) tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(tool_id);
  else if (tool_code) tool = db.prepare('SELECT * FROM tools WHERE code = ?').get(tool_code);

  const offset = tool ? tool.calibration_offset : DEFAULT_OFFSET;

  try {
    const calc = computeFromCode(raw_code, offset);
    res.json({ ...calc, offset_used: offset, matched_tool: tool || null });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// DELETE /api/measurements/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM measurements WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Medición no encontrada' });
  db.prepare('DELETE FROM measurements WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
