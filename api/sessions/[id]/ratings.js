import {
  allowCors,
  ensureDatabase,
  getClientId,
  readJsonBody,
  respondIfDatabaseMissing,
  saveRatings,
  sendJson
} from '../../_lib.js';

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'POST') {
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

  const body = await readJsonBody(req);
  const result = await saveRatings(sessionId, {
    ...body?.ratings,
    targetPlayer: body?.targetPlayer
  }, getClientId(req));
  if (result.error) {
    return sendJson(res, result.statusCode ?? 400, { error: result.error });
  }

  return sendJson(res, 200, result);
}

function getSessionId(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/api\/sessions\/([^/]+)\/ratings\/?$/);
  return match?.[1] ?? null;
}
