// /api/paypal/capture-order.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const { orderID } = req.body;

  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');

  const captureRes = await fetch(`${process.env.PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await captureRes.json();

  if (!captureRes.ok) {
    return res.status(captureRes.status).json(data);
  }

  res.status(200).json(data);
}
