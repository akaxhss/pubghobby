import { startMeshBackground } from './background.js';

const allPlayers = [
  'Sensi',
  'Goodnight',
  'Skull',
  'Valak',
  'Valkyre',
  'Raid',
  'Ryzen',
  'Evie',
  'Good morning',
  'Good Evening',
  'Dsp',
  'Joby',
  'Zeus',
  'Soul',
  'Beast'
];

const skills = [
  'Close Range',
  'Long Range',
  'Team Support',
  'Clutch Ability',
  'Game Sense'
];

const API_BASE =
  window.location.port === '5500'
    ? 'http://127.0.0.1:3000'
    : window.location.origin;

const SESSION_STORAGE_KEY = 'tourney_rater_session';
const DRAFT_STORAGE_KEY = 'tourney_rater_draft';
const CLIENT_ID_STORAGE_KEY = 'tourney_rater_client_id';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const clientId = getOrCreateClientId();

const state = {
  sessionId: null,
  ign: '',
  sessionExpiresAt: null,
  selfPlayer: '',
  pendingSelfPlayer: '',
  currentIndex: 0,
  viewIndex: 0,
  completed: false,
  currentPlayer: null,
  ratings: {},
  savedRatingsByPlayer: {}
};

let completionTimer = null;

const els = {
  loginCard: document.getElementById('loginCard'),
  surveyCard: document.getElementById('surveyCard'),
  loginForm: document.getElementById('loginForm'),
  ignInput: document.getElementById('ignInput'),
  playerList: document.getElementById('playerList'),
  currentPlayerTitle: document.getElementById('currentPlayerTitle'),
  sessionMeta: document.getElementById('sessionMeta'),
  progressText: document.getElementById('progressText'),
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),
  skillRows: document.getElementById('skillRows'),
  ratingForm: document.getElementById('ratingForm'),
  sessionBanner: document.getElementById('sessionBanner'),
  idPicker: document.getElementById('idPicker'),
  startRatingButton: document.getElementById('startRatingButton'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingTitle: document.getElementById('loadingTitle'),
  loadingCopy: document.getElementById('loadingCopy'),
  prevButton: document.getElementById('prevButton'),
  nextReviewButton: document.getElementById('nextReviewButton'),
  nextButton: document.getElementById('nextButton'),
  donePanel: document.getElementById('donePanel')
};

function getRosterPlayers() {
  if (!state.selfPlayer) {
    return allPlayers;
  }

  return allPlayers.filter((player) => player !== state.selfPlayer);
}

function renderPlayerList() {
  els.playerList.innerHTML = '';
  getRosterPlayers().forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'player-pill';
    row.textContent = player;
    if (state.completed || index < state.currentIndex) {
      row.classList.add('done');
    }
    if (!state.completed && index === state.currentIndex) {
      row.classList.add('current');
    }
    if (index === state.viewIndex && index !== state.currentIndex) {
      row.classList.add('reviewing');
    }
    els.playerList.appendChild(row);
  });
}

function renderIdPicker() {
  els.idPicker.innerHTML = '';

  allPlayers.forEach((player) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'id-chip';
    button.textContent = player;
    button.dataset.player = player;
    if (state.pendingSelfPlayer === player) {
      button.classList.add('selected');
    }
    button.addEventListener('click', () => {
      state.pendingSelfPlayer = player;
      renderIdPicker();
      updateStartButtonState();
    });
    els.idPicker.appendChild(button);
  });
}

function renderSkillRows() {
  els.skillRows.innerHTML = '';

  skills.forEach((skill) => {
    const template = document.getElementById('skillTemplate');
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.skill-label').textContent = skill;
    const stars = node.querySelector('.stars');

    for (let value = 1; value <= 10; value += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'star-btn';
      btn.dataset.skill = skill;
      btn.dataset.value = String(value);
      btn.setAttribute('aria-label', `${skill}: ${value} out of 10`);
      btn.textContent = String(value);
      btn.addEventListener('click', () => chooseRating(skill, value, node));
      stars.appendChild(btn);
    }

    els.skillRows.appendChild(node);
  });
}

