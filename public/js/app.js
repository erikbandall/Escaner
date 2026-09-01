'use strict';

/* ======================== Helpers ======================== */

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

let toastTimer = null;
function toast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = isError ? 'error' : '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.add('hidden'); }, 3200);
}

const CATEGORY_LABELS = { maquina: 'Máquina', herramienta: 'Herramienta', proceso: 'Proceso', equipo: 'Equipo' };
function categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat || '—'; }

function statusBadge(status) {
  const labels = { activo: 'Activo', en_mantenimiento: 'En mantenimiento', baja: 'Baja' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function dueBadge(nextDue) {
  const today = todayStr();
  if (nextDue < today) return `<span class="badge badge-overdue">Vencida</span>`;
  const horizon = new Date(); horizon.setDate(horizon.getDate() + 7);
  if (nextDue <= horizon.toISOString().slice(0, 10)) return `<span class="badge badge-upcoming">Próxima</span>`;
  return `<span class="badge badge-ok">Al día</span>`;
}

function onTimeBadge(onTime) {
  if (onTime === null || onTime === undefined) return '<span class="muted">—</span>';
  return onTime ? '<span class="badge badge-ok">A tiempo</span>' : '<span class="badge badge-overdue">Tarde</span>';
}

/* ======================== Modal ======================== */

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');

function openModal(title, bodyHtml) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalOverlay.classList.remove('hidden');
}
function closeModal() {
  modalOverlay.classList.add('hidden');
  modalBody.innerHTML = '';
}
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

/* ======================== Shared caches ======================== */

let toolsCache = [];
let techniciansCache = [];
let linesCache = [];

async function refreshToolsCache() {
  toolsCache = await api('GET', '/api/tools');
  return toolsCache;
}
async function refreshTechniciansCache() {
  techniciansCache = await api('GET', '/api/technicians?active=true');
  return techniciansCache;
}
async function refreshLinesCache() {
  linesCache = await api('GET', '/api/lines');
  return linesCache;
}
function toolOptionsHtml(selectedId) {
  return toolsCache.map(t =>
    `<option value="${t.id}" ${String(t.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(t.code)} — ${escapeHtml(t.name)}</option>`
  ).join('');
}
function technicianOptionsHtml(selectedId) {
  return techniciansCache.map(t =>
    `<option value="${t.id}" ${String(t.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
  ).join('');
}
function lineOptionsHtml(selectedId) {
  return linesCache.map(l =>
    `<option value="${l.id}" ${String(l.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(l.name)}</option>`
  ).join('');
}
const SHIFTS = ['Turno 1', 'Turno 2', 'Turno 3'];
function shiftOptionsHtml(selected) {
  return '<option value="">— Sin definir —</option>' + SHIFTS.map(s =>
    `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`
  ).join('');
}

/* ======================== Navigation ======================== */

const tabs = ['dashboard', 'tools', 'maintenance', 'config'];
const renderers = {
  dashboard: renderDashboard,
  tools: renderTools,
  maintenance: renderMaintenance,
  config: renderConfig
};
const pageMeta = {
  dashboard: { title: 'Dashboard', sub: 'Estado general del herramental de proceso' },
  tools: { title: 'Herramientas', sub: 'Máquinas, herramientas y procesos que requieren mantenimiento' },
  maintenance: { title: 'Mantenimiento', sub: 'Programación y bitácora de mantenimiento preventivo' },
  config: { title: 'Configuración', sub: 'Técnicos de manufactura y líneas de ensamble' }
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item[data-tab]');
  if (!btn) return;
  goToTab(btn.dataset.tab);
});

function goToTab(tab) {
  tabs.forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.nav-item[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const meta = pageMeta[tab];
  document.getElementById('pageTitle').textContent = meta.title;
  document.getElementById('pageSub').textContent = meta.sub;
  closeNotifPanel();
  renderers[tab]().catch(err => toast(err.message, true));
}

/* ======================== Icons ======================== */

const ICONS = {
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 17"></polyline>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>',
  x: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
  clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
  target: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}
function statTile(cls, iconName, value, label) {
  return `<div class="stat-tile ${cls}"><div class="icon">${icon(iconName)}</div><div><div class="n">${value}</div><div class="l">${label}</div></div></div>`;
}

/* ======================== Notifications ======================== */

let notifPanelOpen = false;

document.getElementById('btnNotifBell').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (notifPanelOpen) return closeNotifPanel();
  await openNotifPanel();
});
document.addEventListener('click', (e) => {
  if (notifPanelOpen && !e.target.closest('.notif-wrap')) closeNotifPanel();
});
document.getElementById('btnMarkAllRead').addEventListener('click', async () => {
  await api('POST', '/api/notifications/read-all');
  await openNotifPanel();
  await refreshNotifBadge();
});

async function refreshNotifBadge() {
  const { unread } = await api('GET', '/api/notifications/count');
  const badge = document.getElementById('notifBadge');
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function openNotifPanel() {
  const panel = document.getElementById('notifPanel');
  await refreshNotifBadge();
  const rows = await api('GET', '/api/notifications?limit=30');
  document.getElementById('notifList').innerHTML = rows.length ? rows.map(n => `
    <div class="notif-item type-${n.type} ${n.read ? '' : 'unread'}" data-id="${n.id}">
      <div class="dot"></div>
      <div>
        <div class="msg">${escapeHtml(n.message)}</div>
        <div class="when">${n.type === 'overdue' ? 'Vencido' : 'Próximo a vencer'} · ${escapeHtml(n.tool_code || '')}</div>
      </div>
    </div>`).join('') : `<div class="notif-empty">Sin notificaciones pendientes.</div>`;

  panel.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', async () => {
      await api('POST', `/api/notifications/${el.dataset.id}/read`);
      el.classList.remove('unread');
      await refreshNotifBadge();
    });
  });

  panel.classList.remove('hidden');
  notifPanelOpen = true;
}
function closeNotifPanel() {
  document.getElementById('notifPanel').classList.add('hidden');
  notifPanelOpen = false;
}

/* ======================== DASHBOARD ======================== */

async function renderDashboard() {
  await Promise.all([refreshLinesCache(), refreshTechniciansCache()]);

  const lineSel = document.getElementById('dashLineFilter');
  const techSel = document.getElementById('dashTechFilter');
  const keepLine = lineSel.value, keepTech = techSel.value;
  lineSel.innerHTML = '<option value="">Todas</option>' + lineOptionsHtml(keepLine);
  techSel.innerHTML = '<option value="">Todos</option>' + technicianOptionsHtml(keepTech);
  lineSel.value = keepLine;
  techSel.value = keepTech;

  lineSel.onchange = loadDashboard;
  techSel.onchange = loadDashboard;

  await loadDashboard();
  await renderPmPanel();
  await refreshNotifBadge();
}

async function loadDashboard() {
  const params = new URLSearchParams();
  const lineId = document.getElementById('dashLineFilter').value;
  const techId = document.getElementById('dashTechFilter').value;
  if (lineId) params.set('assembly_line_id', lineId);
  if (techId) params.set('assigned_technician_id', techId);

  const s = await api('GET', '/api/dashboard/summary?' + params.toString());
  const counts = s.tool_counts || {};

  document.getElementById('statGrid').innerHTML =
    statTile('', 'box', s.total_tools, 'Activos registrados') +
    statTile('good', 'check', counts.activo || 0, 'Activos operando') +
    statTile('warn', 'tool', counts.en_mantenimiento || 0, 'En mantenimiento') +
    statTile('bad', 'alert', s.overdue_count, 'Vencidas') +
    statTile('warn', 'clock', s.upcoming_count, 'Próximas a vencer') +
    statTile(s.compliance_pct === null ? '' : (s.compliance_pct >= 80 ? 'good' : s.compliance_pct >= 50 ? 'warn' : 'bad'), 'target', s.compliance_pct === null ? '—' : s.compliance_pct + '%', 'Cumplimiento (90 días)');

  document.getElementById('overdueBody').innerHTML = s.overdue.length ? s.overdue.map(r => `
    <tr>
      <td>${escapeHtml(r.tool_code)} — ${escapeHtml(r.tool_name)}</td>
      <td>${escapeHtml(r.maintenance_type)}</td>
      <td>${escapeHtml(r.line_name || '—')}</td>
      <td>${escapeHtml(r.technician_name || '—')}</td>
      <td class="mono">${fmtDate(r.next_due_date)}</td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="5">Sin mantenimientos vencidos</td></tr>`;

  document.getElementById('upcomingBody').innerHTML = s.upcoming.length ? s.upcoming.map(r => `
    <tr>
      <td>${escapeHtml(r.tool_code)} — ${escapeHtml(r.tool_name)}</td>
      <td>${escapeHtml(r.maintenance_type)}</td>
      <td>${escapeHtml(r.line_name || '—')}</td>
      <td>${escapeHtml(r.technician_name || '—')}</td>
      <td class="mono">${fmtDate(r.next_due_date)}</td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="5">Nada próximo a vencer</td></tr>`;

  document.getElementById('dashLogBody').innerHTML = s.recent_logs.length ? s.recent_logs.map(l => `
    <tr>
      <td>${escapeHtml(l.tool_code)} — ${escapeHtml(l.tool_name)}</td>
      <td>${escapeHtml(l.maintenance_type)}</td>
      <td>${escapeHtml(l.technician_name || '—')}</td>
      <td class="mono">${fmtDate(l.performed_date)}</td>
      <td>${onTimeBadge(l.on_time)}</td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="5">Sin mantenimientos registrados</td></tr>`;
}

function fmtMonthLabel(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${names[m - 1]} ${y}`;
}

async function renderPmPanel() {
  const data = await api('GET', '/api/dashboard/by-line');
  const el = document.getElementById('pmPanel');
  document.getElementById('pmPeriod').textContent = data.month_start ? fmtMonthLabel(data.month_start) : '';

  const lines = data.lines;
  if (!lines.length) {
    el.innerHTML = `<div class="pm-empty">Todavía no hay líneas de ensamble configuradas. Créalas en Configuración → Líneas de ensamble.</div>`;
    return;
  }

  el.innerHTML = `<div class="pm-grid">${lines.map(l => {
    const pct = l.required_month > 0 ? Math.round((l.completed_month / l.required_month) * 100) : (l.total === 0 ? null : 100);
    const pctCls = pct === null ? '' : pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
    const reqW = 100;
    const compW = l.required_month > 0 ? Math.min(100, (l.completed_month / l.required_month) * 100) : 0;

    const alerts = [];
    if (l.overdue) alerts.push(`<span class="badge badge-overdue">${l.overdue} vencida${l.overdue > 1 ? 's' : ''}</span>`);
    if (l.upcoming) alerts.push(`<span class="badge badge-upcoming">${l.upcoming} próxima${l.upcoming > 1 ? 's' : ''}</span>`);
    if (!l.overdue && !l.upcoming && l.total > 0) alerts.push(`<span class="badge badge-ok">Al día</span>`);
    if (l.total === 0) alerts.push(`<span class="muted" style="font-size:0.75rem;">Sin programaciones activas</span>`);

    return `
      <div class="pm-card">
        <div class="pm-card-header">
          <span class="line-name">${escapeHtml(l.line_name)}</span>
          ${pct !== null ? `<span class="pct ${pctCls}">${pct}%</span>` : ''}
        </div>
        <div class="pm-bar-row">
          <span class="lbl">Requeridos</span>
          <div class="pm-bar-track"><div class="pm-bar-fill required" style="width:${reqW}%"></div></div>
          <span class="val">${l.required_month}</span>
        </div>
        <div class="pm-bar-row">
          <span class="lbl">Realizados</span>
          <div class="pm-bar-track"><div class="pm-bar-fill completed" style="width:${compW}%"></div></div>
          <span class="val">${l.completed_month}</span>
        </div>
        <div class="pm-alerts">${alerts.join('')}</div>
      </div>`;
  }).join('')}</div>
  ${data.unassigned_tools ? `<div class="pm-empty">${data.unassigned_tools} herramienta(s) sin línea asignada — no aparecen en este panel.</div>` : ''}`;
}

/* ======================== TOOLS ======================== */

let currentToolDetailId = null;
let toolDetailSub = 'sched';

async function renderTools() {
  await refreshLinesCache();
  await loadToolsTable();
}

async function loadToolsTable() {
  const q = document.getElementById('toolSearch').value.trim();
  const category = document.getElementById('toolCategoryFilter').value;
  const status = document.getElementById('toolStatusFilter').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (status) params.set('status', status);

  const rows = await api('GET', '/api/tools?' + params.toString());
  toolsCache = await api('GET', '/api/tools');

  document.getElementById('toolsBody').innerHTML = rows.length ? rows.map(t => `
    <tr>
      <td class="mono">${escapeHtml(t.code)}</td>
      <td>${escapeHtml(t.name)}</td>
      <td>${categoryLabel(t.category)}</td>
      <td>${escapeHtml(t.line_name || '—')}</td>
      <td>${statusBadge(t.status)}</td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="view" data-id="${t.id}">Ver</button>
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${t.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${t.id}">Eliminar</button>
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="6">Sin resultados. Crea el primero con "+ Nueva herramienta".</td></tr>`;
}

document.getElementById('toolSearch').addEventListener('input', debounce(loadToolsTable, 250));
document.getElementById('toolCategoryFilter').addEventListener('change', loadToolsTable);
document.getElementById('toolStatusFilter').addEventListener('change', loadToolsTable);

document.getElementById('toolsBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'view') return openToolDetail(id);
  if (action === 'edit') return openToolForm(await api('GET', `/api/tools/${id}`));
  if (action === 'delete') {
    if (!confirm('¿Eliminar este activo? También se eliminarán sus programaciones y bitácora.')) return;
    try {
      await api('DELETE', `/api/tools/${id}`);
      toast('Eliminado');
      await loadToolsTable();
      if (currentToolDetailId === id) document.getElementById('toolDetailCard').classList.add('hidden');
    } catch (err) { toast(err.message, true); }
  }
});

document.getElementById('btnNewTool').addEventListener('click', async () => {
  await refreshLinesCache();
  openToolForm(null);
});

function openToolForm(tool) {
  const isEdit = !!tool;
  openModal(isEdit ? 'Editar activo' : 'Nuevo activo (máquina, herramienta o proceso)', `
    <form id="toolForm">
      <div class="field-row">
        <div class="field"><label>Código</label><input name="code" required value="${escapeHtml(tool?.code || '')}"></div>
        <div class="field"><label>Nombre</label><input name="name" required value="${escapeHtml(tool?.name || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Categoría</label>
          <select name="category">
            <option value="maquina" ${tool?.category === 'maquina' ? 'selected' : ''}>Máquina</option>
            <option value="herramienta" ${!tool || tool?.category === 'herramienta' ? 'selected' : ''}>Herramienta</option>
            <option value="proceso" ${tool?.category === 'proceso' ? 'selected' : ''}>Proceso</option>
            <option value="equipo" ${tool?.category === 'equipo' ? 'selected' : ''}>Equipo</option>
          </select>
        </div>
        <div class="field"><label>Tipo (opcional)</label><input name="type" placeholder="Ej. Prensa hidráulica, troquel..." value="${escapeHtml(tool?.type || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Línea de ensamble</label>
          <select name="assembly_line_id">
            <option value="">— Sin línea —</option>
            ${lineOptionsHtml(tool?.assembly_line_id)}
          </select>
        </div>
        <div class="field"><label>Ubicación</label><input name="location" value="${escapeHtml(tool?.location || '')}"></div>
      </div>
      <div class="field">
        <label>Estado</label>
        <select name="status">
          <option value="activo" ${!tool || tool?.status === 'activo' ? 'selected' : ''}>Activo</option>
          <option value="en_mantenimiento" ${tool?.status === 'en_mantenimiento' ? 'selected' : ''}>En mantenimiento</option>
          <option value="baja" ${tool?.status === 'baja' ? 'selected' : ''}>Baja</option>
        </select>
      </div>
      <div class="field"><label>Notas</label><textarea name="notes">${escapeHtml(tool?.notes || '')}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="toolFormCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
      </div>
    </form>
  `);
  document.getElementById('toolFormCancel').addEventListener('click', closeModal);
  document.getElementById('toolForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      if (isEdit) await api('PUT', `/api/tools/${tool.id}`, payload);
      else await api('POST', '/api/tools', payload);
      toast(isEdit ? 'Activo actualizado' : 'Activo creado');
      closeModal();
      await loadToolsTable();
    } catch (err) { toast(err.message, true); }
  });
}

async function openToolDetail(id) {
  currentToolDetailId = id;
  toolDetailSub = 'sched';
  const tool = await api('GET', `/api/tools/${id}`);
  document.getElementById('toolDetailTitle').textContent = `${tool.code} — ${tool.name}`;
  document.getElementById('toolDetailMeta').innerHTML = `
    <span class="chip">Categoría: <strong>${categoryLabel(tool.category)}</strong></span>
    <span class="chip">Línea: <strong>${escapeHtml(tool.line_name || 'Sin asignar')}</strong></span>
    <span class="chip">Ubicación: <strong>${escapeHtml(tool.location || '—')}</strong></span>
    <span class="chip">Estado: <strong>${categoryLabelStatus(tool.status)}</strong></span>
  `;
  document.getElementById('toolDetailCard').classList.remove('hidden');
  document.querySelectorAll('#toolDetailCard .subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === 'sched'));
  await renderToolDetailBody();
  document.getElementById('toolDetailCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function categoryLabelStatus(status) {
  const labels = { activo: 'Activo', en_mantenimiento: 'En mantenimiento', baja: 'Baja' };
  return labels[status] || status;
}

document.getElementById('btnCloseToolDetail').addEventListener('click', () => {
  document.getElementById('toolDetailCard').classList.add('hidden');
  currentToolDetailId = null;
});

document.querySelectorAll('#toolDetailCard .subtab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    toolDetailSub = btn.dataset.sub;
    document.querySelectorAll('#toolDetailCard .subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
    await renderToolDetailBody();
  });
});

async function renderToolDetailBody() {
  const id = currentToolDetailId;
  const body = document.getElementById('toolDetailBody');
  if (toolDetailSub === 'sched') {
    const rows = await api('GET', `/api/tools/${id}/schedules`);
    body.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Técnico</th><th>Turno</th><th>Frecuencia</th><th>Próxima</th><th>Estado</th></tr></thead><tbody>${
      rows.map(s => `<tr><td>${escapeHtml(s.maintenance_type)}</td><td>${escapeHtml(s.technician_name || '—')}</td><td>${escapeHtml(s.shift || '—')}</td><td>${s.frequency_days} días</td><td class="mono">${fmtDate(s.next_due_date)}</td><td>${s.active ? dueBadge(s.next_due_date) : '<span class="badge">Inactiva</span>'}</td></tr>`).join('')
    }</tbody></table></div>` : `<p class="muted">Sin programaciones para este activo.</p>`;
  } else {
    const rows = await api('GET', `/api/tools/${id}/logs`);
    body.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Técnico</th><th>Turno</th><th>A tiempo</th><th>Descripción</th></tr></thead><tbody>${
      rows.map(l => `<tr><td class="mono">${fmtDate(l.performed_date)}</td><td>${escapeHtml(l.maintenance_type)}</td><td>${escapeHtml(l.technician_name || '—')}</td><td>${escapeHtml(l.shift || '—')}</td><td>${onTimeBadge(l.on_time)}</td><td>${escapeHtml(l.description || '—')}</td></tr>`).join('')
    }</tbody></table></div>` : `<p class="muted">Sin mantenimientos registrados para este activo.</p>`;
  }
}

/* ======================== MAINTENANCE ======================== */

let maintSub = 'schedules';

async function renderMaintenance() {
  await Promise.all([refreshToolsCache(), refreshTechniciansCache(), refreshLinesCache()]);

  const lineSel = document.getElementById('scheduleLineFilter');
  const techSel = document.getElementById('scheduleTechFilter');
  lineSel.innerHTML = '<option value="">Todas</option>' + lineOptionsHtml();
  techSel.innerHTML = '<option value="">Todos</option>' + technicianOptionsHtml();

  await loadSchedules();
  await loadLogs();
}

document.querySelectorAll('#tab-maintenance .subtabs .subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    maintSub = btn.dataset.msub;
    document.querySelectorAll('#tab-maintenance .subtabs .subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('msub-schedules').classList.toggle('hidden', maintSub !== 'schedules');
    document.getElementById('msub-logs').classList.toggle('hidden', maintSub !== 'logs');
  });
});

