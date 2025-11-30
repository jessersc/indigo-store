// API endpoint to serve PayPal configuration
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use GET.' 
    });
  }

  // Return PayPal client ID from environment variable
  const clientId = process.env.PAYPAL_CLIENT_ID;

  // Always return 200 with available data (graceful degradation)
  res.status(200).json({
    success: true,
    clientId: clientId || '',
    configured: !!clientId
  });
}