function chooseRating(skill, value, root) {
  state.ratings[skill] = value;
  saveDraftRatingsByPlayer(getViewPlayer(), state.ratings);
  const row = root ?? [...els.skillRows.querySelectorAll('.skill-row')].find((el) => el.querySelector('.skill-label')?.textContent === skill);
  if (!row) return;
  row.querySelectorAll('.star-btn').forEach((btn) => {
    const selected = Number(btn.dataset.value) <= value;
    btn.classList.toggle('selected', selected);
  });
}

function clearRatings() {
  state.ratings = {};
  els.skillRows.querySelectorAll('.skill-row').forEach((row) => {
    row.querySelectorAll('.star-btn').forEach((btn) => {
      btn.classList.remove('selected');
    });
  });
}

function getViewPlayer() {
  return getRosterPlayers()[state.viewIndex] ?? null;
}

function updateStartButtonState() {
  const ign = els.ignInput.value.trim();
  els.startRatingButton.disabled = !(ign && state.pendingSelfPlayer);
}

function setLoading(isLoading, title = 'Loading', copy = 'Please wait...') {
  els.loadingTitle.textContent = title;
  els.loadingCopy.textContent = copy;
  els.loadingOverlay.classList.toggle('hidden', !isLoading);
  document.body.classList.toggle('is-loading', isLoading);
}

function setSurveyVisible(visible) {
  els.loginCard.classList.toggle('hidden', visible);
  els.surveyCard.classList.toggle('hidden', !visible);
}

function resetToLogin() {
  if (completionTimer) {
    window.clearTimeout(completionTimer);
    completionTimer = null;
  }
  state.sessionId = null;
  state.ign = '';
  state.sessionExpiresAt = null;
  state.selfPlayer = '';
  state.pendingSelfPlayer = '';
  state.currentIndex = 0;
  state.viewIndex = 0;
  state.completed = false;
  state.currentPlayer = null;
  state.ratings = {};
  state.savedRatingsByPlayer = {};
  els.loginForm.reset();
  els.sessionBanner.textContent = '';
  setLoading(false);
  renderIdPicker();
  updateStartButtonState();
  clearRatings();
  renderPlayerList();
  setSurveyVisible(false);
}

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.sessionId || !data?.expiresAt) return null;
    if (data.clientId && data.clientId !== clientId) {
      clearStoredSession();
      return null;
    }
    if (Date.now() > Number(data.expiresAt)) {
      clearStoredSession();
      return null;
    }
    return data;
  } catch {
    clearStoredSession();
    return null;
  }
}

function saveStoredSession(payload) {
  const expiresAt = payload.expiresAt ?? state.sessionExpiresAt ?? Date.now() + SESSION_TTL_MS;
  state.sessionExpiresAt = expiresAt;
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      ...payload,
      clientId,
      expiresAt
    })
  );
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function getPendingSelfPlayer() {
  return state.pendingSelfPlayer || els.idPicker.querySelector('.id-chip.selected')?.dataset.player || '';
}

function getOrCreateClientId() {
  const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const value =
    window.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
  return value;
}

function loadDraftRatings() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return {};
  }
}

