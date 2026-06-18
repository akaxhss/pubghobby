import { allowCors, getAvailablePlayers, getReservedPlayers, hasDatabaseUrl, players, sendJson } from './_lib.js';

export default async function handler(req, res) {
  allowCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const [availablePlayers, reservedPlayers] = hasDatabaseUrl()
    ? await Promise.all([getAvailablePlayers(), getReservedPlayers()])
    : [players, []];

  return sendJson(res, 200, {
    players,
    availablePlayers,
    reservedPlayers,
    databaseConfigured: hasDatabaseUrl()
  });
}
