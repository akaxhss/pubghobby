import { startMeshBackground } from './background.js';

const API_BASE =
  window.location.port === '5500'
    ? 'http://127.0.0.1:3000'
    : window.location.origin;

const els = {
  sessionCount: document.getElementById('sessionCount'),
  completedCount: document.getElementById('completedCount'),
  ratingCount: document.getElementById('ratingCount'),
  averageRating: document.getElementById('averageRating'),
  sessionList: document.getElementById('sessionList'),
  sessionDetail: document.getElementById('sessionDetail'),
  detailTitle: document.getElementById('detailTitle'),
  refreshButton: document.getElementById('refreshButton'),
  downloadAllButton: document.getElementById('downloadAllButton'),
  downloadSessionButton: document.getElementById('downloadSessionButton'),
  deleteSessionButton: document.getElementById('deleteSessionButton')
};

const state = {
  overview: null,
  selectedSessionId: null
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function formatDate(value) {
  if (!value) return 'not finished';
  if (value instanceof Date) {
    return value.toLocaleString();
  }

  const text = String(value);
  const normalized = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
  return new Date(normalized).toLocaleString();
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderSummary(overview) {
  els.sessionCount.textContent = String(overview.summary.sessionCount);
  els.completedCount.textContent = String(overview.summary.completedCount);
  els.ratingCount.textContent = String(overview.summary.ratingCount);
  els.averageRating.textContent = String(overview.summary.averageRating);
}

function renderSessionList(sessions) {
  els.sessionList.innerHTML = '';
  const template = document.getElementById('sessionItemTemplate');

  sessions.forEach((session) => {
    const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('.session-ign').textContent = `${session.ign} #${session.id}`;
    node.querySelector('.session-status').textContent = session.completed_at ? 'done' : 'active';
    node.querySelector('.session-meta-line').textContent =
      `${session.rating_count} ratings • avg ${session.average_rating} • ${formatDate(session.created_at)}`;
    node.classList.toggle('active', session.id === state.selectedSessionId);
    node.addEventListener('click', () => selectSession(session.id));
    els.sessionList.appendChild(node);
  });
}

async function selectSession(sessionId) {
  state.selectedSessionId = sessionId;
  renderSessionList(state.overview.sessions);

  const data = await api(`/api/admin/session-export?sessionId=${encodeURIComponent(sessionId)}`);
  els.detailTitle.textContent = `${data.session.ign} session #${data.session.id}`;
  els.downloadSessionButton.disabled = false;
  els.downloadSessionButton.onclick = () => {
    downloadJson(`tourney-session-${data.session.id}.json`, data);
  };
  els.deleteSessionButton.disabled = false;
  els.deleteSessionButton.onclick = async () => {
    try {
      const confirmed = confirm(`Delete entry for session #${data.session.id} and reset it to zero? The session will stay in the database.`);
      if (!confirmed) return;

      await api(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
      });

      await loadOverview({ skipAutoSelect: true });
      await selectSession(sessionId);
    } catch (error) {
      alert(error.message);
    }
  };

  const rows = data.rows.map((row) => {
    return `<tr><td>${escapeHtml(row.target_player)}</td><td>${escapeHtml(row.skill)}</td><td>${escapeHtml(row.rating)}</td><td>${escapeHtml(row.created_at)}</td></tr>`;
  }).join('');

  els.sessionDetail.innerHTML = `
    <div class="detail-grid">
      <div><span class="muted">IGN</span><strong>${escapeHtml(data.session.ign)}</strong></div>
      <div><span class="muted">Created</span><strong>${escapeHtml(formatDate(data.session.createdAt))}</strong></div>
      <div><span class="muted">Completed</span><strong>${escapeHtml(data.session.completedAt ? formatDate(data.session.completedAt) : 'still running')}</strong></div>
      <div><span class="muted">Rows</span><strong>${escapeHtml(data.rows.length)}</strong></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Player</th><th>Skill</th><th>Rating</th><th>Saved</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function loadOverview({ skipAutoSelect = false } = {}) {
  const overview = await api('/api/admin/overview');
  state.overview = overview;
  renderSummary(overview);
  renderSessionList(overview.sessions);
  if (!skipAutoSelect && !state.selectedSessionId && overview.sessions.length) {
    await selectSession(overview.sessions[0].id);
  }
}

els.refreshButton.addEventListener('click', () => {
  loadOverview().catch((error) => alert(error.message));
});

els.downloadAllButton.addEventListener('click', async () => {
  const data = await api('/api/admin/export');
  downloadJson('tourney-admin-export.json', data);
});

loadOverview().catch((error) => {
  els.sessionDetail.innerHTML = `<p class="muted">${error.message}</p>`;
  els.downloadSessionButton.disabled = true;
  els.deleteSessionButton.disabled = true;
});

startMeshBackground(document.getElementById('meshBackground'), {
  pointCount: 54,
  maxDistance: 185,
  background: '#05070d',
  pointColor: 'rgba(140, 200, 255, 0.9)',
  lineRgb: '96, 182, 255',
  glowColor: 'rgba(60, 96, 170, 0.1)'
});
