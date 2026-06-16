import pg from 'pg';

const { Pool } = pg;

export const players = [
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

export const skills = [
  'Close Range',
  'Long Range',
  'Team Support',
  'Clutch Ability',
  'Game Sense'
];

let pool;
let initPromise;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const url = new URL(databaseUrl);
  url.searchParams.delete('sslmode');
  return url.toString();
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl: { rejectUnauthorized: false }
    });
  }

  return pool;
}

export async function queryDb(text, params = []) {
  return getPool().query(text, params);
}

export async function ensureDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      await queryDb(`
        CREATE TABLE IF NOT EXISTS sessions (
          id BIGSERIAL PRIMARY KEY,
          ign TEXT NOT NULL,
          current_index INTEGER NOT NULL DEFAULT 0,
          completed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await queryDb(`
        CREATE TABLE IF NOT EXISTS ratings (
          id BIGSERIAL PRIMARY KEY,
          session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          target_player TEXT NOT NULL,
          skill TEXT NOT NULL,
          rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })();
  }

  return initPromise;
}

export function currentPlayerForIndex(index) {
  return players[index] ?? null;
}

export function sendJson(res, statusCode, payload) {
  allowCors(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function allowCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export function sendMethodNotAllowed(res) {
  sendJson(res, 405, { error: 'Method not allowed.' });
}

export function sendNotFound(res) {
  sendJson(res, 404, { error: 'Not found.' });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error('Payload too large.');
    }
  }

  if (!body) return {};
  return JSON.parse(body);
}

export async function getSession(sessionId) {
  const { rows } = await queryDb('SELECT * FROM sessions WHERE id = $1 LIMIT 1;', [Number(sessionId)]);
  return rows[0] ?? null;
}

export async function createSession(ign) {
  const { rows } = await queryDb(
    'INSERT INTO sessions (ign) VALUES ($1) RETURNING id, ign, current_index;',
    [ign]
  );
  return rows[0];
}

export async function saveRatings(sessionId, ratings) {
  const session = await getSession(sessionId);
  if (!session) {
    return { error: 'Session not found.', statusCode: 404 };
  }

  if (session.completed_at) {
    return { error: 'This session is already complete.', statusCode: 400 };
  }

  const targetPlayer = ratings?.targetPlayer ? String(ratings.targetPlayer).trim() : currentPlayerForIndex(session.current_index);
  if (!targetPlayer || !players.includes(targetPlayer)) {
    return { error: 'Invalid target player.', statusCode: 400 };
  }

  const isCurrentPlayer = targetPlayer === currentPlayerForIndex(session.current_index);
  if (!isCurrentPlayer && session.current_index >= players.length) {
    return { error: 'No remaining players to rate.', statusCode: 400 };
  }

  const values = [];
  for (const skill of skills) {
    const rating = Number(ratings?.[skill]);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return { error: `Invalid rating for ${skill}.`, statusCode: 400 };
    }
    values.push({ skill, rating });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ratings WHERE session_id = $1 AND target_player = $2;', [sessionId, targetPlayer]);
    for (const entry of values) {
      await client.query(
        'INSERT INTO ratings (session_id, target_player, skill, rating) VALUES ($1, $2, $3, $4);',
        [sessionId, targetPlayer, entry.skill, entry.rating]
      );
    }

    let nextIndex = session.current_index;
    let completeClause = '';
    if (isCurrentPlayer) {
      nextIndex = session.current_index + 1;
      if (nextIndex >= players.length) {
        completeClause = ', completed_at = NOW()';
      }
      await client.query(
        `UPDATE sessions SET current_index = $1${completeClause} WHERE id = $2;`,
        [nextIndex, sessionId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updated = await getSession(sessionId);
  return {
    saved: true,
    completed: Boolean(updated.completed_at),
    nextPlayer: currentPlayerForIndex(updated.current_index),
    currentIndex: updated.current_index,
    totalPlayers: players.length,
    savedPlayer: targetPlayer
  };
}

export async function getSessionExport(sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    return { error: 'Session not found.', statusCode: 404 };
  }

  const { rows } = await queryDb(
    `
    SELECT target_player, skill, rating, created_at
    FROM ratings
    WHERE session_id = $1
    ORDER BY id ASC;
  `,
    [Number(sessionId)]
  );

  return {
    session: {
      id: session.id,
      ign: session.ign,
      createdAt: session.created_at,
      completedAt: session.completed_at
    },
    rows
  };
}

export async function getSessionSummaries() {
  const { rows } = await queryDb(`
    SELECT
      s.id,
      s.ign,
      s.current_index,
      s.completed_at,
      s.created_at,
      COUNT(r.id)::int AS rating_count,
      COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS average_rating
    FROM sessions s
    LEFT JOIN ratings r ON r.session_id = s.id
    GROUP BY s.id
    ORDER BY s.id DESC;
  `);
  return rows;
}

export async function getAdminOverview() {
  const sessionCount = Number(
    (await queryDb('SELECT COUNT(*)::int AS count FROM sessions;')).rows[0]?.count ?? 0
  );
  const completedCount = Number(
    (await queryDb('SELECT COUNT(*)::int AS count FROM sessions WHERE completed_at IS NOT NULL;')).rows[0]?.count ?? 0
  );
  const ratingCount = Number((await queryDb('SELECT COUNT(*)::int AS count FROM ratings;')).rows[0]?.count ?? 0);
  const averageRating = Number(
    (await queryDb('SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average FROM ratings;')).rows[0]?.average ?? 0
  );

  return {
    summary: {
      sessionCount,
      completedCount,
      ratingCount,
      averageRating
    },
    sessions: await getSessionSummaries()
  };
}

export async function getAdminExport() {
  return {
    exportedAt: new Date().toISOString(),
    sessions: await getSessionSummaries(),
    ratings: (await queryDb(`
      SELECT session_id, target_player, skill, rating, created_at
      FROM ratings
      ORDER BY id ASC;
    `)).rows
  };
}
