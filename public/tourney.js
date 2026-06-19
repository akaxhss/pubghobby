import { startMeshBackground } from './background.js';

const API_BASE =
  window.location.port === '5500'
    ? 'http://127.0.0.1:3000'
    : window.location.origin;

const AUTH_STORAGE_KEY = 'tourney_rater_admin_auth';
const SELECTED_TOURNAMENT_KEY = 'tourney_dashboard_selected_tournament';

const state = {
  authToken: localStorage.getItem(AUTH_STORAGE_KEY) || '',
  overview: null,
  selectedTournamentId: localStorage.getItem(SELECTED_TOURNAMENT_KEY) || '',
  editingTournamentId: '',
  loading: false
};

const els = {
  loginCard: document.getElementById('tourneyLoginCard'),
  loginForm: document.getElementById('tourneyLoginForm'),
  username: document.getElementById('tourneyUsername'),
  password: document.getElementById('tourneyPassword'),
  loginError: document.getElementById('tourneyLoginError'),
  dashboard: document.getElementById('tourneyDashboard'),
  refreshButton: document.getElementById('tourneyRefreshButton'),
  logoutButton: document.getElementById('tourneyLogoutButton'),
  tourneyCountHero: document.getElementById('tourneyCountHero'),
  teamCountHero: document.getElementById('teamCountHero'),
  playerCountHero: document.getElementById('playerCountHero'),
  matchCountHero: document.getElementById('matchCountHero'),
  tourneyCount: document.getElementById('tourneyCount'),
  teamCount: document.getElementById('teamCount'),
  playerCount: document.getElementById('playerCount'),
  matchCount: document.getElementById('matchCount'),
  tournamentList: document.getElementById('tournamentList'),
  teamList: document.getElementById('teamList'),
  playerList: document.getElementById('playerList'),
  matchList: document.getElementById('matchList'),
  createTournamentForm: document.getElementById('createTournamentForm'),
  tournamentName: document.getElementById('tournamentName'),
  tournamentMode: document.getElementById('tournamentMode'),
  tournamentStatus: document.getElementById('tournamentStatus'),
  tournamentStartAt: document.getElementById('tournamentStartAt'),
  tournamentNotes: document.getElementById('tournamentNotes'),
  createTeamForm: document.getElementById('createTeamForm'),
  teamName: document.getElementById('teamName'),
  teamTag: document.getElementById('teamTag'),
  teamCaptain: document.getElementById('teamCaptain'),
  teamColor: document.getElementById('teamColor'),
  createPlayerForm: document.getElementById('createPlayerForm'),
  playerIgn: document.getElementById('playerIgn'),
  playerTeam: document.getElementById('playerTeam'),
  playerRole: document.getElementById('playerRole'),
  playerActive: document.getElementById('playerActive'),
  createMatchForm: document.getElementById('createMatchForm'),
  matchNo: document.getElementById('matchNo'),
  matchRound: document.getElementById('matchRound'),
  matchTeamA: document.getElementById('matchTeamA'),
  matchTeamB: document.getElementById('matchTeamB'),
  matchRoomCode: document.getElementById('matchRoomCode'),
  matchScheduledAt: document.getElementById('matchScheduledAt'),
  matchStatus: document.getElementById('matchStatus'),
  matchTeamAScore: document.getElementById('matchTeamAScore'),
  matchTeamBScore: document.getElementById('matchTeamBScore'),
  matchWinner: document.getElementById('matchWinner'),
  matchNotes: document.getElementById('matchNotes'),
  roundHistoryCount: document.getElementById('roundHistoryCount'),
  roundHistoryList: document.getElementById('roundHistoryList'),
  playerProfileCount: document.getElementById('playerProfileCount'),
  playerProfileList: document.getElementById('playerProfileList'),
  certificateCount: document.getElementById('certificateCount'),
  certificateList: document.getElementById('certificateList'),
  leaderboardCount: document.getElementById('leaderboardCount'),
  leaderboardList: document.getElementById('leaderboardList'),
  loadingOverlay: document.getElementById('tourneyLoadingOverlay'),
  loadingTitle: document.getElementById('tourneyLoadingTitle'),
  loadingCopy: document.getElementById('tourneyLoadingCopy')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  if (!value) return 'not set';
  return new Date(value).toLocaleString();
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(state.authToken ? { Authorization: `Basic ${state.authToken}` } : {})
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    },
    ...options
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function setLoading(visible, title = 'Loading', copy = 'Please wait...') {
  state.loading = visible;
  els.loadingTitle.textContent = title;
  els.loadingCopy.textContent = copy;
  els.loadingOverlay.classList.toggle('hidden', !visible);
  document.body.classList.toggle('is-loading', visible);
}

function setLoginError(message = '') {
  els.loginError.textContent = message;
  els.loginError.classList.toggle('hidden', !message);
}

function setDashboardVisible(visible) {
  els.loginCard.classList.toggle('hidden', visible);
  els.dashboard.classList.toggle('hidden', !visible);
}

