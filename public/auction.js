import { startMeshBackground } from './background.js';
import { auctionPlayers, auctionTeams, auctionRules, currentAuctionPlayer } from './auction-data.js';
import {
  readAuctionPlayers,
  readAuctionWheelSignal,
  subscribeAuctionPlayers,
  subscribeAuctionWheelSignal,
  writeAuctionPlayers,
  readAuctionTeams,
  subscribeAuctionTeams
} from './auction-sync.js';

const els = {
  summaryCards: document.getElementById('auctionSummaryCards'),
  teamPurse: document.getElementById('auctionTeamPurse'),
  wheel: document.getElementById('auctionWheel'),
  playerTable: document.getElementById('auctionPlayerTable'),
  currentCard: document.getElementById('auctionCurrentCard'),
  purchasedTeams: document.getElementById('auctionPurchasedTeams'),
  rules: document.getElementById('auctionRules'),
  currentPlayerName: document.getElementById('auctionCurrentPlayerName'),
  currentPlayerStatus: document.getElementById('auctionCurrentPlayerStatus'),
  currentBase: document.getElementById('auctionCurrentBase'),
  currentBid: document.getElementById('auctionCurrentBid'),
  currentTeam: document.getElementById('auctionCurrentTeam'),
  currentState: document.getElementById('auctionCurrentState'),
  wheelCaption: document.getElementById('auctionWheelCaption'),
  spotlightAvatar: document.getElementById('auctionSpotlightAvatar')
};

const API_BASE =
  window.location.port === '5500'
    ? 'http://127.0.0.1:3000'
    : window.location.origin;

const AUCTION_PLAYERS_LAST_SYNC_KEY = 'wow_league_auction_players_sync:last';

const state = {
  players: readAuctionPlayers(auctionPlayers),
  teams: readAuctionTeams(auctionTeams),
  wheelPlayers: [],
  selectedPlayerName: currentAuctionPlayer.name,
  highlightedIndex: 0,
  isSpinning: false,
  spinToken: 0,
  pendingSpinTarget: null,
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

function renderPlayerAvatarHtml(player, className = '') {
  if (player?.image) {
    return `<img class="${className}" src="${escapeHtml(player.image)}" alt="${escapeHtml(player.name)}" />`;
  }

  return `<span class="${className}">${initials(player?.name || 'P')}</span>`;
}

function clonePlayers(players) {
  return players.map((player) => ({ ...player }));
}

function isPlayerReserved(player) {
  if (player && typeof player.isReserved === 'boolean') {
    return player.isReserved;
  }
  const defaultReservedNames = ['zeus', 'sull', 'skull', 'soul', 'ryzen'];
  return !!(player && defaultReservedNames.includes(player.name.toLowerCase().trim()));
}

function getWheelPlayers() {
  const allPlayers = [...state.players];
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
  const otherPlayersUnsold = state.players.filter(p => 
    !isPlayerReserved(p) && 
    p.status !== 'sold'
  );
  
  let pool = state.wheelPlayers.filter((player) => player.status !== 'sold');
  
  // If there are other unsold players, block the reserved ones
  if (otherPlayersUnsold.length > 0) {
    pool = pool.filter(p => !isPlayerReserved(p));
  }
  
  return pool.length ? pool : state.wheelPlayers;
}

function getRandomSpinAdvance(length) {
  if (length <= 1) return 1;
  const maxStep = Math.min(4, length - 1);
  return 1 + Math.floor(Math.random() * maxStep);
}

function syncSelectedPlayer(player) {
  state.selectedPlayerName = player.name;
  currentAuctionPlayer.name = player.name;
  currentAuctionPlayer.basePoint = player.basePoint;
  currentAuctionPlayer.currentBid = player.purchasedPoint ?? player.basePoint;
  currentAuctionPlayer.status = 'Wheel selected';
  currentAuctionPlayer.team = player.soldTo || 'Awaiting bid';
  currentAuctionPlayer.image = player.image || '';
}

async function refreshPlayersFromServer() {
  try {
    const response = await fetch(`${API_BASE}/api/auction/players`);
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.players) || !data.players.length) return;
    const serverUpdatedAtMs = Number(data.updatedAtMs ?? 0);
    const localUpdatedAt = (() => {
      try {
        const raw = localStorage.getItem(AUCTION_PLAYERS_LAST_SYNC_KEY);
        if (!raw) return 0;
        const parsed = JSON.parse(raw);
        return Number(parsed?.updatedAt ?? 0);
      } catch {
        return 0;
      }
    })();

    if (localUpdatedAt > serverUpdatedAtMs) {
      writeAuctionPlayers(state.players, { updatedAt: localUpdatedAt });
      return;
    }

    state.players = clonePlayers(data.players);
    writeAuctionPlayers(state.players, { updatedAt: serverUpdatedAtMs || Date.now() });
  } catch {
    // Ignore offline/server failures and keep local data.
  }
}

