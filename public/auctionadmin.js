import { startMeshBackground } from './background.js';
import { auctionPlayers, auctionTeams, auctionRules, currentAuctionPlayer } from './auction-data.js';
import {
  readAuctionPlayers,
  readAuctionWheelSignal,
  subscribeAuctionPlayers,
  subscribeAuctionWheelSignal,
  writeAuctionPlayers,
  writeAuctionWheelSignal,
  readAuctionTeams,
  writeAuctionTeams,
  subscribeAuctionTeams
} from './auction-sync.js';

const API_BASE =
  window.location.port === '5500'
    ? 'http://127.0.0.1:3000'
    : window.location.origin;

const AUTH_STORAGE_KEY = 'auction_admin_auth';
const AUCTION_PLAYERS_LAST_SYNC_KEY = 'wow_league_auction_players_sync:last';

const els = {
  loginCard: document.getElementById('auctionAdminLoginCard'),
  dashboard: document.getElementById('auctionAdminDashboard'),
  loginForm: document.getElementById('auctionAdminLoginForm'),
  username: document.getElementById('auctionAdminUsername'),
  password: document.getElementById('auctionAdminPassword'),
  loginError: document.getElementById('auctionAdminLoginError'),
  logoutButton: document.getElementById('auctionAdminLogoutButton'),
  playerForm: document.getElementById('auctionAdminPlayerForm'),
  playerName: document.getElementById('auctionAdminPlayerName'),
  playerBase: document.getElementById('auctionAdminPlayerBase'),
  playerPurchased: document.getElementById('auctionAdminPlayerPurchased'),
  playerImage: document.getElementById('auctionAdminPlayerImage'),
  playerImagePreview: document.getElementById('auctionAdminPlayerImagePreview'),
  playerStatus: document.getElementById('auctionAdminPlayerStatus'),
  playerWheel: document.getElementById('auctionAdminPlayerWheel'),
  playerSaveButton: document.getElementById('auctionAdminPlayerSaveButton'),
  summaryCards: document.getElementById('auctionAdminSummaryCards'),
  playerTable: document.getElementById('auctionAdminPlayerTable'),
  teamList: document.getElementById('auctionAdminTeamList'),
  summaryMini: document.getElementById('auctionAdminSummaryMini'),
  wheel: document.getElementById('auctionAdminWheel'),
  wheelCaption: document.getElementById('auctionAdminWheelCaption'),
  currentName: document.getElementById('auctionAdminCurrentName'),
  currentMeta: document.getElementById('auctionAdminCurrentMeta'),
  currentBadge: document.getElementById('auctionAdminCurrentBadge'),
  reserveToggle: document.getElementById('auctionAdminReserveToggle'),
  playerReserved: document.getElementById('auctionAdminPlayerReserved'),
  sellForm: document.getElementById('auctionAdminSellForm'),
  sellPlayerSelect: document.getElementById('auctionAdminSellPlayerSelect'),
  sellTeamSelect: document.getElementById('auctionAdminSellTeamSelect'),
  sellPriceInput: document.getElementById('auctionAdminSellPriceInput'),
  sellActionSelect: document.getElementById('auctionAdminSellActionSelect'),
  sellButton: document.getElementById('auctionAdminSellButton'),
  teamForm: document.getElementById('auctionAdminTeamForm'),
  teamName: document.getElementById('auctionAdminTeamName'),
  teamCaptain: document.getElementById('auctionAdminTeamCaptain'),
  teamTotalPoints: document.getElementById('auctionAdminTeamTotalPoints'),
  teamPurchasePoints: document.getElementById('auctionAdminTeamPurchasePoints'),
  teamRemainingPoints: document.getElementById('auctionAdminTeamRemainingPoints'),
  teamPlayers: document.getElementById('auctionAdminTeamPlayers'),
  teamSaveButton: document.getElementById('auctionAdminTeamSaveButton'),
  tabs: Array.from(document.querySelectorAll('[data-auction-tab]')),
  panels: Array.from(document.querySelectorAll('[data-auction-panel]'))
};

