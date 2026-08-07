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

/* ======================== Shared tool cache ======================== */

let toolsCache = [];
async function refreshToolsCache() {
  toolsCache = await api('GET', '/api/tools');
  return toolsCache;
}
function toolOptionsHtml(selectedId) {
  return toolsCache.map(t =>
    `<option value="${t.id}" ${String(t.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(t.code)} — ${escapeHtml(t.name)}</option>`
  ).join('');
}

/* ======================== Navigation ======================== */

const tabs = ['dashboard', 'tools', 'maintenance'];
const renderers = {
  dashboard: renderDashboard,
  tools: renderTools,
  maintenance: renderMaintenance
};

document.getElementById('mainTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  goToTab(btn.dataset.tab);
});

function goToTab(tab) {
  tabs.forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('#mainTabs .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  renderers[tab]().catch(err => toast(err.message, true));
}

/* ======================== DASHBOARD ======================== */

async function renderDashboard() {
  const s = await api('GET', '/api/dashboard/summary');

  const counts = s.tool_counts || {};
  document.getElementById('statGrid').innerHTML = `
    <div class="stat-tile"><div class="n">${s.total_tools}</div><div class="l">Herramientas</div></div>
    <div class="stat-tile good"><div class="n">${counts.activo || 0}</div><div class="l">Activas</div></div>
    <div class="stat-tile warn"><div class="n">${counts.en_mantenimiento || 0}</div><div class="l">En mantenimiento</div></div>
    <div class="stat-tile bad"><div class="n">${counts.baja || 0}</div><div class="l">Baja</div></div>
    <div class="stat-tile bad"><div class="n">${s.overdue_count}</div><div class="l">Vencidas</div></div>
    <div class="stat-tile warn"><div class="n">${s.upcoming_count}</div><div class="l">Próx. 7 días</div></div>
  `;

  document.getElementById('overdueBody').innerHTML = s.overdue.length ? s.overdue.map(r => `
    <tr>
      <td>${escapeHtml(r.tool_code)} — ${escapeHtml(r.tool_name)}</td>
      <td>${escapeHtml(r.maintenance_type)}</td>
      <td class="mono">${fmtDate(r.next_due_date)}</td>
      <td>${r.frequency_days} días</td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="4">Sin mantenimientos vencidos 🎉</td></tr>`;

  document.getElementById('upcomingBody').innerHTML = s.upcoming.length ? s.upcoming.map(r => `
    <tr>
      <td>${escapeHtml(r.tool_code)} — ${escapeHtml(r.tool_name)}</td>
      <td>${escapeHtml(r.maintenance_type)}</td>
      <td class="mono">${fmtDate(r.next_due_date)}</td>
      <td>${r.frequency_days} días</td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="4">Nada próximo en 7 días</td></tr>`;

  document.getElementById('dashLogBody').innerHTML = s.recent_logs.length ? s.recent_logs.map(l => `
    <tr>
      <td>${escapeHtml(l.tool_code)} — ${escapeHtml(l.tool_name)}</td>
      <td>${escapeHtml(l.maintenance_type)}</td>
      <td>${escapeHtml(l.technician || '—')}</td>
      <td class="mono">${fmtDate(l.performed_date)}</td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="4">Sin mantenimientos registrados</td></tr>`;
}

/* ======================== TOOLS ======================== */

let currentToolDetailId = null;
let toolDetailSub = 'sched';

async function renderTools() {
  await loadToolsTable();
}

async function loadToolsTable() {
  const q = document.getElementById('toolSearch').value.trim();
  const status = document.getElementById('toolStatusFilter').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);

  const rows = await api('GET', '/api/tools?' + params.toString());
  toolsCache = await api('GET', '/api/tools'); // keep full cache for selects elsewhere

  document.getElementById('toolsBody').innerHTML = rows.length ? rows.map(t => `
    <tr>
      <td class="mono">${escapeHtml(t.code)}</td>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.type || '—')}</td>
      <td>${escapeHtml(t.location || '—')}</td>
      <td>${statusBadge(t.status)}</td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="view" data-id="${t.id}">Ver</button>
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${t.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${t.id}">Eliminar</button>
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="6">Sin herramientas. Crea la primera con "+ Nueva herramienta".</td></tr>`;
}

document.getElementById('toolSearch').addEventListener('input', debounce(loadToolsTable, 250));
document.getElementById('toolStatusFilter').addEventListener('change', loadToolsTable);

document.getElementById('toolsBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'view') return openToolDetail(id);
  if (action === 'edit') return openToolForm(await api('GET', `/api/tools/${id}`));
  if (action === 'delete') {
    if (!confirm('¿Eliminar esta herramienta? También se eliminarán sus programaciones y bitácora.')) return;
    try {
      await api('DELETE', `/api/tools/${id}`);
      toast('Herramienta eliminada');
      await loadToolsTable();
      if (currentToolDetailId === id) document.getElementById('toolDetailCard').classList.add('hidden');
    } catch (err) { toast(err.message, true); }
  }
});

document.getElementById('btnNewTool').addEventListener('click', () => openToolForm(null));

function openToolForm(tool) {
  const isEdit = !!tool;
  openModal(isEdit ? 'Editar herramienta' : 'Nueva herramienta', `
    <form id="toolForm">
      <div class="field-row">
        <div class="field"><label>Código</label><input name="code" required value="${escapeHtml(tool?.code || '')}"></div>
        <div class="field"><label>Nombre</label><input name="name" required value="${escapeHtml(tool?.name || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Tipo</label><input name="type" placeholder="Troquel, molde, calibre..." value="${escapeHtml(tool?.type || '')}"></div>
        <div class="field"><label>Ubicación</label><input name="location" value="${escapeHtml(tool?.location || '')}"></div>
      </div>
      <div class="field">
        <label>Estado</label>
        <select name="status">
          <option value="activo" ${tool?.status === 'activo' ? 'selected' : ''}>Activo</option>
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
      toast(isEdit ? 'Herramienta actualizada' : 'Herramienta creada');
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
  document.getElementById('toolDetailCard').classList.remove('hidden');
  document.querySelectorAll('#toolDetailCard .subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === 'sched'));
  await renderToolDetailBody();
  document.getElementById('toolDetailCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    body.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Frecuencia</th><th>Última</th><th>Próxima</th><th>Estado</th></tr></thead><tbody>${
      rows.map(s => `<tr><td>${escapeHtml(s.maintenance_type)}</td><td>${s.frequency_days} días</td><td class="mono">${fmtDate(s.last_done_date)}</td><td class="mono">${fmtDate(s.next_due_date)}</td><td>${s.active ? dueBadge(s.next_due_date) : '<span class="badge">Inactiva</span>'}</td></tr>`).join('')
    }</tbody></table></div>` : `<p class="muted">Sin programaciones para esta herramienta.</p>`;
  } else {
    const rows = await api('GET', `/api/tools/${id}/logs`);
    body.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Técnico</th><th>Descripción</th></tr></thead><tbody>${
      rows.map(l => `<tr><td class="mono">${fmtDate(l.performed_date)}</td><td>${escapeHtml(l.maintenance_type)}</td><td>${escapeHtml(l.technician || '—')}</td><td>${escapeHtml(l.description || '—')}</td></tr>`).join('')
    }</tbody></table></div>` : `<p class="muted">Sin mantenimientos registrados para esta herramienta.</p>`;
  }
}

/* ======================== MAINTENANCE ======================== */

let maintSub = 'schedules';

async function renderMaintenance() {
  await refreshToolsCache();
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

async function loadSchedules() {
  const due = document.getElementById('scheduleFilter').value;
  const params = new URLSearchParams();
  if (due) params.set('due', due); else params.set('active', 'true');
  const rows = await api('GET', '/api/maintenance/schedules?' + params.toString());

  document.getElementById('schedulesBody').innerHTML = rows.length ? rows.map(s => `
    <tr>
      <td>${escapeHtml(s.tool_code)} — ${escapeHtml(s.tool_name)}</td>
      <td>${escapeHtml(s.maintenance_type)}</td>
      <td>${s.frequency_days} días</td>
      <td class="mono">${fmtDate(s.last_done_date)}</td>
      <td class="mono">${fmtDate(s.next_due_date)}</td>
      <td>${dueBadge(s.next_due_date)}</td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-sched" data-id="${s.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete-sched" data-id="${s.id}">Eliminar</button>
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="7">Sin programaciones para este filtro.</td></tr>`;
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

function openScheduleForm(schedule) {
  const isEdit = !!schedule;
  openModal(isEdit ? 'Editar programación' : 'Nueva programación de mantenimiento', `
    <form id="schedForm">
      <div class="field">
        <label>Herramienta</label>
        <select name="tool_id" ${isEdit ? 'disabled' : ''} required>
          <option value="">Selecciona...</option>
          ${toolOptionsHtml(schedule?.tool_id)}
        </select>
      </div>
      <div class="field"><label>Tipo de mantenimiento</label><input name="maintenance_type" required placeholder="Calibración, limpieza, cambio de piezas..." value="${escapeHtml(schedule?.maintenance_type || '')}"></div>
      <div class="field-row">
        <div class="field"><label>Frecuencia (días)</label><input name="frequency_days" type="number" min="1" required value="${schedule?.frequency_days || 30}"></div>
        <div class="field"><label>Última realizada</label><input name="last_done_date" type="date" value="${fmtDate(schedule?.last_done_date) === '—' ? '' : fmtDate(schedule?.last_done_date)}"></div>
      </div>
      ${isEdit ? `<div class="field"><label>Próxima fecha</label><input name="next_due_date" type="date" value="${fmtDate(schedule.next_due_date)}"></div>` : ''}
      ${isEdit ? `<div class="field"><label><input type="checkbox" name="active" value="1" style="width:auto;display:inline-block;margin-right:6px;" ${schedule.active ? 'checked' : ''}> Programación activa</label></div>` : ''}
      <div class="field"><label>Notas</label><textarea name="notes">${escapeHtml(schedule?.notes || '')}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="schedCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
      </div>
    </form>
  `);
  document.getElementById('schedCancel').addEventListener('click', closeModal);
  document.getElementById('schedForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    if (isEdit) payload.active = e.target.elements.active && e.target.elements.active.checked ? 1 : 0;
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
      <td>${escapeHtml(l.technician || '—')}</td>
      <td class="mono">${fmtDate(l.performed_date)}</td>
      <td>${escapeHtml(l.description || '—')}</td>
      <td class="row-actions"><button class="btn btn-danger btn-sm" data-action="delete-log" data-id="${l.id}">Eliminar</button></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="6">Sin mantenimientos registrados.</td></tr>`;
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

async function openLogForm() {
  openModal('Registrar mantenimiento realizado', `
    <form id="logForm">
      <div class="field">
        <label>Herramienta</label>
        <select name="tool_id" id="logToolSelect" required>
          <option value="">Selecciona...</option>
          ${toolOptionsHtml()}
        </select>
      </div>
      <div class="field">
        <label>Programación relacionada (opcional — actualiza automáticamente la próxima fecha)</label>
        <select name="schedule_id" id="logScheduleSelect"><option value="">— Ninguna —</option></select>
      </div>
      <div class="field-row">
        <div class="field"><label>Tipo de mantenimiento</label><input name="maintenance_type" required placeholder="Calibración, limpieza..." id="logTypeInput"></div>
        <div class="field"><label>Fecha realizada</label><input name="performed_date" type="date" value="${todayStr()}"></div>
      </div>
      <div class="field"><label>Técnico</label><input name="technician"></div>
      <div class="field"><label>Descripción</label><textarea name="description"></textarea></div>
      <div class="field"><label>Repuestos / partes usadas</label><textarea name="parts_used"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="logCancel">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);

  document.getElementById('logCancel').addEventListener('click', closeModal);

  document.getElementById('logToolSelect').addEventListener('change', async (e) => {
    const toolId = e.target.value;
    const schedSel = document.getElementById('logScheduleSelect');
    schedSel.innerHTML = '<option value="">— Ninguna —</option>';
    if (!toolId) return;
    const scheds = await api('GET', `/api/tools/${toolId}/schedules`);
    scheds.filter(s => s.active).forEach(s => {
      schedSel.innerHTML += `<option value="${s.id}" data-type="${escapeHtml(s.maintenance_type)}">${escapeHtml(s.maintenance_type)} (vence ${fmtDate(s.next_due_date)})</option>`;
    });
  });

  document.getElementById('logScheduleSelect').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.dataset.type) document.getElementById('logTypeInput').value = opt.dataset.type;
  });

  document.getElementById('logForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    if (!payload.schedule_id) delete payload.schedule_id;
    try {
      await api('POST', '/api/maintenance/logs', payload);
      toast('Mantenimiento registrado');
      closeModal();
      await loadLogs();
      await loadSchedules();
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
