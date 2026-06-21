import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import pg from 'pg';
import tourneyHandler from './api/tourney.js';
import publicDashboardHandler from './api/public-dashboard.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const storageDir = path.join(__dirname, 'storage');
const auctionPlayersFile = path.join(storageDir, 'auction-players.json');
const auctionTeamsFile = path.join(storageDir, 'auction-teams.json');
const mediaDir = path.join(publicDir, 'media');
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

const defaultAuctionPlayers = [
  { name: 'Skull', basePoint: 9, wheelOrder: 1, status: 'sold', soldTo: 'Valky Team', purchasedPoint: 14, image: '' },
  { name: 'Zeus', basePoint: 9, wheelOrder: 2, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Evie', basePoint: 7, wheelOrder: 3, status: 'sold', soldTo: 'Qatar Team', purchasedPoint: 8, image: '' },
  { name: 'Joby', basePoint: 7, wheelOrder: 4, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Ryzen', basePoint: 9, wheelOrder: 5, status: 'current', soldTo: 'Qatar Team', purchasedPoint: 15, image: '' },
  { name: 'Good Morning', basePoint: 7, wheelOrder: 6, status: 'sold', soldTo: 'Akash Team', purchasedPoint: 10, image: '' },
  { name: 'Sensi', basePoint: 7, wheelOrder: 7, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Valak', basePoint: 7, wheelOrder: 8, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Beast', basePoint: 6, wheelOrder: 9, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Dsp', basePoint: 6, wheelOrder: 10, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Soul', basePoint: 6, wheelOrder: 11, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
];

const defaultAuctionTeams = [
  {
    name: 'Qatar Team',
    captainName: 'Qatar',
    totalPoints: 50,
    purchasePoints: 23,
    remainingPoints: 27,
    players: [
      { name: 'Ryzen', price: 15 },
      { name: 'Evie', price: 8 }
    ]
  },
  {
    name: 'Valky Team',
    captainName: 'Valky',
    totalPoints: 50,
    purchasePoints: 14,
    remainingPoints: 36,
    players: [{ name: 'Skull', price: 14 }]
  },
  {
    name: 'Akash Team',
    captainName: 'Akash',
    totalPoints: 50,
    purchasePoints: 10,
    remainingPoints: 40,
    players: [{ name: 'Good Morning', price: 10 }]
  }
];

function cloneAuctionTeams(teamsList) {
  return teamsList.map((team) => ({
    ...team,
    players: (team.players || []).map((p) => ({ ...p }))
  }));
}

function getDefaultAuctionTeams() {
  return cloneAuctionTeams(defaultAuctionTeams);
}

function readStoredAuctionTeams() {
  try {
    if (!fs.existsSync(auctionTeamsFile)) {
      return getDefaultAuctionTeams();
    }
    const raw = fs.readFileSync(auctionTeamsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      return getDefaultAuctionTeams();
    }
    return parsed.map((team) => ({
      ...team,
      players: (team.players || []).map((p) => ({ ...p }))
    }));
  } catch {
    return getDefaultAuctionTeams();
  }
}

function writeStoredAuctionTeams(teamsList) {
  const nextTeams = cloneAuctionTeams(teamsList);
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(auctionTeamsFile, JSON.stringify(nextTeams, null, 2));
  return nextTeams;
}

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'password';

async function queryDb(text, params = []) {
  return pool.query(text, params);
}

function cloneAuctionPlayers(playersList) {
  return playersList.map((player) => ({ ...player }));
}

function getDefaultAuctionPlayers() {
  return cloneAuctionPlayers(defaultAuctionPlayers);
}

function ensureStorageDirs() {
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });
  if (!fs.existsSync(auctionPlayersFile)) {
    fs.writeFileSync(auctionPlayersFile, JSON.stringify(getDefaultAuctionPlayers(), null, 2));
  }
  if (!fs.existsSync(auctionTeamsFile)) {
    fs.writeFileSync(auctionTeamsFile, JSON.stringify(getDefaultAuctionTeams(), null, 2));
  }
}

function readStoredAuctionPlayers() {
  try {
    if (!fs.existsSync(auctionPlayersFile)) {
      return getDefaultAuctionPlayers();
    }

    const raw = fs.readFileSync(auctionPlayersFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      return getDefaultAuctionPlayers();
    }

    return parsed.map((player) => ({ ...player }));
  } catch {
    return getDefaultAuctionPlayers();
  }
}

function writeStoredAuctionPlayers(playersList) {
  const nextPlayers = cloneAuctionPlayers(playersList);
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(auctionPlayersFile, JSON.stringify(nextPlayers, null, 2));
  return nextPlayers;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl ?? '').trim());
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) return null;

  return { mimeType, buffer };
}

