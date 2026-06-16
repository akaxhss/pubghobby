import {
  allowCors,
  createSession,
  currentPlayerForIndex,
  ensureDatabase,
  players,
  readJsonBody,
  sendJson
} from './_lib.js';

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  await ensureDatabase();

  const body = await readJsonBody(req);
  const ign = String(body?.ign ?? '').trim();
  if (!ign) {
    return sendJson(res, 400, { error: 'IGN is required.' });
  }

  const session = await createSession(ign);
  return sendJson(res, 200, {
    sessionId: session.id,
    ign: session.ign,
    currentIndex: session.current_index,
    currentPlayer: currentPlayerForIndex(session.current_index),
    totalPlayers: players.length
  });
}
