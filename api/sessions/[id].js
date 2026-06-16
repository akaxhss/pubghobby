import {
  allowCors,
  ensureDatabase,
  getSession,
  getClientId,
  isSessionLockedToDevice,
  players,
  respondIfDatabaseMissing,
  sendJson
} from '../_lib.js';

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  if (respondIfDatabaseMissing(res)) {
    return;
  }

  await ensureDatabase();

  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendJson(res, 404, { error: 'Not found.' });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return sendJson(res, 404, { error: 'Session not found.' });
  }

  const clientId = getClientId(req);
  if (isSessionLockedToDevice(session, clientId)) {
    return sendJson(res, 403, { error: 'This session belongs to a different device.' });
  }

  return sendJson(res, 200, {
    sessionId: session.id,
    ign: session.ign,
    clientId: session.device_id,
    currentIndex: session.current_index,
    completedAt: session.completed_at,
    currentPlayer: players[session.current_index] ?? null,
    totalPlayers: players.length
  });
}

function getSessionId(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/api\/sessions\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}
