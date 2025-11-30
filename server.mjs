import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import mercantilRoutes from './api/mercantil/mercantil_routes.js';
import { initializeConfig as initMercantilConfig } from './api/mercantil/mercantil_payment.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Handle OPTIONS requests FIRST for all API routes (critical for CORS preflight)
// This MUST run before other middleware to catch preflight requests
// Works for both localhost (development) and production (deployed domain)
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    console.log('OPTIONS preflight request:', { 
      path: req.path, 
      origin: origin,
      headers: req.headers 
    });
    
    // Echo back the origin to allow cross-origin requests
    // This works for: localhost:5173 -> production, admin.indigostores.com -> www.indigostores.com, etc.
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      console.log('CORS: Allowing origin:', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
      console.log('CORS: No origin header, using wildcard');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    console.log('CORS: Preflight response sent');
    return res.sendStatus(200);
  }
  next();
});

// CORS configuration for admin dashboard
app.use((req, res, next) => {
  const allowedOrigins = [
    process.env.ADMIN_DASHBOARD_URL,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://admin.indigostores.com',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.FRONTEND_URL
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  
  // For API endpoints, always set CORS headers to allow cross-origin requests
  // This is critical for webhook calls from admin dashboard (localhost or production)
  if (req.path.startsWith('/api/')) {
    // Always allow API requests - echo back the origin if provided, otherwise use wildcard
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  } else if (allowedOrigins.includes(origin) || !origin) {
    // For non-API endpoints, respect allowed origins list
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Note: Static files are served directly by Vercel, not through Express
// Only serve static files in local development
if (process.env.NODE_ENV !== 'production') {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));
}

// Initialize Mercantil configuration
// Wrap in try-catch to prevent serverless function crashes
try {
  console.log('Initializing Mercantil payment system...');
  const mercantilInitialized = initMercantilConfig();
  if (mercantilInitialized) {
    console.log('Mercantil payment system ready');
  } else {
    console.warn('Mercantil payment system not configured (missing env variables)');
  }
  
  // Mount Mercantil routes
  app.use('/api/mercantil', mercantilRoutes);
} catch (error) {
  console.error('Error initializing Mercantil:', error);
  // Continue anyway - Mercantil routes just won't work
}

// Cache version state (in-memory, resets on server restart)
// In production with multiple instances, consider using Redis or a shared store
// Initialize safely for serverless environment
try {
  if (typeof global === 'undefined' || typeof global.lastForceRefresh === 'undefined') {
    if (typeof global !== 'undefined') {
      global.lastForceRefresh = 0;
    } else {
      // Fallback if global doesn't exist (shouldn't happen in Node.js)
      globalThis.lastForceRefresh = 0;
    }
  }
} catch (e) {
  console.warn('Could not initialize global.lastForceRefresh:', e);
}

// Cache version endpoint - checks if cache should be refreshed
app.get('/api/cache-version', (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { force_refresh } = req.query;
    const now = Date.now();
    
    // Initialize global.lastForceRefresh if not exists (for serverless)
    if (typeof global.lastForceRefresh === 'undefined') {
      global.lastForceRefresh = 0;
    }
    
  // Initialize if needed (for serverless cold starts)
  if (typeof global === 'undefined' || typeof global.lastForceRefresh === 'undefined') {
    if (typeof global !== 'undefined') {
      global.lastForceRefresh = 0;
    } else {
      globalThis.lastForceRefresh = 0;
    }
  }
  
  // Update last force refresh time if explicitly requested
  if (force_refresh) {
    if (typeof global !== 'undefined') {
      global.lastForceRefresh = now;
    } else {
      globalThis.lastForceRefresh = now;
    }
    console.log('Force refresh requested via query parameter, updating timestamp');
  }
  
  // Force refresh if explicitly requested OR if there was a recent force refresh (within 60 seconds - increased from 30)
  const lastRefresh = (typeof global !== 'undefined' ? global.lastForceRefresh : globalThis.lastForceRefresh) || 0;
  const timeSinceLastForceRefresh = now - lastRefresh;
    const hasRecentForceRefresh = timeSinceLastForceRefresh < 60000; // 60 seconds (increased window)
    const shouldForceRefresh = !!force_refresh || hasRecentForceRefresh;
    
  const lastRefreshValue = typeof global !== 'undefined' ? global.lastForceRefresh : globalThis.lastForceRefresh;
  const version = shouldForceRefresh ? `2.7.1-${lastRefreshValue || now}` : '2.7.1';

  console.log('Cache version check:', {
    force_refresh: !!force_refresh,
    hasRecentForceRefresh: hasRecentForceRefresh,
    timeSinceLastForceRefresh: Math.round(timeSinceLastForceRefresh / 1000) + 's',
    shouldForceRefresh: shouldForceRefresh,
    version: version,
    lastForceRefresh: lastRefreshValue ? new Date(lastRefreshValue).toISOString() : 'never',
    query: req.query
  });

  res.status(200).json({ 
    version: version,
    timestamp: new Date().toISOString(),
    force_refresh: shouldForceRefresh,
    webhook_triggers: shouldForceRefresh ? 1 : 0,
    time_since_force_refresh: Math.round(timeSinceLastForceRefresh / 1000),
    last_force_refresh: lastRefreshValue ? new Date(lastRefreshValue).toISOString() : null,
    currentVersion: '2.7.1'
  });
  } catch (error) {
    console.error('Error in /api/cache-version:', error);
    res.status(500).json({
      error: 'Failed to get cache version',
      message: error.message,
      version: '2.7.1',
      timestamp: new Date().toISOString()
    });
  }
});

// Webhook endpoint for cache refresh
app.post('/api/webhook/cache-refresh', async (req, res) => {
  try {
    // Set CORS headers explicitly for webhook endpoint
    // Echo back the origin to allow cross-origin requests (works for localhost and production)
    const origin = req.headers.origin;
    console.log('Webhook POST request:', { 
      origin: origin,
      path: req.path,
      method: req.method,
      headers: req.headers 
    });
    
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      console.log('CORS: Allowing origin for POST:', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
      console.log('CORS: No origin header for POST, using wildcard');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { action, timestamp, source } = body;

    if (action !== 'cache_refresh' && action !== 'clear_triggers') {
      return res.status(400).json({ success: false, error: 'Invalid action. Expected cache_refresh or clear_triggers.' });
    }

    // Handle clear triggers action
    if (action === 'clear_triggers') {
      if (typeof global !== 'undefined') {
        global.lastForceRefresh = 0;
      } else {
        globalThis.lastForceRefresh = 0;
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

    // Update last force refresh timestamp - this will trigger cache refresh for all clients
    const triggerTimestamp = Date.now();
    if (typeof global !== 'undefined') {
      global.lastForceRefresh = triggerTimestamp;
    } else {
      globalThis.lastForceRefresh = triggerTimestamp;
    }
    const triggerId = `webhook_${triggerTimestamp}`;
    console.log('Webhook trigger stored:', triggerId, 'Timestamp:', triggerTimestamp, 'ISO:', new Date(triggerTimestamp).toISOString());
    console.log('All clients checking /api/cache-version within the next 60 seconds will receive force_refresh: true');

    // Update the cache version to force all users to refresh
    const lastRefreshValue = typeof global !== 'undefined' ? global.lastForceRefresh : globalThis.lastForceRefresh;
    const newVersion = `2.7.1-${lastRefreshValue || triggerTimestamp}`;
    console.log('Generated new version:', newVersion);
    
    res.status(200).json({
      success: true,
      message: 'Cache refresh webhook received successfully',
      timestamp: new Date().toISOString(),
      action: 'cache_will_be_cleared',
      new_version: newVersion,
      force_refresh: true,
      triggerId: triggerId,
      trigger_timestamp: lastRefreshValue || triggerTimestamp
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
  }
});

// Supabase configuration endpoint for main store
app.get('/api/config/supabase', (req, res) => {
  try {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    
    res.json({
      url: url,
      anonKey: anonKey,
      configured: !!(url && anonKey)
    });
  } catch (error) {
    console.error('Error in /api/config/supabase:', error);
    res.status(500).json({
      error: 'Failed to load Supabase configuration',
      message: error.message
    });
  }
});

// Temporary stub endpoint for Google Scripts config (to prevent 404 errors during migration)
// TODO: Remove this once migration to Supabase is complete
app.get('/api/config/google-scripts', (req, res) => {
  res.json({
    catalogUrl: '',
    ordersUrl: '',
    trackerUrl: '',
    updateUrl: '',
    configured: false
  });
});

// PayPal configuration endpoint
app.get('/api/config/paypal', (req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID || ''
  });
});

const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
const base = 'https://api-m.sandbox.paypal.com';

app.post('/api/paypal/paypal_create', async (req, res) => {
  const { amount } = req.body;
  const response = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: amount }
      }]
    })
  });
  const data = await response.json();
  res.json(data);
});

