const AUCTION_WHEEL_SYNC_KEY = 'wow_league_auction_wheel_sync';
const AUCTION_WHEEL_CHANNEL = 'wow_league_auction_wheel_channel';
const AUCTION_PLAYERS_SYNC_KEY = 'wow_league_auction_players_sync';
const AUCTION_PLAYERS_STORAGE_KEY = 'wow_league_auction_players';
const AUCTION_TEAMS_SYNC_KEY = 'wow_league_auction_teams_sync';
const AUCTION_TEAMS_STORAGE_KEY = 'wow_league_auction_teams';

let channel = null;
let playerChannel = null;
let teamChannel = null;

function createChannel() {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  channel = new BroadcastChannel(AUCTION_WHEEL_CHANNEL);
  return channel;
}

function createPlayerChannel() {
  if (playerChannel) return playerChannel;
  if (typeof BroadcastChannel === 'undefined') return null;
  playerChannel = new BroadcastChannel(AUCTION_PLAYERS_SYNC_KEY);
  return playerChannel;
}

export function readAuctionWheelSignal() {
  try {
    const raw = localStorage.getItem(AUCTION_WHEEL_SYNC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeAuctionWheelSignal(signal) {
  const nextSignal = {
    ...signal,
    updatedAt: Date.now()
  };

  try {
    localStorage.setItem(AUCTION_WHEEL_SYNC_KEY, JSON.stringify(nextSignal));
  } catch {
    // Ignore storage write failures and still broadcast locally.
  }

  const bc = createChannel();
  if (bc) bc.postMessage(nextSignal);
  return nextSignal;
}

export function subscribeAuctionWheelSignal(handler) {
  const bc = createChannel();
  const onStorage = (event) => {
    if (event.key !== AUCTION_WHEEL_SYNC_KEY || !event.newValue) return;
    try {
      handler(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed payloads.
    }
  };

  const onMessage = (event) => {
    if (!event?.data) return;
    handler(event.data);
  };

  window.addEventListener('storage', onStorage);
  if (bc) bc.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('storage', onStorage);
    if (bc) bc.removeEventListener('message', onMessage);
  };
}

export function readAuctionPlayers(defaultPlayers = []) {
  try {
    const raw = localStorage.getItem(AUCTION_PLAYERS_STORAGE_KEY);
    if (!raw) return defaultPlayers.map((player) => ({ ...player }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return defaultPlayers.map((player) => ({ ...player }));
    return parsed.map((player) => ({ ...player }));
  } catch {
    return defaultPlayers.map((player) => ({ ...player }));
  }
}

export function writeAuctionPlayers(players, options = {}) {
  const nextPlayers = players.map((player) => ({ ...player }));
  const updatedAt = Number(options.updatedAt ?? Date.now());
  try {
    localStorage.setItem(AUCTION_PLAYERS_STORAGE_KEY, JSON.stringify(nextPlayers));
  } catch {
    // Ignore storage write failures.
  }

  const bc = createPlayerChannel();
  const payload = { players: nextPlayers, updatedAt };
  try {
    localStorage.setItem(`${AUCTION_PLAYERS_SYNC_KEY}:last`, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
  if (bc) bc.postMessage(payload);
  return nextPlayers;
}

export function subscribeAuctionPlayers(handler) {
  const bc = createPlayerChannel();
  const onStorage = (event) => {
    if (event.key !== AUCTION_PLAYERS_SYNC_KEY && event.key !== `${AUCTION_PLAYERS_SYNC_KEY}:last`) return;
    if (!event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue);
      handler(payload.players || payload);
    } catch {
      // Ignore malformed payloads.
    }
  };

  const onMessage = (event) => {
    if (!event?.data) return;
    handler(event.data.players || event.data);
  };

  window.addEventListener('storage', onStorage);
  if (bc) bc.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('storage', onStorage);
    if (bc) bc.removeEventListener('message', onMessage);
  };
}

function createTeamChannel() {
  if (teamChannel) return teamChannel;
  if (typeof BroadcastChannel === 'undefined') return null;
  teamChannel = new BroadcastChannel(AUCTION_TEAMS_SYNC_KEY);
  return teamChannel;
}

export function readAuctionTeams(defaultTeams = []) {
  try {
    const raw = localStorage.getItem(AUCTION_TEAMS_STORAGE_KEY);
    if (!raw) return defaultTeams.map((team) => ({ ...team, players: (team.players || []).map(p => ({ ...p })) }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return defaultTeams.map((team) => ({ ...team, players: (team.players || []).map(p => ({ ...p })) }));
    return parsed.map((team) => ({ ...team, players: (team.players || []).map(p => ({ ...p })) }));
  } catch {
    return defaultTeams.map((team) => ({ ...team, players: (team.players || []).map(p => ({ ...p })) }));
  }
}

export function writeAuctionTeams(teams, options = {}) {
  const nextTeams = teams.map((team) => ({ ...team, players: (team.players || []).map(p => ({ ...p })) }));
  const updatedAt = Number(options.updatedAt ?? Date.now());
  try {
    localStorage.setItem(AUCTION_TEAMS_STORAGE_KEY, JSON.stringify(nextTeams));
  } catch {
    // Ignore storage write failures.
  }

  const bc = createTeamChannel();
  const payload = { teams: nextTeams, updatedAt };
  try {
    localStorage.setItem(`${AUCTION_TEAMS_SYNC_KEY}:last`, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
  if (bc) bc.postMessage(payload);
  return nextTeams;
}

export function subscribeAuctionTeams(handler) {
  const bc = createTeamChannel();
  const onStorage = (event) => {
    if (event.key !== AUCTION_TEAMS_SYNC_KEY && event.key !== `${AUCTION_TEAMS_SYNC_KEY}:last`) return;
    if (!event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue);
      handler(payload.teams || payload);
    } catch {
      // Ignore malformed payloads.
    }
  };

  const onMessage = (event) => {
    if (!event?.data) return;
    handler(event.data.teams || event.data);
  };

  window.addEventListener('storage', onStorage);
  if (bc) bc.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('storage', onStorage);
    if (bc) bc.removeEventListener('message', onMessage);
  };
}
