const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public')); 

const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');

app.post('/api/paypal/create-order', async (req, res) => {
  const { amount } = req.body;
  const response = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
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

app.post('/api/paypal/capture-order', async (req, res) => {
  const { orderID } = req.body;
  const response = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`, {
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
const CASHEA_API_URL = process.env.CASHEA_API_URL || 'https://external.cashea.app';
const CASHEA_PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || '';
const CASHEA_PRIVATE_API_KEY = process.env.PRIVATE_API_KEY || '';
const CASHEA_EXTERNAL_CLIENT_ID = process.env.EXTERNAL_CLIENT_ID || '';
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

// Proxy to Cashea: Get order info (no simulation)
app.get('/api/cashea/orders/:idNumber', async (req, res) => {
  const { idNumber } = req.params;
  try {
    const response = await fetch(`${CASHEA_API_URL}/orders/${idNumber}`, {
      method: 'GET',
      headers: buildCasheaHeaders(),
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
      headers: buildCasheaHeaders(),
    });
    const text = await response.text();
    // Cashea may return empty body on delete; forward status
    res.status(response.status).send(text || '');
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order', details: err.message });
  }
});

// Simple confirmation page that uses above APIs
app.get('/confirmation', (req, res) => {
  const { idNumber } = req.query;
  if (!idNumber) {
    return res.status(400).send(`<!DOCTYPE html><html><body><div style="font-family:sans-serif;max-width:720px;margin:40px auto;background:#fff3cd;padding:16px;border-radius:8px;">Falta parámetro idNumber</div></body></html>`);
  }
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Confirmación Cashea</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;background:#f7f7fb} .card{background:#fff;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.06);padding:24px;margin-bottom:16px} .btn{padding:12px 16px;border:none;border-radius:8px;color:#fff;cursor:pointer;margin-right:8px} .btn-confirm{background:#28a745} .btn-cancel{background:#dc3545}</style></head><body><div class="card"><h2>Orden Cashea: ${idNumber}</h2><pre id="order" style="white-space:pre-wrap;background:#f8f9fa;padding:12px;border-radius:8px;">Cargando...</pre><div><input id="amount" type="number" step="0.01" placeholder="Monto inicial" style="padding:8px;border:1px solid #ddd;border-radius:6px;margin-right:8px" /><button class="btn btn-confirm" onclick="confirmPayment()">Confirmar pago</button><button class="btn btn-cancel" onclick="cancelOrder()">Cancelar orden</button></div></div><script>(async function(){const id='${idNumber}';const res=await fetch('/api/cashea/orders/'+id);const data=await res.json();document.getElementById('order').textContent=JSON.stringify(data,null,2);document.getElementById('amount').value=(data && data.orderDetails && data.orderDetails.downPayment)||'';})();async function confirmPayment(){const id='${idNumber}';const amount=document.getElementById('amount').value;const res=await fetch('/api/cashea/confirm-payment/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})});const data=await res.json();alert('Resultado: '+JSON.stringify(data));}async function cancelOrder(){const id='${idNumber}';if(!confirm('¿Cancelar la orden '+id+'?'))return;const res=await fetch('/api/cashea/cancel-order/'+id,{method:'DELETE'});if(res.ok){alert('Orden cancelada');}else{alert('Error cancelando: '+(await res.text()))}}</script></body></html>`);
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
