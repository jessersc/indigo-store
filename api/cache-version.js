// Simple approach: force refresh when explicitly requested or recently requested
// This works reliably in serverless environments
if (typeof global.lastForceRefresh === 'undefined') {
  global.lastForceRefresh = 0;
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed. Use GET.' });

  const { force_refresh } = req.query;
  const now = Date.now();
  
  // Update last force refresh time if explicitly requested
  if (force_refresh) {
    global.lastForceRefresh = now;
  }
  
  // Force refresh if explicitly requested OR if there was a recent force refresh (within 30 seconds)
  const timeSinceLastForceRefresh = now - global.lastForceRefresh;
  const hasRecentForceRefresh = timeSinceLastForceRefresh < 30000; // 30 seconds
  const shouldForceRefresh = !!force_refresh || hasRecentForceRefresh;
  
  const version = shouldForceRefresh ? `2.7.1-${Date.now()}` : '2.7.1';

  console.log('Cache version check:', {
    force_refresh: !!force_refresh,
    hasRecentForceRefresh: hasRecentForceRefresh,
    timeSinceLastForceRefresh: Math.round(timeSinceLastForceRefresh / 1000) + 's',
    shouldForceRefresh: shouldForceRefresh,
    version: version,
    query: req.query
  });

  res.status(200).json({ 
    version: version,
    timestamp: new Date().toISOString(),
    force_refresh: shouldForceRefresh,
    webhook_triggers: shouldForceRefresh ? 1 : 0,
    time_since_force_refresh: Math.round(timeSinceLastForceRefresh / 1000)
  }); 
}