app.post('/api/paypal/paypal_capture', async (req, res) => {
  const { orderID } = req.body;
  const response = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  res.json(data);
});

// ===== Cashea Integration =====
// Support both naming schemes: PUBLIC_API_KEY / CASHEA_PUBLIC_API_KEY, etc.
const CASHEA_API_URL = process.env.CASHEA_API_URL || process.env.CASHEA_BASE_URL || 'https://external.cashea.app';
const CASHEA_PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || process.env.CASHEA_PUBLIC_API_KEY || '';
const CASHEA_PRIVATE_API_KEY = process.env.PRIVATE_API_KEY || process.env.CASHEA_PRIVATE_API_KEY || '';
const CASHEA_EXTERNAL_CLIENT_ID = process.env.EXTERNAL_CLIENT_ID || process.env.CASHEA_CLIENT_ID || '';
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
const CF_ACCESS_JWT = process.env.CF_ACCESS_JWT;

function buildCasheaHeaders(extra = {}) {
  const headers = {
    'Authorization': `ApiKey ${CASHEA_PRIVATE_API_KEY}`,
    ...extra
  };
  if (CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = CF_ACCESS_CLIENT_SECRET;
  }
  if (CF_ACCESS_JWT) {
    headers['CF-Access-Jwt-Assertion'] = CF_ACCESS_JWT;
  }
  return headers;
}

