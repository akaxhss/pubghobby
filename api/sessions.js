import {
  allowCors,
  createSession,
  currentPlayerForIndex,
  getClientId,
  getRosterPlayers,
  ensureDatabase,
  players,
  respondIfDatabaseMissing,
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

  if (respondIfDatabaseMissing(res)) {
    return;
  }

  await ensureDatabase();

  const body = await readJsonBody(req);
  const ign = String(body?.ign ?? '').trim();
  const selfPlayer = String(body?.selfPlayer ?? '').trim();
  if (!ign) {
    return sendJson(res, 400, { error: 'IGN is required.' });
  }

  if (!selfPlayer || !players.includes(selfPlayer)) {
    return sendJson(res, 400, { error: 'Please select your ID.' });
  }

  const session = await createSession(ign, getClientId(req), selfPlayer);
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
