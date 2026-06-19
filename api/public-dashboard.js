import {
  ensureDatabase,
  queryDb,
  respondIfDatabaseMissing,
  sendJson,
  allowCors
} from './_lib.js';

function toInt(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function pickFeaturedTournament(tournaments, requestedTournamentId) {
  if (requestedTournamentId) {
    const requested = tournaments.find((entry) => String(entry.id) === String(requestedTournamentId));
    if (requested) return requested;
  }
  return (
    tournaments.find((entry) => entry.status === 'active') ||
    tournaments.find((entry) => Number(entry.match_count ?? 0) > 0) ||
    tournaments[0] ||
    null
  );
}

function buildLeaderboard(matches, teams) {
  const leaderboardMap = new Map();
  for (const team of teams) {
    leaderboardMap.set(String(team.id), {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      totalScore: 0,
      scored: 0,
      conceded: 0
    });
  }

  for (const match of matches) {
    const teamA = leaderboardMap.get(String(match.team_a_id));
    const teamB = leaderboardMap.get(String(match.team_b_id));
    const scoreA = Number(match.team_a_score);
    const scoreB = Number(match.team_b_score);
    const hasScores = Number.isFinite(scoreA) && Number.isFinite(scoreB);
    const finished = match.status === 'finished' || hasScores;
    if (!teamA || !teamB || !finished) continue;

    teamA.played += 1;
    teamB.played += 1;
    teamA.scored += scoreA;
    teamA.conceded += scoreB;
    teamB.scored += scoreB;
    teamB.conceded += scoreA;
    teamA.points += scoreA;
    teamB.points += scoreB;
    teamA.totalScore += scoreA;
    teamB.totalScore += scoreB;

    if (scoreA > scoreB) {
      teamA.wins += 1;
      teamB.losses += 1;
    } else if (scoreB > scoreA) {
      teamB.wins += 1;
      teamA.losses += 1;
    } else {
      teamA.draws += 1;
      teamB.draws += 1;
    }
  }

  return [...leaderboardMap.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aDiff = a.scored - a.conceded;
    const bDiff = b.scored - b.conceded;
    if (bDiff !== aDiff) return bDiff - aDiff;
    if (b.scored !== a.scored) return b.scored - a.scored;
    return a.team.name.localeCompare(b.team.name);
  });
}

function buildPlayerStats(rows) {
  return rows
    .map((row) => ({
      playerId: row.player_id,
      player_name: row.player_name,
      team_id: row.team_id,
      team_name: row.team_name,
      matches_played: Number(row.matches_played ?? 0),
      kills: Number(row.kills ?? 0),
      damage: Number(row.damage ?? 0),
      mvps: Number(row.mvps ?? 0)
    }))
    .sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.damage !== a.damage) return b.damage - a.damage;
      if (b.mvps !== a.mvps) return b.mvps - a.mvps;
      if (b.matches_played !== a.matches_played) return b.matches_played - a.matches_played;
      return a.player_name.localeCompare(b.player_name);
    });
}

async function loadTournamentSummaryRows() {
  return (await queryDb(`
    SELECT
      t.*,
      COUNT(DISTINCT te.id)::int AS team_count,
      COUNT(DISTINCT tp.id)::int AS player_count,
      COUNT(DISTINCT tm.id)::int AS match_count,
      COUNT(DISTINCT CASE WHEN tm.status = 'finished' THEN tm.id END)::int AS finished_match_count
    FROM tourney_tournaments t
    LEFT JOIN tourney_teams te ON te.tournament_id = t.id
    LEFT JOIN tourney_players tp ON tp.tournament_id = t.id
    LEFT JOIN tourney_matches tm ON tm.tournament_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC, t.id DESC;
  `)).rows;
}

