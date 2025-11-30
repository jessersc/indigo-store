// /api/cashea/cashea-capture.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const { orderID, paymentData } = req.body;

  try {
    // Cashea API integration
    // This is a placeholder - you'll need to implement the actual Cashea API call
    // based on their documentation
    
    const casheaAuth = Buffer.from(`${process.env.CASHEA_CLIENT_ID}:${process.env.CASHEA_SECRET}`).toString('base64');

    const captureRes = await fetch(`${process.env.CASHEA_API_BASE}/v1/payments/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${casheaAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData || {}),
    });

    const data = await captureRes.json();

    if (!captureRes.ok) {
      return res.status(captureRes.status).json(data);
    }

    // Log successful capture for tracking
    console.log('Cashea payment captured successfully:', {
      orderID,
      casheaTransactionId: data.transaction_id,
      amount: data.amount,
      status: data.status
    });

    res.status(200).json(data);
  } catch (error) {
    console.error('Cashea capture error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
