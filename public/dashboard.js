import { startMeshBackground } from './background.js';

const API_BASE =
  window.location.port === '5500'
    ? 'http://127.0.0.1:3000'
    : window.location.origin;

const els = {
  featuredTournamentName: document.getElementById('featuredTournamentName'),
  featuredTournamentNotes: document.getElementById('featuredTournamentNotes'),
  featuredTeamCount: document.getElementById('featuredTeamCount'),
  featuredPlayerCount: document.getElementById('featuredPlayerCount'),
  featuredMatchCount: document.getElementById('featuredMatchCount'),
  featuredFinishedCount: document.getElementById('featuredFinishedCount'),
  featuredMode: document.getElementById('featuredMode'),
  featuredStatus: document.getElementById('featuredStatus'),
  activeTournamentList: document.getElementById('activeTournamentList'),
  leaderboardList: document.getElementById('leaderboardList'),
  playerStatsList: document.getElementById('playerStatsList'),
  matchResultsList: document.getElementById('matchResultsList'),
  recentActivityList: document.getElementById('recentActivityList'),
  mvpHighlightCard: document.getElementById('mvpHighlightCard'),
  dashboardLoadingOverlay: document.getElementById('dashboardLoadingOverlay'),
  dashboardLoadingTitle: document.getElementById('dashboardLoadingTitle'),
  dashboardLoadingCopy: document.getElementById('dashboardLoadingCopy'),
  footerServerTime: document.getElementById('footerServerTime')
};

function setText(element, value) {
  if (element) element.textContent = value;
}

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

function setLoading(visible, title = 'Loading', copy = 'Please wait...') {
  if (els.dashboardLoadingTitle) els.dashboardLoadingTitle.textContent = title;
  if (els.dashboardLoadingCopy) els.dashboardLoadingCopy.textContent = copy;
  if (els.dashboardLoadingOverlay) els.dashboardLoadingOverlay.classList.toggle('hidden', !visible);
  document.body.classList.toggle('is-loading', visible);
}

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Draw a sparkline showing the team form trend over the tournament matches
function drawSparkline(canvas, dataPoints) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Set display size based on screen pixel density (HiDPI)
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  
  ctx.clearRect(0, 0, width, height);

  if (dataPoints.length < 2) {
    // Show static horizontal line for 1 match / initial state
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(244, 210, 106, 0.2)';
    ctx.lineWidth = 2;
    ctx.moveTo(2, height / 2);
    ctx.lineTo(width - 2, height / 2);
    ctx.stroke();
    return;
  }

  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const range = max - min || 1;

  // Render gradient background below curve
  ctx.beginPath();
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(244, 210, 106, 0.25)');
  grad.addColorStop(1, 'rgba(244, 210, 106, 0)');

  const points = dataPoints.map((val, idx) => {
    const x = (idx / (dataPoints.length - 1)) * (width - 8) + 4;
    const y = height - ((val - min) / range) * (height - 8) - 4;
    return { x, y };
  });

  // Plot line
  ctx.beginPath();
  ctx.strokeStyle = '#f4d26a';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  points.forEach((pt, idx) => {
    if (idx === 0) {
      ctx.moveTo(pt.x, pt.y);
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  });
  ctx.stroke();

  // Close path to draw gradient area
  ctx.lineTo(points[points.length - 1].x, height);
  ctx.lineTo(points[0].x, height);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw last point dot (active status dot)
  const lastPt = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(lastPt.x, lastPt.y, 3.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#ff4655'; // Vibrant red pulse dot
  ctx.fill();
  ctx.strokeStyle = '#07080d';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Compute cumulative win/loss form trend for each team
function getTeamFormTrend(matches, teams) {
  const sortedMatches = [...matches].sort((a, b) => a.match_no - b.match_no);
  const trends = {};
  
  teams.forEach((team) => {
    trends[team.id] = [0];
  });

  const runningForm = {};
  teams.forEach((team) => {
    runningForm[team.id] = 0;
  });

  sortedMatches.forEach((match) => {
    const scoreA = Number(match.team_a_score);
    const scoreB = Number(match.team_b_score);
    const hasScores = Number.isFinite(scoreA) && Number.isFinite(scoreB);
    const finished = match.status === 'finished' || hasScores;

    if (finished) {
      let deltaA = 0;
      let deltaB = 0;
      if (scoreA > scoreB) {
        deltaA = 1;
        deltaB = -1;
      } else if (scoreB > scoreA) {
        deltaA = -1;
        deltaB = 1;
      }

      if (runningForm[match.team_a_id] !== undefined) {
        runningForm[match.team_a_id] += deltaA;
      }
      if (runningForm[match.team_b_id] !== undefined) {
        runningForm[match.team_b_id] += deltaB;
      }
    }

    teams.forEach((team) => {
      trends[team.id].push(runningForm[team.id] ?? 0);
    });
  });

  return trends;
}

function renderActiveTournaments(activeTournaments, selectedTournamentId) {
  if (!els.activeTournamentList) return;
  if (!activeTournaments.length) {
    els.activeTournamentList.innerHTML = '<span class="muted">No active tournaments available.</span>';
    return;
  }

  els.activeTournamentList.innerHTML = '';
  activeTournaments.forEach((tournament) => {
    const isSelected = String(tournament.id) === String(selectedTournamentId);
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `selector-pill ${isSelected ? 'active' : ''}`;
    
    // Add status specific indicator
    const statusText = tournament.status === 'active' ? 'LIVE' : 'FINISHED';
    
    pill.innerHTML = `
      <span class="pill-name">${escapeHtml(tournament.name)}</span>
      <span class="pill-status ${tournament.status}">${statusText}</span>
    `;

    pill.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('tournamentId', String(tournament.id));
      window.location.href = url.toString();
    });

    els.activeTournamentList.appendChild(pill);
  });
}