// Public config for frontend SDK
app.get('/api/cashea/config', (req, res) => {
  res.json({
    publicApiKey: CASHEA_PUBLIC_API_KEY,
    externalClientId: CASHEA_EXTERNAL_CLIENT_ID,
    store: { id: 21977, name: 'Web Indigo Store', enabled: true },
    redirectUrl: `${req.protocol}://${req.get('host')}/confirmation`
  });
});

// Consolidated Cashea handler endpoint (matches Vercel serverless function format)
// This endpoint handles all Cashea actions via query parameter
app.get('/api/cashea-handler', async (req, res) => {
  const { action, idNumber } = req.query;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    switch (action) {
      case 'config':
        return res.status(200).json({
          success: true,
          publicApiKey: CASHEA_PUBLIC_API_KEY,
          externalClientId: CASHEA_EXTERNAL_CLIENT_ID,
          store: { id: 21977, name: 'Web Indigo Store', enabled: true },
          redirectUrl: `${req.protocol}://${req.get('host')}/confirmation.html`,
          configured: !!(CASHEA_PUBLIC_API_KEY && CASHEA_EXTERNAL_CLIENT_ID)
        });

      case 'orders':
        if (!idNumber) {
          return res.status(400).json({ error: 'idNumber is required' });
        }
        try {
          const orderResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
            method: 'GET',
            headers: buildCasheaHeaders()
          });
          const orderData = await orderResponse.json();
          return res.status(orderResponse.status).json(orderData);
        } catch (err) {
          return res.status(500).json({ error: 'Failed to fetch order', details: err.message });
        }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: config, orders, confirm-payment, or cancel-order' });
    }
  } catch (err) {
    console.error('Cashea handler error:', err);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
      action: action || 'unknown'
    });
  }
});