function buildAuthToken(username, password) {
  return window.btoa(`${username}:${password}`);
}

function getSelectedTournament() {
  const tournaments = state.overview?.tournaments ?? [];
  const apiSelected = state.overview?.selectedTournament;
  if (apiSelected && String(apiSelected.id) === String(state.selectedTournamentId || apiSelected.id)) {
    return apiSelected;
  }

  const byId = tournaments.find((entry) => String(entry.id) === String(state.selectedTournamentId));
  if (byId) {
    return byId;
  }

  const withTeams = tournaments.find((entry) => Number(entry.team_count ?? 0) > 0) || null;
  return withTeams || tournaments[0] || apiSelected || null;
}

function setSelectedTournamentId(id) {
  state.selectedTournamentId = id ? String(id) : '';
  if (state.selectedTournamentId) {
    localStorage.setItem(SELECTED_TOURNAMENT_KEY, state.selectedTournamentId);
  } else {
    localStorage.removeItem(SELECTED_TOURNAMENT_KEY);
  }
}

function renderSummary(summary) {
  const tournamentCount = String(summary.tournamentCount ?? 0);
  const teamCount = String(summary.teamCount ?? 0);
  const playerCount = String(summary.playerCount ?? 0);
  const matchCount = String(summary.matchCount ?? 0);

  els.tourneyCount.textContent = tournamentCount;
  els.teamCount.textContent = teamCount;
  els.playerCount.textContent = playerCount;
  els.matchCount.textContent = matchCount;

  if (els.tourneyCountHero) els.tourneyCountHero.textContent = tournamentCount;
  if (els.teamCountHero) els.teamCountHero.textContent = teamCount;
  if (els.playerCountHero) els.playerCountHero.textContent = playerCount;
  if (els.matchCountHero) els.matchCountHero.textContent = matchCount;
}

function populateTournamentForm(tournament) {
  if (!tournament) return;
  state.editingTournamentId = String(tournament.id);
  els.tournamentName.value = tournament.name ?? '';
  els.tournamentMode.value = tournament.mode ?? 'WOW';
  els.tournamentStatus.value = tournament.status ?? 'draft';
  els.tournamentStartAt.value = formatDateInput(tournament.start_at);
  els.tournamentNotes.value = tournament.notes ?? '';
  const button = els.createTournamentForm.querySelector('button[type="submit"]');
  if (button) button.textContent = 'Save tournament';
}

function resetTournamentForm() {
  state.editingTournamentId = '';
  els.createTournamentForm.reset();
  els.tournamentMode.value = 'WOW';
  els.tournamentStatus.value = 'draft';
  const button = els.createTournamentForm.querySelector('button[type="submit"]');
  if (button) button.textContent = 'Create tournament';
}

function renderTournamentList(tournaments) {
  if (!tournaments.length) {
    els.tournamentList.innerHTML = '<p class="muted">No tournaments yet. Create the first one above.</p>';
    return;
  }

  els.tournamentList.innerHTML = tournaments
    .map(
      (tournament) => `
        <div class="entity-card ${String(tournament.id) === String(state.selectedTournamentId) ? 'selected' : ''}" data-tournament-id="${tournament.id}">
          <div class="entity-card-head">
            <div>
              <strong>${escapeHtml(tournament.name)}</strong>
              <p class="muted">${escapeHtml(tournament.mode)} • ${escapeHtml(tournament.status)}</p>
            </div>
            <div class="entity-card-actions">
              <button type="button" class="ghost-button select-tournament-button" data-select-tournament="${tournament.id}">Open</button>
              <button type="button" class="ghost-button edit-tournament-button" data-edit-tournament="${tournament.id}">Edit</button>
            </div>
          </div>
          <div class="entity-meta">
            <span>${escapeHtml(tournament.team_count)} teams</span>
            <span>${escapeHtml(tournament.player_count)} players</span>
            <span>${escapeHtml(tournament.match_count)} matches</span>
            <span>${escapeHtml(formatDate(tournament.created_at))}</span>
          </div>
          ${
            Number(tournament.team_count ?? 0) > 0
              ? `<div class="entity-preview">
                  ${(state.overview?.selectedTournament?.id === tournament.id ? state.overview.selectedTournament.teams : []).length
                    ? state.overview.selectedTournament.teams
                        .map(
                          (team) => `<span class="preview-pill">${escapeHtml(team.name)}${team.tag ? ` • ${escapeHtml(team.tag)}` : ''}</span>`
                        )
                        .join('')
                    : ''}
                </div>`
              : ''
          }
        </div>
      `
    )
    .join('');

  els.tournamentList.querySelectorAll('[data-select-tournament]').forEach((button) => {
    button.addEventListener('click', async () => {
      setSelectedTournamentId(button.dataset.selectTournament);
      await loadOverview();
    });
  });

  els.tournamentList.querySelectorAll('[data-edit-tournament]').forEach((button) => {
    button.addEventListener('click', async () => {
      const tournament = tournaments.find((entry) => String(entry.id) === String(button.dataset.editTournament));
      if (!tournament) return;
      setSelectedTournamentId(tournament.id);
      populateTournamentForm(tournament);
      await loadOverview();
    });
  });
}

