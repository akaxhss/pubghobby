import { allowCors, ensureDatabase, resetSession, respondIfDatabaseMissing, sendJson } from '../../_lib.js';

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  if (respondIfDatabaseMissing(res)) {
    return;
  }

  await ensureDatabase();

  const sessionId = new URL(req.url, `http://${req.headers.host}`).pathname.match(/^\/api\/admin\/sessions\/(\d+)\/?$/)?.[1];
  if (!sessionId) {
    return sendJson(res, 400, { error: 'sessionId is required.' });
  }

  const reset = await resetSession(sessionId);
  if (!reset) {
    return sendJson(res, 404, { error: 'Session not found.' });
  }

  return sendJson(res, 200, { reset: true, sessionId: Number(sessionId) });
}
