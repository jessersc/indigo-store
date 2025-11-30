// /api/cashea/cashea-create.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const { amount, orderNumber, customerInfo } = req.body;

  try {
    // Cashea API integration
    // This is a placeholder - you'll need to implement the actual Cashea API call
    // based on their documentation
    
    const casheaAuth = Buffer.from(`${process.env.CASHEA_CLIENT_ID}:${process.env.CASHEA_SECRET}`).toString('base64');

    const orderRes = await fetch(`${process.env.CASHEA_API_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${casheaAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount,
        currency: 'USD',
        order_number: orderNumber,
        customer: customerInfo || {},
        description: `Order ${orderNumber} - Indigo Store`,
        return_url: `${process.env.BASE_URL}/?page=payment_success`,
        cancel_url: `${process.env.BASE_URL}/?page=payment_cancelled`
      }),
    });

    const data = await orderRes.json();

    if (!orderRes.ok) {
      return res.status(orderRes.status).json(data);
    }

    // Log successful order creation for tracking
    console.log('Cashea payment order created successfully:', {
      orderNumber,
      casheaOrderId: data.order_id,
      amount: amount,
      status: data.status
    });

    res.status(200).json(data);
  } catch (error) {
    console.error('Cashea create error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