const state = {
  authToken: localStorage.getItem(AUTH_STORAGE_KEY) || '',
  activeTab: 'summary',
  players: loadPlayers(),
  teams: loadTeams(),
  wheelPlayers: [],
  selectedPlayerName: currentAuctionPlayer.name,
  highlightedIndex: 0,
  isSpinning: false,
  spinToken: 0,
  editingPlayerName: '',
  editingPlayerImage: '',
  editingTeamName: '',
  reservedLockActive: localStorage.getItem('wow_league_auction_reserved_lock') !== 'false'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function clonePlayers(players) {
  return players.map((player) => ({ ...player }));
}

async function fetchServerPlayers() {
  try {
    const response = await fetch(`${API_BASE}/api/auction/players`, {
      headers: {
        Authorization: `Basic ${state.authToken}`
      }
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.players)) return null;
    return {
      players: clonePlayers(data.players),
      updatedAtMs: Number(data.updatedAtMs ?? 0)
    };
  } catch {
    return null;
  }
}

async function persistServerPlayers(players) {
  try {
    const response = await fetch(`${API_BASE}/api/auction/players`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${state.authToken}`
      },
      body: JSON.stringify({ players })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save players to server.');
    }
  } catch (error) {
    console.warn('Auction player sync failed:', error);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadPlayerImage(file) {
  if (!file) return '';
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch(`${API_BASE}/api/media/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${state.authToken}`
    },
    body: JSON.stringify({
      dataUrl,
      filename: file.name
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Failed to upload image.');
  }
  return data.url;
}

function loadPlayers() {
  return readAuctionPlayers(auctionPlayers);
}

function loadTeams() {
  return readAuctionTeams(auctionTeams);
}

function getTeams() {
  return state.teams;
}

function cloneTeams(teams) {
  return teams.map((team) => ({
    ...team,
    players: (team.players || []).map((p) => ({ ...p }))
  }));
}

function normalizePlayerStatus(status) {
  const value = String(status || 'available').toLowerCase();
  if (value === 'current') return 'sold';
  if (value === 'unsold') return 'unsold';
  if (value === 'sold') return 'sold';
  return 'available';
}

function getPlayerLabel(player) {
  const status = normalizePlayerStatus(player.status);
  const team = player.soldTo ? ` • ${player.soldTo}` : '';
  return `${player.name} — ${status}${team}`;
}

function getTeamByName(name) {
  return getTeams().find((team) => team.name === name) || null;
}

function dedupeTeamPlayers(teamPlayers = [], playerName, price) {
  const nextPlayers = (teamPlayers || []).filter((entry) => entry.name !== playerName);
  if (price == null) return nextPlayers;
  nextPlayers.push({ name: playerName, price: Number(price) || 0 });
  return nextPlayers;
}

function removePlayerFromTeam(team, playerName) {
  const players = (team.players || []).filter((entry) => entry.name !== playerName);
  const removed = (team.players || []).find((entry) => entry.name === playerName) || null;
  if (!removed) {
    return { ...team, players };
  }

  const price = Number(removed.price) || 0;
  return {
    ...team,
    players,
    purchasePoints: Math.max(0, Number(team.purchasePoints || 0) - price),
    remainingPoints: Number(team.remainingPoints || 0) + price
  };
}

function addPlayerToTeam(team, playerName, price) {
  const nextPrice = Number(price) || 0;
  const players = dedupeTeamPlayers(team.players || [], playerName, nextPrice);
  return {
    ...team,
    players,
    purchasePoints: Number(team.purchasePoints || 0) + nextPrice,
    remainingPoints: Math.max(0, Number(team.remainingPoints || 0) - nextPrice)
  };
}

function clearTeamSelectionIfInvalid() {
  if (!els.sellTeamSelect) return;
  const teamNames = new Set(getTeams().map((team) => team.name));
  if (!els.sellTeamSelect.value || teamNames.has(els.sellTeamSelect.value)) return;
  els.sellTeamSelect.value = getTeams()[0]?.name || '';
}

function renderSellPanelOptions() {
  if (els.sellPlayerSelect) {
    const currentPlayerValue = els.sellPlayerSelect.value || state.selectedPlayerName || '';
    els.sellPlayerSelect.innerHTML = getPlayers()
      .map((player) => `<option value="${escapeHtml(player.name)}">${escapeHtml(getPlayerLabel(player))}</option>`)
      .join('');
    if (currentPlayerValue) {
      els.sellPlayerSelect.value = currentPlayerValue;
    }
    if (!els.sellPlayerSelect.value && getPlayers().length) {
      els.sellPlayerSelect.value = getPlayers()[0].name;
    }
  }

  if (els.sellTeamSelect) {
    const currentTeamValue = els.sellTeamSelect.value || '';
    els.sellTeamSelect.innerHTML = getTeams()
      .map((team) => `<option value="${escapeHtml(team.name)}">${escapeHtml(team.name)} • ${team.remainingPoints}L left</option>`)
      .join('');
    if (currentTeamValue) {
      els.sellTeamSelect.value = currentTeamValue;
    }
    if (!els.sellTeamSelect.value && getTeams().length) {
      els.sellTeamSelect.value = getTeams()[0].name;
    }
  }

  clearTeamSelectionIfInvalid();
}

function refreshSellPanelFromPlayer(playerName) {
  const player = getPlayers().find((entry) => entry.name === playerName) || getPlayers()[0] || null;
  if (!player) return;
  if (els.sellPlayerSelect) els.sellPlayerSelect.value = player.name;
  if (els.sellPriceInput) els.sellPriceInput.value = String(player.purchasedPoint ?? player.basePoint ?? 0);
  const currentTeamValue = els.sellTeamSelect?.value || '';
  const teamNames = new Set(getTeams().map((team) => team.name));
  if (els.sellTeamSelect && player.soldTo) {
    const matchedTeam = getTeamByName(player.soldTo);
    if (matchedTeam) {
      els.sellTeamSelect.value = matchedTeam.name;
    } else {
      els.sellTeamSelect.value = teamNames.has(currentTeamValue) ? currentTeamValue : getTeams()[0]?.name || '';
    }
  } else {
    if (els.sellTeamSelect) {
      els.sellTeamSelect.value = teamNames.has(currentTeamValue) ? currentTeamValue : getTeams()[0]?.name || '';
    }
  }
}

function refreshSellPanelSelection() {
  renderSellPanelOptions();
  const selectedPlayerName = els.sellPlayerSelect?.value || state.selectedPlayerName || getPlayers()[0]?.name || '';
  if (selectedPlayerName) {
    refreshSellPanelFromPlayer(selectedPlayerName);
  }
}

async function executeSellAction() {
  const playerName = els.sellPlayerSelect?.value?.trim() || '';
  const teamName = els.sellTeamSelect?.value?.trim() || '';
  const action = els.sellActionSelect?.value || 'sell';
  const purchasedPoint = Number(els.sellPriceInput?.value) || 0;

  if (!playerName) {
    throw new Error('Select a player.');
  }

  const players = clonePlayers(getPlayers());
  const teams = cloneTeams(getTeams());
  const playerIndex = players.findIndex((entry) => entry.name === playerName);
  if (playerIndex < 0) {
    throw new Error('Player not found.');
  }

  const player = players[playerIndex];
  const currentStatus = normalizePlayerStatus(player.status);
  const currentTeamName = String(player.soldTo || '').trim();
  const currentTeamIndex = currentTeamName ? teams.findIndex((team) => team.name === currentTeamName) : -1;
  const selectedTeamIndex = teamName ? teams.findIndex((team) => team.name === teamName) : -1;
  const refundTeamIndex = currentTeamIndex >= 0 ? currentTeamIndex : selectedTeamIndex;

  if (action === 'sell') {
    if (currentStatus === 'sold') {
      throw new Error('Sold player cannot be sold again unless the sale is undone.');
    }
    if (selectedTeamIndex < 0) {
      throw new Error('Select a team.');
    }

    const nextTeam = addPlayerToTeam(teams[selectedTeamIndex], player.name, purchasedPoint);
    teams[selectedTeamIndex] = nextTeam;

    // Prevent duplicate stale assignments if the player was previously linked elsewhere.
    if (currentTeamIndex >= 0 && currentTeamIndex !== selectedTeamIndex) {
      teams[currentTeamIndex] = removePlayerFromTeam(teams[currentTeamIndex], player.name);
    } else {
      teams[selectedTeamIndex].players = dedupeTeamPlayers(teams[selectedTeamIndex].players || [], player.name, purchasedPoint);
    }

    players[playerIndex] = {
      ...player,
      status: 'sold',
      soldTo: teams[selectedTeamIndex].name,
      purchasedPoint,
      currentBid: purchasedPoint
    };
  } else {
    if (currentStatus === 'sold' && refundTeamIndex < 0) {
      throw new Error('Select the team that bought this player.');
    }
    if (refundTeamIndex >= 0) {
      teams[refundTeamIndex] = removePlayerFromTeam(teams[refundTeamIndex], player.name);
    }

    players[playerIndex] = {
      ...player,
      status: action === 'unsold' ? 'unsold' : 'available',
      soldTo: '',
      purchasedPoint: null,
      currentBid: player.basePoint ?? 0
    };
  }

  state.players = players;
  state.teams = teams;
  writeAuctionPlayers(state.players);
  writeAuctionTeams(state.teams);
  void persistServerPlayers(state.players);
  void persistServerTeams(state.teams);

  const settledIndex = Math.max(0, getWheelPlayers().findIndex((entry) => entry.name === player.name));
  state.selectedPlayerName = player.name;
  state.highlightedIndex = settledIndex;
  syncCurrentAuctionPlayer(players[playerIndex]);
  writeAuctionWheelSignal({
    type: 'settled',
    token: Date.now(),
    targetName: player.name,
    highlightedIndex: settledIndex
  });
  renderSummary();
  renderPlayersTable();
  renderTeams();
  renderWheel();
  renderCurrentPreview();
  refreshSellPanelSelection();
}

async function fetchServerTeams() {
  try {
    const response = await fetch(`${API_BASE}/api/auction/teams`, {
      headers: {
        Authorization: `Basic ${state.authToken}`
      }
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.teams)) return null;
    return {
      teams: cloneTeams(data.teams),
      updatedAtMs: Number(data.updatedAtMs ?? 0)
    };
  } catch {
    return null;
  }
}

async function persistServerTeams(teams) {
  try {
    const response = await fetch(`${API_BASE}/api/auction/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${state.authToken}`
      },
      body: JSON.stringify({ teams })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save teams to server.');
    }
  } catch (error) {
    console.warn('Auction team sync failed:', error);
  }
}

function saveTeams(teams) {
  state.teams = cloneTeams(teams);
  writeAuctionTeams(state.teams);
  void persistServerTeams(state.teams);
  renderSellPanelOptions();
}

function getLocalPlayersUpdatedAt() {
  try {
    const raw = localStorage.getItem(AUCTION_PLAYERS_LAST_SYNC_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Number(parsed?.updatedAt ?? 0);
  } catch {
    return 0;
  }
}

function savePlayers(players) {
  state.players = clonePlayers(players);
  writeAuctionPlayers(state.players);
  void persistServerPlayers(state.players);
  renderSellPanelOptions();
}

function getPlayers() {
  return state.players;
}

function renderPlayerImagePreview(imageUrl = '', label = '') {
  if (!els.playerImagePreview) return;

  if (!imageUrl) {
    els.playerImagePreview.innerHTML = 'No image selected.';
    return;
  }

  const descriptor = imageUrl.startsWith('blob:') ? 'Ready to upload' : imageUrl;
  els.playerImagePreview.innerHTML = `
    <img src="${escapeHtml(imageUrl)}" alt="Selected auction player image" />
    <div>
      <strong>${escapeHtml(label || 'Image ready')}</strong>
      <span>${escapeHtml(descriptor)}</span>
    </div>
  `;
}

async function updateSelectedFilePreview() {
  const file = els.playerImage?.files?.[0] || null;
  if (!file) {
    renderPlayerImagePreview(state.editingPlayerImage || '', state.editingPlayerName || '');
    return;
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    renderPlayerImagePreview(objectUrl, file.name);
  } catch {
    renderPlayerImagePreview(state.editingPlayerImage || '', state.editingPlayerName || '');
  }
}

function isPlayerReserved(player) {
  if (player && typeof player.isReserved === 'boolean') {
    return player.isReserved;
  }
  const defaultReservedNames = ['zeus', 'sull', 'skull', 'soul', 'ryzen'];
  return !!(player && defaultReservedNames.includes(player.name.toLowerCase().trim()));
}

function getWheelPlayers() {
  const allPlayers = [...getPlayers()];
  const isLastPlayer = (p) => isPlayerReserved(p);
  const isFixed = (p) => p.wheelOrder != null && typeof p.wheelOrder === 'number' && p.wheelOrder >= 1;

  const N = allPlayers.length;
  const result = new Array(N).fill(null);
  const placedNames = new Set();

  // 1. Place fixed players first at their designated 1-based index (wheelOrder - 1)
  allPlayers.forEach(p => {
    if (isFixed(p)) {
      let targetIdx = Math.min(Math.max(1, p.wheelOrder), N) - 1;
      // Find the next available slot if targetIdx is already taken
      while (targetIdx < N && result[targetIdx] !== null) {
        targetIdx++;
      }
      if (targetIdx < N) {
        result[targetIdx] = p;
        placedNames.add(p.name);
      }
    }
  });

  // 2. Separate remaining players into middle and last
  const remainingPlayers = allPlayers.filter(p => !placedNames.has(p.name));
  const remainingLast = remainingPlayers.filter(p => isLastPlayer(p));
  const remainingMiddle = remainingPlayers.filter(p => !isLastPlayer(p));

  // 3. Sort deterministically to look random but stable
  function getDeterministicRandom(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) / 2147483647;
  }

  remainingMiddle.sort((a, b) => getDeterministicRandom(a.name) - getDeterministicRandom(b.name));
  remainingLast.sort((a, b) => getDeterministicRandom(a.name) - getDeterministicRandom(b.name));

  // 4. Fill middle players in vacant slots from the left
  let middlePtr = 0;
  for (let i = 0; i < N; i++) {
    if (result[i] === null && middlePtr < remainingMiddle.length) {
      result[i] = remainingMiddle[middlePtr++];
    }
  }

  // 5. Fill last players in remaining vacant slots (which will naturally be at the end)
  let lastPtr = 0;
  for (let i = 0; i < N; i++) {
    if (result[i] === null && lastPtr < remainingLast.length) {
      result[i] = remainingLast[lastPtr++];
    }
  }

  return result.filter(Boolean);
}

function getWheelPlayerByName(name) {
  return state.wheelPlayers.find((player) => player.name === name) || state.wheelPlayers[0] || currentAuctionPlayer;
}

function getSpinPool() {
  const otherPlayersUnsold = getPlayers().filter(p => 
    !isPlayerReserved(p) && 
    p.status !== 'sold'
  );
  
  let pool = state.wheelPlayers.filter((player) => player.status !== 'sold');
  
  // If lock is active and there are other unsold players, block the reserved ones
  if (state.reservedLockActive && otherPlayersUnsold.length > 0) {
    pool = pool.filter(p => !isPlayerReserved(p));
  }
  
  return pool.length ? pool : state.wheelPlayers;
}

function getNextWheelSelection() {
  const pool = getSpinPool();
  if (!pool.length) return currentAuctionPlayer;

  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

function getRandomSpinAdvance(length) {
  if (length <= 1) return 1;
  const maxStep = Math.min(4, length - 1);
  return 1 + Math.floor(Math.random() * maxStep);
}

function syncCurrentAuctionPlayer(player) {
  currentAuctionPlayer.name = player.name;
  currentAuctionPlayer.basePoint = player.basePoint;
  currentAuctionPlayer.currentBid = player.purchasedPoint ?? player.basePoint;
  currentAuctionPlayer.status = 'Live Auction';
  currentAuctionPlayer.team = player.soldTo || 'Awaiting bid';
  currentAuctionPlayer.image = player.image || '';
  state.selectedPlayerName = player.name;
}

function renderCurrentPreview() {
  const selected = getWheelPlayerByName(state.selectedPlayerName);
  if (els.currentName) els.currentName.textContent = selected.name;
  if (els.currentMeta) {
    els.currentMeta.textContent = `Current bid ${selected.purchasedPoint ?? selected.basePoint}L • ${selected.soldTo || 'Awaiting bid'}`;
  }
  if (els.currentBadge) {
    els.currentBadge.textContent = state.isSpinning ? 'SPINNING' : 'LIVE';
  }
}

function getAuthToken(username, password) {
  return window.btoa(`${username}:${password}`);
}

function setLoginError(message = '') {
  els.loginError.textContent = message;
  els.loginError.classList.toggle('hidden', !message);
}

function setDashboardVisible(visible) {
  els.loginCard.classList.toggle('hidden', visible);
  els.dashboard.classList.toggle('hidden', !visible);
}

async function verifyAdmin() {
  const response = await fetch(`${API_BASE}/api/admin/overview`, {
    headers: {
      Authorization: `Basic ${state.authToken}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Admin login required.');
  }
  return data;
}

function renderSummary() {
  const players = getPlayers();
  const summary = {
    totalPlayers: players.length,
    soldPlayers: players.filter((player) => player.status === 'sold' || player.status === 'current').length,
    availablePlayers: players.filter((player) => player.status === 'available').length,
    totalSpent: players.reduce((sum, player) => sum + (Number(player.purchasedPoint) || 0), 0)
  };
  els.summaryCards.innerHTML = [
    ['Players', summary.totalPlayers, 'gold'],
    ['Sold', summary.soldPlayers, 'green'],
    ['Available', summary.availablePlayers, 'blue'],
    ['Total spent', `${summary.totalSpent}L`, 'amber']
  ]
    .map(([label, value, tone]) => `
      <div class="auction-summary-card auction-summary-card--${tone}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join('');

  els.summaryMini.innerHTML = `
    <div class="auction-summary-mini">
      <span>Total teams</span>
      <strong>${auctionTeams.length}</strong>
    </div>
    <div class="auction-summary-mini">
      <span>Wheel players</span>
      <strong>${players.length}</strong>
    </div>
    <div class="auction-summary-mini">
      <span>Current player</span>
      <strong>${escapeHtml(currentAuctionPlayer.name)}</strong>
    </div>
    <div class="auction-summary-mini">
      <span>Bid</span>
      <strong>${currentAuctionPlayer.currentBid}L</strong>
    </div>
  `;
}

function renderWheel() {
  state.wheelPlayers = getWheelPlayers();
  const size = Math.max(320, els.wheel.getBoundingClientRect().width || 640);
  const radius = size * 0.34;
  const center = size / 2;
  const selectedPlayer = getWheelPlayerByName(state.selectedPlayerName);
  const wheelCount = state.wheelPlayers.length || 1;

  els.wheel.innerHTML = `
    <div class="auction-wheel-core">
      <span>WAGON</span>
      <strong>Wheel</strong>
      <button class="auction-wheel-button${state.isSpinning ? ' is-spinning' : ''}" type="button" data-admin-wheel-spin aria-label="Spin wheel to select player">
        ${state.isSpinning ? 'Spinning…' : 'Select player'}
      </button>
      <p id="auctionAdminWheelSelectedLabel">${escapeHtml(selectedPlayer.name)} • ${selectedPlayer.basePoint}L</p>
    </div>
    ${state.wheelPlayers
      .map((player, index) => {
        const angle = (Math.PI * 2 * index) / wheelCount - Math.PI / 2;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;

        const otherPlayersUnsold = getPlayers().filter(p => !isPlayerReserved(p) && p.status !== 'sold');
        const isReserved = state.reservedLockActive && isPlayerReserved(player) && otherPlayersUnsold.length > 0;
        const isSoldStyle = player.status === 'sold';
        const isMuted = isReserved || isSoldStyle;

        return `
          <div class="auction-wheel-node auction-wheel-node--${player.status}${state.highlightedIndex === index ? ' is-highlighted' : ''}${state.selectedPlayerName === player.name ? ' is-selected' : ''}${isMuted ? ' is-reserved' : ''}" style="left:${x}px; top:${y}px;">
            <div class="auction-wheel-avatar" style="${isMuted ? 'filter: grayscale(1);' : ''}">${player.image ? `<img src="${escapeHtml(player.image)}" alt="${escapeHtml(player.name)}" />` : initials(player.name)}</div>
            <span class="auction-wheel-name">${escapeHtml(player.name)}</span>
            <small>${isReserved ? 'RESERVED' : isSoldStyle ? 'SOLD' : `${player.basePoint}L`}</small>
          </div>
        `;
      })
      .join('')}
  `;

  const updatedSelectedPlayer = getWheelPlayerByName(state.selectedPlayerName);
  els.wheelCaption.textContent = `${updatedSelectedPlayer.name} • ${updatedSelectedPlayer.basePoint}L`;
  renderCurrentPreview();
}

function animateWheelSelection() {
  if (state.isSpinning || !state.wheelPlayers.length) return;

  const spinPlayers = state.wheelPlayers;
  const selectedPlayer = getNextWheelSelection();
  const selectedIndex = spinPlayers.findIndex((player) => player.name === selectedPlayer.name);
  const totalSteps = spinPlayers.length * 2 + selectedIndex + 4 + Math.floor(Math.random() * Math.max(2, spinPlayers.length));
  const token = Date.now();
  state.isSpinning = true;
  state.spinToken = token;
  state.highlightedIndex = Math.floor(Math.random() * spinPlayers.length);
  writeAuctionWheelSignal({
    type: 'spin',
    token,
    targetName: selectedPlayer.name,
    highlightedIndex: 0
  });
  let step = 0;

  const tick = () => {
    if (state.spinToken !== token) return;
    state.highlightedIndex = (state.highlightedIndex + getRandomSpinAdvance(spinPlayers.length)) % spinPlayers.length;
    renderWheel();
    step += 1;

    if (step > totalSteps) {
      state.highlightedIndex = selectedIndex;
      state.selectedPlayerName = selectedPlayer.name;
      state.isSpinning = false;
      syncCurrentAuctionPlayer(selectedPlayer);
      renderWheel();
      renderSummary();
      renderCurrentPreview();
      writeAuctionWheelSignal({
        type: 'settled',
        token,
        targetName: selectedPlayer.name,
        highlightedIndex: selectedIndex
      });
      return;
    }

    window.setTimeout(tick, step < Math.max(4, Math.floor(spinPlayers.length * 0.75)) ? 55 : 90 + Math.floor(Math.random() * 35));
  };

  tick();
}

function renderPlayersTable() {
  els.playerTable.innerHTML = getWheelPlayers()
    .map(
      (player) => `
        <tr class="auction-row auction-row--${player.status}" data-player-row="${escapeHtml(player.name)}">
          <td>
            <div class="auction-photo">${player.image ? `<img src="${escapeHtml(player.image)}" alt="${escapeHtml(player.name)}" />` : initials(player.name)}</div>
          </td>
          <td>
            <strong>${escapeHtml(player.name)}</strong>
            <div class="muted">${player.wheelOrder != null && typeof player.wheelOrder === 'number' && player.wheelOrder >= 1 ? `Wheel #${player.wheelOrder}` : 'Wheel: Random'}</div>
          </td>
          <td>${player.basePoint}L</td>
          <td>${player.purchasedPoint ? `${player.purchasedPoint}L` : '—'}</td>
          <td><span class="auction-status auction-status--${player.status}">${escapeHtml(player.status)}</span></td>
          <td>
            <button type="button" class="auction-status ${isPlayerReserved(player) ? 'auction-status--sold' : 'auction-status--available'}" style="cursor: pointer; border: none; font-family: inherit; font-size: 0.75rem; display: inline-flex; align-items: center; justify-content: center; width: 100px; text-align: center; font-weight: 600;" data-player-action="toggle-reserve" data-player-name="${escapeHtml(player.name)}">
              ${isPlayerReserved(player) ? 'Reserved' : 'Not Reserved'}
            </button>
          </td>
          <td>${player.soldTo ? escapeHtml(player.soldTo) : '—'}</td>
          <td>
            <div class="auction-row-actions">
              <button type="button" class="ghost-button" data-player-action="edit" data-player-name="${escapeHtml(player.name)}">Edit</button>
              <button type="button" class="danger-button" data-player-action="delete" data-player-name="${escapeHtml(player.name)}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');
}

function renderTeams() {
  els.teamList.innerHTML = getTeams()
    .map(
      (team) => `
        <article class="auction-team-admin-card">
          <div class="auction-team-card-top">
            <div>
              <span class="auction-team-name">${escapeHtml(team.name)}</span>
              <p>${escapeHtml(team.captainName)}</p>
            </div>
            <span class="auction-team-badge">${team.remainingPoints}L left</span>
          </div>
          <div class="auction-team-stats">
            <div><span>Total</span><strong>${team.totalPoints}L</strong></div>
            <div><span>Spent</span><strong>${team.purchasePoints}L</strong></div>
            <div><span>Remaining</span><strong>${team.remainingPoints}L</strong></div>
            <div><span>Players</span><strong>${(team.players || []).length}</strong></div>
          </div>
          <div class="auction-team-player-list">
            ${(team.players || []).map((player) => `<span class="preview-pill">${escapeHtml(player.name)} • ${player.price}L</span>`).join('')}
          </div>
          <div class="auction-row-actions">
            <button type="button" class="ghost-button" data-team-action="edit" data-team-name="${escapeHtml(team.name)}">Edit</button>
            <button type="button" class="danger-button" data-team-action="delete" data-team-name="${escapeHtml(team.name)}">Delete</button>
          </div>
        </article>
      `
    )
    .join('');
}

function setActiveTab(tab) {
  state.activeTab = tab;
  els.tabs.forEach((button) => button.classList.toggle('is-active', button.dataset.auctionTab === tab));
  els.panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.auctionPanel === tab));
}

function resetPlayerForm() {
  state.editingPlayerName = '';
  state.editingPlayerImage = '';
  if (els.playerForm) els.playerForm.dataset.mode = 'create';
  if (els.playerSaveButton) els.playerSaveButton.textContent = 'Save player';
  if (els.playerName) els.playerName.value = '';
  if (els.playerBase) els.playerBase.value = '';
  if (els.playerPurchased) els.playerPurchased.value = '';
  if (els.playerImage) els.playerImage.value = '';
  if (els.playerStatus) els.playerStatus.value = 'available';
  if (els.playerWheel) els.playerWheel.value = '';
  if (els.playerReserved) els.playerReserved.checked = false;
  renderPlayerImagePreview('');
}

function fillPlayerForm(player) {
  state.editingPlayerName = player.name;
  state.editingPlayerImage = player.image || '';
  if (els.playerForm) els.playerForm.dataset.mode = 'edit';
  if (els.playerSaveButton) els.playerSaveButton.textContent = 'Update player';
  if (els.playerName) els.playerName.value = player.name || '';
  if (els.playerBase) els.playerBase.value = String(player.basePoint ?? '');
  if (els.playerPurchased) els.playerPurchased.value = player.purchasedPoint == null ? '' : String(player.purchasedPoint);
  if (els.playerImage) els.playerImage.value = '';
  if (els.playerStatus) els.playerStatus.value = player.status || 'available';
  if (els.playerWheel) els.playerWheel.value = String(player.wheelOrder ?? '');
  if (els.playerReserved) els.playerReserved.checked = isPlayerReserved(player);
  renderPlayerImagePreview(player.image || '', player.name);
}

async function upsertPlayerFromForm() {
  const name = els.playerName.value.trim();
  if (!name) return;
  const basePoint = Number(els.playerBase.value) || 0;
  const purchasedValue = els.playerPurchased.value.trim();
  const purchasedPoint = purchasedValue === '' ? null : Number(purchasedValue);
  const status = els.playerStatus.value || 'available';
  const wheelOrderVal = els.playerWheel.value.trim();
  const wheelOrder = (wheelOrderVal === '' || isNaN(Number(wheelOrderVal))) ? null : Number(wheelOrderVal);
  const isReserved = els.playerReserved ? els.playerReserved.checked : false;
  const selectedFile = els.playerImage?.files?.[0] || null;
  const image = selectedFile ? await uploadPlayerImage(selectedFile) : state.editingPlayerImage || '';

  const players = clonePlayers(getPlayers());
  const existingIndex = players.findIndex((player) => player.name === state.editingPlayerName);
  const nextPlayer = {
    name,
    basePoint,
    purchasedPoint,
    image,
    status,
    wheelOrder,
    isReserved,
    soldTo: existingIndex >= 0 ? players[existingIndex].soldTo || '' : '',
    currentBid: existingIndex >= 0 ? players[existingIndex].currentBid ?? purchasedPoint ?? basePoint : purchasedPoint ?? basePoint
  };

  if (existingIndex >= 0) {
    players[existingIndex] = { ...players[existingIndex], ...nextPlayer };
  } else {
    players.push(nextPlayer);
  }

  savePlayers(players);
  renderSummary();
  renderPlayersTable();
  renderWheel();
  renderSellPanelOptions();
  if (state.selectedPlayerName === state.editingPlayerName) {
    syncCurrentAuctionPlayer(getWheelPlayerByName(name));
  }
  resetPlayerForm();
}

function deletePlayerByName(name) {
  const confirmed = window.confirm(`Delete ${name}?`);
  if (!confirmed) return;

  const players = getPlayers().filter((player) => player.name !== name);
  savePlayers(players);

  if (state.selectedPlayerName === name) {
    const fallback = players.slice().sort((a, b) => a.wheelOrder - b.wheelOrder)[0];
    if (fallback) {
      state.selectedPlayerName = fallback.name;
      syncCurrentAuctionPlayer(fallback);
    }
  }

  if (state.editingPlayerName === name) {
    resetPlayerForm();
  }

  state.wheelPlayers = getWheelPlayers();
  state.highlightedIndex = Math.max(0, state.wheelPlayers.findIndex((player) => player.name === state.selectedPlayerName));
  renderSummary();
  renderPlayersTable();
  renderWheel();
  renderCurrentPreview();
}

function resetTeamForm() {
  state.editingTeamName = '';
  if (els.teamForm) els.teamForm.dataset.mode = 'create';
  if (els.teamSaveButton) els.teamSaveButton.textContent = 'Save team';
  if (els.teamName) els.teamName.value = '';
  if (els.teamCaptain) els.teamCaptain.value = '';
  if (els.teamTotalPoints) els.teamTotalPoints.value = '50';
  if (els.teamPurchasePoints) els.teamPurchasePoints.value = '0';
  if (els.teamRemainingPoints) els.teamRemainingPoints.value = '50';
  if (els.teamPlayers) els.teamPlayers.value = '0';
}

function fillTeamForm(team) {
  state.editingTeamName = team.name;
  if (els.teamForm) els.teamForm.dataset.mode = 'edit';
  if (els.teamSaveButton) els.teamSaveButton.textContent = 'Update team';
  if (els.teamName) els.teamName.value = team.name || '';
  if (els.teamCaptain) els.teamCaptain.value = team.captainName || '';
  if (els.teamTotalPoints) els.teamTotalPoints.value = String(team.totalPoints ?? 50);
  if (els.teamPurchasePoints) els.teamPurchasePoints.value = String(team.purchasePoints ?? 0);
  if (els.teamRemainingPoints) els.teamRemainingPoints.value = String(team.remainingPoints ?? 50);
  if (els.teamPlayers) els.teamPlayers.value = String(team.players?.length ?? 0);
}

async function upsertTeamFromForm() {
  const name = els.teamName.value.trim();
  if (!name) return;
  const captainName = els.teamCaptain.value.trim();
  const totalPoints = Number(els.teamTotalPoints.value) || 0;
  const purchasePoints = Number(els.teamPurchasePoints.value) || 0;
  const remainingPoints = Number(els.teamRemainingPoints.value) || 0;

  const teams = cloneTeams(getTeams());
  const existingIndex = teams.findIndex((team) => team.name === state.editingTeamName);

  const nextTeam = {
    name,
    captainName,
    totalPoints,
    purchasePoints,
    remainingPoints,
    players: existingIndex >= 0 ? teams[existingIndex].players || [] : []
  };

  if (existingIndex >= 0) {
    teams[existingIndex] = { ...teams[existingIndex], ...nextTeam };
  } else {
    teams.push(nextTeam);
  }

  saveTeams(teams);
  renderTeams();
  renderSellPanelOptions();
  resetTeamForm();
}

async function refreshPlayersFromServer() {
  const serverSnapshot = await fetchServerPlayers();
  if (!serverSnapshot?.players?.length) return;

  const localUpdatedAt = getLocalPlayersUpdatedAt();
  if (localUpdatedAt > serverSnapshot.updatedAtMs) {
    state.players = loadPlayers();
    writeAuctionPlayers(state.players, { updatedAt: localUpdatedAt });
    void persistServerPlayers(state.players);
    renderSummary();
    renderPlayersTable();
    renderWheel();
    renderCurrentPreview();
    renderSellPanelOptions();
    return;
  }

  state.players = clonePlayers(serverSnapshot.players);
  writeAuctionPlayers(state.players, { updatedAt: serverSnapshot.updatedAtMs || Date.now() });
  renderSummary();
  renderPlayersTable();
  renderWheel();
  renderCurrentPreview();
  renderSellPanelOptions();
}

async function refreshTeamsFromServer() {
  const serverSnapshot = await fetchServerTeams();
  if (!serverSnapshot?.teams?.length) return;

  state.teams = cloneTeams(serverSnapshot.teams);
  writeAuctionTeams(state.teams, { updatedAt: serverSnapshot.updatedAtMs || Date.now() });
  renderTeams();
  renderSellPanelOptions();
}

function bindTabs() {
  els.tabs.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.auctionTab));
  });
}

