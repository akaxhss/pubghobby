import { startMeshBackground } from './background.js';

const players = [
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

const state = {
  sessionId: null,
  ign: '',
  currentIndex: 0,
  completed: false,
  currentPlayer: null,
  ratings: {}
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
  nextButton: document.getElementById('nextButton'),
  donePanel: document.getElementById('donePanel')
};

function renderPlayerList() {
  els.playerList.innerHTML = '';
  players.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'player-pill';
    row.textContent = player;
    if (state.completed || index < state.currentIndex) {
      row.classList.add('done');
    }
    if (!state.completed && index === state.currentIndex) {
      row.classList.add('current');
    }
    els.playerList.appendChild(row);
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
      btn.textContent = '☆';
      btn.addEventListener('click', () => chooseRating(skill, value, node));
      stars.appendChild(btn);
    }

    els.skillRows.appendChild(node);
  });
}

function chooseRating(skill, value, root) {
  state.ratings[skill] = value;
  const row = root ?? [...els.skillRows.querySelectorAll('.skill-row')].find((el) => el.querySelector('.skill-label')?.textContent === skill);
  if (!row) return;
  row.querySelectorAll('.star-btn').forEach((btn) => {
    const selected = Number(btn.dataset.value) <= value;
    btn.textContent = selected ? '★' : '☆';
    btn.classList.toggle('selected', selected);
  });
}

function clearRatings() {
  state.ratings = {};
  els.skillRows.querySelectorAll('.skill-row').forEach((row) => {
    row.querySelectorAll('.star-btn').forEach((btn) => {
      btn.textContent = '☆';
      btn.classList.remove('selected');
    });
  });
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
  state.currentIndex = 0;
  state.completed = false;
  state.currentPlayer = null;
  state.ratings = {};
  els.loginForm.reset();
  clearRatings();
  renderPlayerList();
  setSurveyVisible(false);
}

function updateProgress() {
  const total = players.length;
  const completed = Math.min(state.currentIndex, total);
  const percent = Math.round((completed / total) * 100);
  els.progressText.textContent = `${completed} of ${total} completed`;
  els.progressPercent.textContent = `${percent}%`;
  els.progressFill.style.width = `${percent}%`;
  renderPlayerList();
}

function showCurrentPlayer() {
  if (state.completed) {
    els.currentPlayerTitle.textContent = 'Session complete';
    els.sessionMeta.textContent = `${state.ign} finished the full roster`;
    els.donePanel.classList.remove('hidden');
    els.ratingForm.classList.add('hidden');
    updateProgress();
    renderPlayerList();
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
  els.currentPlayerTitle.textContent = state.currentPlayer ?? 'Player';
  els.sessionMeta.textContent = `${state.ign} is rating ${state.currentIndex + 1} / ${players.length}`;
  updateProgress();
  clearRatings();
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

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const ign = els.ignInput.value.trim();
  if (!ign) return;

  els.nextButton.disabled = true;
  try {
    const data = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ ign })
    });

    state.sessionId = data.sessionId;
    state.ign = data.ign;
    state.currentIndex = data.currentIndex;
    state.currentPlayer = data.currentPlayer;
    state.completed = false;

    setSurveyVisible(true);
    showCurrentPlayer();
  } catch (error) {
    alert(error.message);
  } finally {
    els.nextButton.disabled = false;
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
  try {
    const data = await api(`/api/sessions/${state.sessionId}/ratings`, {
      method: 'POST',
      body: JSON.stringify({ ratings: state.ratings })
    });

    state.currentIndex = data.currentIndex;
    state.currentPlayer = data.nextPlayer;
    state.completed = data.completed;

    showCurrentPlayer();
  } catch (error) {
    alert(error.message);
  } finally {
    els.nextButton.disabled = false;
  }
});

renderSkillRows();
renderPlayerList();

startMeshBackground(document.getElementById('meshBackground'), {
  pointCount: 48,
  maxDistance: 170,
  background: '#05070d',
  pointColor: 'rgba(140, 200, 255, 0.95)',
  lineRgb: '112, 194, 255',
  glowColor: 'rgba(64, 112, 180, 0.11)'
});
