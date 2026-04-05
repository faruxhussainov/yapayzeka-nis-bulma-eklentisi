// ============================================================
// Farrukh Huseynovü - Side Panel JavaScript
// ============================================================

'use strict';

// --- State ---
let currentResults = [];
let sortState = { col: 'growthScore', dir: 'desc' };
let isScanning = false;

// --- DOM References ---
const apiKeyInput      = document.getElementById('api-key-input');
const toggleApiBtn     = document.getElementById('toggle-api-visibility');
const saveApiBtn       = document.getElementById('save-api-key');
const apiStatus        = document.getElementById('api-status');
const searchQueryInput = document.getElementById('search-query');
const channelAgeGroup  = document.getElementById('channel-age-group');
const minSubsInput     = document.getElementById('min-subs');
const maxSubsInput     = document.getElementById('max-subs');
const maxResultsGroup  = document.getElementById('max-results-group');
const outlierOnlyCheck = document.getElementById('outlier-only');
const startScanBtn     = document.getElementById('start-scan');
const progressSection  = document.getElementById('progress-section');
const progressBar      = document.getElementById('progress-bar');
const progressText     = document.getElementById('progress-text');
const errorSection     = document.getElementById('error-section');
const resultsSection   = document.getElementById('results-section');
const emptyState       = document.getElementById('empty-state');
const resultsTbody     = document.getElementById('results-tbody');
const resultsCount     = document.getElementById('results-count');
const exportCsvBtn     = document.getElementById('export-csv');
const statTotal        = document.getElementById('stat-total');
const statOutliers     = document.getElementById('stat-outliers');
const statAvgGrowth    = document.getElementById('stat-avg-growth');

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadApiKey();
  setupEventListeners();
});

function setupEventListeners() {
  // API Key visibility toggle
  toggleApiBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleApiBtn.querySelector('svg').style.opacity = isPassword ? '1' : '0.5';
  });

  // Save API Key
  saveApiBtn.addEventListener('click', saveApiKey);
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKey();
  });

  // Channel Age toggle buttons
  setupToggleGroup(channelAgeGroup);

  // Max Results toggle buttons
  setupToggleGroup(maxResultsGroup);

  // Start scan
  startScanBtn.addEventListener('click', startScan);

  // Export CSV
  exportCsvBtn.addEventListener('click', exportToCSV);

  // Table sorting
  document.querySelectorAll('.results-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState.col === col) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        sortState.dir = 'desc';
      }
      updateSortHeaders();
      renderTable(currentResults);
    });
  });
}

function setupToggleGroup(group) {
  group.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ============================================================
// API KEY MANAGEMENT
// ============================================================
function loadApiKey() {
  chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, (response) => {
    if (response?.success && response.apiKey) {
      apiKeyInput.value = response.apiKey;
      showApiStatus('API anahtarı yüklendi.', 'success');
    }
  });
}

function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showApiStatus('Lütfen geçerli bir API anahtarı girin.', 'error');
    return;
  }
  if (!apiKey.startsWith('AIza')) {
    showApiStatus('Geçersiz API anahtarı formatı.', 'error');
    return;
  }

  chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', apiKey }, (response) => {
    if (response?.success) {
      showApiStatus('✓ API anahtarı başarıyla kaydedildi.', 'success');
    } else {
      showApiStatus('Kaydetme başarısız.', 'error');
    }
  });
}

function showApiStatus(msg, type) {
  apiStatus.textContent = msg;
  apiStatus.className = `status-msg ${type}`;
  if (type === 'success') {
    setTimeout(() => {
      apiStatus.textContent = '';
      apiStatus.className = 'status-msg';
    }, 3000);
  }
}