function saveDraftRatingsByPlayer(playerName, ratings) {
  const drafts = loadDraftRatings();
  drafts[playerName] = ratings;
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function clearDraftForPlayer(playerName) {
  if (!playerName) return;
  const drafts = loadDraftRatings();
  if (drafts[playerName]) {
    delete drafts[playerName];
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  }
}

function clearDraftRatings() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

function getRatingsForPlayer(playerName) {
  const drafts = loadDraftRatings();
  return drafts[playerName] ?? state.savedRatingsByPlayer[playerName] ?? {};
}

function applyRatingsToUI(ratings) {
  state.ratings = { ...ratings };
  els.skillRows.querySelectorAll('.skill-row').forEach((row) => {
    const skill = row.querySelector('.skill-label')?.textContent;
    const value = Number(state.ratings[skill]);
    row.querySelectorAll('.star-btn').forEach((btn) => {
      const selected = Number(btn.dataset.value) <= value;
      btn.classList.toggle('selected', selected);
    });
  });
}

function syncReviewUi() {
  const playerName = getViewPlayer();
  if (!playerName) return;

  const isReviewingSaved = state.viewIndex < state.currentIndex;
  state.currentPlayer = playerName;
  els.prevButton.disabled = state.viewIndex <= 0;
  els.nextReviewButton.disabled = state.viewIndex >= getRosterPlayers().length - 1 || state.completed;
  els.nextButton.textContent = isReviewingSaved ? 'Save Changes' : 'Save & Next Player';
  els.sessionBanner.textContent = `This IGN is logged in: ${state.ign} | Your ID: ${state.selfPlayer}`;
  els.currentPlayerTitle.textContent = playerName;
  els.sessionMeta.textContent = isReviewingSaved
    ? `${state.ign} is reviewing ${state.viewIndex + 1} / ${getRosterPlayers().length}`
    : `${state.ign} is rating ${state.currentIndex + 1} / ${getRosterPlayers().length}`;
  saveStoredSession({
    sessionId: state.sessionId,
    ign: state.ign,
    selfPlayer: state.selfPlayer,
    viewIndex: state.viewIndex
  });
  renderPlayerList();
}

function showPlayerAt(index, { preserveDraft = false } = {}) {
  const rosterPlayers = getRosterPlayers();
  state.viewIndex = Math.max(0, Math.min(index, rosterPlayers.length - 1));
  const playerName = getViewPlayer();
  if (!playerName) return;

  const ratings = getRatingsForPlayer(playerName);
  if (ratings && Object.keys(ratings).length) {
    applyRatingsToUI(ratings);
  } else {
    clearRatings();
  }

  syncReviewUi();
}

function buildSavedRatingsByPlayer(rows) {
  const grouped = {};
  for (const row of rows) {
    grouped[row.target_player] ??= {};
    grouped[row.target_player][row.skill] = row.rating;
  }
  return grouped;
}

function updateProgress() {
  const total = getRosterPlayers().length;
  const completed = Math.min(state.currentIndex, total);
  const percent = Math.round((completed / total) * 100);
  els.progressText.textContent = `${completed} of ${total} completed`;
  els.progressPercent.textContent = `${percent}%`;
  els.progressFill.style.width = `${percent}%`;
  renderPlayerList();
}

function showCurrentPlayer({ preserveDraft = false } = {}) {
  if (state.completed) {
    els.currentPlayerTitle.textContent = 'Session complete';
    els.sessionMeta.textContent = `${state.ign} finished the full roster`;
    els.sessionBanner.textContent = `This IGN is logged in: ${state.ign} | Your ID: ${state.selfPlayer}`;
    els.donePanel.classList.remove('hidden');
    els.ratingForm.classList.add('hidden');
    updateProgress();
    renderPlayerList();
    clearStoredSession();
    clearDraftRatings();
    if (completionTimer) {
      window.clearTimeout(completionTimer);
    }
    completionTimer = window.setTimeout(() => {
      resetToLogin();
    }, 3500);
    return;
  }

  els.donePanel.classList.add('hidden');
  els.ratingForm.classList.remove('hidden');
  els.sessionBanner.textContent = `This IGN is logged in: ${state.ign} | Your ID: ${state.selfPlayer}`;
  els.currentPlayerTitle.textContent = state.currentPlayer ?? 'Player';
  els.sessionMeta.textContent = `${state.ign} is rating ${state.currentIndex + 1} / ${getRosterPlayers().length}`;
  updateProgress();
  if (!preserveDraft) {
    clearRatings();
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': clientId
    },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function restorePersistedSession() {
  const stored = loadStoredSession();
  if (!stored) return;

  setLoading(true, 'Restoring session', 'Reconnecting to your current ratings...');
  try {
    const data = await api(`/api/sessions/${stored.sessionId}`);
    const exportData = await api(`/api/sessions/${stored.sessionId}/export`);
    state.sessionId = data.sessionId;
    state.ign = data.ign;
    state.sessionExpiresAt = stored.expiresAt;
    state.selfPlayer = data.selfPlayer ?? stored.selfPlayer ?? '';
    state.currentIndex = data.currentIndex;
    state.currentPlayer = data.currentPlayer;
    state.completed = Boolean(data.completedAt);
    state.savedRatingsByPlayer = buildSavedRatingsByPlayer(exportData.rows);

    setSurveyVisible(true);
    const storedViewIndex = Number.isInteger(stored.viewIndex) ? stored.viewIndex : state.currentIndex;
    showPlayerAt(state.completed ? storedViewIndex : Math.min(storedViewIndex, getRosterPlayers().length - 1), {
      preserveDraft: true
    });

    const draft = loadDraftRatings();
    const playerName = getViewPlayer();
    const draftForPlayer = playerName ? draft[playerName] : null;
    if (draftForPlayer && Object.keys(draftForPlayer).length) {
      applyRatingsToUI(draftForPlayer);
    }

    if (state.completed) {
      showCurrentPlayer();
    }
  } catch {
    clearStoredSession();
    clearDraftRatings();
  } finally {
    setLoading(false);
  }
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  updateStartButtonState();
  if (!els.startRatingButton.disabled) {
    els.startRatingButton.click();
  }
});

els.ratingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const missing = skills.filter((skill) => !state.ratings[skill]);
  if (missing.length) {
    alert(`Please rate all skills before continuing: ${missing.join(', ')}`);
    return;
  }

  els.nextButton.disabled = true;
  setLoading(true, 'Saving ratings', 'Uploading this player’s scores...');
  try {
    const data = await api(`/api/sessions/${state.sessionId}/ratings`, {
      method: 'POST',
      body: JSON.stringify({
        ratings: state.ratings,
        targetPlayer: getViewPlayer()
      })
    });

    state.savedRatingsByPlayer[data.savedPlayer] = { ...state.ratings };
    clearDraftForPlayer(data.savedPlayer);
    state.currentIndex = data.currentIndex;
    state.completed = data.completed;
    saveStoredSession({
      sessionId: state.sessionId,
      ign: state.ign,
      selfPlayer: state.selfPlayer,
      clientId,
      viewIndex: data.savedPlayer === getViewPlayer() ? data.currentIndex : state.viewIndex,
      expiresAt: state.sessionExpiresAt ?? undefined
    });
    if (data.completed) {
      showCurrentPlayer();
    } else if (data.savedPlayer === getViewPlayer()) {
      showPlayerAt(data.currentIndex);
    } else {
      showPlayerAt(state.viewIndex, { preserveDraft: true });
    }
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
    els.nextButton.disabled = false;
  }
});