function renderSummaryCards() {
  const players = state.players;
  const summary = {
    totalPlayers: players.length,
    soldPlayers: players.filter((player) => player.status === 'sold' || player.status === 'current').length,
    availablePlayers: players.filter((player) => player.status === 'available').length,
    totalSpent: players.reduce((sum, player) => sum + (Number(player.purchasedPoint) || 0), 0)
  };
  const cards = [
    { label: 'Players', value: summary.totalPlayers, tone: 'gold' },
    { label: 'Sold', value: summary.soldPlayers, tone: 'green' },
    { label: 'Available', value: summary.availablePlayers, tone: 'blue' },
    { label: 'Total spent', value: `${summary.totalSpent}L`, tone: 'amber' }
  ];

  els.summaryCards.innerHTML = cards
    .map(
      (card) => `
        <div class="auction-summary-card auction-summary-card--${card.tone}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </div>
      `
    )
    .join('');
}

function renderTeamPurse() {
  els.teamPurse.innerHTML = state.teams
    .map(
      (team) => `
        <article class="auction-team-card">
          <div class="auction-team-card-top">
            <div>
              <span class="auction-team-name">${escapeHtml(team.name)}</span>
              <p>${escapeHtml(team.captainName)}</p>
            </div>
            <span class="auction-team-badge">${team.players.length} players</span>
          </div>
          <div class="auction-team-stats">
            <div><span>Total Purse</span><strong>${team.totalPoints}L</strong></div>
            <div><span>Spent</span><strong>${team.purchasePoints}L</strong></div>
            <div><span>Remaining</span><strong>${team.remainingPoints}L</strong></div>
          </div>
          <div class="auction-team-player-list">
            ${team.players.map((player) => `<span class="preview-pill">${escapeHtml(player.name)} • ${player.price}L</span>`).join('')}
          </div>
        </article>
      `
    )
    .join('');
}

function renderCurrentPlayer() {
  const selected = getWheelPlayerByName(state.selectedPlayerName);
  els.currentPlayerName.textContent = selected.name;
  els.currentPlayerStatus.textContent = state.isSpinning ? 'Status: Selecting from wheel…' : `Status: ${currentAuctionPlayer.status}`;
  els.currentBase.textContent = `${selected.basePoint}L`;
  els.currentBid.textContent = `${selected.purchasedPoint ?? selected.basePoint}L`;
  els.currentTeam.textContent = selected.soldTo || 'Awaiting bid';
  els.currentState.textContent = state.isSpinning ? 'Spinning' : 'Highlighted';
  if (els.spotlightAvatar) {
    els.spotlightAvatar.innerHTML = renderPlayerAvatarHtml(selected, 'auction-spotlight-live-avatar-media');
  }

  els.currentCard.innerHTML = `
    <div class="auction-current-portrait">
      <div class="auction-current-avatar">${renderPlayerAvatarHtml(selected, 'auction-current-avatar-media')}</div>
      <div>
        <span class="step">Current Player</span>
        <h3>${escapeHtml(selected.name)}</h3>
        <p>${escapeHtml(state.isSpinning ? 'Spinning' : selected.status)} • ${escapeHtml(selected.soldTo || 'Awaiting bid')}</p>
      </div>
    </div>
    <div class="auction-current-stats">
      <div class="auction-current-stat">
        <span>Base price</span>
        <strong>${selected.basePoint}L</strong>
      </div>
      <div class="auction-current-stat">
        <span>Current bid</span>
        <strong>${selected.purchasedPoint ?? selected.basePoint}L</strong>
      </div>
      <div class="auction-current-stat">
        <span>Status</span>
        <strong>${escapeHtml(state.isSpinning ? 'Selecting' : selected.status)}</strong>
      </div>
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
      <div class="auction-wheel-core-note">Admin only</div>
      <p id="auctionWheelSelectedLabel">${escapeHtml(selectedPlayer.name)} • ${selectedPlayer.basePoint}L</p>
    </div>
    ${state.wheelPlayers
      .map((player, index) => {
        const angle = (Math.PI * 2 * index) / wheelCount - Math.PI / 2;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;

        const otherPlayersUnsold = state.players.filter(p => 
          !isPlayerReserved(p) && 
          p.status !== 'sold'
        );
        const isReserved = state.reservedLockActive && isPlayerReserved(player) && otherPlayersUnsold.length > 0;
        const isSoldStyle = player.status === 'sold';
        const isMuted = isReserved || isSoldStyle;

        return `
          <div class="auction-wheel-node auction-wheel-node--${player.status}${state.highlightedIndex === index ? ' is-highlighted' : ''}${state.selectedPlayerName === player.name ? ' is-selected' : ''}${isMuted ? ' is-reserved' : ''}" data-wheel-player="${escapeHtml(player.name)}" style="left:${x}px; top:${y}px;">
            <div class="auction-wheel-avatar" style="${isMuted ? 'filter: grayscale(1);' : ''}">${renderPlayerAvatarHtml(player, 'auction-wheel-avatar-media')}</div>
            <strong>${escapeHtml(player.name)}</strong>
            <small>${isReserved ? 'RESERVED' : isSoldStyle ? 'SOLD' : `${player.basePoint}L`}</small>
          </div>
        `;
      })
      .join('')}
  `;

  els.wheelCaption.textContent = `${selectedPlayer.name} • ${selectedPlayer.basePoint}L`;
}

