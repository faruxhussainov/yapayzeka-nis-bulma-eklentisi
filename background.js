// Background Service Worker - Farrukh Huseynov Niş
// Side Panel'i her sekme için açık tutar

chrome.runtime.onInstalled.addListener(() => {
  // Side Panel'i global olarak etkinleştir (sekme bağımsız)
  chrome.sidePanel.setOptions({
    enabled: true,
    path: 'sidepanel.html'
  });

  // Tüm sekmeler için side panel'i açık tut
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// Kullanıcı toolbar ikonuna tıkladığında side panel'i aç
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Sekme değişimlerinde panel durumunu koru
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  chrome.sidePanel.setOptions({
    tabId: tabId,
    enabled: true,
    path: 'sidepanel.html'
  });
});

// Mesaj dinleyicisi - sidepanel ile iletişim
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_YOUTUBE_DATA') {
    fetchYouTubeData(message.payload)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.type === 'SAVE_API_KEY') {
    chrome.storage.local.set({ youtubeApiKey: message.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_API_KEY') {
    chrome.storage.local.get(['youtubeApiKey'], (result) => {
      sendResponse({ success: true, apiKey: result.youtubeApiKey || '' });
    });
    return true;
  }
});

// ============================================================
// YouTube Data API v3 Fetch Logic
// ============================================================

async function fetchYouTubeData(params) {
  const {
    apiKey,
    query,
    channelAgeDays,
    minSubscribers,
    maxSubscribers,
    maxResults
  } = params;

  // Kanal yaşı için publishedAfter tarihi hesapla
  const publishedAfter = new Date();
  publishedAfter.setDate(publishedAfter.getDate() - channelAgeDays);
  const publishedAfterISO = publishedAfter.toISOString();

  // Adım 1: Video araması yap
  const searchResults = await searchVideos(apiKey, query, publishedAfterISO, maxResults);

  if (!searchResults || searchResults.length === 0) {
    return { channels: [], videos: [] };
  }

  // Benzersiz kanal ID'lerini topla
  const channelIds = [...new Set(searchResults.map(item => item.snippet.channelId))];
  const videoIds = searchResults.map(item => item.id.videoId).filter(Boolean);

  // Adım 2: Kanal detaylarını çek
  const channelDetails = await getChannelDetails(apiKey, channelIds);

  // Adım 3: Video istatistiklerini çek
  const videoStats = await getVideoStats(apiKey, videoIds);

  // Adım 4: Verileri birleştir ve filtrele
  const results = processResults(
    searchResults,
    channelDetails,
    videoStats,
    {
      minSubscribers,
      maxSubscribers,
      channelAgeDays,
      publishedAfterISO
    }
  );

  return results;
}

async function searchVideos(apiKey, query, publishedAfter, maxResults) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'viewCount');
  url.searchParams.set('publishedAfter', publishedAfter);
  url.searchParams.set('maxResults', Math.min(maxResults, 50).toString());
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.items || [];
}

async function getChannelDetails(apiKey, channelIds) {
  if (channelIds.length === 0) return {};

  // Max 50 kanal ID per request
  const chunks = chunkArray(channelIds, 50);
  const allChannels = {};

  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }
    const data = await response.json();

    (data.items || []).forEach(channel => {
      allChannels[channel.id] = channel;
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
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }
    const data = await response.json();

    (data.items || []).forEach(video => {
      allStats[video.id] = video;
    });
  }

  return allStats;
}

function processResults(searchResults, channelDetails, videoStats, filters) {
  const { minSubscribers, maxSubscribers, channelAgeDays, publishedAfterISO } = filters;
  const now = new Date();
  const results = [];

  for (const searchItem of searchResults) {
    const channelId = searchItem.snippet?.channelId;
    const videoId = searchItem.id?.videoId;

    if (!channelId || !videoId) continue;

    const channel = channelDetails[channelId];
    const video = videoStats[videoId];

    if (!channel || !video) continue;

    // Kanal istatistikleri
    const subscriberCount = parseInt(channel.statistics?.subscriberCount || '0', 10);
    const totalViewCount = parseInt(channel.statistics?.viewCount || '0', 10);
    const videoCount = parseInt(channel.statistics?.videoCount || '0', 10);

    // Abone filtresi
    if (subscriberCount < minSubscribers || subscriberCount > maxSubscribers) continue;

    // Kanal yaşı hesapla
    const channelCreatedAt = new Date(channel.snippet?.publishedAt);
    const channelAgeMs = now - channelCreatedAt;
    const channelAgeDaysActual = Math.floor(channelAgeMs / (1000 * 60 * 60 * 24));

    // Kanal yaşı filtresi
    if (channelAgeDaysActual > channelAgeDays) continue;

    // Video istatistikleri
    const videoViewCount = parseInt(video.statistics?.viewCount || '0', 10);
    const videoLikeCount = parseInt(video.statistics?.likeCount || '0', 10);

    // Outlier tespiti: video izlenme > abone sayısının %300'ü
    const outlierThreshold = subscriberCount * 3;
    const isOutlier = videoViewCount > outlierThreshold && subscriberCount > 0;

    // İzlenme/Abone oranı
    const viewToSubRatio = subscriberCount > 0
      ? (videoViewCount / subscriberCount).toFixed(2)
      : 'N/A';

    // Büyüme skoru: Toplam İzlenme / Kanal Yaşı (gün)
    const growthScore = channelAgeDaysActual > 0
      ? Math.round(totalViewCount / channelAgeDaysActual)
      : 0;

    results.push({
      channelId,
      channelName: channel.snippet?.title || 'Bilinmiyor',
      channelUrl: `https://www.youtube.com/channel/${channelId}`,
      channelThumbnail: channel.snippet?.thumbnails?.default?.url || '',
      channelCreatedAt: channelCreatedAt.toLocaleDateString('tr-TR'),
      channelAgeDays: channelAgeDaysActual,
      subscriberCount,
      totalViewCount,
      videoCount,
      videoId,
      videoTitle: video.snippet?.title || searchItem.snippet?.title || 'Bilinmiyor',
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoThumbnail: video.snippet?.thumbnails?.medium?.url || '',
      videoViewCount,
      videoLikeCount,
      isOutlier,
      viewToSubRatio,
      growthScore
    });
  }

  // Büyüme skoruna göre sırala (yüksekten düşüğe)
  results.sort((a, b) => b.growthScore - a.growthScore);

  return results;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