function renderTeamSelectOptions(teams) {
  const options = ['<option value="">No team</option>']
    .concat(teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`))
    .join('');
  els.playerTeam.innerHTML = options;
  els.matchTeamA.innerHTML = options;
  els.matchTeamB.innerHTML = options;
  els.matchWinner.innerHTML = '<option value="">No winner</option>' + teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join('');
}

function renderTeams(teams, tournamentId) {
  if (!tournamentId) {
    els.teamList.innerHTML = '<p class="muted">Create or open a tournament to manage teams.</p>';
    return;
  }

  if (!teams.length) {
    els.teamList.innerHTML = '<p class="muted">No teams yet. Add the first team above.</p>';
    return;
  }

  els.teamList.innerHTML = teams
    .map(
      (team) => `
        <form class="entity-card entity-form" data-team-id="${team.id}">
          <div class="entity-card-head">
            <div>
              <strong>${escapeHtml(team.name)}</strong>
              <p class="muted">${escapeHtml(team.tag || 'No tag')} • ${escapeHtml(team.captain_name || 'No captain')}</p>
            </div>
            <button type="button" class="danger-button" data-delete-team="${team.id}">Delete</button>
          </div>
          <div class="entity-edit-grid">
            <input name="name" value="${escapeHtml(team.name)}" placeholder="Team name" />
            <input name="tag" value="${escapeHtml(team.tag)}" placeholder="Tag" />
            <input name="captainName" value="${escapeHtml(team.captain_name)}" placeholder="Captain" />
            <input name="color" value="${escapeHtml(team.color)}" placeholder="Color" />
          </div>
          <div class="entity-actions">
            <button type="submit">Save team</button>
          </div>
        </form>
      `
    )
    .join('');

  els.teamList.querySelectorAll('form[data-team-id]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = form.dataset.teamId;
      const payload = {
        action: 'updateTeam',
        id,
        name: form.elements.name.value,
        tag: form.elements.tag.value,
        captainName: form.elements.captainName.value,
        color: form.elements.color.value
      };
      await mutate(payload, 'Team saved', 'Reloading teams...');
    });
  });

  els.teamList.querySelectorAll('[data-delete-team]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this team? Players and matches will keep their rows, but the team reference will be cleared.')) {
        return;
      }
      await mutate({ action: 'deleteTeam', id: button.dataset.deleteTeam }, 'Team deleted', 'Reloading teams...');
    });
  });
}

function renderPlayers(players, teams, tournamentId) {
  if (!tournamentId) {
    els.playerList.innerHTML = '<p class="muted">Create or open a tournament to manage players.</p>';
    return;
  }

  if (!players.length) {
    els.playerList.innerHTML = '<p class="muted">No players yet. Add the first player above.</p>';
    return;
  }

  const teamOptions = ['<option value="">No team</option>']
    .concat(teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`))
    .join('');

  els.playerList.innerHTML = players
    .map(
      (player) => `
        <form class="entity-card entity-form" data-player-id="${player.id}">
          <div class="entity-card-head">
            <div>
              <strong>${escapeHtml(player.ign)}</strong>
              <p class="muted">${escapeHtml(player.team_name || 'Unassigned')} • ${escapeHtml(player.role || 'Player')}</p>
            </div>
            <button type="button" class="danger-button" data-delete-player="${player.id}">Delete</button>
          </div>
          <div class="entity-edit-grid">
            <input name="ign" value="${escapeHtml(player.ign)}" placeholder="IGN" />
            <select name="teamId">${teamOptions}</select>
            <input name="role" value="${escapeHtml(player.role || 'Player')}" placeholder="Role" />
            <label class="toggle-field">
              <input name="isActive" type="checkbox" ${player.is_active ? 'checked' : ''} />
              <span>Active</span>
            </label>
          </div>
          <div class="entity-actions">
            <button type="submit">Save player</button>
          </div>
        </form>
      `
    )
    .join('');

  els.playerList.querySelectorAll('form[data-player-id]').forEach((form) => {
    const playerId = form.dataset.playerId;
    const teamSelect = form.elements.teamId;
    teamSelect.value = players.find((player) => String(player.id) === String(playerId))?.team_id ?? '';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await mutate(
        {
          action: 'updatePlayer',
          id: playerId,
          ign: form.elements.ign.value,
          teamId: form.elements.teamId.value,
          role: form.elements.role.value,
          isActive: form.elements.isActive.checked
        },
        'Player saved',
        'Reloading players...'
      );
    });
  });

  els.playerList.querySelectorAll('[data-delete-player]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this player from the tournament?')) {
        return;
      }
      await mutate({ action: 'deletePlayer', id: button.dataset.deletePlayer }, 'Player deleted', 'Reloading players...');
    });
  });
}

