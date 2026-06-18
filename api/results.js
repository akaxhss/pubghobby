import { allowCors, ensureDatabase, getPlayerResults, respondIfDatabaseMissing, sendJson } from './_lib.js';

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
  const results = await getPlayerResults();

  return sendJson(res, 200, {
    generatedAt: new Date().toISOString(),
    results
  });
}
