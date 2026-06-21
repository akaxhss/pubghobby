export const auctionTeams = [
  {
    name: 'Qatar Team',
    captainName: 'Qatar',
    totalPoints: 50,
    purchasePoints: 23,
    remainingPoints: 27,
    players: [
      { name: 'Ryzen', price: 15 },
      { name: 'Evie', price: 8 }
    ]
  },
  {
    name: 'Valky Team',
    captainName: 'Valky',
    totalPoints: 50,
    purchasePoints: 14,
    remainingPoints: 36,
    players: [{ name: 'Skull', price: 14 }]
  },
  {
    name: 'Akash Team',
    captainName: 'Akash',
    totalPoints: 50,
    purchasePoints: 10,
    remainingPoints: 40,
    players: [{ name: 'Good Morning', price: 10 }]
  }
];

export const auctionPlayers = [
  { name: 'Skull', basePoint: 9, wheelOrder: null, status: 'sold', soldTo: 'Valky Team', purchasedPoint: 14, image: '' },
  { name: 'Zeus', basePoint: 9, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Evie', basePoint: 7, wheelOrder: null, status: 'sold', soldTo: 'Qatar Team', purchasedPoint: 8, image: '' },
  { name: 'Joby', basePoint: 7, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Ryzen', basePoint: 9, wheelOrder: null, status: 'current', soldTo: 'Qatar Team', purchasedPoint: 15, image: '' },
  { name: 'Good Morning', basePoint: 7, wheelOrder: null, status: 'sold', soldTo: 'Akash Team', purchasedPoint: 10, image: '' },
  { name: 'Sensi', basePoint: 7, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Valak', basePoint: 7, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Beast', basePoint: 6, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Dsp', basePoint: 6, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Soul', basePoint: 6, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' },
  { name: 'Good Evening', basePoint: 6, wheelOrder: null, status: 'available', soldTo: '', purchasedPoint: null, image: '' }
];

export const currentAuctionPlayer = {
  name: 'Ryzen',
  basePoint: 9,
  currentBid: 15,
  status: 'Live Auction',
  team: 'Qatar Team',
  image: ''
};

export const auctionRules = [
  'Each player starts with the base point shown on the wheel.',
  'Bidding increases by 1L every turn.',
  'A team cannot bid beyond its remaining purse.',
  'Sold players cannot be re-bid unless the sale is undone.',
  'Good Night, Raid, and Valkyre are excluded from the auction pool.'
];

export function getAuctionSummary() {
  const soldPlayers = auctionPlayers.filter((player) => player.status === 'sold' || player.status === 'current').length;
  const availablePlayers = auctionPlayers.filter((player) => player.status === 'available').length;
  const totalSpent = auctionTeams.reduce((sum, team) => sum + team.purchasePoints, 0);

  return {
    totalPlayers: auctionPlayers.length,
    soldPlayers,
    availablePlayers,
    totalSpent,
    livePlayerName: currentAuctionPlayer.name,
    currentBid: currentAuctionPlayer.currentBid
  };
}