// ============================================================
// SCAN LOGIC
// ============================================================
async function startScan() {
  if (isScanning) return;

  // Validate API key
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showError('Lütfen önce YouTube API anahtarınızı girin ve kaydedin.');
    return;
  }

  // Get filter values
  const query       = searchQueryInput.value.trim() || 'AI faceless channel';
  const channelAge  = parseInt(getActiveToggle(channelAgeGroup), 10);
  const minSubs     = parseInt(minSubsInput.value, 10) || 1000;
  const maxSubs     = parseInt(maxSubsInput.value, 10) || 50000;
  const maxResults  = parseInt(getActiveToggle(maxResultsGroup), 10);
  const outlierOnly = outlierOnlyCheck.checked;

  if (minSubs >= maxSubs) {
    showError('Minimum abone sayısı, maksimumdan küçük olmalıdır.');
    return;
  }

  // UI state
  isScanning = true;
  startScanBtn.disabled = true;
  startScanBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    Taranıyor...
  `;

  hideError();
  hideResults();
  showProgress(5, 'Arama başlatılıyor...');

  try {
    // Step 1: Search videos
    setProgress(15, 'YouTube\'da videolar aranıyor...');
    const searchResults = await searchVideos(apiKey, query, channelAge, maxResults);

    if (!searchResults || searchResults.length === 0) {
      throw new Error('Bu filtrelerle eşleşen video bulunamadı. Arama terimini veya kanal yaşı filtresini değiştirmeyi deneyin.');
    }

    setProgress(35, `${searchResults.length} video bulundu. Kanal verileri alınıyor...`);

    // Step 2: Get channel details
    const channelIds = [...new Set(searchResults.map(item => item.snippet?.channelId).filter(Boolean))];
    const videoIds   = searchResults.map(item => item.id?.videoId).filter(Boolean);

    const channelDetails = await getChannelDetails(apiKey, channelIds);

    setProgress(60, 'Video istatistikleri alınıyor...');

    // Step 3: Get video stats
    const videoStats = await getVideoStats(apiKey, videoIds);

    setProgress(80, 'Veriler analiz ediliyor...');

    // Step 4: Process & filter
    const results = processResults(searchResults, channelDetails, videoStats, {
      minSubs,
      maxSubs,
      channelAgeDays: channelAge,
      outlierOnly
    });

    setProgress(100, 'Tamamlandı!');

    setTimeout(() => {
      hideProgress();
      currentResults = results;
      displayResults(results);
    }, 500);

  } catch (err) {
    hideProgress();
    showError(formatError(err));
  } finally {
    isScanning = false;
    startScanBtn.disabled = false;
    startScanBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      Niş Taramasını Başlat
    `;
  }
}

// ============================================================
// YOUTUBE API CALLS
// ============================================================
async function searchVideos(apiKey, query, channelAgeDays, maxResults) {
  const publishedAfter = new Date();
  publishedAfter.setDate(publishedAfter.getDate() - channelAgeDays);
  const publishedAfterISO = publishedAfter.toISOString();

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'viewCount');
  url.searchParams.set('publishedAfter', publishedAfterISO);
  url.searchParams.set('maxResults', Math.min(maxResults, 50).toString());
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `API Hatası: HTTP ${response.status}`);
  }

  return data.items || [];
}

async function getChannelDetails(apiKey, channelIds) {
  if (channelIds.length === 0) return {};

  const chunks = chunkArray(channelIds, 50);
  const allChannels = {};

  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Kanal API Hatası: HTTP ${response.status}`);
    }

    (data.items || []).forEach(ch => {
      allChannels[ch.id] = ch;
    });
  }

  return allChannels;
}

async function getVideoStats(apiKey, videoIds) {
  if (videoIds.length === 0) return {};

  const chunks = chunkArray(videoIds, 50);
  const allStats = {};

  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics,snippet');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Video API Hatası: HTTP ${response.status}`);
    }

    (data.items || []).forEach(v => {
      allStats[v.id] = v;
    });
  }

  return allStats;
}