function extensionFromMimeType(mimeType = '') {
  const normalized = String(mimeType).toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return '.jpg';
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'image/avif') return '.avif';
  if (normalized === 'image/svg+xml') return '.svg';
  return '';
}

function safeBaseName(input = 'auction-player') {
  return (
    String(input)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'auction-player'
  );
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.avif': 'image/avif',
      '.svg': 'image/svg+xml'
    }[ext] ?? 'application/octet-stream'
  );
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

  ensureStorageDirs();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id, Authorization'
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

async function getReservedPlayers() {
  const { rows } = await queryDb(`
    SELECT DISTINCT self_player
    FROM sessions
    WHERE self_player <> ''
    ORDER BY self_player ASC;
  `);
  return rows.map((row) => row.self_player).filter(Boolean);
}

async function getAvailablePlayers() {
  const reserved = new Set(await getReservedPlayers());
  return players.filter((player) => !reserved.has(player));
}

function getClientId(req) {
  return String(req.headers['x-client-id'] ?? '').trim();
}

function isSessionLockedToDevice(session, clientId) {
  return Boolean(session?.device_id) && session.device_id !== clientId;
}

function isAdminAuthorized(req) {
  const header = String(req.headers.authorization ?? '');
  if (!header.startsWith('Basic ')) {
    return false;
  }

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) {
      return false;
    }

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

async function getSession(sessionId) {
  const { rows } = await queryDb('SELECT * FROM sessions WHERE id = $1 LIMIT 1;', [Number(sessionId)]);
  return rows[0] ?? null;
}

async function deleteSession(sessionId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: sessionRows } = await client.query(
      'SELECT id, ign, self_player FROM sessions WHERE id = $1 FOR UPDATE;',
      [Number(sessionId)]
    );
    const session = sessionRows[0];
    if (!session) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('DELETE FROM sessions WHERE id = $1;', [Number(sessionId)]);
    await client.query('COMMIT');
    return session;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

async function getPlayerResults() {
  const { rows } = await queryDb(`
    SELECT
      target_player,
      COUNT(*)::int AS rating_count,
      COALESCE(ROUND(AVG(rating)::numeric, 0), 0)::int AS average_rating
    FROM ratings
    GROUP BY target_player
    ORDER BY target_player ASC;
  `);

  const byPlayer = new Map(rows.map((row) => [row.target_player, row]));
  return players.map((player) => {
    const row = byPlayer.get(player);
    return {
      player,
      ratingCount: Number(row?.rating_count ?? 0),
      averageRating: Number(row?.average_rating ?? 0)
    };
  });
}