// Handle POST requests for confirm-payment
app.post('/api/cashea-handler', async (req, res) => {
  const { action, idNumber } = req.query;
  const { amount } = req.body;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (action === 'confirm-payment') {
    if (!idNumber) {
      return res.status(400).json({ error: 'idNumber is required' });
    }
    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }
    try {
      const confirmResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}/down-payment`, {
        method: 'POST',
        headers: buildCasheaHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      const confirmData = await confirmResponse.json();
      return res.status(confirmResponse.status).json(confirmData);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to confirm payment', details: err.message });
    }
  }
  return res.status(400).json({ error: 'Invalid action for POST. Use: confirm-payment' });
});

// Handle DELETE requests for cancel-order
app.delete('/api/cashea-handler', async (req, res) => {
  const { action, idNumber } = req.query;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (action === 'cancel-order') {
    if (!idNumber) {
      return res.status(400).json({ error: 'idNumber is required' });
    }
    try {
      const cancelResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
        method: 'DELETE',
        headers: buildCasheaHeaders()
      });
      const cancelText = await cancelResponse.text();
      return res.status(cancelResponse.status).send(cancelText || '');
    } catch (err) {
      return res.status(500).json({ error: 'Failed to cancel order', details: err.message });
    }
  }
  return res.status(400).json({ error: 'Invalid action for DELETE. Use: cancel-order' });
});

// Proxy to Cashea: Get order info (no simulation)
app.get('/api/cashea/orders/:idNumber', async (req, res) => {
  const { idNumber } = req.params;
  try {
    const response = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
      method: 'GET',
      headers: buildCasheaHeaders()
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order', details: err.message });
  }
});

// Confirm down payment (no simulation)
app.post('/api/cashea/confirm-payment/:idNumber', async (req, res) => {
  const { idNumber } = req.params;
  const { amount } = req.body;
  try {
    const response = await fetch(`${CASHEA_API_URL}/orders/${idNumber}/down-payment`, {
      method: 'POST',
      headers: buildCasheaHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ amount: parseFloat(amount) })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm payment', details: err.message });
  }
});

// Cancel order (no simulation)
app.delete('/api/cashea/cancel-order/:idNumber', async (req, res) => {
  const { idNumber } = req.params;
  try {
    const response = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
      method: 'DELETE',
      headers: buildCasheaHeaders()
    });
    const text = await response.text();
    res.status(response.status).send(text || '');
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order', details: err.message });
  }
});

// Cloudinary deletion endpoint
app.post('/api/cloudinary/delete', async (req, res) => {
  try {
    const { publicId } = req.body;
    
    if (!publicId) {
      return res.status(400).json({ error: 'publicId is required' });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.warn('Cloudinary credentials not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env');
      return res.status(500).json({ 
        error: 'Cloudinary not configured',
        message: 'Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server environment variables'
      });
    }

    // Generate timestamp and signature for Cloudinary Admin API
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Build signature string: public_id + timestamp + api_secret
    const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

    // Call Cloudinary Admin API to delete
    const params = new URLSearchParams({
      public_id: publicId,
      timestamp: timestamp.toString(),
      api_key: apiKey,
      signature: signature
    });

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const result = await response.json();

    if (result.result === 'ok' || result.result === 'not found') {
      // 'not found' is acceptable - image might already be deleted
      return res.json({ 
        success: true, 
        message: result.result === 'not found' ? 'Image not found (may already be deleted)' : 'Image deleted successfully',
        result: result.result
      });
    } else {
      console.error('Cloudinary deletion error:', result);
      return res.status(500).json({ 
        error: 'Failed to delete from Cloudinary',
        details: result.error?.message || result
      });
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return res.status(500).json({ 
      error: 'Failed to delete from Cloudinary',
      details: error.message 
    });
  }
});

// Consolidated Cashea handler endpoint (matches Vercel serverless function format)
// This endpoint handles all Cashea actions via query parameter for localhost compatibility
app.get('/api/cashea-handler', async (req, res) => {
  const { action, idNumber } = req.query;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    switch (action) {
      case 'config':
        return res.status(200).json({
          success: true,
          publicApiKey: CASHEA_PUBLIC_API_KEY,
          externalClientId: CASHEA_EXTERNAL_CLIENT_ID,
          store: { id: 21977, name: 'Web Indigo Store', enabled: true },
          redirectUrl: `${req.protocol}://${req.get('host')}/confirmation.html`,
          configured: !!(CASHEA_PUBLIC_API_KEY && CASHEA_EXTERNAL_CLIENT_ID)
        });

      case 'orders':
        if (!idNumber) {
          return res.status(400).json({ error: 'idNumber is required' });
        }
        try {
          const orderResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
            method: 'GET',
            headers: buildCasheaHeaders()
          });
          const orderData = await orderResponse.json();
          return res.status(orderResponse.status).json(orderData);
        } catch (err) {
          return res.status(500).json({ error: 'Failed to fetch order', details: err.message });
        }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: config, orders, confirm-payment, or cancel-order' });
    }
  } catch (err) {
    console.error('Cashea handler error:', err);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
      action: action || 'unknown'
    });
  }
});