// ============================================================
// DATA PROCESSING
// ============================================================
function processResults(searchResults, channelDetails, videoStats, filters) {
  const { minSubs, maxSubs, channelAgeDays, outlierOnly } = filters;
  const now = new Date();
  const results = [];
  const seenChannels = new Set();

  for (const searchItem of searchResults) {
    const channelId = searchItem.snippet?.channelId;
    const videoId   = searchItem.id?.videoId;

    if (!channelId || !videoId) continue;

    const channel = channelDetails[channelId];
    const video   = videoStats[videoId];

    if (!channel || !video) continue;

    // Kanal istatistikleri
    const subscriberCount = parseInt(channel.statistics?.subscriberCount || '0', 10);
    const totalViewCount  = parseInt(channel.statistics?.viewCount || '0', 10);
    const videoCount      = parseInt(channel.statistics?.videoCount || '0', 10);

    // Abone filtresi
    if (subscriberCount < minSubs || subscriberCount > maxSubs) continue;

    // Kanal yaşı hesapla
    const channelCreatedAt     = new Date(channel.snippet?.publishedAt);
    const channelAgeMs         = now - channelCreatedAt;
    const channelAgeDaysActual = Math.max(1, Math.floor(channelAgeMs / (1000 * 60 * 60 * 24)));

    // Kanal yaşı filtresi
    if (channelAgeDaysActual > channelAgeDays) continue;

    // Video istatistikleri
    const videoViewCount = parseInt(video.statistics?.viewCount || '0', 10);
    const videoLikeCount = parseInt(video.statistics?.likeCount || '0', 10);

    // Outlier tespiti: video izlenme > abone sayısının %300'ü
    const outlierThreshold = subscriberCount * 3;
    const isOutlier = subscriberCount > 0 && videoViewCount > outlierThreshold;

    // Outlier filtresi
    if (outlierOnly && !isOutlier) continue;

    // İzlenme/Abone oranı
    const viewToSubRatio = subscriberCount > 0
      ? parseFloat((videoViewCount / subscriberCount).toFixed(2))
      : 0;

    // Büyüme skoru: Toplam İzlenme / Kanal Yaşı (gün)
    const growthScore = Math.round(totalViewCount / channelAgeDaysActual);

    results.push({
      channelId,
      channelName:      channel.snippet?.title || 'Bilinmiyor',
      channelUrl:       `https://www.youtube.com/channel/${channelId}`,
      channelThumbnail: channel.snippet?.thumbnails?.default?.url || '',
      channelCreatedAt: channelCreatedAt.toLocaleDateString('tr-TR'),
      channelAgeDays:   channelAgeDaysActual,
      subscriberCount,
      totalViewCount,
      videoCount,
      videoId,
      videoTitle:       video.snippet?.title || searchItem.snippet?.title || 'Bilinmiyor',
      videoUrl:         `https://www.youtube.com/watch?v=${videoId}`,
      videoThumbnail:   video.snippet?.thumbnails?.medium?.url || '',
      videoViewCount,
      videoLikeCount,
      isOutlier,
      viewToSubRatio,
      growthScore
    });
  }

  // Büyüme skoruna göre sırala
  results.sort((a, b) => b.growthScore - a.growthScore);
  return results;
}

// ============================================================
// DISPLAY RESULTS
// ============================================================
function displayResults(results) {
  if (results.length === 0) {
    showEmptyState();
    return;
  }

  // Stats
  const outlierCount = results.filter(r => r.isOutlier).length;
  const avgGrowth    = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.growthScore, 0) / results.length)
    : 0;

  statTotal.textContent     = results.length;
  statOutliers.textContent  = outlierCount;
  statAvgGrowth.textContent = formatNumber(avgGrowth);
  resultsCount.textContent  = `${results.length} kanal`;

  renderTable(results);

  resultsSection.classList.remove('hidden');
  resultsSection.classList.add('fade-in');
  emptyState.classList.add('hidden');
}

function renderTable(results) {
  const sorted = sortResults([...results], sortState.col, sortState.dir);

  resultsTbody.innerHTML = sorted.map(r => `
    <tr class="${r.isOutlier ? 'is-outlier' : ''}">
      <td>
        <div class="channel-cell">
          ${r.channelThumbnail
            ? `<img src="${r.channelThumbnail}" alt="" class="channel-avatar" onerror="this.style.display='none'">`
            : '<div class="channel-avatar" style="background:var(--bg-card)"></div>'
          }
          <div class="channel-info">
            <span class="channel-name" title="${escapeHtml(r.channelName)}">${escapeHtml(r.channelName)}</span>
            <span class="channel-age">${r.channelAgeDays} gün önce</span>
          </div>
        </div>
      </td>
      <td class="num-cell">${formatNumber(r.subscriberCount)}</td>
      <td class="num-cell ${r.isOutlier ? 'text-warning' : ''}">${formatNumber(r.videoViewCount)}</td>
      <td class="num-cell highlight">${r.viewToSubRatio}x</td>
      <td>
        <span class="growth-badge">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
          ${formatNumber(r.growthScore)}/gün
        </span>
      </td>
      <td>
        ${r.isOutlier
          ? '<span class="outlier-badge">OUTLIER</span>'
          : '<span class="normal-badge">Normal</span>'
        }
      </td>
      <td>
        <div class="link-cell">
          <a href="${r.channelUrl}" target="_blank" class="link-btn link-btn-channel" title="Kanalı Aç">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>
            Kanal
          </a>
          <a href="${r.videoUrl}" target="_blank" class="link-btn link-btn-video" title="Videoyu Aç">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Video
          </a>
        </div>
      </td>
    </tr>
  `).join('');
}