async function handleApi(req, res, url) {
  if (url.pathname.startsWith('/api/tourney')) {
    await tourneyHandler(req, res);
    return true;
  }

  if (url.pathname.startsWith('/api/dashboard')) {
    await publicDashboardHandler(req, res);
    return true;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id, Authorization'
    });
    res.end();
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(res, 200, {
      players,
      skills,
      availablePlayers: await getAvailablePlayers(),
      reservedPlayers: await getReservedPlayers(),
      databaseConfigured: true
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/auction/players') {
    const fileExists = fs.existsSync(auctionPlayersFile);
    return sendJson(res, 200, {
      players: readStoredAuctionPlayers(),
      updatedAtMs: fileExists ? fs.statSync(auctionPlayersFile).mtimeMs : 0
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auction/players') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'Admin login required.' });
    }

    const body = await readJsonBody(req);
    if (!Array.isArray(body?.players)) {
      return sendJson(res, 400, { error: 'players array is required.' });
    }

    try {
      const saved = writeStoredAuctionPlayers(body.players);
      return sendJson(res, 200, { saved: true, players: saved });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'Failed to save players.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/auction/teams') {
    const fileExists = fs.existsSync(auctionTeamsFile);
    return sendJson(res, 200, {
      teams: readStoredAuctionTeams(),
      updatedAtMs: fileExists ? fs.statSync(auctionTeamsFile).mtimeMs : 0
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auction/teams') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'Admin login required.' });
    }

    const body = await readJsonBody(req);
    if (!Array.isArray(body?.teams)) {
      return sendJson(res, 400, { error: 'teams array is required.' });
    }

    try {
      const saved = writeStoredAuctionTeams(body.teams);
      return sendJson(res, 200, { saved: true, teams: saved });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'Failed to save teams.' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/media/upload') {
    const body = await readJsonBody(req);
    const dataUrl = String(body?.dataUrl ?? '').trim();
    const filename = String(body?.filename ?? 'auction-image').trim();
    const parsed = parseDataUrl(dataUrl);

    if (!parsed) {
      return sendJson(res, 400, { error: 'A valid image data URL is required.' });
    }

    const extension = extensionFromMimeType(parsed.mimeType) || path.extname(filename).toLowerCase() || '.png';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const fileName = `${safeBaseName(filename)}-${uniqueSuffix}${extension}`;
    const filePath = path.join(mediaDir, fileName);

    try {
      fs.mkdirSync(mediaDir, { recursive: true });
      fs.writeFileSync(filePath, parsed.buffer);
      return sendJson(res, 200, {
        saved: true,
        url: `/media/${fileName}`,
        fileName
      });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'Failed to save image.' });
    }
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
    const client = await pool.connect();
    let session;
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE sessions IN SHARE ROW EXCLUSIVE MODE;');
      const { rows: existingRows } = await client.query(
        'SELECT id FROM sessions WHERE self_player = $1 LIMIT 1;',
        [selfPlayer]
      );
      if (existingRows.length) {
        await client.query('ROLLBACK');
        return sendJson(res, 409, { error: 'This ID is already in use.' });
      }

      const { rows } = await client.query(
        'INSERT INTO sessions (ign, device_id, self_player) VALUES ($1, $2, $3) RETURNING id, ign, device_id, self_player, current_index;',
        [ign, clientId, selfPlayer]
      );
      session = rows[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

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
  const adminDeleteMatch = url.pathname.match(/^\/api\/admin\/sessions\/(\d+)$/);

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
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'Admin login required.' });
    }
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
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'Admin login required.' });
    }
    return sendJson(res, 200, {
      exportedAt: new Date().toISOString(),
      sessions: await getSessionSummaries(),
      ratings: await getAllRatings()
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/results') {
    await ensureDatabase();
    return sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      results: await getPlayerResults()
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/session-export') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'Admin login required.' });
    }
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return sendJson(res, 400, { error: 'sessionId is required.' });
    }
    const session = await getSession(sessionId);
    if (!session) {
      return sendJson(res, 404, { error: 'Session not found.' });
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

  if (req.method === 'DELETE' && adminDeleteMatch) {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'Admin login required.' });
    }
    try {
      const deleted = await deleteSession(adminDeleteMatch[1]);
      if (!deleted) {
        return sendJson(res, 404, { error: 'Session not found.' });
      }
      return sendJson(res, 200, { deleted: true, sessionId: Number(adminDeleteMatch[1]) });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || 'Failed to delete session.' });
    }
  }

  return false;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
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
  const pathname =
    url.pathname === '/' ? '/index.html' :
    url.pathname === '/rater' ? '/rater.html' :
    url.pathname === '/tourney' ? '/tourney.html' :
    url.pathname === '/auction' ? '/auction.html' :
    url.pathname === '/auctionadmin' ? '/auctionadmin.html' :
    url.pathname === '/admin' ? '/admin.html' :
    url.pathname === '/results' ? '/results.html' :
    url.pathname;
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) {
    return sendText(res, 403, 'Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendText(res, 404, 'Not found');
  }

  const contentType = contentTypeForFile(filePath);

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