function renderMatches(matches, teams, players, tournamentId) {
  if (!tournamentId) {
    els.matchList.innerHTML = '<p class="muted">Create or open a tournament to manage matches.</p>';
    return;
  }

  if (!matches.length) {
    els.matchList.innerHTML = '<p class="muted">No matches yet. Schedule the first match above.</p>';
    return;
  }

  const teamOptions = ['<option value="">No team</option>']
    .concat(teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`))
    .join('');

  els.matchList.innerHTML = matches
    .map(
      (match) => `
        <form class="entity-card entity-form" data-match-id="${match.id}">
          <div class="entity-card-head">
            <div>
              <strong>Match #${escapeHtml(match.match_no)}</strong>
              <p class="muted">${escapeHtml(match.round_name)} • ${escapeHtml(match.status)}</p>
              <p class="muted">${escapeHtml(match.team_a_name || 'No team')} vs ${escapeHtml(match.team_b_name || 'No team')}</p>
            </div>
            <button type="button" class="danger-button" data-delete-match="${match.id}">Delete</button>
          </div>
          <div class="entity-edit-grid match-edit-grid">
            <input name="matchNo" type="number" min="1" value="${escapeHtml(match.match_no)}" />
            <input name="roundName" value="${escapeHtml(match.round_name)}" placeholder="Round / stage" />
            <select name="teamAId">${teamOptions}</select>
            <select name="teamBId">${teamOptions}</select>
            <input name="roomCode" value="${escapeHtml(match.room_code)}" placeholder="Room code" />
            <input name="scheduledAt" type="datetime-local" value="${escapeHtml(formatDateInput(match.scheduled_at))}" />
            <select name="status">
              <option value="scheduled" ${match.status === 'scheduled' ? 'selected' : ''}>scheduled</option>
              <option value="live" ${match.status === 'live' ? 'selected' : ''}>live</option>
              <option value="finished" ${match.status === 'finished' ? 'selected' : ''}>finished</option>
            </select>
            <input name="teamAScore" type="number" value="${match.team_a_score ?? ''}" placeholder="Score A" />
            <input name="teamBScore" type="number" value="${match.team_b_score ?? ''}" placeholder="Score B" />
            <select name="winnerTeamId">${['<option value="">No winner</option>']
              .concat(teams.map((team) => `<option value="${team.id}" ${String(team.id) === String(match.winner_team_id) ? 'selected' : ''}>${escapeHtml(team.name)}</option>`))
              .join('')}</select>
            <input name="notes" value="${escapeHtml(match.notes)}" placeholder="Notes" />
          </div>
          <div class="match-stats-block">
            <div class="match-stats-head">
              <strong>Player stats</strong>
              <span class="muted">Kills, damage, MVP</span>
            </div>
            <div class="match-stats-grid" data-match-stats></div>
          </div>
          <div class="entity-actions">
            <button type="submit">Save match</button>
          </div>
        </form>
      `
    )
    .join('');

  els.matchList.querySelectorAll('form[data-match-id]').forEach((form) => {
    const matchId = form.dataset.matchId;
    const match = matches.find((entry) => String(entry.id) === String(matchId));
    if (match) {
      form.elements.teamAId.value = match.team_a_id ?? '';
      form.elements.teamBId.value = match.team_b_id ?? '';
      form.elements.winnerTeamId.value = match.winner_team_id ?? '';
    }
    const refreshStats = () => renderMatchStats(form, match, teams, tournamentId);
    form.elements.teamAId.addEventListener('change', refreshStats);
    form.elements.teamBId.addEventListener('change', refreshStats);
    refreshStats();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await mutate(
        {
          action: 'updateMatch',
          id: matchId,
          matchNo: form.elements.matchNo.value,
          roundName: form.elements.roundName.value,
          teamAId: form.elements.teamAId.value,
          teamBId: form.elements.teamBId.value,
          roomCode: form.elements.roomCode.value,
          scheduledAt: form.elements.scheduledAt.value,
          status: form.elements.status.value,
          teamAScore: form.elements.teamAScore.value,
          teamBScore: form.elements.teamBScore.value,
          winnerTeamId: form.elements.winnerTeamId.value,
          notes: form.elements.notes.value,
          stats: collectMatchStats(form)
        },
        'Match saved',
        'Reloading matches...'
      );
    });
  });

  els.matchList.querySelectorAll('[data-delete-match]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this match?')) {
        return;
      }
      await mutate({ action: 'deleteMatch', id: button.dataset.deleteMatch }, 'Match deleted', 'Reloading matches...');
    });
  });
}

function getPlayersForTeam(players, teamId) {
  if (!teamId) return [];
  return players.filter((player) => String(player.team_id) === String(teamId));
}

function collectMatchStats(form) {
  return [...form.querySelectorAll('[data-stat-row]')].map((row) => ({
    playerId: row.dataset.playerId,
    playerName: row.dataset.playerName,
    teamId: row.dataset.teamId,
    teamName: row.dataset.teamName,
    kills: row.querySelector('[data-stat-kills]')?.value ?? 0,
    damage: row.querySelector('[data-stat-damage]')?.value ?? 0,
    isMvp: row.querySelector('[data-stat-mvp]')?.checked ?? false
  }));
}

function renderMatchStats(form, match, teams, tournamentId) {
  const container = form.querySelector('[data-match-stats]');
  if (!container) return;

  const overviewPlayers = state.overview?.selectedTournament?.players || [];
  const currentTeamAId = form.elements.teamAId.value || match?.team_a_id || '';
  const currentTeamBId = form.elements.teamBId.value || match?.team_b_id || '';
  const teamA = teams.find((team) => String(team.id) === String(currentTeamAId)) || null;
  const teamB = teams.find((team) => String(team.id) === String(currentTeamBId)) || null;
  const selectedPlayers = [
    ...getPlayersForTeam(overviewPlayers, currentTeamAId),
    ...getPlayersForTeam(overviewPlayers, currentTeamBId)
  ];

  const savedStats = new Map(
    (match?.player_stats ?? []).map((stat) => [String(stat.player_id), stat])
  );
  const draftStats = new Map(
    collectMatchStats(form).map((stat) => [String(stat.playerId), stat])
  );
  const savedRows = [...savedStats.values()];

  const renderSavedSummary = () => {
    if (!savedRows.length) {
      return '<p class="muted match-stats-summary-empty">Saved player stats will appear here after you click Save match.</p>';
    }

    return `
      <div class="match-stats-summary">
        <div class="match-stats-summary-head">
          <strong>Saved player stats</strong>
          <span class="muted">${savedRows.length} players recorded</span>
        </div>
        <div class="match-stats-summary-grid">
          ${savedRows
            .map(
              (entry) => `
                <div class="match-stats-summary-item">
                  <div class="match-stats-summary-item-head">
                    <strong>${escapeHtml(entry.player_name || entry.playerName || 'Player')}</strong>
                    <span>${entry.is_mvp || entry.isMvp ? 'MVP' : 'No MVP'}</span>
                  </div>
                  <span>${escapeHtml(entry.team_name || entry.teamName || 'No team')}</span>
                  <span>${Number(entry.kills ?? 0)} kills</span>
                  <span>${Number(entry.damage ?? 0)} damage</span>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    `;
  };

  if (!selectedPlayers.length) {
    container.innerHTML = `<p class="muted">Assign players to Team A and Team B to start entering kills, damage, and MVP.</p>${renderSavedSummary()}`;
    return;
  }

  container.innerHTML = selectedPlayers
    .map((player) => {
      const team = String(player.team_id) === String(teamA?.id)
        ? teamA
        : String(player.team_id) === String(teamB?.id)
          ? teamB
          : null;
      const draft = draftStats.get(String(player.id)) || {};
      const saved = savedStats.get(String(player.id)) || {};
      const chosen = Object.keys(saved).length ? saved : draft;
      return `
        <div class="match-stat-row ${Object.keys(saved).length ? 'saved' : ''}" data-stat-row data-player-id="${player.id}" data-player-name="${escapeHtml(player.ign)}" data-team-id="${escapeHtml(player.team_id ?? '')}" data-team-name="${escapeHtml(team?.name || player.team_name || '')}">
          <div class="match-stat-player">
            <strong>${escapeHtml(player.ign)}</strong>
            <span class="muted">${escapeHtml(team?.name || player.team_name || 'No team')}</span>
          </div>
          <label class="match-stat-field">
            <span>Kills</span>
            <input data-stat-kills type="number" min="0" value="${escapeHtml(chosen.kills ?? 0)}" />
          </label>
          <label class="match-stat-field">
            <span>Damage</span>
            <input data-stat-damage type="number" min="0" value="${escapeHtml(chosen.damage ?? 0)}" />
          </label>
          <label class="toggle-field match-mvp-field">
            <input data-stat-mvp type="checkbox" ${chosen.is_mvp || chosen.isMvp ? 'checked' : ''} />
            <span>MVP</span>
          </label>
        </div>
      `;
    })
    .join('') + renderSavedSummary();

  container.querySelectorAll('[data-stat-row]').forEach((row) => {
    row.querySelector('[data-stat-kills]')?.addEventListener('input', () => {
      row.classList.add('dirty');
    });
    row.querySelector('[data-stat-damage]')?.addEventListener('input', () => {
      row.classList.add('dirty');
    });
    row.querySelector('[data-stat-mvp]')?.addEventListener('change', () => {
      row.classList.add('dirty');
    });
  });
}

function buildTournamentInsights(selected) {
  const teams = selected?.teams ?? [];
  const players = selected?.players ?? [];
  const matches = selected?.matches ?? [];
  const teamsById = new Map(teams.map((team) => [String(team.id), team]));

  const roundMap = new Map();
  for (const match of matches) {
    const roundName = match.round_name || 'Round';
    if (!roundMap.has(roundName)) {
      roundMap.set(roundName, {
        roundName,
        matches: [],
        scheduled: 0,
        live: 0,
        finished: 0
      });
    }
    const bucket = roundMap.get(roundName);
    bucket.matches.push(match);
    bucket[match.status] = (bucket[match.status] || 0) + 1;
  }

  const leaderMap = new Map();
  for (const team of teams) {
    leaderMap.set(String(team.id), {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      scored: 0,
      conceded: 0
    });
  }

  for (const match of matches) {
    const teamA = leaderMap.get(String(match.team_a_id));
    const teamB = leaderMap.get(String(match.team_b_id));
    const scoreA = Number(match.team_a_score);
    const scoreB = Number(match.team_b_score);
    const hasScores = Number.isFinite(scoreA) && Number.isFinite(scoreB);
    const finished = match.status === 'finished' || hasScores;
    if (!teamA || !teamB || !finished) {
      continue;
    }

    teamA.played += 1;
    teamB.played += 1;
    teamA.scored += scoreA;
    teamA.conceded += scoreB;
    teamB.scored += scoreB;
    teamB.conceded += scoreA;

    if (scoreA > scoreB) {
      teamA.wins += 1;
      teamA.points += 3;
      teamB.losses += 1;
    } else if (scoreB > scoreA) {
      teamB.wins += 1;
      teamB.points += 3;
      teamA.losses += 1;
    } else {
      teamA.draws += 1;
      teamB.draws += 1;
      teamA.points += 1;
      teamB.points += 1;
    }
  }

  const leaderboard = [...leaderMap.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aDiff = a.scored - a.conceded;
    const bDiff = b.scored - b.conceded;
    if (bDiff !== aDiff) return bDiff - aDiff;
    if (b.scored !== a.scored) return b.scored - a.scored;
    return a.team.name.localeCompare(b.team.name);
  });

  const playerProfiles = players.map((player) => ({
    ...player,
    team: player.team_id ? teamsById.get(String(player.team_id)) || null : null
  }));

  const certificates = players.map((player) => {
    const team = player.team_id ? teamsById.get(String(player.team_id)) || null : null;
    return {
      player,
      team,
      title: selected?.status === 'completed' ? 'Tournament Certificate' : 'Participation Certificate',
      subtitle: team ? `Representing ${team.name}` : 'Independent roster slot',
      code: `PTS-${String(selected?.id ?? '0').padStart(3, '0')}-${String(player.id).padStart(3, '0')}`
    };
  });

  return {
    roundHistory: [...roundMap.values()].sort((a, b) => a.roundName.localeCompare(b.roundName)),
    playerProfiles,
    certificates,
    leaderboard
  };
}

function renderRoundHistory(roundHistory) {
  els.roundHistoryCount.textContent = `${roundHistory.length} rounds`;
  if (!roundHistory.length) {
    els.roundHistoryList.innerHTML = '<p class="muted">No rounds yet. Schedule matches to build history.</p>';
    return;
  }

  els.roundHistoryList.innerHTML = roundHistory
    .map(
      (round) => `
        <div class="insight-row">
          <div class="insight-row-head">
            <strong>${escapeHtml(round.roundName)}</strong>
            <span class="muted">${round.matches.length} matches</span>
          </div>
          <div class="insight-badges">
            <span class="preview-pill">${round.scheduled || 0} scheduled</span>
            <span class="preview-pill">${round.live || 0} live</span>
            <span class="preview-pill">${round.finished || 0} finished</span>
          </div>
          <div class="insight-mini-list">
            ${round.matches
              .map(
                (match) => `
                  <div class="insight-mini-item">
                    <span>Match #${escapeHtml(match.match_no)}</span>
                    <span>${escapeHtml(match.team_a_name || 'No team')} vs ${escapeHtml(match.team_b_name || 'No team')}</span>
                    <span class="muted">${escapeHtml(match.status)}</span>
                  </div>
                `
              )
              .join('')}
          </div>
        </div>
      `
    )
    .join('');
}

function renderPlayerProfiles(playerProfiles) {
  els.playerProfileCount.textContent = `${playerProfiles.length} players`;
  if (!playerProfiles.length) {
    els.playerProfileList.innerHTML = '<p class="muted">No players yet. Add roster entries to build profiles.</p>';
    return;
  }

  els.playerProfileList.innerHTML = playerProfiles
    .map(
      (player) => `
        <div class="insight-row">
          <div class="insight-row-head">
            <strong>${escapeHtml(player.ign)}</strong>
            <span class="muted">${escapeHtml(player.role || 'Player')}</span>
          </div>
          <div class="insight-badges">
            <span class="preview-pill">${escapeHtml(player.team?.name || 'No team')}</span>
            <span class="preview-pill">${player.is_active ? 'Active' : 'Inactive'}</span>
            ${player.team?.tag ? `<span class="preview-pill">${escapeHtml(player.team.tag)}</span>` : ''}
          </div>
          <div class="insight-copy">
            Joined ${escapeHtml(formatDate(player.created_at))}${player.team?.captain_name ? ` • Captain ${escapeHtml(player.team.captain_name)}` : ''}
          </div>
        </div>
      `
    )
    .join('');
}

function renderCertificates(certificates, tournament) {
  els.certificateCount.textContent = `${certificates.length} certificates`;
  if (!certificates.length) {
    els.certificateList.innerHTML = '<p class="muted">No certificates yet. Add players to generate participant certificates.</p>';
    return;
  }

  els.certificateList.innerHTML = certificates
    .map(
      (entry) => `
        <div class="certificate-card">
          <div class="certificate-top">
            <div>
              <strong>${escapeHtml(entry.title)}</strong>
              <p class="muted">${escapeHtml(tournament?.name || 'Tournament')}</p>
            </div>
            <span class="preview-pill">${escapeHtml(entry.code)}</span>
          </div>
          <div class="certificate-name">${escapeHtml(entry.player.ign)}</div>
          <div class="certificate-subtitle">${escapeHtml(entry.subtitle)}</div>
          <div class="certificate-foot">
            <span>${escapeHtml(entry.team?.name || 'No team')}</span>
            <span>${escapeHtml(entry.player.role || 'Player')}</span>
          </div>
        </div>
      `
    )
    .join('');
}

function renderLeaderboard(leaderboard) {
  els.leaderboardCount.textContent = `${leaderboard.length} teams`;
  if (!leaderboard.length) {
    els.leaderboardList.innerHTML = '<p class="muted">No teams yet. Add teams and finish matches to calculate standings.</p>';
    return;
  }

  els.leaderboardList.innerHTML = leaderboard
    .map(
      (entry, index) => {
        const diff = entry.scored - entry.conceded;
        return `
          <div class="leader-row">
            <div class="leader-rank">${index + 1}</div>
            <div class="leader-name">
              <strong>${escapeHtml(entry.team.name)}</strong>
              <span class="muted">${escapeHtml(entry.team.captain_name || 'No captain')}</span>
            </div>
            <div class="leader-stats">
              <span>${entry.played} played</span>
              <span>${entry.wins}W ${entry.draws}D ${entry.losses}L</span>
              <span>${entry.points} pts</span>
              <span>${diff >= 0 ? '+' : ''}${diff} diff</span>
            </div>
          </div>
        `;
      }
    )
    .join('');
}

function renderInsights(selected) {
  const insights = buildTournamentInsights(selected);
  renderRoundHistory(insights.roundHistory);
  renderPlayerProfiles(insights.playerProfiles);
  renderCertificates(insights.certificates, selected);
  renderLeaderboard(insights.leaderboard);
}

function renderDashboard(overview) {
  state.overview = overview;
  const selected = getSelectedTournament();

  renderSummary(overview.summary);
  renderTournamentList(overview.tournaments || []);
  renderTeamSelectOptions(selected?.teams || []);
  renderTeams(selected?.teams || [], selected?.id || null);
  renderPlayers(selected?.players || [], selected?.teams || [], selected?.id || null);
  renderMatches(selected?.matches || [], selected?.teams || [], selected?.players || [], selected?.id || null);
  renderInsights(selected);

  if (!selected) {
    els.playerTeam.innerHTML = '<option value="">No team</option>';
    els.matchTeamA.innerHTML = '<option value="">No team</option>';
    els.matchTeamB.innerHTML = '<option value="">No team</option>';
    els.matchWinner.innerHTML = '<option value="">No winner</option>';
    els.roundHistoryList.innerHTML = '<p class="muted">No rounds yet. Schedule matches to build history.</p>';
    els.playerProfileList.innerHTML = '<p class="muted">No players yet. Add roster entries to build profiles.</p>';
    els.certificateList.innerHTML = '<p class="muted">No certificates yet. Add players to generate participant certificates.</p>';
    els.leaderboardList.innerHTML = '<p class="muted">No teams yet. Add teams and finish matches to calculate standings.</p>';
  }
}

async function loadOverview() {
  setLoading(true, 'Loading tourney', 'Fetching tournaments, teams, players, and matches...');
  try {
    const cacheBuster = `&_ts=${Date.now()}`;
    const query = state.selectedTournamentId
      ? `?tournamentId=${encodeURIComponent(state.selectedTournamentId)}${cacheBuster}`
      : `?${cacheBuster.slice(1)}`;
    const data = await api(`/api/tourney${query}`);
    const tournaments = data.tournaments || [];
    const selectedStillExists = tournaments.some((entry) => String(entry.id) === String(state.selectedTournamentId));
    if (!selectedStillExists) {
      setSelectedTournamentId(data.selectedTournamentId || tournaments[0]?.id || '');
    }
    state.overview = data;
    setDashboardVisible(true);
    renderDashboard(data);
  } finally {
    setLoading(false);
  }
}

async function mutate(payload, successTitle = 'Saved', loadingCopy = 'Applying changes...') {
  setLoading(true, successTitle, loadingCopy);
  try {
    const result = await api('/api/tourney', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (payload.action === 'createTournament' && result?.item?.id) {
      setSelectedTournamentId(result.item.id);
    }
    await loadOverview();
    return true;
  } catch (error) {
    alert(error.message);
    return false;
  } finally {
    setLoading(false);
  }
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

  state.authToken = buildAuthToken(username, password);
  localStorage.setItem(AUTH_STORAGE_KEY, state.authToken);

  try {
    await loadOverview();
    els.password.value = '';
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    state.authToken = '';
    setDashboardVisible(false);
    setLoginError(error.message === 'Admin login required.' ? 'Invalid username or password.' : error.message);
  }
});

els.logoutButton.addEventListener('click', () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  state.authToken = '';
  setDashboardVisible(false);
});

