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
    { id: 'efectivo', label: 'Efectivo', svg: `<svg viewBox='0 0 32 32' width='18' height='18' fill='none'><rect x='2' y='8' width='28' height='10' rx='2' fill='#82DCC7'/><rect x='2' y='18' width='28' height='6' rx='2' fill='#74CBB4'/><ellipse cx='16' cy='13' rx='4' ry='5' fill='#74CBB4'/><rect x='2' y='8' width='28' height='16' rx='2' stroke='#3b65d8' stroke-width='1.5'/></svg>` },
    { id: 'pago-movil', label: 'Pago Móvil', svg: `<svg viewBox='0 0 32 32' width='18' height='18' fill='none'><rect x='3' y='6' width='8' height='18' rx='2' fill='#69d3cc' stroke='#3b65d8' stroke-width='1.5'/><rect x='6' y='8' width='4' height='1' rx='0.5' fill='#3b65d8'/><circle cx='8' cy='23' r='1' fill='#3b65d8'/><rect x='21' y='6' width='8' height='18' rx='2' fill='#f9a8a8' stroke='#3b65d8' stroke-width='1.5'/><rect x='24' y='8' width='4' height='1' rx='0.5' fill='#3b65d8'/><circle cx='26' cy='23' r='1' fill='#3b65d8'/></svg>` },
    { id: 'paypal', label: 'PayPal', svg: `<svg viewBox='0 0 48 48' width='18' height='18'><path fill='#0d62ab' d='M18.7,13.767l0.005,0.002C18.809,13.326,19.187,13,19.66,13h13.472c0.017,0,0.034-0.007,0.051-0.006C32.896,8.215,28.887,6,25.35,6H11.878c-0.474,0-0.852,0.335-0.955,0.777l-0.005-0.002L5.029,33.813l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,0.991,1,0.991h8.071L18.7,13.767z'></path><path fill='#199be2' d='M33.183,12.994c0.053,0.876-0.005,1.829-0.229,2.882c-1.281,5.995-5.912,9.115-11.635,9.115c0,0-3.47,0-4.313,0c-0.521,0-0.767,0.306-0.88,0.54l-1.74,8.049l-0.305,1.429h-0.006l-1.263,5.796l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,1,1,1h7.333l0.013-0.01c0.472-0.007,0.847-0.344,0.945-0.788l0.018-0.015l1.812-8.416c0,0,0.126-0.803,0.97-0.803s4.178,0,4.178,0c5.723,0,10.401-3.106,11.683-9.102C42.18,16.106,37.358,13.019,33.183,12.994z'></path><path fill='#006fc4' d='M19.66,13c-0.474,0-0.852,0.326-0.955,0.769L18.7,13.767l-2.575,11.765c0.113-0.234,0.359-0.54,0.88-0.54c0.844,0,4.235,0,4.235,0c5.723,0,10.432-3.12,11.713-9.115c0.225-1.053,0.282-2.006,0.229-2.882C33.166,12.993,33.148,13,33.132,13H19.66z'></path></svg>` },
    { id: 'zelle', label: 'Zelle', svg: `<svg viewBox='0 0 48 48' width='18' height='18'><path fill='#a0f' d='M35,42H13c-3.866,0-7-3.134-7-7V13c0-3.866,3.134-7,7-7h22c3.866,0,7,3.134,7,7v22 C42,38.866,38.866,42,35,42z'></path><path fill='#fff' d='M17.5,18.5h14c0.552,0,1-0.448,1-1V15c0-0.552-0.448-1-1-1h-14c-0.552,0-1,0.448-1,1v2.5C16.5,18.052,16.948,18.5,17.5,18.5z'></path><path fill='#fff' d='M17,34.5h14.5c0.552,0,1-0.448,1-1V31c0-0.552-0.448-1-1-1H17c-0.552,0-1,0.448-1,1v2.5C16,34.052,16.448,34.5,17,34.5z'></path><path fill='#fff' d='M22.25,11v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,10.5,22.25,10.724,22.25,11z'></path><path fill='#fff' d='M22.25,32v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,31.5,22.25,31.724,22.25,32z'></path><path fill='#fff' d='M16.578,30.938H22l10.294-12.839c0.178-0.222,0.019-0.552-0.266-0.552H26.5L16.275,30.298C16.065,30.553,16.247,30.938,16.578,30.938z'></path></svg>` },
    { id: 'binance', label: 'Binance', svg: `<svg viewBox='0 0 64 64' width='18' height='18'><path fill='orange' d='M33.721,25.702l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C31.243,24.758,32.777,24.758,33.721,25.702z'></path><path fill='orange' d='M11.725,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C9.247,24.757,10.781,24.757,11.725,25.701z'></path><path fill='orange' d='M55.718,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C53.241,24.757,54.774,24.757,55.718,25.701z'></path><path fill='orange' d='M19.298,23.295l-2.581-2.583c-0.944-0.943-0.944-2.479,0-3.421l13.58-13.584c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.576c0.943,0.944,0.944,2.477,0,3.421l-2.587,2.588c-0.944,0.943-2.477,0.943-3.421-0.001l-9.284-9.292l-9.288,9.297C21.777,24.239,20.243,24.241,19.298,23.295z'></path><path fill='orange' d='M19.297,36.701l-2.583,2.583c-0.944,0.944-0.944,2.477,0,3.421l13.58,13.585c0.944,0.944,2.477,0.944,3.421,0l13.583-13.576c0.944-0.944,0.944-2.477,0-3.421l-2.587-2.587c-0.944-0.944-2.477-0.944-3.421,0l-9.284,9.292l-9.288-9.297C21.774,35.757,20.241,35.757,19.297,36.701z'></path><path fill='#fff' fill-opacity='.298' d='M16.715,17.293L30.297,3.707c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.577c-1.957,1.472-4.753,1.317-6.535-0.464l-8.76-8.752l-8.753,8.759C21.47,18.61,18.674,18.765,16.715,17.293z'></path><path fill='#fff' fill-rule='evenodd' d='M23.43,14.577c-0.585-0.585-0.585-1.536,0-2.121l3.024-3.024c0.585-0.585,1.536-0.585,2.121,0c0.585,0.585,0.585,1.536,0,2.121l-3.024,3.024C24.966,15.162,24.015,15.162,23.43,14.577z' clip-rule='evenodd'></path><path fill-opacity='.149' d='M16.715,42.706l13.581,13.585c0.944,0.945,2.477,0.945,3.421,0.001l13.583-13.577c-1.957-1.472-4.753-1.317-6.535,0.464l-8.76,8.752l-8.753-8.759C21.47,41.389,18.674,41.234,16.715,42.706z'></path><path fill-opacity='.298' d='M58.009,61c0-1.656-11.648-3-26-3s-26,1.344-26,3c0,1.656,11.648,3,26,3S58.009,62.656,58.009,61z'></path></svg>` }
  ];
  const container = document.getElementById('paymentMethods');
  if (!container) return;
  container.innerHTML = methods.map(m => `
    <label class="payment-method">
      <input type="radio" name="paymentMethod" value="${m.id}" ${m.id === 'efectivo' ? 'checked' : ''}>
      <span>${m.label}</span>
      <span class="payment-method-icon">${m.svg}</span>
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