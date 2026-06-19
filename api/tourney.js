import {
  allowCors,
  ensureDatabase,
  isAdminAuthorized,
  getPool,
  queryDb,
  readJsonBody,
  respondIfDatabaseMissing,
  sendAdminUnauthorized,
  sendJson
} from './_lib.js';

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNullableInteger(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function toNullableDateTime(value) {
  const text = cleanText(value);
  return text ? new Date(text).toISOString() : null;
}

async function getTournamentOverview(requestedTournamentId = null) {
  const tournamentRows = (await queryDb(`
    SELECT
      t.*,
      COUNT(DISTINCT te.id)::int AS team_count,
      COUNT(DISTINCT tp.id)::int AS player_count,
      COUNT(DISTINCT tm.id)::int AS match_count
    FROM tourney_tournaments t
    LEFT JOIN tourney_teams te ON te.tournament_id = t.id
    LEFT JOIN tourney_players tp ON tp.tournament_id = t.id
    LEFT JOIN tourney_matches tm ON tm.tournament_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC, t.id DESC;
  `)).rows;

  const summaryRows = (await queryDb(`
    SELECT
      (SELECT COUNT(*)::int FROM tourney_tournaments) AS tournament_count,
      (SELECT COUNT(*)::int FROM tourney_teams) AS team_count,
      (SELECT COUNT(*)::int FROM tourney_players) AS player_count,
      (SELECT COUNT(*)::int FROM tourney_matches) AS match_count,
      (SELECT COUNT(*)::int FROM tourney_matches WHERE status = 'live') AS live_match_count,
      (SELECT COUNT(*)::int FROM tourney_matches WHERE status = 'finished') AS finished_match_count
  `)).rows[0] ?? {};

  const activeTournamentId =
    requestedTournamentId ?? tournamentRows[0]?.id ?? null;

  let selectedTournament = null;
  if (activeTournamentId) {
    const tournamentRow = (await queryDb(
      'SELECT * FROM tourney_tournaments WHERE id = $1 LIMIT 1;',
      [Number(activeTournamentId)]
    )).rows[0] ?? null;

    if (tournamentRow) {
      const teams = (await queryDb(
        'SELECT * FROM tourney_teams WHERE tournament_id = $1 ORDER BY id ASC;',
        [Number(activeTournamentId)]
      )).rows;

      const players = (await queryDb(
        `
        SELECT
          p.*,
          te.name AS team_name,
          te.tag AS team_tag
        FROM tourney_players p
        LEFT JOIN tourney_teams te ON te.id = p.team_id
        WHERE p.tournament_id = $1
        ORDER BY p.id ASC;
      `,
        [Number(activeTournamentId)]
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
        [Number(activeTournamentId)]
      )).rows;

      const matchPlayerStats = (await queryDb(
        `
        SELECT
          s.*,
          p.ign AS player_lookup_name,
          te.name AS team_lookup_name
        FROM tourney_match_player_stats s
        JOIN tourney_matches m ON m.id = s.match_id
        LEFT JOIN tourney_players p ON p.id = s.player_id
        LEFT JOIN tourney_teams te ON te.id = s.team_id
        WHERE m.tournament_id = $1
        ORDER BY s.created_at ASC, s.id ASC;
      `,
        [Number(activeTournamentId)]
      )).rows;

      const statsByMatchId = new Map();
      for (const stat of matchPlayerStats) {
        const key = String(stat.match_id);
        if (!statsByMatchId.has(key)) {
          statsByMatchId.set(key, []);
        }
        statsByMatchId.get(key).push({
          ...stat,
          player_name: stat.player_name || stat.player_lookup_name || '',
          team_name: stat.team_name || stat.team_lookup_name || ''
        });
      }

      selectedTournament = {
        ...tournamentRow,
        teams,
        players,
        matches: matches.map((match) => ({
          ...match,
          player_stats: statsByMatchId.get(String(match.id)) ?? []
        }))
      };
    }
  }

  return {
    summary: {
      tournamentCount: Number(summaryRows.tournament_count ?? 0),
      teamCount: Number(summaryRows.team_count ?? 0),
      playerCount: Number(summaryRows.player_count ?? 0),
      matchCount: Number(summaryRows.match_count ?? 0),
      liveMatchCount: Number(summaryRows.live_match_count ?? 0),
      finishedMatchCount: Number(summaryRows.finished_match_count ?? 0)
    },
    tournaments: tournamentRows,
    selectedTournamentId: selectedTournament?.id ?? null,
    selectedTournament
  };
}

async function createTournament(body) {
  const name = cleanText(body.name);
  if (!name) {
    return { error: 'Tournament name is required.', statusCode: 400 };
  }

  const mode = cleanText(body.mode, 'WOW');
  const status = cleanText(body.status, 'draft');
  const notes = cleanText(body.notes, '');
  const startAt = toNullableDateTime(body.startAt);

  const { rows } = await queryDb(
    `
    INSERT INTO tourney_tournaments (name, mode, status, notes, start_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `,
    [name, mode, status, notes, startAt]
  );

  return rows[0];
}

async function updateTournament(body) {
  const id = toNullableInteger(body.id);
  if (!id) {
    return { error: 'Tournament id is required.', statusCode: 400 };
  }

  const updates = [];
  const params = [];
  const setField = (field, value) => {
    params.push(value);
    updates.push(`${field} = $${params.length}`);
  };

  if (body.name !== undefined) setField('name', cleanText(body.name));
  if (body.mode !== undefined) setField('mode', cleanText(body.mode, 'WOW'));
  if (body.status !== undefined) setField('status', cleanText(body.status, 'draft'));
  if (body.notes !== undefined) setField('notes', cleanText(body.notes, ''));
  if (body.startAt !== undefined) setField('start_at', toNullableDateTime(body.startAt));

  if (!updates.length) {
    return { error: 'No fields to update.', statusCode: 400 };
  }

  params.push(id);
  const { rows } = await queryDb(
    `
    UPDATE tourney_tournaments
    SET ${updates.join(', ')}
    WHERE id = $${params.length}
    RETURNING *;
  `,
    params
  );

  return rows[0] ?? { error: 'Tournament not found.', statusCode: 404 };
}

async function deleteTournament(body) {
  const id = toNullableInteger(body.id);
  if (!id) {
    return { error: 'Tournament id is required.', statusCode: 400 };
  }

  const { rows } = await queryDb(
    'DELETE FROM tourney_tournaments WHERE id = $1 RETURNING id;',
    [id]
  );
  return rows[0] ?? { error: 'Tournament not found.', statusCode: 404 };
}

async function createTeam(body) {
  const tournamentId = toNullableInteger(body.tournamentId);
  const name = cleanText(body.name);
  if (!tournamentId) return { error: 'Tournament id is required.', statusCode: 400 };
  if (!name) return { error: 'Team name is required.', statusCode: 400 };

  const { rows } = await queryDb(
    `
    INSERT INTO tourney_teams (tournament_id, name, tag, captain_name, color)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `,
    [tournamentId, name, cleanText(body.tag), cleanText(body.captainName), cleanText(body.color)]
  );

  return rows[0];
}

async function updateTeam(body) {
  const id = toNullableInteger(body.id);
  if (!id) return { error: 'Team id is required.', statusCode: 400 };

  const updates = [];
  const params = [];
  const setField = (field, value) => {
    params.push(value);
    updates.push(`${field} = $${params.length}`);
  };

  if (body.name !== undefined) setField('name', cleanText(body.name));
  if (body.tag !== undefined) setField('tag', cleanText(body.tag));
  if (body.captainName !== undefined) setField('captain_name', cleanText(body.captainName));
  if (body.color !== undefined) setField('color', cleanText(body.color));

  if (!updates.length) {
    return { error: 'No fields to update.', statusCode: 400 };
  }

  params.push(id);
  const { rows } = await queryDb(
    `UPDATE tourney_teams SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *;`,
    params
  );
  return rows[0] ?? { error: 'Team not found.', statusCode: 404 };
}

async function deleteTeam(body) {
  const id = toNullableInteger(body.id);
  if (!id) return { error: 'Team id is required.', statusCode: 400 };
  const { rows } = await queryDb('DELETE FROM tourney_teams WHERE id = $1 RETURNING id;', [id]);
  return rows[0] ?? { error: 'Team not found.', statusCode: 404 };
}

async function createPlayer(body) {
  const tournamentId = toNullableInteger(body.tournamentId);
  const ign = cleanText(body.ign);
  if (!tournamentId) return { error: 'Tournament id is required.', statusCode: 400 };
  if (!ign) return { error: 'Player name is required.', statusCode: 400 };

  const { rows } = await queryDb(
    `
    INSERT INTO tourney_players (tournament_id, team_id, ign, role, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `,
    [
      tournamentId,
      toNullableInteger(body.teamId),
      ign,
      cleanText(body.role, 'Player'),
      body.isActive === undefined ? true : Boolean(body.isActive)
    ]
  );

  return rows[0];
}

async function updatePlayer(body) {
  const id = toNullableInteger(body.id);
  if (!id) return { error: 'Player id is required.', statusCode: 400 };

  const updates = [];
  const params = [];
  const setField = (field, value) => {
    params.push(value);
    updates.push(`${field} = $${params.length}`);
  };

  if (body.ign !== undefined) setField('ign', cleanText(body.ign));
  if (body.teamId !== undefined) setField('team_id', toNullableInteger(body.teamId));
  if (body.role !== undefined) setField('role', cleanText(body.role, 'Player'));
  if (body.isActive !== undefined) setField('is_active', Boolean(body.isActive));

  if (!updates.length) {
    return { error: 'No fields to update.', statusCode: 400 };
  }

  params.push(id);
  const { rows } = await queryDb(
    `UPDATE tourney_players SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *;`,
    params
  );
  return rows[0] ?? { error: 'Player not found.', statusCode: 404 };
}

async function deletePlayer(body) {
  const id = toNullableInteger(body.id);
  if (!id) return { error: 'Player id is required.', statusCode: 400 };
  const { rows } = await queryDb('DELETE FROM tourney_players WHERE id = $1 RETURNING id;', [id]);
  return rows[0] ?? { error: 'Player not found.', statusCode: 404 };
}

async function createMatch(body) {
  const tournamentId = toNullableInteger(body.tournamentId);
  if (!tournamentId) return { error: 'Tournament id is required.', statusCode: 400 };

  const { rows } = await queryDb(
    `
    INSERT INTO tourney_matches (
      tournament_id, match_no, round_name, room_code, status, scheduled_at,
      team_a_id, team_b_id, team_a_score, team_b_score, winner_team_id, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;
  `,
    [
      tournamentId,
      Number(body.matchNo ?? 1),
      cleanText(body.roundName, 'Group Stage'),
      cleanText(body.roomCode),
      cleanText(body.status, 'scheduled'),
      toNullableDateTime(body.scheduledAt),
      toNullableInteger(body.teamAId),
      toNullableInteger(body.teamBId),
      body.teamAScore === '' || body.teamAScore === undefined ? null : Number(body.teamAScore),
      body.teamBScore === '' || body.teamBScore === undefined ? null : Number(body.teamBScore),
      toNullableInteger(body.winnerTeamId),
      cleanText(body.notes)
    ]
  );

  return rows[0];
}

async function updateMatch(body) {
  const id = toNullableInteger(body.id);
  if (!id) return { error: 'Match id is required.', statusCode: 400 };

  const updates = [];
  const params = [];
  const setField = (field, value) => {
    params.push(value);
    updates.push(`${field} = $${params.length}`);
  };

  if (body.matchNo !== undefined) setField('match_no', Number(body.matchNo));
  if (body.roundName !== undefined) setField('round_name', cleanText(body.roundName, 'Group Stage'));
  if (body.roomCode !== undefined) setField('room_code', cleanText(body.roomCode));
  if (body.status !== undefined) setField('status', cleanText(body.status, 'scheduled'));
  if (body.scheduledAt !== undefined) setField('scheduled_at', toNullableDateTime(body.scheduledAt));
  if (body.teamAId !== undefined) setField('team_a_id', toNullableInteger(body.teamAId));
  if (body.teamBId !== undefined) setField('team_b_id', toNullableInteger(body.teamBId));
  if (body.teamAScore !== undefined) setField('team_a_score', body.teamAScore === '' ? null : Number(body.teamAScore));
  if (body.teamBScore !== undefined) setField('team_b_score', body.teamBScore === '' ? null : Number(body.teamBScore));
  if (body.winnerTeamId !== undefined) setField('winner_team_id', toNullableInteger(body.winnerTeamId));
  if (body.notes !== undefined) setField('notes', cleanText(body.notes));

  if (!updates.length) {
    return { error: 'No fields to update.', statusCode: 400 };
  }

  params.push(id);
  const { rows } = await queryDb(
    `UPDATE tourney_matches SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *;`,
    params
  );
  if (Array.isArray(body.stats)) {
    const statsResult = await saveMatchStats({ matchId: id, stats: body.stats });
    if (statsResult?.error) {
      return statsResult;
    }
  }
  return rows[0] ?? { error: 'Match not found.', statusCode: 404 };
}

function normalizeMatchStats(stats, fallbackPlayers, teamsById) {
  if (!Array.isArray(stats)) {
    return [];
  }

  const byPlayerId = new Map();
  for (const entry of stats) {
    const playerId = toNullableInteger(entry?.playerId);
    if (!playerId) continue;
    byPlayerId.set(String(playerId), entry);
  }

  return fallbackPlayers
    .map((player) => {
      const team = player.team_id ? teamsById.get(String(player.team_id)) || null : null;
      const existing = byPlayerId.get(String(player.id)) || {};
      return {
        playerId: player.id,
        playerName: player.ign,
        teamId: player.team_id ?? null,
        teamName: team?.name || '',
        kills: Number.isFinite(Number(existing.kills)) ? Number(existing.kills) : 0,
        damage: Number.isFinite(Number(existing.damage)) ? Number(existing.damage) : 0,
        isMvp: Boolean(existing.isMvp ?? existing.is_mvp)
      };
    })
    .filter((entry) => entry.teamId !== null && entry.teamId !== undefined);
}

async function saveMatchStats(body) {
  const matchId = toNullableInteger(body.matchId);
  if (!matchId) return { error: 'Match id is required.', statusCode: 400 };

  const match = (await queryDb('SELECT * FROM tourney_matches WHERE id = $1 LIMIT 1;', [matchId])).rows[0];
  if (!match) return { error: 'Match not found.', statusCode: 404 };

  const tournamentPlayers = (await queryDb(
    `
    SELECT p.*, te.name AS team_name
    FROM tourney_players p
    LEFT JOIN tourney_teams te ON te.id = p.team_id
    WHERE p.tournament_id = $1
    ORDER BY p.id ASC;
  `,
    [match.tournament_id]
  )).rows;
  const teams = (await queryDb(
    'SELECT * FROM tourney_teams WHERE tournament_id = $1 ORDER BY id ASC;',
    [match.tournament_id]
  )).rows;
  const teamsById = new Map(teams.map((team) => [String(team.id), team]));

  const fallbackPlayers = tournamentPlayers.filter(
    (player) =>
      String(player.team_id) === String(match.team_a_id) ||
      String(player.team_id) === String(match.team_b_id)
  );
  const stats = normalizeMatchStats(body.stats, fallbackPlayers, teamsById);
  const connection = await getPool().connect();
  try {
    await connection.query('BEGIN');
    await connection.query('DELETE FROM tourney_match_player_stats WHERE match_id = $1;', [matchId]);
    for (const entry of stats) {
      await connection.query(
        `
        INSERT INTO tourney_match_player_stats (
          match_id, player_id, player_name, team_id, team_name, kills, damage, is_mvp, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW());
      `,
        [
          matchId,
          entry.playerId,
          entry.playerName,
          entry.teamId,
          entry.teamName || teamsById.get(String(entry.teamId))?.name || '',
          entry.kills,
          entry.damage,
          entry.isMvp
        ]
      );
    }
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }

  return { saved: true };
}

async function deleteMatch(body) {
  const id = toNullableInteger(body.id);
  if (!id) return { error: 'Match id is required.', statusCode: 400 };
  const { rows } = await queryDb('DELETE FROM tourney_matches WHERE id = $1 RETURNING id;', [id]);
  return rows[0] ?? { error: 'Match not found.', statusCode: 404 };
}

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (!isAdminAuthorized(req)) {
    return sendAdminUnauthorized(res);
  }

  if (respondIfDatabaseMissing(res)) {
    return;
  }

  await ensureDatabase();

  if (req.method === 'GET') {
    const tournamentId = toNullableInteger(new URL(req.url, `http://${req.headers.host}`).searchParams.get('tournamentId'));
    const data = await getTournamentOverview(tournamentId);
    return sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      ...data
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = await readJsonBody(req);
  const action = cleanText(body.action);

  try {
    let result;
    switch (action) {
      case 'createTournament':
        result = await createTournament(body);
        break;
      case 'updateTournament':
        result = await updateTournament(body);
        break;
      case 'deleteTournament':
        result = await deleteTournament(body);
        break;
      case 'createTeam':
        result = await createTeam(body);
        break;
      case 'updateTeam':
        result = await updateTeam(body);
        break;
      case 'deleteTeam':
        result = await deleteTeam(body);
        break;
      case 'createPlayer':
        result = await createPlayer(body);
        break;
      case 'updatePlayer':
        result = await updatePlayer(body);
        break;
      case 'deletePlayer':
        result = await deletePlayer(body);
        break;
      case 'createMatch':
        result = await createMatch(body);
        break;
      case 'updateMatch':
        result = await updateMatch(body);
        break;
      case 'saveMatchStats':
        result = await saveMatchStats(body);
        break;
      case 'deleteMatch':
        result = await deleteMatch(body);
        break;
      default:
        return sendJson(res, 400, { error: 'Unknown action.' });
    }

    if (result?.error) {
      return sendJson(res, result.statusCode ?? 400, { error: result.error });
    }

    return sendJson(res, 200, {
      ok: true,
      action,
      item: result,
      ...(await getTournamentOverview(toNullableInteger(body.tournamentId ?? body.id)))
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Tourney request failed.' });
  }
}