document.getElementById('scheduleFilter').addEventListener('change', loadSchedules);
document.getElementById('scheduleLineFilter').addEventListener('change', loadSchedules);
document.getElementById('scheduleTechFilter').addEventListener('change', loadSchedules);

async function loadSchedules() {
  const due = document.getElementById('scheduleFilter').value;
  const lineId = document.getElementById('scheduleLineFilter').value;
  const techId = document.getElementById('scheduleTechFilter').value;
  const params = new URLSearchParams();
  if (due) params.set('due', due); else params.set('active', 'true');
  if (lineId) params.set('assembly_line_id', lineId);
  if (techId) params.set('assigned_technician_id', techId);
  const rows = await api('GET', '/api/maintenance/schedules?' + params.toString());

  document.getElementById('schedulesBody').innerHTML = rows.length ? rows.map(s => `
    <tr>
      <td>${escapeHtml(s.tool_code)} — ${escapeHtml(s.tool_name)}</td>
      <td>${escapeHtml(s.maintenance_type)}</td>
      <td>${escapeHtml(s.line_name || '—')}</td>
      <td>${escapeHtml(s.technician_name || '—')}</td>
      <td>${escapeHtml(s.shift || '—')}</td>
      <td class="mono">${fmtDate(s.next_due_date)}</td>
      <td>${dueBadge(s.next_due_date)}</td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-sched" data-id="${s.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete-sched" data-id="${s.id}">Eliminar</button>
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="8">Sin programaciones para este filtro.</td></tr>`;
}

document.getElementById('schedulesBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'delete-sched') {
    if (!confirm('¿Eliminar esta programación?')) return;
    await api('DELETE', `/api/maintenance/schedules/${id}`);
    toast('Programación eliminada');
    await loadSchedules();
  } else if (btn.dataset.action === 'edit-sched') {
    const s = await api('GET', `/api/maintenance/schedules/${id}`);
    openScheduleForm(s);
  }
});