async function bootDashboard() {
  await refreshPlayersFromServer();
  await refreshTeamsFromServer();
  renderSummary();
  renderPlayersTable();
  renderTeams();
  refreshSellPanelSelection();
  setActiveTab(state.activeTab);
  setDashboardVisible(true);
  state.wheelPlayers = getWheelPlayers();
  
  if (els.reserveToggle) {
    els.reserveToggle.checked = state.reservedLockActive;
    els.reserveToggle.addEventListener('change', (e) => {
      state.reservedLockActive = e.target.checked;
      localStorage.setItem('wow_league_auction_reserved_lock', String(e.target.checked));
      writeAuctionWheelSignal({
        type: 'toggle_lock',
        reservedLockActive: e.target.checked
      });
      renderWheel();
    });
  }

  renderWheel();
  resetPlayerForm();
  resetTeamForm();
  renderSellPanelOptions();
}

function bootBackground() {
  startMeshBackground(document.getElementById('meshBackground'), {
    pointCount: 48,
    maxDistance: 170,
    background: '#05070b',
    pointColor: 'rgba(243, 197, 87, 0.9)',
    lineRgb: '226, 179, 61',
    glowColor: 'rgba(226, 179, 61, 0.09)'
  });
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setLoginError('');

  const username = els.username.value.trim();
  const password = els.password.value;
  if (!username || !password) {
    setLoginError('Enter both username and password.');
    return;
  }

  state.authToken = getAuthToken(username, password);
  localStorage.setItem(AUTH_STORAGE_KEY, state.authToken);

  try {
    await verifyAdmin();
    els.password.value = '';
    await bootDashboard();
  } catch (error) {
    state.authToken = '';
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setLoginError(error.message || 'Admin login failed.');
  }
});