function getRankBadge(rank) {
  const trophySvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="trophy-icon">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
      <path d="M4 22h16"></path>
      <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path>
      <path d="M12 2a4 4 0 0 1 4 4v7.3a4.8 4.8 0 0 1-8 0V6a4 4 0 0 1 4-4Z"></path>
    </svg>
  `;

  if (rank === 1) return `<span class="rank-badge gold-badge" title="Champion">${trophySvg}</span>`;
  if (rank === 2) return `<span class="rank-badge silver-badge" title="2nd Place">${trophySvg}</span>`;
  if (rank === 3) return `<span class="rank-badge bronze-badge" title="3rd Place">${trophySvg}</span>`;
  return `<span class="rank-badge normal-badge">${rank}</span>`;
}

function renderLeaderboard(leaderboard, matches, teams) {
  if (!els.leaderboardList) return;
  els.leaderboardList.innerHTML = '';
  
  if (!leaderboard.length) {
    els.leaderboardList.innerHTML = `
      <tr>
        <td colspan="9" class="text-center muted" style="padding: 40px 0;">
          No leaderboard statistics available. Execute matches in the hub to populate standings.
        </td>
      </tr>
    `;
    return;
  }

  const trends = getTeamFormTrend(matches || [], teams || []);
  
  leaderboard.forEach((entry, index) => {
    const row = document.createElement('tr');
    row.className = 'table-row-hover';
    
    const diff = entry.scored - entry.conceded;
    const diffSign = diff > 0 ? '+' : '';
    const diffClass = diff > 0 ? 'good-text' : (diff < 0 ? 'bad-text' : 'font-dim');
    
    row.innerHTML = `
      <td>
        <div class="rank-container">
          ${getRankBadge(index + 1)}
        </div>
      </td>
      <td>
        <div class="team-info-cell">
          <span class="team-tag">${escapeHtml(entry.team.tag || 'T')}</span>
          <div class="team-name-wrap">
            <strong class="team-name-text">${escapeHtml(entry.team.name)}</strong>
            <span class="team-captain">Capt: ${escapeHtml(entry.team.captain_name || 'N/A')}</span>
          </div>
        </div>
      </td>
      <td class="text-center font-numeric">${entry.played}</td>
      <td class="text-center font-numeric font-bold">${entry.wins}</td>
      <td class="text-center font-numeric font-dim">${entry.draws}</td>
      <td class="text-center font-numeric font-bold">${entry.losses}</td>
      <td class="text-center font-numeric ${diffClass}">${diffSign}${diff}</td>
      <td class="text-center">
        <canvas class="sparkline-canvas" style="width: 80px; height: 24px;" data-team-id="${entry.team.id}"></canvas>
      </td>
      <td class="text-right font-numeric font-gold font-bold">${entry.points}</td>
    `;

    els.leaderboardList.appendChild(row);

    // Render sparkline onto canvas
    const canvas = row.querySelector('.sparkline-canvas');
    const teamTrend = trends[entry.team.id] || [0];
    setTimeout(() => drawSparkline(canvas, teamTrend), 0);
  });
}

function renderPlayerStats(playerStats) {
  if (!els.playerStatsList) return;
  els.playerStatsList.innerHTML = '';
  
  if (!playerStats.length) {
    els.playerStatsList.innerHTML = `
      <tr>
        <td colspan="7" class="text-center muted" style="padding: 40px 0;">
          No player performance telemetry recorded yet.
        </td>
      </tr>
    `;
    return;
  }

  playerStats.slice(0, 10).forEach((entry, index) => {
    const row = document.createElement('tr');
    row.className = 'table-row-hover';

    const rankClass = index < 3 ? 'top-three-rank' : '';
    
    row.innerHTML = `
      <td>
        <div class="player-rank-container">
          <span class="player-rank-num ${rankClass}">${index + 1}</span>
        </div>
      </td>
      <td>
        <div class="player-name-cell">
          <strong class="player-name-text">${escapeHtml(entry.player_name)}</strong>
        </div>
      </td>
      <td>
        <span class="player-team-tag">${escapeHtml(entry.team_name || 'Free Agent')}</span>
      </td>
      <td class="text-center font-numeric font-dim">${entry.matches_played}</td>
      <td class="text-center font-numeric font-highlight font-bold">${entry.kills}</td>
      <td class="text-center font-numeric font-dim">${entry.damage}</td>
      <td class="text-center font-numeric">
        ${entry.mvps > 0 ? `<span class="mvp-capsule">${entry.mvps} MVP</span>` : `<span class="font-dim">-</span>`}
      </td>
    `;
    els.playerStatsList.appendChild(row);
  });
}

function renderMatchResults(matchResults, teams = []) {
  if (!els.matchResultsList) return;
  els.matchResultsList.innerHTML = '';
  
  if (!matchResults?.length) {
    els.matchResultsList.innerHTML = '<div class="empty-state">No matches played yet.</div>';
    return;
  }

  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.id] = team;
  });

  els.matchResultsList.innerHTML = matchResults
    .slice()
    .reverse()
    .slice(0, 4)
    .map((match) => {
      const isFinished = match.status === 'finished';
      const statusClass = isFinished ? 'status-finished' : 'status-live';
      const statusLabel = isFinished ? 'FINISHED' : 'LIVE';

      const teamA = teamMap[match.team_a_id] || {};
      const teamB = teamMap[match.team_b_id] || {};
      const tagA = teamA.tag || 'T';
      const tagB = teamB.tag || 'T';

      const scoreA = match.team_a_score;
      const scoreB = match.team_b_score;
      const hasScores = scoreA !== null && scoreB !== null;

      const isTeamAWinner = match.winner_team_name === match.team_a_name || (hasScores && scoreA > scoreB);
      const isTeamBWinner = match.winner_team_name === match.team_b_name || (hasScores && scoreB > scoreA);

      let topPlayerInfo = '';
      if (match.player_stats?.length) {
        const topMatchPlayer = [...match.player_stats].sort(
          (a, b) => b.kills - a.kills || b.damage - a.damage
        )[0];
        if (topMatchPlayer) {
          topPlayerInfo = `
            <div class="match-mvp-strip">
              <span class="mvp-label">Match MVP:</span>
              <span class="mvp-name">${escapeHtml(topMatchPlayer.player_name)}</span>
              <span class="mvp-stats">(${topMatchPlayer.kills}K / ${topMatchPlayer.damage}D)</span>
            </div>
          `;
        }
      }

      return `
        <div class="v2-match-card">
          <div class="match-card-header">
            <span class="match-card-title">Match #${match.match_no} • ${escapeHtml(match.round_name || 'Round')}</span>
            <span class="match-badge ${statusClass}">${statusLabel}</span>
          </div>
          <div class="match-card-body">
            <div class="match-team-row ${isTeamAWinner ? 'is-winner' : ''}">
              <div class="team-identity">
                <span class="team-tag">${escapeHtml(tagA)}</span>
                <span class="team-name" title="${escapeHtml(match.team_a_name)}">${escapeHtml(match.team_a_name)}</span>
              </div>
              <div class="team-score">${scoreA !== null ? scoreA : '-'}</div>
            </div>
            <div class="match-team-row ${isTeamBWinner ? 'is-winner' : ''}">
              <div class="team-identity">
                <span class="team-tag">${escapeHtml(tagB)}</span>
                <span class="team-name" title="${escapeHtml(match.team_b_name)}">${escapeHtml(match.team_b_name)}</span>
              </div>
              <div class="team-score">${scoreB !== null ? scoreB : '-'}</div>
            </div>
          </div>
          ${topPlayerInfo}
        </div>
      `;
    })
    .join('');
}

function renderRecentActivity(featured) {
  if (!els.recentActivityList) return;

  if (!featured || !featured.matches || featured.matches.length === 0) {
    els.recentActivityList.innerHTML = '<div class="empty-state">No activities logged yet.</div>';
    return;
  }

  const events = [];
  const sortedMatches = [...featured.matches].sort((a, b) => b.match_no - a.match_no);
  const highestMatchNo = sortedMatches[0]?.match_no ?? 1;

  if (featured.leaderboard?.length) {
    const leader = featured.leaderboard[0];
    events.push({
      type: 'standings',
      title: 'Standings Updated',
      desc: `${leader.team.name} leads the board with ${leader.points} total points.`,
      time: 'Update Synced',
      timeVal: 1,
      tag: 'LEADERBOARD',
      tagClass: 'tag-leader'
    });
  }

  sortedMatches.forEach((match) => {
    const matchAge = (highestMatchNo - match.match_no) * 15;

    if (match.status === 'live') {
      events.push({
        type: 'match_live',
        title: `Match #${match.match_no} Active`,
        desc: `Clash between ${match.team_a_name} and ${match.team_b_name} is currently underway.`,
        time: 'Active Now',
        timeVal: 0,
        tag: 'LIVE NOW',
        tagClass: 'tag-live'
      });
    } else if (match.status === 'finished') {
      events.push({
        type: 'match_finished',
        title: `Match #${match.match_no} Completed`,
        desc: `${match.team_a_name} vs ${match.team_b_name} concluded ${match.team_a_score}-${match.team_b_score}. ${match.winner_team_name ? `${match.winner_team_name} took the win.` : 'Match ended in a draw.'}`,
        time: matchAge === 0 ? '5m ago' : `${matchAge + 5}m ago`,
        timeVal: matchAge + 5,
        tag: 'FINISHED',
        tagClass: 'tag-finished'
      });
    }

    if (match.player_stats?.length) {
      const mvpPlayer =
        [...match.player_stats].find((p) => p.is_mvp) ||
        [...match.player_stats].sort((a, b) => b.kills - a.kills || b.damage - a.damage)[0];
      if (mvpPlayer) {
        events.push({
          type: 'mvp',
          title: 'MVP Highlight',
          desc: `${mvpPlayer.player_name} (${mvpPlayer.team_name || 'No Team'}) dominated match #${match.match_no} generating ${mvpPlayer.kills} kills and ${mvpPlayer.damage} damage.`,
          time: matchAge === 0 ? '8m ago' : `${matchAge + 8}m ago`,
          timeVal: matchAge + 8,
          tag: 'MATCH MVP',
          tagClass: 'tag-mvp'
        });
      }
    }
  });

  events.sort((a, b) => a.timeVal - b.timeVal);
  const displayEvents = events.slice(0, 5);

  if (displayEvents.length === 0) {
    els.recentActivityList.innerHTML = '<div class="empty-state">Waiting for activity telemetry...</div>';
    return;
  }

  els.recentActivityList.innerHTML = displayEvents
    .map(
      (event) => `
    <div class="activity-item ${event.type === 'match_finished' ? 'finished' : (event.type === 'match_live' ? 'live' : (event.type === 'mvp' ? 'mvp' : 'leaderboard'))}">
      <div class="activity-top">
        <span class="activity-title">${escapeHtml(event.title)}</span>
        <span class="activity-time">${escapeHtml(event.time)}</span>
      </div>
      <p class="activity-desc">${escapeHtml(event.desc)}</p>
      <span class="activity-tag ${event.tagClass}">${escapeHtml(event.tag)}</span>
    </div>
  `
    )
    .join('');
}

