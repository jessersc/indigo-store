// checkout.js

document.addEventListener('DOMContentLoaded', function() {
  renderCheckoutSummary();
  setupPaymentMethods();
  setupCheckoutButton();
});

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function renderCheckoutSummary() {
  const cart = getCart();
  const summaryContainer = document.getElementById('checkoutSummary');
  const paymentMethods = document.getElementById('paymentMethods');
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (!summaryContainer) return;
  if (cart.length === 0) {
    summaryContainer.innerHTML = '<div class="text-center text-gray-500" style="margin: 2rem 0; font-size: 1.2rem;">tu carrito está vacío, agrega productos para continuar con tu compra.</div>';
    if (paymentMethods) paymentMethods.style.display = 'none';
    if (checkoutBtn) checkoutBtn.style.display = 'none';
    return;
  }
  if (paymentMethods) paymentMethods.style.display = '';
  if (checkoutBtn) checkoutBtn.style.display = '';
  let totalUSD = 0, totalBS = 0;
  summaryContainer.innerHTML = cart.map(item => {
    const itemTotalUSD = (parseFloat(item.USD) || 0) * item.quantity;
    const itemTotalBS = (parseFloat(item.Bs) || 0) * item.quantity;
    totalUSD += itemTotalUSD;
    totalBS += itemTotalBS;
    return `
      <div class="checkout-item-row">
        <img src="${item.Image}" class="checkout-item-img" alt="${item.Product}">
        <div class="checkout-item-info">
          <div class="checkout-item-title">${item.Product}</div>
          <div class="checkout-item-qty">cantidad: ${item.quantity}</div>
          <div class="checkout-item-price">$${item.USD} | Bs ${item.Bs}</div>
          <div class="checkout-item-total">total: $${itemTotalUSD.toFixed(2)} | Bs ${itemTotalBS.toFixed(2)}</div>
        </div>
      </div>
    `;
  }).join('') + `
    <div class="checkout-summary-total">
      <span>total:</span>
      <span>$${totalUSD.toFixed(2)} | Bs ${totalBS.toFixed(2)}</span>
    </div>
    <div class="checkout-summary-charges">cargos adicionales: <span>$0.00 | Bs 0.00</span></div>
  `;
}

function setupPaymentMethods() {
  const methods = [
    { id: 'efectivo', label: 'Efectivo' },
    { id: 'pago-movil', label: 'Pago Móvil' },
    { id: 'paypal', label: 'Paypal' },
    { id: 'zelle', label: 'Zelle' },
    { id: 'binance', label: 'Binance' }
  ];
  const container = document.getElementById('paymentMethods');
  if (!container) return;
  container.innerHTML = methods.map(m => `
    <label class="payment-method">
      <input type="radio" name="paymentMethod" value="${m.id}" ${m.id === 'efectivo' ? 'checked' : ''}>
      <span>${m.label}</span>
    </label>
  `).join('');
}

function setupCheckoutButton() {
  const btn = document.getElementById('checkoutBtn');
  if (!btn) return;
  btn.onclick = function() {
    const cart = getCart();
    if (cart.length === 0) return;
    const orderNumber = 'ORD-' + Math.floor(Math.random() * 1000000);
    let message = `¡Hola! Quiero hacer un pedido.\n\nOrden: ${orderNumber}\n`;
    cart.forEach(item => {
      message += `\n${item.Product} x${item.quantity} - $${item.USD} | Bs ${item.Bs}`;
    });
    let totalUSD = 0, totalBS = 0;
    cart.forEach(item => {
      totalUSD += (parseFloat(item.USD) || 0) * item.quantity;
      totalBS += (parseFloat(item.Bs) || 0) * item.quantity;
    });
    message += `\n\nTotal: $${totalUSD.toFixed(2)} | Bs ${totalBS.toFixed(2)}`;
    // add payment method
    const method = document.querySelector('input[name="paymentMethod"]:checked');
    if (method) {
      message += `\n\nMétodo de pago: ${method.nextElementSibling.textContent}`;
    }
    // whatsApp link - opens in new tab
    const whatsapp = 'https://www.whatsapp.com/catalog/584128503608/?app_absent=0';
    const url = `https://wa.me/584128503608?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };
} 