document.getElementById('btnNewSchedule').addEventListener('click', () => openScheduleForm(null));

function checklistRowHtml(desc) {
  return `<div class="checklist-row"><input type="text" name="checklist_item" placeholder="Ej. Revisar nivel de aceite" value="${escapeHtml(desc || '')}"><button type="button" class="btn btn-secondary btn-sm remove-checklist-row">✕</button></div>`;
}

function openScheduleForm(schedule) {
  const isEdit = !!schedule;
  const checklistItems = schedule?.checklist?.length ? schedule.checklist.map(c => c.description) : [''];

  openModal(isEdit ? 'Editar programación' : 'Nueva programación de mantenimiento preventivo', `
    <form id="schedForm">
      <div class="field">
        <label>Máquina, herramienta o proceso</label>
        <select name="tool_id" ${isEdit ? 'disabled' : ''} required>
          <option value="">Selecciona...</option>
          ${toolOptionsHtml(schedule?.tool_id)}
        </select>
      </div>
      <div class="field"><label>Tipo de mantenimiento</label><input name="maintenance_type" required placeholder="Calibración, lubricación, limpieza..." value="${escapeHtml(schedule?.maintenance_type || '')}"></div>
      <div class="field-row">
        <div class="field"><label>Frecuencia (días)</label><input name="frequency_days" type="number" min="1" required value="${schedule?.frequency_days || 30}"></div>
        <div class="field"><label>Alertar con anticipación (días)</label><input name="alert_days_before" type="number" min="0" required value="${schedule?.alert_days_before ?? 7}"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Técnico asignado</label>
          <select name="assigned_technician_id">
            <option value="">— Sin asignar —</option>
            ${technicianOptionsHtml(schedule?.assigned_technician_id)}
          </select>
        </div>
        <div class="field">
          <label>Turno</label>
          <select name="shift">${shiftOptionsHtml(schedule?.shift)}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Última realizada</label><input name="last_done_date" type="date" value="${fmtDate(schedule?.last_done_date) === '—' ? '' : fmtDate(schedule?.last_done_date)}"></div>
        ${isEdit ? `<div class="field"><label>Próxima fecha</label><input name="next_due_date" type="date" value="${fmtDate(schedule.next_due_date)}"></div>` : ''}
      </div>
      ${isEdit ? `<div class="field"><label><input type="checkbox" name="active" value="1" style="width:auto;display:inline-block;margin-right:6px;" ${schedule.active ? 'checked' : ''}> Programación activa</label></div>` : ''}
      <div class="field"><label>Notas</label><textarea name="notes">${escapeHtml(schedule?.notes || '')}</textarea></div>

      <div class="field">
        <label>Checklist a realizar</label>
        <div class="checklist-builder" id="checklistBuilder">${checklistItems.map(checklistRowHtml).join('')}</div>
        <button type="button" class="btn btn-secondary btn-sm" id="btnAddChecklistRow">+ Agregar ítem</button>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="schedCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
      </div>
    </form>
  `);

  document.getElementById('btnAddChecklistRow').addEventListener('click', () => {
    document.getElementById('checklistBuilder').insertAdjacentHTML('beforeend', checklistRowHtml(''));
  });
  document.getElementById('checklistBuilder').addEventListener('click', (e) => {
    const rm = e.target.closest('.remove-checklist-row');
    if (rm) rm.closest('.checklist-row').remove();
  });

  document.getElementById('schedCancel').addEventListener('click', closeModal);
  document.getElementById('schedForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = Object.fromEntries(new FormData(form).entries());
    if (isEdit) payload.active = form.elements.active && form.elements.active.checked ? 1 : 0;
    payload.checklist = Array.from(form.querySelectorAll('[name="checklist_item"]')).map(el => el.value.trim()).filter(Boolean);
    try {
      if (isEdit) await api('PUT', `/api/maintenance/schedules/${schedule.id}`, payload);
      else await api('POST', '/api/maintenance/schedules', payload);
      toast(isEdit ? 'Programación actualizada' : 'Programación creada');
      closeModal();
      await loadSchedules();
    } catch (err) { toast(err.message, true); }
  });
}

