import {
  allowCors,
  ensureDatabase,
  getSession,
  getSessionExport,
  players,
  readJsonBody,
  saveRatings,
  sendJson
} from '../_lib.js';

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  await ensureDatabase();

  const parts = getRouteParts(req);
  const sessionId = parts[0];
  const action = parts[1];

  if (!sessionId) {
    return sendJson(res, 404, { error: 'Not found.' });
  }

  if (parts.length === 1 && req.method === 'GET') {
    const session = await getSession(sessionId);
    if (!session) {
      return sendJson(res, 404, { error: 'Session not found.' });
    }

    return sendJson(res, 200, {
      sessionId: session.id,
      ign: session.ign,
      currentIndex: session.current_index,
      completedAt: session.completed_at,
      currentPlayer: players[session.current_index] ?? null,
      totalPlayers: players.length
    });
  }

  if (action === 'ratings' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const result = await saveRatings(sessionId, {
      ...body?.ratings,
      targetPlayer: body?.targetPlayer
    });
    if (result.error) {
      return sendJson(res, result.statusCode ?? 400, { error: result.error });
    }

    return sendJson(res, 200, result);
  }

  if (action === 'export' && req.method === 'GET') {
    const result = await getSessionExport(sessionId);
    if (result.error) {
      return sendJson(res, result.statusCode ?? 404, { error: result.error });
    }

    return sendJson(res, 200, result);
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

function getRouteParts(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.pathname
    .replace(/^\/api\/sessions\/?/, '')
    .split('/')
    .filter(Boolean);
}
