// Simple webhook trigger storage using a timestamp approach
// This works better in serverless environments

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { action, timestamp, source } = body;

    if (action !== 'cache_refresh' && action !== 'clear_triggers') {
      return res.status(400).json({ success: false, error: 'Invalid action. Expected cache_refresh or clear_triggers.' });
    }

    // Handle clear triggers action
    if (action === 'clear_triggers') {
      // Initialize global.lastForceRefresh if needed
      if (typeof global !== 'undefined') {
        global.lastForceRefresh = 0;
      }
      console.log('Webhook triggers cleared');
      return res.status(200).json({
        success: true,
        message: 'Webhook triggers cleared successfully',
        timestamp: new Date().toISOString()
      });
    }

    console.log('Cache refresh webhook triggered:', { 
      timestamp, 
      source, 
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
    });

    // Store webhook trigger in response headers for immediate detection
    const triggerTimestamp = Date.now();
    const triggerId = `webhook_${triggerTimestamp}`;

    console.log('Webhook trigger stored:', triggerId, 'Timestamp:', triggerTimestamp);

    // Update the cache version to force all users to refresh
    const newVersion = `2.7.1-${Date.now()}`;
    console.log('Generated new version:', newVersion);
    
    res.status(200).json({
      success: true,
      message: 'Cache refresh webhook received successfully',
      timestamp: new Date().toISOString(),
      action: 'cache_will_be_cleared',
      new_version: newVersion,
      force_refresh: true,
      triggerId: triggerId,
      trigger_timestamp: triggerTimestamp
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
  }
}