function startWheelSpin(targetName, token = Date.now()) {
  if (state.isSpinning || !state.wheelPlayers.length) return;

  const targetPlayer = getWheelPlayerByName(targetName);
  const spinPlayers = state.wheelPlayers;
  const targetIndex = spinPlayers.findIndex((player) => player.name === targetPlayer.name);
  const totalSteps = spinPlayers.length * 2 + Math.max(targetIndex, 0) + 4 + Math.floor(Math.random() * Math.max(2, spinPlayers.length));
  state.spinToken = token;
  state.pendingSpinTarget = targetPlayer.name;
  state.isSpinning = true;
  state.highlightedIndex = Math.floor(Math.random() * spinPlayers.length);

  let step = 0;

  const tick = () => {
    if (state.spinToken !== token) return;
    state.highlightedIndex = (state.highlightedIndex + getRandomSpinAdvance(spinPlayers.length)) % spinPlayers.length;
    renderWheel();
    renderCurrentPlayer();
    step += 1;

    if (step > totalSteps) {
      state.highlightedIndex = Math.max(0, targetIndex);
      state.pendingSpinTarget = null;
      state.isSpinning = false;
      syncSelectedPlayer(targetPlayer);
      renderWheel();
      renderCurrentPlayer();
      return;
    }

    window.setTimeout(tick, step < Math.max(4, Math.floor(spinPlayers.length * 0.75)) ? 55 : 90 + Math.floor(Math.random() * 35));
  };

  tick();
}

function applyWheelSignal(signal) {
  if (!signal || signal.type !== 'spin') return;
  if (!signal.targetName) return;
  if (state.spinToken === signal.token && state.isSpinning) return;
  state.spinToken = signal.token || Date.now();
  startWheelSpin(signal.targetName, state.spinToken);
}

function statusLabel(status) {
  if (status === 'current') return 'Live';
  if (status === 'sold') return 'Sold';
  if (status === 'available') return 'Available';
  return 'Unsold';
}

