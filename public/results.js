import { startMeshBackground } from './background.js';

const API_BASE =
  window.location.port === '5500'
    ? 'http://127.0.0.1:3000'
    : window.location.origin;

const els = {
  resultsPlayerCount: document.getElementById('resultsPlayerCount'),
  resultsRatingCount: document.getElementById('resultsRatingCount'),
  resultsTableBody: document.getElementById('resultsTableBody')
};

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function renderResults(results) {
  const totalRatings = results.reduce((sum, row) => sum + Number(row.ratingCount ?? 0), 0);
  els.resultsPlayerCount.textContent = String(results.length);
  els.resultsRatingCount.textContent = String(totalRatings);

  const template = document.getElementById('resultRowTemplate');
  els.resultsTableBody.innerHTML = '';

  results
    .slice()
    .sort((a, b) => {
      if (b.averageRating !== a.averageRating) {
        return b.averageRating - a.averageRating;
      }
      return a.player.localeCompare(b.player);
    })
    .forEach((row) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector('.result-player').textContent = row.player;
      node.querySelector('.result-average').textContent = String(row.averageRating);
      node.querySelector('.result-count').textContent = `${row.ratingCount} ratings`;
      els.resultsTableBody.appendChild(node);
    });
}

async function boot() {
  const data = await api('/api/results');
  renderResults(data.results ?? []);
}

boot().catch((error) => {
  els.resultsTableBody.innerHTML = `<tr><td colspan="3" class="muted">${error.message}</td></tr>`;
});

startMeshBackground(document.getElementById('meshBackground'), {
  pointCount: 54,
  maxDistance: 185,
  background: '#05070d',
  pointColor: 'rgba(140, 200, 255, 0.9)',
  lineRgb: '96, 182, 255',
  glowColor: 'rgba(60, 96, 170, 0.1)'
});