function renderTopPerformer(playerStats) {
  if (!els.mvpHighlightCard) return;

  if (!playerStats?.length) {
    els.mvpHighlightCard.innerHTML = `
      <div class="mvp-card-inner empty">
        <div class="mvp-badge">NO MVP DATA</div>
        <p class="mvp-empty-text">Spotlight waiting for tournament matches to complete.</p>
      </div>
    `;
    return;
  }

  const mvpPlayer = playerStats[0];

  els.mvpHighlightCard.innerHTML = `
    <div class="mvp-card-glow"></div>
    <div class="mvp-card-inner">
      <div class="mvp-badge">TOURNAMENT LEADER</div>
      <div class="mvp-character-bg">
        <svg viewBox="0 0 100 100" class="mvp-silhouette">
          <defs>
            <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffe694" />
              <stop offset="100%" stop-color="#b88314" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="55" r="40" fill="url(#gold-grad)" opacity="0.05" />
          <path d="M50 20a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm-22 55c0-15 10-22 22-22s22 7 22 22v5H28v-5z" fill="url(#gold-grad)" opacity="0.18" />
          <path d="M50 15 L53 23 L62 23 L55 28 L57 37 L50 32 L43 37 L45 28 L38 23 L47 23 Z" fill="#f4d26a" opacity="0.8" />
        </svg>
      </div>
      <div class="mvp-player-details">
        <span class="mvp-team-name">${escapeHtml(mvpPlayer.team_name || 'Free Agent')}</span>
        <h3 class="mvp-player-name">${escapeHtml(mvpPlayer.player_name)}</h3>
      </div>
      <div class="mvp-stats-grid">
        <div class="mvp-stat-box">
          <span class="mvp-stat-val">${mvpPlayer.kills}</span>
          <span class="mvp-stat-lbl">Kills</span>
        </div>
        <div class="mvp-stat-box">
          <span class="mvp-stat-val">${mvpPlayer.damage}</span>
          <span class="mvp-stat-lbl">Damage</span>
        </div>
        <div class="mvp-stat-box">
          <span class="mvp-stat-val">${mvpPlayer.mvps}</span>
          <span class="mvp-stat-lbl">MVPs</span>
        </div>
      </div>
    </div>
  `;
}