els.logoutButton.addEventListener('click', () => {
  state.authToken = '';
  localStorage.removeItem(AUTH_STORAGE_KEY);
  setDashboardVisible(false);
});

els.wheel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-admin-wheel-spin]');
  if (!button) return;
  animateWheelSelection();
});

els.playerTable.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-player-action]');
  if (!actionButton) return;

  const playerName = actionButton.dataset.playerName;
  const player = getPlayers().find((entry) => entry.name === playerName);
  if (!player) return;

  if (actionButton.dataset.playerAction === 'edit') {
    fillPlayerForm(player);
    setActiveTab('players');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (actionButton.dataset.playerAction === 'toggle-reserve') {
    player.isReserved = !isPlayerReserved(player);
    savePlayers(getPlayers());
    renderPlayersTable();
    state.wheelPlayers = getWheelPlayers();
    renderWheel();
    writeAuctionWheelSignal({
      ...readAuctionWheelSignal(),
      reservedLockActive: state.reservedLockActive
    });
    return;
  }

  if (actionButton.dataset.playerAction === 'delete') {
    deletePlayerByName(playerName);
  }
});

els.playerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  upsertPlayerFromForm().catch((error) => {
    window.alert(error.message || 'Failed to save player.');
  });
});

els.playerImage.addEventListener('change', () => {
  void updateSelectedFilePreview();
});