// Handle POST requests for confirm-payment
app.post('/api/cashea-handler', async (req, res) => {
  const { action, idNumber } = req.query;
  const { amount } = req.body;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (action === 'confirm-payment') {
    if (!idNumber) {
      return res.status(400).json({ error: 'idNumber is required' });
    }
    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }
    try {
      const confirmResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}/down-payment`, {
        method: 'POST',
        headers: buildCasheaHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      const confirmData = await confirmResponse.json();
      return res.status(confirmResponse.status).json(confirmData);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to confirm payment', details: err.message });
    }
  }
  return res.status(400).json({ error: 'Invalid action for POST. Use: confirm-payment' });
});

// Handle DELETE requests for cancel-order
app.delete('/api/cashea-handler', async (req, res) => {
  const { action, idNumber } = req.query;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (action === 'cancel-order') {
    if (!idNumber) {
      return res.status(400).json({ error: 'idNumber is required' });
    }
    try {
      const cancelResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
        method: 'DELETE',
        headers: buildCasheaHeaders()
      });
      const cancelText = await cancelResponse.text();
      return res.status(cancelResponse.status).send(cancelText || '');
    } catch (err) {
      return res.status(500).json({ error: 'Failed to cancel order', details: err.message });
    }
  }
  return res.status(400).json({ error: 'Invalid action for DELETE. Use: cancel-order' });
});

// Simple confirmation page
app.get('/confirmation', (req, res) => {
  const { idNumber } = req.query;
  if (!idNumber) {
    return res.status(400).send(`<!DOCTYPE html><html><body><div style="font-family:sans-serif;max-width:720px;margin:40px auto;background:#fff3cd;padding:16px;border-radius:8px;">Falta parámetro idNumber</div></body></html>`);
  }
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Confirmación Cashea</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;background:#f7f7fb} .card{background:#fff;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.06);padding:24px;margin-bottom:16px} .btn{padding:12px 16px;border:none;border-radius:8px;color:#fff;cursor:pointer;margin-right:8px} .btn-confirm{background:#28a745} .btn-cancel{background:#dc3545}</style></head><body><div class="card"><h2>Orden Cashea: ${idNumber}</h2><pre id="order" style="white-space:pre-wrap;background:#f8f9fa;padding:12px;border-radius:8px;">Cargando...</pre><div><input id="amount" type="number" step="0.01" placeholder="Monto inicial" style="padding:8px;border:1px solid #ddd;border-radius:6px;margin-right:8px" /><button class="btn btn-confirm" onclick="confirmPayment()">Confirmar pago</button><button class="btn btn-cancel" onclick="cancelOrder()">Cancelar orden</button></div></div><script>(async function(){const id='${idNumber}';const res=await fetch('/api/cashea/orders/'+id);const data=await res.json();document.getElementById('order').textContent=JSON.stringify(data,null,2);document.getElementById('amount').value=(data && data.orderDetails && data.orderDetails.downPayment)||'';})();async function confirmPayment(){const id='${idNumber}';const amount=document.getElementById('amount').value;const res=await fetch('/api/cashea/confirm-payment/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})});const data=await res.json();alert('Resultado: '+JSON.stringify(data));}async function cancelOrder(){const id='${idNumber}';if(!confirm('¿Cancelar la orden '+id+'?'))return;const res=await fetch('/api/cashea/cancel-order/'+id,{method:'DELETE'});if(res.ok){alert('Orden cancelada');}else{alert('Error cancelando: '+(await res.text()))}}</script></body></html>`);
});

// Note: Root route and static files are handled by Vercel's static file serving
// This app only handles API routes

// Error handler for unhandled errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// Export for Vercel serverless functions
export default app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => console.log('Server running at http://localhost:3000'));
}