function startServerClock() {
  if (!els.footerServerTime) return;
  const updateClock = () => {
    const now = new Date();
    els.footerServerTime.textContent = `Server Time: ${now.toLocaleTimeString()}`;
  };
  updateClock();
  setInterval(updateClock, 1000);
}

function renderDashboard(data) {
  renderActiveTournaments(data.activeTournaments || [], data.selectedTournamentId);

  const featured = data.featuredTournament;
  if (!featured) {
    setText(els.featuredTournamentName, 'No active tournament yet');
    setText(els.featuredTournamentNotes, 'Please mark a tournament active in the Tourney Hub to showcase stats.');
    setText(els.featuredTeamCount, '-');
    setText(els.featuredPlayerCount, '-');
    setText(els.featuredMatchCount, '-');
    setText(els.featuredFinishedCount, '-');
    setText(els.featuredMode, '-');
    setText(els.featuredStatus, '-');
    
    if (els.leaderboardList) els.leaderboardList.innerHTML = '<tr><td colspan="9" class="text-center muted">No tournament active.</td></tr>';
    if (els.playerStatsList) els.playerStatsList.innerHTML = '<tr><td colspan="7" class="text-center muted">No tournament active.</td></tr>';
    if (els.matchResultsList) els.matchResultsList.innerHTML = '<div class="empty-state">No active tournament.</div>';
    if (els.recentActivityList) els.recentActivityList.innerHTML = '<div class="empty-state">No active tournament.</div>';
    if (els.mvpHighlightCard) {
      els.mvpHighlightCard.innerHTML = `
        <div class="mvp-card-inner empty">
          <div class="mvp-badge">NO ACTIVE TOURNAMENT</div>
          <p class="mvp-empty-text">Please load or activate a tournament to fetch MVP metrics.</p>
        </div>
      `;
    }
    return;
  }

  setText(els.featuredTournamentName, featured.name);
  setText(els.featuredTournamentNotes, featured.notes || 'No notes set for this tournament.');
  setText(els.featuredTeamCount, String(featured.teams?.length ?? 0));
  setText(els.featuredPlayerCount, String(featured.players?.length ?? 0));
  setText(els.featuredMatchCount, String(featured.matches?.length ?? 0));
  setText(els.featuredFinishedCount, String(featured.matches?.filter((match) => match.status === 'finished' || (match.team_a_score !== null && match.team_b_score !== null)).length ?? 0));
  setText(els.featuredMode, featured.mode || 'Squad');
  setText(els.featuredStatus, featured.status === 'active' ? 'Active' : 'Completed');

  renderLeaderboard(featured.leaderboard || [], featured.matches || [], featured.teams || []);
  renderPlayerStats(featured.playerStats || []);
  renderMatchResults(featured.matchResults || [], featured.teams || []);
  renderRecentActivity(featured);
  renderTopPerformer(featured.playerStats || []);
}

async function boot() {
  setLoading(true, 'Connecting to Game Servers', 'Loading esports databases...');
  try {
    const params = new URLSearchParams(window.location.search);
    const tournamentId = params.get('tournamentId');
    const data = await api(`/api/dashboard${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`);
    renderDashboard(data);
    startServerClock();
  } catch (error) {
    console.error('Error during boot:', error);
    setText(els.featuredTournamentName, 'System Offline');
    setText(els.featuredTournamentNotes, `Error details: ${error.message}`);
    if (els.leaderboardList) els.leaderboardList.innerHTML = `<tr><td colspan="9" class="text-center bad-text">${escapeHtml(error.message)}</td></tr>`;
  } finally {
    setLoading(false);
  }
}

// Background mesh configuration with golden hues matching WOW League aesthetic
startMeshBackground(document.getElementById('meshBackground'), {
  pointCount: 60,
  maxDistance: 170,
  background: '#07080d',
  pointColor: 'rgba(244, 210, 106, 0.45)',
  lineRgb: '184, 131, 20',
  glowColor: 'rgba(244, 210, 106, 0.04)'
});

boot().catch((error) => {
  console.error('Fatal initialization error:', error);
});
