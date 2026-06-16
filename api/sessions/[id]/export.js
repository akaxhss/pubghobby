import {
  allowCors,
  ensureDatabase,
  getSessionExport,
  getClientId,
  getSession,
  isSessionLockedToDevice,
  respondIfDatabaseMissing,
  sendJson
} from '../../_lib.js';

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

  if (isSessionLockedToDevice(session, getClientId(req))) {
    return sendJson(res, 403, { error: 'This session belongs to a different device.' });
  }

  const result = await getSessionExport(sessionId);
  if (result.error) {
    return sendJson(res, result.statusCode ?? 404, { error: result.error });
  }

  return sendJson(res, 200, result);
}

function getSessionId(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/api\/sessions\/([^/]+)\/export\/?$/);
  return match?.[1] ?? null;
}