renderSkillRows();
renderPlayerList();
renderIdPicker();
updateStartButtonState();

els.ignInput.addEventListener('input', () => {
  updateStartButtonState();
});

els.prevButton.addEventListener('click', () => {
  if (state.viewIndex <= 0) return;
  showPlayerAt(state.viewIndex - 1, { preserveDraft: true });
});

els.nextReviewButton.addEventListener('click', () => {
  if (state.viewIndex >= getRosterPlayers().length - 1) return;
  showPlayerAt(state.viewIndex + 1, { preserveDraft: true });
});

els.startRatingButton.addEventListener('click', async () => {
  const ign = els.ignInput.value.trim();
  const selfPlayer = getPendingSelfPlayer();
  if (!ign || !selfPlayer) {
    alert('Please enter your IGN and select your ID.');
    return;
  }

  els.startRatingButton.disabled = true;
  setLoading(true, 'Starting session', 'Creating your rating session...');
  try {
    const data = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ ign, selfPlayer })
    });

    state.sessionId = data.sessionId;
    state.ign = data.ign;
    state.sessionExpiresAt = Date.now() + SESSION_TTL_MS;
    state.selfPlayer = data.selfPlayer ?? selfPlayer;
    state.currentIndex = data.currentIndex;
    state.currentPlayer = data.currentPlayer;
    state.completed = false;
    saveStoredSession({
      sessionId: data.sessionId,
      ign: data.ign,
      selfPlayer: state.selfPlayer,
      clientId,
      viewIndex: data.currentIndex,
      expiresAt: state.sessionExpiresAt
    });
    clearDraftRatings();

    setSurveyVisible(true);
    els.sessionBanner.textContent = `This IGN is logged in: ${state.ign} | Your ID: ${state.selfPlayer}`;
    showPlayerAt(state.currentIndex);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
    updateStartButtonState();
  }
});

await restorePersistedSession();

startMeshBackground(document.getElementById('meshBackground'), {
  pointCount: 48,
  maxDistance: 170,
  background: '#05070d',
  pointColor: 'rgba(140, 200, 255, 0.95)',
  lineRgb: '112, 194, 255',
  glowColor: 'rgba(64, 112, 180, 0.11)'
});