if (els.sellForm) {
  els.sellForm.addEventListener('submit', (event) => {
    event.preventDefault();
    executeSellAction().catch((error) => {
      window.alert(error.message || 'Failed to execute sell action.');
    });
  });
}

if (els.sellPlayerSelect) {
  els.sellPlayerSelect.addEventListener('change', () => {
    refreshSellPanelFromPlayer(els.sellPlayerSelect.value);
  });
}

if (els.sellActionSelect) {
  els.sellActionSelect.addEventListener('change', () => {
    const selectedPlayer = getPlayers().find((player) => player.name === els.sellPlayerSelect?.value) || getPlayers()[0] || null;
    if (!selectedPlayer) return;
    if (els.sellActionSelect.value === 'sell') {
      if (els.sellPriceInput) els.sellPriceInput.value = String(selectedPlayer.purchasedPoint ?? selectedPlayer.basePoint ?? 0);
      if (els.sellTeamSelect && selectedPlayer.soldTo) {
        els.sellTeamSelect.value = selectedPlayer.soldTo;
      }
    } else {
      if (els.sellPriceInput) els.sellPriceInput.value = String(selectedPlayer.purchasedPoint ?? selectedPlayer.basePoint ?? 0);
    }
  });
}

if (els.sellTeamSelect) {
  els.sellTeamSelect.addEventListener('change', () => {
    const team = getTeamByName(els.sellTeamSelect.value);
    if (!team) return;
    if (els.sellPriceInput && els.sellActionSelect?.value === 'sell') {
      const selectedPlayer = getPlayers().find((player) => player.name === els.sellPlayerSelect?.value);
      els.sellPriceInput.value = String(selectedPlayer?.purchasedPoint ?? selectedPlayer?.basePoint ?? 0);
    }
  });
}

