import { allowCors, ensureDatabase, getAdminExport, sendJson } from '../_lib.js';

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  await ensureDatabase();
  const data = await getAdminExport();
  return sendJson(res, 200, data);
}
