const express = require('express');
const db = require('../db/database');

const router = express.Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

// GET /api/dashboard/summary
router.get('/summary', (req, res) => {
  const toolCounts = db.prepare(`
    SELECT status, COUNT(*) AS n FROM tools GROUP BY status
  `).all();

  const totalTools = db.prepare('SELECT COUNT(*) AS n FROM tools').get().n;

  const horizon = addDays(today(), 7);

  const overdue = db.prepare(`
    SELECT s.*, t.code AS tool_code, t.name AS tool_name
    FROM maintenance_schedules s JOIN tools t ON t.id = s.tool_id
    WHERE s.active = 1 AND s.next_due_date < ?
    ORDER BY s.next_due_date
  `).all(today());

  const upcoming = db.prepare(`
    SELECT s.*, t.code AS tool_code, t.name AS tool_name
    FROM maintenance_schedules s JOIN tools t ON t.id = s.tool_id
    WHERE s.active = 1 AND s.next_due_date >= ? AND s.next_due_date <= ?
    ORDER BY s.next_due_date
  `).all(today(), horizon);

  const recentMeasurements = db.prepare(`
    SELECT m.*, t.code AS tool_code, t.name AS tool_name
    FROM measurements m LEFT JOIN tools t ON t.id = m.tool_id
    ORDER BY m.created_at DESC LIMIT 8
  `).all();

  const recentLogs = db.prepare(`
    SELECT l.*, t.code AS tool_code, t.name AS tool_name
    FROM maintenance_logs l JOIN tools t ON t.id = l.tool_id
    ORDER BY l.performed_date DESC, l.id DESC LIMIT 8
  `).all();

  res.json({
    total_tools: totalTools,
    tool_counts: toolCounts.reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {}),
    overdue_count: overdue.length,
    upcoming_count: upcoming.length,
    overdue,
    upcoming,
    recent_measurements: recentMeasurements,
    recent_logs: recentLogs
  });
});

module.exports = router;