bindTabs();
bootBackground();

if (state.authToken) {
  verifyAdmin()
    .then(() => bootDashboard())
    .catch(() => {
      state.authToken = '';
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setDashboardVisible(false);
    });
}

subscribeAuctionPlayers((players) => {
  if (!Array.isArray(players) || !players.length) return;
  state.players = clonePlayers(players);
  if (state.editingPlayerName) {
    const editing = state.players.find((player) => player.name === state.editingPlayerName);
    if (editing) {
      state.editingPlayerImage = editing.image || state.editingPlayerImage;
    }
  }
  renderSummary();
  renderPlayersTable();
  renderWheel();
  renderSellPanelOptions();
});

const currentSignal = readAuctionWheelSignal();
if (currentSignal?.type === 'settled' && currentSignal.targetName) {
  const settledPlayer = getWheelPlayers().find((player) => player.name === currentSignal.targetName);
  if (settledPlayer) {
    state.selectedPlayerName = settledPlayer.name;
    syncCurrentAuctionPlayer(settledPlayer);
  }
}

subscribeAuctionWheelSignal((signal) => {
  if (!signal || !state.authToken) return;
  if (signal.type === 'spin' && signal.targetName) {
    if (!state.isSpinning) {
      const targetPlayer = getWheelPlayers().find((player) => player.name === signal.targetName);
      if (!targetPlayer) return;
      state.isSpinning = true;
      state.spinToken = signal.token || Date.now();
      const spinPlayers = state.wheelPlayers.length ? state.wheelPlayers : getWheelPlayers();
      state.wheelPlayers = spinPlayers;
      const selectedIndex = spinPlayers.findIndex((player) => player.name === targetPlayer.name);
      const totalSteps = spinPlayers.length * 2 + Math.max(selectedIndex, 0) + 4 + Math.floor(Math.random() * Math.max(2, spinPlayers.length));
      state.highlightedIndex = Math.floor(Math.random() * spinPlayers.length);
      let step = 0;

      const tick = () => {
        if (state.spinToken !== signal.token) return;
        state.highlightedIndex = (state.highlightedIndex + getRandomSpinAdvance(spinPlayers.length)) % spinPlayers.length;
        renderWheel();
        step += 1;

        if (step > totalSteps) {
          state.highlightedIndex = selectedIndex;
          state.selectedPlayerName = targetPlayer.name;
          state.isSpinning = false;
          syncCurrentAuctionPlayer(targetPlayer);
          renderWheel();
          renderSummary();
          renderCurrentPreview();
          return;
        }

        window.setTimeout(tick, step < Math.max(4, Math.floor(spinPlayers.length * 0.75)) ? 55 : 90 + Math.floor(Math.random() * 35));
      };

      tick();
    }
  }

  if (signal.type === 'settled' && signal.targetName) {
    const settledPlayer = getWheelPlayers().find((player) => player.name === signal.targetName);
    if (!settledPlayer) return;
    state.isSpinning = false;
    state.selectedPlayerName = settledPlayer.name;
    state.highlightedIndex = Math.max(0, state.wheelPlayers.findIndex((player) => player.name === settledPlayer.name));
    syncCurrentAuctionPlayer(settledPlayer);
    renderWheel();
    renderSummary();
    renderCurrentPreview();
    renderSellPanelOptions();
  }
});

if (els.teamForm) {
  els.teamForm.addEventListener('submit', (event) => {
    event.preventDefault();
    upsertTeamFromForm().catch((error) => {
      window.alert(error.message || 'Failed to save team.');
    });
  });
}

if (els.teamList) {
  els.teamList.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-team-action]');
    if (!actionButton) return;

    const teamName = actionButton.dataset.teamName;
    const team = getTeams().find((entry) => entry.name === teamName);
    if (!team) return;

    if (actionButton.dataset.teamAction === 'edit') {
      fillTeamForm(team);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (actionButton.dataset.teamAction === 'delete') {
      if (window.confirm(`Delete team "${teamName}"?`)) {
        const teams = getTeams().filter((t) => t.name !== teamName);
        saveTeams(teams);
        renderTeams();
        if (state.editingTeamName === teamName) {
          resetTeamForm();
        }
      }
    }
  });
}

subscribeAuctionTeams((teams) => {
  if (!Array.isArray(teams) || !teams.length) return;
  state.teams = cloneTeams(teams);
  renderTeams();
  renderSellPanelOptions();
});
