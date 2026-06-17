import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Set it in your environment before starting the app.');
}

const databaseUrlObject = new URL(databaseUrl);
databaseUrlObject.searchParams.delete('sslmode');

const pool = new Pool({
  connectionString: databaseUrlObject.toString(),
  ssl: { rejectUnauthorized: false }
});

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

async function queryDb(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      ign TEXT NOT NULL,
      device_id TEXT NOT NULL DEFAULT '',
      self_player TEXT NOT NULL DEFAULT '',
      current_index INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      target_player TEXT NOT NULL,
      skill TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await queryDb(`
    ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
  `);

  await queryDb(`
    ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS self_player TEXT NOT NULL DEFAULT '';
  `);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

function currentPlayerForIndex(index) {
  return players[index] ?? null;
}

function getRosterPlayers(selfPlayer = '') {
  if (!selfPlayer) {
    return players;
  }

  return players.filter((player) => player !== selfPlayer);
}

function getClientId(req) {
  return String(req.headers['x-client-id'] ?? '').trim();
}

function isSessionLockedToDevice(session, clientId) {
  return Boolean(session?.device_id) && session.device_id !== clientId;
}

async function getSession(sessionId) {
  const { rows } = await queryDb('SELECT * FROM sessions WHERE id = $1 LIMIT 1;', [Number(sessionId)]);
  return rows[0] ?? null;
}

async function getSessionSummaries() {
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

async function getAllRatings() {
  const { rows } = await queryDb(`
    SELECT
      session_id,
      target_player,
      skill,
      rating,
      created_at
    FROM ratings
    ORDER BY id ASC;
  `);
  return rows;
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id'
    });
    res.end();
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(res, 200, { players, skills });
  }

  if (req.method === 'POST' && url.pathname === '/api/sessions') {
    const body = await readJsonBody(req);
    const ign = String(body?.ign ?? '').trim();
    const selfPlayer = String(body?.selfPlayer ?? '').trim();
    if (!ign) {
      return sendJson(res, 400, { error: 'IGN is required.' });
    }

    if (!selfPlayer || !players.includes(selfPlayer)) {
      return sendJson(res, 400, { error: 'Please select your ID.' });
    }

    const clientId = getClientId(req);

    const { rows } = await queryDb(
      'INSERT INTO sessions (ign, device_id, self_player) VALUES ($1, $2, $3) RETURNING id, ign, device_id, self_player, current_index;',
      [ign, clientId, selfPlayer]
    );
    const session = rows[0];

    return sendJson(res, 200, {
      sessionId: session.id,
      ign: session.ign,
      clientId: session.device_id,
      selfPlayer: session.self_player,
      currentIndex: session.current_index,
      currentPlayer: getRosterPlayers(session.self_player)[session.current_index] ?? null,
      totalPlayers: getRosterPlayers(session.self_player).length
    });
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/(\d+)$/);
  const ratingsMatch = url.pathname.match(/^\/api\/sessions\/(\d+)\/ratings$/);
  const exportMatch = url.pathname.match(/^\/api\/sessions\/(\d+)\/export$/);

  if (req.method === 'GET' && sessionMatch) {
    const session = await getSession(sessionMatch[1]);
    if (!session) return sendJson(res, 404, { error: 'Session not found.' });
    if (isSessionLockedToDevice(session, getClientId(req))) {
      return sendJson(res, 403, { error: 'This session belongs to a different device.' });
    }
    return sendJson(res, 200, {
      sessionId: session.id,
      ign: session.ign,
      clientId: session.device_id,
      selfPlayer: session.self_player,
      currentIndex: session.current_index,
      completedAt: session.completed_at,
      currentPlayer: getRosterPlayers(session.self_player)[session.current_index] ?? null,
      totalPlayers: getRosterPlayers(session.self_player).length
    });
  }

  if (req.method === 'POST' && ratingsMatch) {
    const body = await readJsonBody(req);
    const sessionId = Number(ratingsMatch[1]);
    const session = await getSession(sessionId);
    if (!session) {
      return sendJson(res, 404, { error: 'Session not found.' });
    }
    if (isSessionLockedToDevice(session, getClientId(req))) {
      return sendJson(res, 403, { error: 'This session belongs to a different device.' });
    }

    if (session.completed_at) {
      return sendJson(res, 400, { error: 'This session is already complete.' });
    }

    const rosterPlayers = getRosterPlayers(session.self_player);
    const targetPlayer = rosterPlayers[session.current_index];
    if (!targetPlayer) {
      return sendJson(res, 400, { error: 'No remaining players to rate.' });
    }

    if (session.self_player && targetPlayer === session.self_player) {
      return sendJson(res, 400, { error: 'You cannot rate your own ID.' });
    }

    const payload = body?.ratings ?? {};
    const values = [];
    for (const skill of skills) {
      const rating = Number(payload[skill]);
      if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
        return sendJson(res, 400, { error: `Invalid rating for ${skill}.` });
      }
      values.push({ skill, rating });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!session.device_id && getClientId(req)) {
        await client.query('UPDATE sessions SET device_id = $1 WHERE id = $2;', [getClientId(req), sessionId]);
      }
      if (!session.self_player && body?.selfPlayer && players.includes(String(body.selfPlayer).trim())) {
        await client.query('UPDATE sessions SET self_player = $1 WHERE id = $2;', [String(body.selfPlayer).trim(), sessionId]);
      }
      for (const entry of values) {
        await client.query(
          'INSERT INTO ratings (session_id, target_player, skill, rating) VALUES ($1, $2, $3, $4);',
          [sessionId, targetPlayer, entry.skill, entry.rating]
        );
      }

      const nextIndex = session.current_index + 1;
      const completeClause = nextIndex >= rosterPlayers.length ? ', completed_at = NOW()' : '';
      await client.query(
        `UPDATE sessions SET current_index = $1${completeClause} WHERE id = $2;`,
        [nextIndex, sessionId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const updated = await getSession(sessionId);
    const updatedRoster = getRosterPlayers(updated?.self_player ?? session.self_player);
    return sendJson(res, 200, {
      saved: true,
      completed: Boolean(updated.completed_at),
      nextPlayer: updatedRoster[updated.current_index] ?? null,
      currentIndex: updated.current_index,
      totalPlayers: updatedRoster.length
    });
  }

  if (req.method === 'GET' && exportMatch) {
    const session = await getSession(exportMatch[1]);
    if (!session) return sendJson(res, 404, { error: 'Session not found.' });
    if (isSessionLockedToDevice(session, getClientId(req))) {
      return sendJson(res, 403, { error: 'This session belongs to a different device.' });
    }
    const { rows } = await queryDb(
      `
      SELECT target_player, skill, rating, created_at
      FROM ratings
      WHERE session_id = $1
      ORDER BY id ASC;
    `,
      [Number(exportMatch[1])]
    );
    return sendJson(res, 200, {
      session: {
        id: session.id,
        ign: session.ign,
        createdAt: session.created_at,
        completedAt: session.completed_at
      },
      rows
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    const sessionCount = Number((await queryDb('SELECT COUNT(*)::int AS count FROM sessions;')).rows[0]?.count ?? 0);
    const completedCount = Number(
      (await queryDb('SELECT COUNT(*)::int AS count FROM sessions WHERE completed_at IS NOT NULL;')).rows[0]?.count ?? 0
    );
    const ratingCount = Number((await queryDb('SELECT COUNT(*)::int AS count FROM ratings;')).rows[0]?.count ?? 0);
    const averageRating = Number(
      (await queryDb('SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average FROM ratings;')).rows[0]?.average ?? 0
    );
    return sendJson(res, 200, {
      summary: {
        sessionCount,
        completedCount,
        ratingCount,
        averageRating
      },
      sessions: await getSessionSummaries()
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export') {
    return sendJson(res, 200, {
      exportedAt: new Date().toISOString(),
      sessions: await getSessionSummaries(),
      ratings: await getAllRatings()
    });
  }

  return false;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Payload too large.'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendStatic(req, res, url) {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) {
    return sendText(res, 403, 'Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendText(res, 404, 'Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    }[ext] ?? 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

await initDb();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  void (async () => {
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled === false && !res.headersSent) {
        sendJson(res, 404, { error: 'Not found.' });
      }
      return;
    }

    if (!sendStatic(req, res, url) && !res.headersSent) {
      sendText(res, 404, 'Not found');
    }
  })().catch((error) => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: error.message });
      return;
    }
    res.destroy(error);
  });
});

server.listen(port, () => {
  console.log(`Tourney Rater listening on http://localhost:${port}`);
});
