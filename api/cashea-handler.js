// Consolidated Cashea handler - handles all Cashea endpoints
// Note: Vercel's Node.js runtime has native fetch, no need to import

function buildCasheaHeaders() {
  const CASHEA_PRIVATE_API_KEY = process.env.PRIVATE_API_KEY || process.env.CASHEA_PRIVATE_API_KEY || '';
  
  const headers = {
    'Authorization': `ApiKey ${CASHEA_PRIVATE_API_KEY}`
  };

  // Add Cloudflare Access headers if configured
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  if (process.env.CF_ACCESS_JWT) {
    headers['CF-Access-Jwt-Assertion'] = process.env.CF_ACCESS_JWT;
  }

  return headers;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, idNumber } = req.query;
  const CASHEA_API_URL = process.env.CASHEA_API_URL || process.env.CASHEA_BASE_URL || 'https://external.cashea.app';

  try {
    // Handle different actions
    switch (action) {
      case 'config':
        // Get Cashea configuration
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed. Use GET.' });
        }

        const publicApiKey = process.env.PUBLIC_API_KEY || process.env.CASHEA_PUBLIC_API_KEY || '';
        const externalClientId = process.env.EXTERNAL_CLIENT_ID || process.env.CASHEA_CLIENT_ID || '';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'indigostores.com';
        const redirectUrl = `${protocol}://${host}/confirmation.html`;

        return res.status(200).json({
          success: true,
          publicApiKey: publicApiKey,
          externalClientId: externalClientId,
          store: { id: 21977, name: 'Web Indigo Store', enabled: true },
          redirectUrl: redirectUrl,
          configured: !!(publicApiKey && externalClientId)
        });

      case 'orders':
        // Get order info
        if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed. Use GET.' });
        }
        if (!idNumber) {
          return res.status(400).json({ error: 'idNumber is required' });
        }

        const orderResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
          method: 'GET',
          headers: buildCasheaHeaders()
        });
        const orderData = await orderResponse.json();
        return res.status(orderResponse.status).json(orderData);

      case 'confirm-payment':
        // Confirm down payment
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed. Use POST.' });
        }
        if (!idNumber) {
          return res.status(400).json({ error: 'idNumber is required' });
        }

        const { amount } = req.body;
        if (!amount) {
          return res.status(400).json({ error: 'amount is required' });
        }

        const confirmResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}/down-payment`, {
          method: 'POST',
          headers: { ...buildCasheaHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: parseFloat(amount) })
        });
        const confirmData = await confirmResponse.json();
        return res.status(confirmResponse.status).json(confirmData);

      case 'cancel-order':
        // Cancel order
        if (req.method !== 'DELETE') {
          return res.status(405).json({ error: 'Method not allowed. Use DELETE.' });
        }
        if (!idNumber) {
          return res.status(400).json({ error: 'idNumber is required' });
        }

        const cancelResponse = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
          method: 'DELETE',
          headers: buildCasheaHeaders()
        });
        const cancelText = await cancelResponse.text();
        return res.status(cancelResponse.status).send(cancelText || '');

      default:
        return res.status(400).json({ error: 'Invalid action. Use: config, orders, confirm-payment, or cancel-order' });
    }
  } catch (err) {
    console.error('Cashea handler error:', err);
    console.error('Error stack:', err.stack);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
      action: action || 'unknown'
    });
  }
}