els.refreshButton.addEventListener('click', () => {
  loadOverview().catch((error) => {
    if (error.message === 'Admin login required.') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      state.authToken = '';
      setDashboardVisible(false);
      setLoginError('Invalid username or password.');
      return;
    }
    alert(error.message);
  });
});

els.createTournamentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const action = state.editingTournamentId ? 'updateTournament' : 'createTournament';
  const payload = {
    action,
    name: els.tournamentName.value,
    mode: els.tournamentMode.value,
    status: els.tournamentStatus.value,
    startAt: els.tournamentStartAt.value,
    notes: els.tournamentNotes.value
  };

  if (state.editingTournamentId) {
    payload.id = state.editingTournamentId;
  }

  const ok = await mutate(
    payload,
    state.editingTournamentId ? 'Tournament updated' : 'Tournament created',
    state.editingTournamentId ? 'Saving tournament...' : 'Creating tournament...'
  );
  if (!ok) return;
  if (!state.editingTournamentId) {
    resetTournamentForm();
  }
});

els.createTeamForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = getSelectedTournament();
  if (!selected) {
    alert('Create or open a tournament first.');
    return;
  }

  const ok = await mutate(
    {
      action: 'createTeam',
      tournamentId: selected.id,
      name: els.teamName.value,
      tag: els.teamTag.value,
      captainName: els.teamCaptain.value,
      color: els.teamColor.value
    },
    'Team created',
    'Adding team...'
  );
  if (!ok) return;
  els.createTeamForm.reset();
});

