import { allowCors, ensureDatabase, getSessionExport, respondIfDatabaseMissing, sendJson } from '../_lib.js';

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

  const sessionId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('sessionId');
  if (!sessionId) {
    return sendJson(res, 400, { error: 'sessionId is required.' });
  }

  const result = await getSessionExport(sessionId);
  if (result.error) {
    return sendJson(res, result.statusCode ?? 404, { error: result.error });
  }

  return sendJson(res, 200, result);
}