function renderPlayersTable() {
  els.playerTable.innerHTML = getWheelPlayers()
    .map(
      (player) => `
        <tr class="auction-row auction-row--${player.status}">
          <td>
            <div class="auction-photo">${player.image ? `<img src="${escapeHtml(player.image)}" alt="${escapeHtml(player.name)}" />` : initials(player.name)}</div>
          </td>
          <td>
            <strong>${escapeHtml(player.name)}</strong>
            <div class="muted">${player.wheelOrder != null && typeof player.wheelOrder === 'number' && player.wheelOrder >= 1 ? `Wheel order #${player.wheelOrder}` : 'Wheel: Random'}</div>
          </td>
          <td>${player.basePoint}L</td>
          <td>${player.purchasedPoint == null ? '—' : `${player.purchasedPoint}L`}</td>
          <td><span class="auction-status auction-status--${player.status}">${statusLabel(player.status)}</span></td>
          <td>${player.soldTo ? escapeHtml(player.soldTo) : '—'}</td>
        </tr>
      `
    )
    .join('');
}

function renderPurchasedTeams() {
  els.purchasedTeams.innerHTML = state.teams
    .map(
      (team) => `
        <article class="auction-purchased-card">
          <div class="auction-purchased-top">
            <div>
              <strong>${escapeHtml(team.name)}</strong>
              <p>${escapeHtml(team.captainName)}</p>
            </div>
            <span class="auction-team-badge">${team.remainingPoints}L left</span>
          </div>
          <div class="auction-purchased-list-inner">
            ${team.players
              .map(
                (player) => `
                  <div class="auction-purchased-player">
                    <span>${escapeHtml(player.name)}</span>
                    <strong>${player.price}L</strong>
                  </div>
                `
              )
              .join('')}
          </div>
          <div class="auction-purchased-foot">
            <span>Spent ${team.purchasePoints}L</span>
            <span>${team.players.length} players</span>
          </div>
        </article>
      `
    )
    .join('');
}

function renderRules() {
  els.rules.innerHTML = auctionRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('');
}

async function boot() {
  await refreshPlayersFromServer();
  state.wheelPlayers = getWheelPlayers();
  state.highlightedIndex = Math.max(
    0,
    state.wheelPlayers.findIndex((player) => player.name === state.selectedPlayerName)
  );
  renderSummaryCards();
  renderTeamPurse();
  renderCurrentPlayer();
  renderWheel();
  renderPlayersTable();
  renderPurchasedTeams();
  renderRules();

  const currentSignal = readAuctionWheelSignal();
  if (currentSignal?.type === 'toggle_lock') {
    state.reservedLockActive = currentSignal.reservedLockActive !== false;
  }

  if (currentSignal?.type === 'spin' && currentSignal.targetName) {
    const isRecent = !currentSignal.updatedAt || Date.now() - currentSignal.updatedAt < 15000;
    if (isRecent) {
      window.setTimeout(() => applyWheelSignal(currentSignal), 120);
    }
  } else if (currentSignal?.type === 'settled' && currentSignal.targetName) {
    const settledPlayer = getWheelPlayerByName(currentSignal.targetName);
    syncSelectedPlayer(settledPlayer);
    state.highlightedIndex = Math.max(0, state.wheelPlayers.findIndex((player) => player.name === settledPlayer.name));
    renderWheel();
    renderCurrentPlayer();
  }

  subscribeAuctionWheelSignal((signal) => {
    if (signal?.type === 'toggle_lock') {
      state.reservedLockActive = signal.reservedLockActive !== false;
      renderWheel();
      return;
    }

    if (signal?.type === 'spin' && signal.targetName) {
      applyWheelSignal(signal);
      return;
    }

    if (signal?.type === 'settled' && signal.targetName) {
      const settledPlayer = getWheelPlayerByName(signal.targetName);
      state.isSpinning = false;
      state.pendingSpinTarget = null;
      state.selectedPlayerName = settledPlayer.name;
      syncSelectedPlayer(settledPlayer);
      state.highlightedIndex = Math.max(0, state.wheelPlayers.findIndex((player) => player.name === settledPlayer.name));
      renderWheel();
      renderCurrentPlayer();
    }
  });

  startMeshBackground(document.getElementById('meshBackground'), {
    pointCount: 48,
    maxDistance: 170,
    background: '#05070b',
    pointColor: 'rgba(243, 197, 87, 0.9)',
    lineRgb: '226, 179, 61',
    glowColor: 'rgba(226, 179, 61, 0.09)'
  });

  window.addEventListener('resize', renderWheel);

  subscribeAuctionPlayers((players) => {
    if (!Array.isArray(players) || !players.length) return;
    state.players = clonePlayers(players);
    state.wheelPlayers = getWheelPlayers();
    state.highlightedIndex = Math.max(
      0,
      state.wheelPlayers.findIndex((player) => player.name === state.selectedPlayerName)
    );
    renderSummaryCards();
    renderTeamPurse();
    renderCurrentPlayer();
    renderWheel();
    renderPlayersTable();
    renderPurchasedTeams();
  });

  subscribeAuctionTeams((teams) => {
    if (!Array.isArray(teams) || !teams.length) return;
    state.teams = teams.map((team) => ({ ...team, players: (team.players || []).map(p => ({ ...p })) }));
    renderTeamPurse();
    renderPurchasedTeams();
  });
}

boot();