function sortResults(results, col, dir) {
  return results.sort((a, b) => {
    let va = a[col];
    let vb = b[col];

    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();

    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('.results-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === sortState.col) {
      th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ============================================================
// CSV EXPORT
// ============================================================
function exportToCSV() {
  if (currentResults.length === 0) return;

  const headers = [
    'Kanal Adı', 'Kanal URL', 'Abone Sayısı', 'Toplam İzlenme',
    'Video Sayısı', 'Kanal Yaşı (Gün)', 'Kanal Oluşturma Tarihi',
    'Video Başlığı', 'Video URL', 'Video İzlenme', 'Video Beğeni',
    'İzlenme/Abone Oranı', 'Büyüme Skoru', 'Outlier'
  ];

  const rows = currentResults.map(r => [
    `"${r.channelName.replace(/"/g, '""')}"`,
    r.channelUrl,
    r.subscriberCount,
    r.totalViewCount,
    r.videoCount,
    r.channelAgeDays,
    r.channelCreatedAt,
    `"${r.videoTitle.replace(/"/g, '""')}"`,
    r.videoUrl,
    r.videoViewCount,
    r.videoLikeCount,
    r.viewToSubRatio,
    r.growthScore,
    r.isOutlier ? 'EVET' : 'HAYIR'
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const bom = '\uFEFF'; // UTF-8 BOM for Excel
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `yapay-zihin-nis-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// UI HELPERS
// ============================================================
function showProgress(pct, text) {
  progressSection.classList.remove('hidden');
  setProgress(pct, text);
}

function setProgress(pct, text) {
  progressBar.style.width = `${pct}%`;
  progressText.textContent = text;
}

function hideProgress() {
  progressSection.classList.add('hidden');
}

function showError(msg) {
  errorSection.textContent = msg;
  errorSection.classList.remove('hidden');
}

function hideError() {
  errorSection.classList.add('hidden');
  errorSection.textContent = '';
}

function hideResults() {
  resultsSection.classList.add('hidden');
  emptyState.classList.add('hidden');
}

function showEmptyState() {
  emptyState.classList.remove('hidden');
  resultsSection.classList.add('hidden');
}

function getActiveToggle(group) {
  const active = group.querySelector('.btn-toggle.active');
  return active ? active.dataset.value : group.querySelector('.btn-toggle').dataset.value;
}

function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatError(err) {
  const msg = err.message || String(err);

  if (msg.includes('quotaExceeded') || msg.includes('quota')) {
    return '⚠️ YouTube API kota limitine ulaşıldı. Lütfen yarın tekrar deneyin veya farklı bir API anahtarı kullanın.';
  }
  if (msg.includes('keyInvalid') || msg.includes('API key')) {
    return '🔑 Geçersiz API anahtarı. Lütfen API anahtarınızı kontrol edin ve tekrar kaydedin.';
  }
  if (msg.includes('accessNotConfigured')) {
    return '⚙️ YouTube Data API v3 etkinleştirilmemiş. Google Cloud Console\'dan API\'yi etkinleştirin.';
  }
  if (msg.includes('forbidden') || msg.includes('403')) {
    return '🚫 API erişimi reddedildi. API anahtarınızın YouTube Data API v3 için yetkili olduğundan emin olun.';
  }
  if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
    return '🌐 Ağ bağlantısı hatası. İnternet bağlantınızı kontrol edin.';
  }
  return `❌ Hata: ${msg}`;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// CSS for spin animation (injected dynamically)
const spinStyle = document.createElement('style');
spinStyle.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(spinStyle);