async function loadTournamentDetail(tournamentId) {
  const tournament = (await queryDb('SELECT * FROM tourney_tournaments WHERE id = $1 LIMIT 1;', [tournamentId])).rows[0] ?? null;
  if (!tournament) return null;

  const teams = (await queryDb('SELECT * FROM tourney_teams WHERE tournament_id = $1 ORDER BY id ASC;', [tournamentId])).rows;
  const players = (await queryDb(
    `
    SELECT p.*, te.name AS team_name, te.tag AS team_tag
    FROM tourney_players p
    LEFT JOIN tourney_teams te ON te.id = p.team_id
    WHERE p.tournament_id = $1
    ORDER BY p.id ASC;
  `,
    [tournamentId]
  )).rows;
  const matches = (await queryDb(
    `
    SELECT
      m.*,
      ta.name AS team_a_name,
      tb.name AS team_b_name,
      tw.name AS winner_team_name
    FROM tourney_matches m
    LEFT JOIN tourney_teams ta ON ta.id = m.team_a_id
    LEFT JOIN tourney_teams tb ON tb.id = m.team_b_id
    LEFT JOIN tourney_teams tw ON tw.id = m.winner_team_id
    WHERE m.tournament_id = $1
    ORDER BY m.match_no ASC, m.id ASC;
  `,
    [tournamentId]
  )).rows;

  const playerStatsRows = (await queryDb(
    `
    SELECT
      s.player_id,
      s.player_name,
      s.team_id,
      s.team_name,
      COUNT(*)::int AS matches_played,
      COALESCE(SUM(s.kills), 0)::int AS kills,
      COALESCE(SUM(s.damage), 0)::int AS damage,
      COUNT(*) FILTER (WHERE s.is_mvp)::int AS mvps
    FROM tourney_match_player_stats s
    JOIN tourney_matches m ON m.id = s.match_id
    WHERE m.tournament_id = $1
    GROUP BY s.player_id, s.player_name, s.team_id, s.team_name
    ORDER BY kills DESC, damage DESC, mvps DESC, s.player_name ASC;
  `,
    [tournamentId]
  )).rows;

  const matchPlayerStatsRows = (await queryDb(
    `
    SELECT
      s.match_id,
      s.player_id,
      s.player_name,
      s.team_id,
      s.team_name,
      s.kills,
      s.damage,
      s.is_mvp,
      m.match_no,
      m.round_name,
      m.status,
      ta.name AS team_a_name,
      tb.name AS team_b_name,
      m.team_a_score,
      m.team_b_score,
      tw.name AS winner_team_name
    FROM tourney_match_player_stats s
    JOIN tourney_matches m ON m.id = s.match_id
    LEFT JOIN tourney_teams ta ON ta.id = m.team_a_id
    LEFT JOIN tourney_teams tb ON tb.id = m.team_b_id
    LEFT JOIN tourney_teams tw ON tw.id = m.winner_team_id
    WHERE m.tournament_id = $1
    ORDER BY m.match_no ASC, m.id ASC, s.id ASC;
  `,
    [tournamentId]
  )).rows;

  const matchResultsMap = new Map(
    matches.map((match) => [
      String(match.id),
      {
        ...match,
        player_stats: []
      }
    ])
  );

  for (const row of matchPlayerStatsRows) {
    const entry = matchResultsMap.get(String(row.match_id));
    if (!entry) continue;
    entry.player_stats.push({
      player_id: row.player_id,
      player_name: row.player_name,
      team_id: row.team_id,
      team_name: row.team_name,
      kills: Number(row.kills ?? 0),
      damage: Number(row.damage ?? 0),
      is_mvp: Boolean(row.is_mvp)
    });
  }

  return {
    ...tournament,
    teams,
    players,
    matches,
    matchResults: [...matchResultsMap.values()],
    leaderboard: buildLeaderboard(matches, teams),
    playerStats: buildPlayerStats(playerStatsRows)
  };
}

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (respondIfDatabaseMissing(res)) {
    return;
  }

  await ensureDatabase();

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestedTournamentId = toInt(url.searchParams.get('tournamentId'));
    const tournaments = await loadTournamentSummaryRows();
    const activeTournaments = tournaments.filter(
      (entry) => entry.status === 'active' || Number(entry.match_count ?? 0) > 0
    );
    const featured = requestedTournamentId
      ? pickFeaturedTournament(tournaments, requestedTournamentId)
      : activeTournaments[0] || tournaments[0] || null;
    const featuredTournament = featured ? await loadTournamentDetail(Number(featured.id)) : null;

    const summaryRows = (await queryDb(`
      SELECT
        (SELECT COUNT(*)::int FROM tourney_tournaments) AS tournament_count,
        (SELECT COUNT(*)::int FROM tourney_tournaments WHERE status = 'active') AS active_tournament_count,
        (SELECT COUNT(*)::int FROM tourney_teams) AS team_count,
        (SELECT COUNT(*)::int FROM tourney_players) AS player_count,
        (SELECT COUNT(*)::int FROM tourney_matches) AS match_count,
        (SELECT COUNT(*)::int FROM tourney_matches WHERE status = 'live') AS live_match_count,
        (SELECT COUNT(*)::int FROM tourney_matches WHERE status = 'finished') AS finished_match_count
    `)).rows[0] ?? {};

    return sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      summary: {
        tournamentCount: Number(summaryRows.tournament_count ?? 0),
        activeTournamentCount: activeTournaments.length,
        teamCount: Number(summaryRows.team_count ?? 0),
        playerCount: Number(summaryRows.player_count ?? 0),
        matchCount: Number(summaryRows.match_count ?? 0),
        liveMatchCount: Number(summaryRows.live_match_count ?? 0),
        finishedMatchCount: Number(summaryRows.finished_match_count ?? 0)
      },
      activeTournaments,
      selectedTournamentId: featured?.id ?? null,
      featuredTournament
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Failed to load dashboard.' });
  }
}