async function loadLogs() {
  const rows = await api('GET', '/api/maintenance/logs?limit=50');
  document.getElementById('logsBody').innerHTML = rows.length ? rows.map(l => `
    <tr>
      <td>${escapeHtml(l.tool_code)} — ${escapeHtml(l.tool_name)}</td>
      <td>${escapeHtml(l.maintenance_type)}</td>
      <td>${escapeHtml(l.technician_name || '—')}</td>
      <td>${escapeHtml(l.shift || '—')}</td>
      <td class="mono">${fmtDate(l.performed_date)}</td>
      <td>${onTimeBadge(l.on_time)}</td>
      <td class="row-actions"><button class="btn btn-danger btn-sm" data-action="delete-log" data-id="${l.id}">Eliminar</button></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="7">Sin mantenimientos registrados.</td></tr>`;
}

document.getElementById('logsBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete-log"]');
  if (!btn) return;
  if (!confirm('¿Eliminar este registro de mantenimiento?')) return;
  await api('DELETE', `/api/maintenance/logs/${btn.dataset.id}`);
  toast('Registro eliminado');
  await loadLogs();
});

document.getElementById('btnNewLog').addEventListener('click', () => openLogForm());

function renderLogChecklist(items) {
  const container = document.getElementById('logChecklistContainer');
  if (!items || !items.length) {
    container.innerHTML = '<p class="muted" style="font-size:0.8rem;">Esta programación no tiene checklist definido, o no seleccionaste una programación.</p>';
    return;
  }
  container.innerHTML = `<div class="checklist-run">${items.map(it => `
    <div class="checklist-run-item" data-item-id="${it.id}" data-desc="${escapeHtml(it.description)}">
      <label class="chk"><input type="checkbox" class="chk-completed" checked> ${escapeHtml(it.description)}</label>
      <input type="text" class="chk-notes" placeholder="Notas (opcional)">
    </div>`).join('')}</div>`;
}

