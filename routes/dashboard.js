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

// GET /api/dashboard/summary?assembly_line_id=&assigned_technician_id=
router.get('/summary', (req, res) => {
  const { assembly_line_id, assigned_technician_id } = req.query;
  const t0 = today();

  const toolClauses = [];
  const toolParams = [];
  if (assembly_line_id) { toolClauses.push('assembly_line_id = ?'); toolParams.push(assembly_line_id); }
  const toolWhere = toolClauses.length ? ' WHERE ' + toolClauses.join(' AND ') : '';

  const toolCounts = db.prepare(`SELECT status, COUNT(*) AS n FROM tools${toolWhere} GROUP BY status`).all(...toolParams);
  const totalTools = db.prepare(`SELECT COUNT(*) AS n FROM tools${toolWhere}`).get(...toolParams).n;

  const schedClauses = ['s.active = 1'];
  const schedParams = [];
  if (assembly_line_id) { schedClauses.push('t.assembly_line_id = ?'); schedParams.push(assembly_line_id); }
  if (assigned_technician_id) { schedClauses.push('s.assigned_technician_id = ?'); schedParams.push(assigned_technician_id); }
  const schedWhereBase = schedClauses.join(' AND ');

  const overdue = db.prepare(`
    SELECT s.*, t.code AS tool_code, t.name AS tool_name, l.name AS line_name, tech.name AS technician_name
    FROM maintenance_schedules s JOIN tools t ON t.id = s.tool_id
    LEFT JOIN assembly_lines l ON l.id = t.assembly_line_id
    LEFT JOIN technicians tech ON tech.id = s.assigned_technician_id
    WHERE ${schedWhereBase} AND s.next_due_date < ?
    ORDER BY s.next_due_date
  `).all(...schedParams, t0);

  const upcoming = db.prepare(`
    SELECT s.*, t.code AS tool_code, t.name AS tool_name, l.name AS line_name, tech.name AS technician_name
    FROM maintenance_schedules s JOIN tools t ON t.id = s.tool_id
    LEFT JOIN assembly_lines l ON l.id = t.assembly_line_id
    LEFT JOIN technicians tech ON tech.id = s.assigned_technician_id
    WHERE ${schedWhereBase} AND s.next_due_date >= ? AND julianday(s.next_due_date) - julianday(?) <= s.alert_days_before
    ORDER BY s.next_due_date
  `).all(...schedParams, t0, t0);

  const logClauses = [];
  const logParams = [];
  if (assembly_line_id) { logClauses.push('t.assembly_line_id = ?'); logParams.push(assembly_line_id); }
  if (assigned_technician_id) { logClauses.push('l.technician_id = ?'); logParams.push(assigned_technician_id); }
  const logWhere = logClauses.length ? ' WHERE ' + logClauses.join(' AND ') : '';

  const recentLogs = db.prepare(`
    SELECT l.*, t.code AS tool_code, t.name AS tool_name, tech.name AS technician_name
    FROM maintenance_logs l JOIN tools t ON t.id = l.tool_id
    LEFT JOIN technicians tech ON tech.id = l.technician_id
    ${logWhere}
    ORDER BY l.performed_date DESC, l.id DESC LIMIT 10
  `).all(...logParams);

  // Cumplimiento: % de mantenimientos ligados a una programación, hechos en los últimos 90 días, que se hicieron a tiempo.
  const horizon90 = addDays(t0, -90);
  const complianceRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN l.on_time = 1 THEN 1 ELSE 0 END) AS on_time
    FROM maintenance_logs l JOIN tools t ON t.id = l.tool_id
    WHERE l.schedule_id IS NOT NULL AND l.performed_date >= ?${logClauses.length ? ' AND ' + logClauses.join(' AND ') : ''}
  `).get(horizon90, ...logParams);
  const compliance = complianceRow.total > 0 ? Math.round((complianceRow.on_time / complianceRow.total) * 100) : null;

  const unreadNotifications = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read = 0').get().n;

  res.json({
    total_tools: totalTools,
    tool_counts: toolCounts.reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {}),
    overdue_count: overdue.length,
    upcoming_count: upcoming.length,
    overdue,
    upcoming,
    recent_logs: recentLogs,
    compliance_pct: compliance,
    compliance_sample: complianceRow.total,
    unread_notifications: unreadNotifications
  });
});

// GET /api/dashboard/by-line -- panel de mantenimientos preventivos por línea de ensamble:
// cuántos se requieren este mes vs. cuántos ya se realizaron, más alertas de vencidos/próximos.
//
// "Requeridos este mes" = mantenimientos ya realizados este mes para esa programación +
// 1 más por cada programación activa que siga pendiente (su próxima fecha cae dentro o antes
// de fin de este mes). Así el número de requeridos nunca baja de lo ya realizado, y crece con
// cada ciclo pendiente. "Realizados este mes" = registros de bitácora con fecha en este mes.
router.get('/by-line', (req, res) => {
  const t0 = today();
  const monthStart = t0.slice(0, 7) + '-01';
  const [y, m] = t0.slice(0, 7).split('-').map(Number);
  const monthEnd = new Date(y, m, 0).toISOString().slice(0, 10); // último día del mes actual

  const lines = db.prepare('SELECT * FROM assembly_lines ORDER BY name COLLATE NOCASE').all();
  const completedThisMonth = db.prepare(`
    SELECT schedule_id, COUNT(*) AS n FROM maintenance_logs
    WHERE schedule_id IS NOT NULL AND performed_date >= ? AND performed_date <= ?
    GROUP BY schedule_id
  `).all(monthStart, monthEnd);
  const completedMap = new Map(completedThisMonth.map(r => [r.schedule_id, r.n]));

  const rows = lines.map(line => {
    const schedules = db.prepare(`
      SELECT s.id, s.next_due_date, s.alert_days_before FROM maintenance_schedules s
      JOIN tools t ON t.id = s.tool_id
      WHERE t.assembly_line_id = ? AND s.active = 1
    `).all(line.id);

    let overdue = 0, upcoming = 0, ok = 0, requiredMonth = 0, completedMonth = 0;
    schedules.forEach(s => {
      if (s.next_due_date < t0) overdue++;
      else if ((new Date(s.next_due_date) - new Date(t0)) / 86400000 <= s.alert_days_before) upcoming++;
      else ok++;

      const done = completedMap.get(s.id) || 0;
      const outstanding = s.next_due_date <= monthEnd ? 1 : 0;
      requiredMonth += done + outstanding;
      completedMonth += done;
    });

    return {
      line_id: line.id, line_name: line.name, overdue, upcoming, ok, total: schedules.length,
      required_month: requiredMonth, completed_month: completedMonth
    };
  });

  // Herramientas sin línea asignada, agrupadas aparte para no perderlas del panorama.
  const unassignedTools = db.prepare('SELECT COUNT(*) AS n FROM tools WHERE assembly_line_id IS NULL').get().n;

  res.json({ lines: rows, unassigned_tools: unassignedTools, month_start: monthStart, month_end: monthEnd });
});

module.exports = router;