els.createPlayerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = getSelectedTournament();
  if (!selected) {
    alert('Create or open a tournament first.');
    return;
  }

  const ok = await mutate(
    {
      action: 'createPlayer',
      tournamentId: selected.id,
      ign: els.playerIgn.value,
      teamId: els.playerTeam.value,
      role: els.playerRole.value,
      isActive: els.playerActive.checked
    },
    'Player created',
    'Adding player...'
  );
  if (!ok) return;
  els.createPlayerForm.reset();
  els.playerTeam.value = '';
  els.playerActive.checked = true;
  els.playerRole.value = 'Player';
});

els.createMatchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = getSelectedTournament();
  if (!selected) {
    alert('Create or open a tournament first.');
    return;
  }

  const ok = await mutate(
    {
      action: 'createMatch',
      tournamentId: selected.id,
      matchNo: els.matchNo.value,
      roundName: els.matchRound.value,
      teamAId: els.matchTeamA.value,
      teamBId: els.matchTeamB.value,
      roomCode: els.matchRoomCode.value,
      scheduledAt: els.matchScheduledAt.value,
      status: els.matchStatus.value,
      teamAScore: els.matchTeamAScore.value,
      teamBScore: els.matchTeamBScore.value,
      winnerTeamId: els.matchWinner.value,
      notes: els.matchNotes.value
    },
    'Match created',
    'Scheduling match...'
  );
  if (!ok) return;
  els.createMatchForm.reset();
  els.matchRound.value = 'Group Stage';
  els.matchNo.value = '1';
  els.matchStatus.value = 'scheduled';
  els.matchTeamA.value = '';
  els.matchTeamB.value = '';
  els.matchWinner.value = '';
});

async function boot() {
  if (!state.authToken) {
    setDashboardVisible(false);
    return;
  }

  try {
    await loadOverview();
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    state.authToken = '';
    setDashboardVisible(false);
    setLoginError(error.message === 'Admin login required.' ? 'Invalid username or password.' : error.message);
  }
}

startMeshBackground(document.getElementById('meshBackground'), {
  pointCount: 62,
  maxDistance: 175,
  background: '#05070d',
  pointColor: 'rgba(150, 214, 255, 0.92)',
  lineRgb: '88, 170, 255',
  glowColor: 'rgba(74, 134, 255, 0.12)'
});

boot().catch((error) => {
  setLoginError(error.message);
});