async function openLogForm() {
  openModal('Registrar mantenimiento realizado', `
    <form id="logForm">
      <div class="field">
        <label>Máquina, herramienta o proceso</label>
        <select name="tool_id" id="logToolSelect" required>
          <option value="">Selecciona...</option>
          ${toolOptionsHtml()}
        </select>
      </div>
      <div class="field">
        <label>Programación relacionada (opcional — actualiza la próxima fecha y trae el checklist)</label>
        <select name="schedule_id" id="logScheduleSelect"><option value="">— Ninguna —</option></select>
      </div>
      <div class="field-row">
        <div class="field"><label>Tipo de mantenimiento</label><input name="maintenance_type" required placeholder="Calibración, lubricación..." id="logTypeInput"></div>
        <div class="field"><label>Fecha realizada</label><input name="performed_date" type="date" value="${todayStr()}"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Técnico</label>
          <select name="technician_id" id="logTechnicianSelect">
            <option value="">— Sin asignar —</option>
            ${technicianOptionsHtml()}
          </select>
        </div>
        <div class="field">
          <label>Turno</label>
          <select name="shift" id="logShiftSelect">${shiftOptionsHtml()}</select>
        </div>
      </div>
      <div class="field"><label>Descripción</label><textarea name="description"></textarea></div>
      <div class="field"><label>Repuestos / partes usadas</label><textarea name="parts_used"></textarea></div>

      <div class="field">
        <label>Checklist realizado</label>
        <div id="logChecklistContainer"></div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="logCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);

  renderLogChecklist(null);
  document.getElementById('logCancel').addEventListener('click', closeModal);

  document.getElementById('logToolSelect').addEventListener('change', async (e) => {
    const toolId = e.target.value;
    const schedSel = document.getElementById('logScheduleSelect');
    schedSel.innerHTML = '<option value="">— Ninguna —</option>';
    renderLogChecklist(null);
    if (!toolId) return;
    const scheds = await api('GET', `/api/tools/${toolId}/schedules`);
    scheds.filter(s => s.active).forEach(s => {
      schedSel.innerHTML += `<option value="${s.id}" data-type="${escapeHtml(s.maintenance_type)}" data-tech="${s.assigned_technician_id || ''}" data-shift="${escapeHtml(s.shift || '')}">${escapeHtml(s.maintenance_type)} (vence ${fmtDate(s.next_due_date)})</option>`;
    });
  });

  document.getElementById('logScheduleSelect').addEventListener('change', async (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt || !opt.value) { renderLogChecklist(null); return; }
    if (opt.dataset.type) document.getElementById('logTypeInput').value = opt.dataset.type;
    if (opt.dataset.tech) document.getElementById('logTechnicianSelect').value = opt.dataset.tech;
    if (opt.dataset.shift) document.getElementById('logShiftSelect').value = opt.dataset.shift;
    const detail = await api('GET', `/api/maintenance/schedules/${opt.value}`);
    renderLogChecklist(detail.checklist);
  });

  document.getElementById('logForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    if (!payload.schedule_id) delete payload.schedule_id;
    payload.checklist = Array.from(document.querySelectorAll('#logChecklistContainer .checklist-run-item')).map(row => ({
      checklist_item_id: Number(row.dataset.itemId),
      description: row.dataset.desc,
      completed: row.querySelector('.chk-completed').checked,
      notes: row.querySelector('.chk-notes').value.trim() || undefined
    }));
    try {
      await api('POST', '/api/maintenance/logs', payload);
      toast('Mantenimiento registrado');
      closeModal();
      await loadLogs();
      await loadSchedules();
    } catch (err) { toast(err.message, true); }
  });
}

/* ======================== CONFIG (técnicos / líneas) ======================== */

let configSub = 'technicians';

async function renderConfig() {
  await loadTechnicians();
  await loadLines();
}

document.querySelectorAll('#tab-config .subtabs .subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    configSub = btn.dataset.csub;
    document.querySelectorAll('#tab-config .subtabs .subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('csub-technicians').classList.toggle('hidden', configSub !== 'technicians');
    document.getElementById('csub-lines').classList.toggle('hidden', configSub !== 'lines');
  });
});

async function loadTechnicians() {
  const rows = await api('GET', '/api/technicians');
  document.getElementById('techniciansBody').innerHTML = rows.length ? rows.map(t => `
    <tr>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.area || '—')}</td>
      <td>${t.active ? '<span class="badge badge-activo">Activo</span>' : '<span class="badge">Inactivo</span>'}</td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-tech" data-id="${t.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete-tech" data-id="${t.id}">Eliminar</button>
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="4">Sin técnicos registrados.</td></tr>`;
}

document.getElementById('btnNewTechnician').addEventListener('click', () => openTechnicianForm(null));
document.getElementById('techniciansBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit-tech') {
    const rows = await api('GET', '/api/technicians');
    openTechnicianForm(rows.find(r => String(r.id) === String(btn.dataset.id)));
  } else if (btn.dataset.action === 'delete-tech') {
    if (!confirm('¿Eliminar este técnico? Las programaciones que lo tenían asignado quedarán sin técnico.')) return;
    await api('DELETE', `/api/technicians/${btn.dataset.id}`);
    toast('Técnico eliminado');
    await loadTechnicians();
  }
});

function openTechnicianForm(tech) {
  const isEdit = !!tech;
  openModal(isEdit ? 'Editar técnico' : 'Nuevo técnico de manufactura', `
    <form id="techForm">
      <div class="field"><label>Nombre</label><input name="name" required value="${escapeHtml(tech?.name || '')}"></div>
      <div class="field"><label>Área</label><input name="area" placeholder="Manufactura, Mantenimiento..." value="${escapeHtml(tech?.area || '')}"></div>
      ${isEdit ? `<div class="field"><label><input type="checkbox" name="active" value="1" style="width:auto;display:inline-block;margin-right:6px;" ${tech.active ? 'checked' : ''}> Técnico activo</label></div>` : ''}
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="techCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
      </div>
    </form>
  `);
  document.getElementById('techCancel').addEventListener('click', closeModal);
  document.getElementById('techForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = Object.fromEntries(new FormData(form).entries());
    if (isEdit) payload.active = form.elements.active && form.elements.active.checked ? 1 : 0;
    try {
      if (isEdit) await api('PUT', `/api/technicians/${tech.id}`, payload);
      else await api('POST', '/api/technicians', payload);
      toast(isEdit ? 'Técnico actualizado' : 'Técnico creado');
      closeModal();
      await loadTechnicians();
    } catch (err) { toast(err.message, true); }
  });
}

async function loadLines() {
  const [lines, tools] = await Promise.all([api('GET', '/api/lines'), api('GET', '/api/tools')]);
  document.getElementById('linesBody').innerHTML = lines.length ? lines.map(l => {
    const count = tools.filter(t => String(t.assembly_line_id) === String(l.id)).length;
    return `
    <tr>
      <td>${escapeHtml(l.name)}</td>
      <td>${count}</td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-line" data-id="${l.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete-line" data-id="${l.id}">Eliminar</button>
      </td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="3">Sin líneas de ensamble registradas.</td></tr>`;
}

document.getElementById('btnNewLine').addEventListener('click', () => openLineForm(null));
document.getElementById('linesBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit-line') {
    const rows = await api('GET', '/api/lines');
    openLineForm(rows.find(r => String(r.id) === String(btn.dataset.id)));
  } else if (btn.dataset.action === 'delete-line') {
    if (!confirm('¿Eliminar esta línea? Las herramientas asignadas quedarán sin línea.')) return;
    await api('DELETE', `/api/lines/${btn.dataset.id}`);
    toast('Línea eliminada');
    await loadLines();
  }
});

function openLineForm(line) {
  const isEdit = !!line;
  openModal(isEdit ? 'Editar línea de ensamble' : 'Nueva línea de ensamble', `
    <form id="lineForm">
      <div class="field"><label>Nombre</label><input name="name" required value="${escapeHtml(line?.name || '')}" placeholder="Ej. Línea 1, Ensamble Final..."></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="lineCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
      </div>
    </form>
  `);
  document.getElementById('lineCancel').addEventListener('click', closeModal);
  document.getElementById('lineForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (isEdit) await api('PUT', `/api/lines/${line.id}`, payload);
      else await api('POST', '/api/lines', payload);
      toast(isEdit ? 'Línea actualizada' : 'Línea creada');
      closeModal();
      await loadLines();
    } catch (err) { toast(err.message, true); }
  });
}

/* ======================== Utils ======================== */

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ======================== Init ======================== */

goToTab('dashboard');
refreshNotifBadge().catch(() => {});
setInterval(() => refreshNotifBadge().catch(() => {}), 45000);
