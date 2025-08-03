// checkout.js

// jsonp for cors issues
// google script web app url for orders
const ORDER_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzHaxeUKcp8XK1SY0niB07L_FLC0lugNBGnxS77DIb1ICrd52ifS_-ZVlyZLQ3hcRut7A/exec';

// jsonp callback counter
let jsonpCounter = 0;

// send data to google sheets using jsonp
function sendToGoogleSheets(data, callback) {
  // create unique callback name
  const callbackName = 'jsonpCallback_' + (++jsonpCounter);
  
  // create global callback function
  window[callbackName] = function(response) {
    // cleanup
    delete window[callbackName];
    document.head.removeChild(script);
    
    // call the actual callback
    if (callback) {
      callback(response);
    }
  };
  
  // create script tag for jsonp
  const script = document.createElement('script');
  
  // build url with parameters
  const params = new URLSearchParams();
  params.append('callback', callbackName);
  params.append('data', JSON.stringify(data));
  
  script.src = `${ORDER_SCRIPT_URL}?${params.toString()}`;
  
  // add error handling
  script.onerror = function() {
    delete window[callbackName];
    document.head.removeChild(script);
    if (callback) {
      callback({ success: false, error: 'Network error' });
    }
  };
  
  // add timeout
  setTimeout(function() {
    if (window[callbackName]) {
      delete window[callbackName];
      document.head.removeChild(script);
      if (callback) {
        callback({ success: false, error: 'Timeout' });
      }
    }
  }, 10000); // 10 second timeout
  
  // add script to page
  document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('Checkout page loaded');
  renderCheckoutSummary();
  setupPaymentMethods();
  setupCheckoutButton();
  
  // setup delivery options when checkout page is shown
  setTimeout(() => {
    setupDeliveryOptions();
  }, 100);
  

});

// enhanced order number generation system
function generateOrderNumber() {
  // get current timestamp
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // get sequential order number from localStorage
  const lastOrderNumber = localStorage.getItem('lastOrderNumber') || 0;
  const nextOrderNumber = parseInt(lastOrderNumber) + 1;
  localStorage.setItem('lastOrderNumber', nextOrderNumber.toString());
  
  // generate unique session identifier (first 4 chars of session storage key)
  const sessionId = sessionStorage.getItem('sessionId') || generateSessionId();
  sessionStorage.setItem('sessionId', sessionId);
  
  // create timestamp component
  const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
  
  // create sequential component (padded to 6 digits)
  const sequential = String(nextOrderNumber).padStart(6, '0');
  
  // create random component for extra uniqueness (3 digits)
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  
  // combine all components
  const orderNumber = `ORD-${timestamp}-${sequential}-${sessionId}-${random}`;
  
  return orderNumber;
}

function generateSessionId() {
  // generate a 4-character alphanumeric session ID
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// using parseOrderNumber from main.js - no duplicate function needed

// ..... getOrderHistory  .... ....... . .. ......... ........ ......

function saveOrderToHistory(orderNumber, cart, totalUSD, totalBS, paymentMethod, status = 'pending') {
  // get delivery method and information
  const deliveryMethod = document.querySelector('input[name="deliveryMethod"]:checked').value;
  let deliveryInfo = null;
  
  if (deliveryMethod === 'delivery') {
    deliveryInfo = {
      name: document.getElementById('customerName').value,
      phone: document.getElementById('customerPhone').value,
      email: document.getElementById('customerEmail').value,
      address: document.getElementById('customerAddress').value,
      instructions: document.getElementById('deliveryInstructions').value
    };
  }
  
  const orderInfo = {
    orderNumber,
    orderDate: new Date().toISOString(),
    items: cart.map(item => ({
      product: item.Product,
      quantity: item.quantity,
      priceUSD: item.USD,
      priceBS: item.Bs
    })),
    totalUSD,
    totalBS,
    paymentMethod,
    status: status,
    // add delivery information
    deliveryMethod: deliveryMethod,
    deliveryInfo: deliveryInfo,
    // add pickup method for efecitvo orders
    pickupMethod: paymentMethod === 'Efectivo' ? 'retirar en tienda' : null
  };
  
  const history = getOrderHistory();
  history.unshift(orderInfo); // add in beginning of array
  
  // only last 50 for too large local storage
  if (history.length > 50) {
    history.splice(50);
  }
  
  localStorage.setItem('orderHistory', JSON.stringify(history));
  
  // send order to Google Sheets
  sendOrderToGoogleSheets(orderInfo);
  
  return orderInfo;
}

function sendOrderToGoogleSheets(orderInfo) {
  const orderData = {
    action: 'saveOrder',
    orderNumber: orderInfo.orderNumber,
    orderDate: new Date(orderInfo.orderDate).toLocaleString('es-ES'),
    paymentMethod: orderInfo.paymentMethod,
    products: orderInfo.items.map(item => item.product).join(', '),
    quantities: orderInfo.items.map(item => item.quantity).join(', '),
    totalBS: orderInfo.totalBS.toFixed(2),
    totalUSD: orderInfo.totalUSD.toFixed(2),
    status: orderInfo.status || 'pending',
    deliveryMethod: orderInfo.deliveryMethod || '',
    deliveryInfo: orderInfo.deliveryInfo || null,
    customerName: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.name : '',
    customerPhone: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.phone : '',
    customerEmail: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.email : '',
    customerAddress: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.address : '',
    deliveryInstructions: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.instructions : ''
  };
  
  sendToGoogleSheets(orderData, function(data) {
    if (data.success) {
      console.log('Order sent to Google Sheets successfully');
    } else {
      console.error('Error sending order to Google Sheets:', data.error);
    }
  });
}

// using getCart from main.js - no duplicate function needed

function renderCheckoutSummary() {
  const cart = getCart();
  const summaryContainer = document.getElementById('checkoutSummary');
  const paymentMethods = document.getElementById('paymentMethods');
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (!summaryContainer) return;
  if (cart.length === 0) {
    summaryContainer.innerHTML = '<div class="text-center text-gray-500" style="margin: 2rem 0; font-size: 1.2rem;">🛒 tu carrito está vacío, agrega productos para continuar con tu compra.</div>';
    if (paymentMethods) paymentMethods.style.display = 'none';
    if (checkoutBtn) checkoutBtn.style.display = 'none';
    return;
  }
  if (paymentMethods) paymentMethods.style.display = '';
  if (checkoutBtn) checkoutBtn.style.display = '';
  
  setTimeout(() => {
    setupDeliveryOptions();
  }, 50);
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
  console.log('Setting up payment methods...');
  const methods = [
    { id: 'efectivo', label: 'Efectivo', svg: `<svg viewBox='0 0 32 32' width='18' height='18' fill='none'><rect x='2' y='8' width='28' height='10' rx='2' fill='#82DCC7'/><rect x='2' y='18' width='28' height='6' rx='2' fill='#74CBB4'/><ellipse cx='16' cy='13' rx='4' ry='5' fill='#74CBB4'/><rect x='2' y='8' width='28' height='16' rx='2' stroke='#3b65d8' stroke-width='1.5'/></svg>` },
    { id: 'pago-movil', label: 'Pago Móvil', svg: `<svg viewBox='0 0 32 32' width='18' height='18' fill='none'><rect x='3' y='6' width='8' height='18' rx='2' fill='#69d3cc' stroke='#3b65d8' stroke-width='1.5'/><rect x='6' y='8' width='4' height='1' rx='0.5' fill='#3b65d8'/><circle cx='8' cy='23' r='1' fill='#3b65d8'/><rect x='21' y='6' width='8' height='18' rx='2' fill='#f9a8a8' stroke='#3b65d8' stroke-width='1.5'/><rect x='24' y='8' width='4' height='1' rx='0.5' fill='#3b65d8'/><circle cx='26' cy='23' r='1' fill='#3b65d8'/></svg>` },
    { id: 'paypal', label: 'PayPal', svg: `<svg viewBox='0 0 48 48' width='18' height='18'><path fill='#0d62ab' d='M18.7,13.767l0.005,0.002C18.809,13.326,19.187,13,19.66,13h13.472c0.017,0,0.034-0.007,0.051-0.006C32.896,8.215,28.887,6,25.35,6H11.878c-0.474,0-0.852,0.335-0.955,0.777l-0.005-0.002L5.029,33.813l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,0.991,1,0.991h8.071L18.7,13.767z'></path><path fill='#199be2' d='M33.183,12.994c0.053,0.876-0.005,1.829-0.229,2.882c-1.281,5.995-5.912,9.115-11.635,9.115c0,0-3.47,0-4.313,0c-0.521,0-0.767,0.306-0.88,0.54l-1.74,8.049l-0.305,1.429h-0.006l-1.263,5.796l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,1,1,1h7.333l0.013-0.01c0.472-0.007,0.847-0.344,0.945-0.788l0.018-0.015l1.812-8.416c0,0,0.126-0.803,0.97-0.803s4.178,0,4.178,0c5.723,0,10.401-3.106,11.683-9.102C42.18,16.106,37.358,13.019,33.183,12.994z'></path><path fill='#006fc4' d='M19.66,13c-0.474,0-0.852,0.326-0.955,0.769L18.7,13.767l-2.575,11.765c0.113-0.234,0.359-0.54,0.88-0.54c0.844,0,4.235,0,4.235,0c5.723,0,10.432-3.12,11.713-9.115c0.225-1.053,0.282-2.006,0.229-2.882C33.166,12.993,33.148,13,33.132,13H19.66z'></path></svg>` },
    { id: 'zelle', label: 'Zelle', svg: `<svg viewBox='0 0 48 48' width='18' height='18'><path fill='#a0f' d='M35,42H13c-3.866,0-7-3.134-7-7V13c0-3.866,3.134-7,7-7h22c3.866,0,7,3.134,7,7v22 C42,38.866,38.866,42,35,42z'></path><path fill='#fff' d='M17.5,18.5h14c0.552,0,1-0.448,1-1V15c0-0.552-0.448-1-1-1h-14c-0.552,0-1,0.448-1,1v2.5C16.5,18.052,16.948,18.5,17.5,18.5z'></path><path fill='#fff' d='M17,34.5h14.5c0.552,0,1-0.448,1-1V31c0-0.552-0.448-1-1-1H17c-0.552,0-1,0.448-1,1v2.5C16,34.052,16.448,34.5,17,34.5z'></path><path fill='#fff' d='M22.25,11v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,10.5,22.25,10.724,22.25,11z'></path><path fill='#fff' d='M22.25,32v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,31.5,22.25,31.724,22.25,32z'></path><path fill='#fff' d='M16.578,30.938H22l10.294-12.839c0.178-0.222,0.019-0.552-0.266-0.552H26.5L16.275,30.298C16.065,30.553,16.247,30.938,16.578,30.938z'></path></svg>` },
    { id: 'binance', label: 'Binance', svg: `<svg viewBox='0 0 64 64' width='18' height='18'><path fill='orange' d='M33.721,25.702l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C31.243,24.758,32.777,24.758,33.721,25.702z'></path><path fill='orange' d='M11.725,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C9.247,24.757,10.781,24.757,11.725,25.701z'></path><path fill='orange' d='M55.718,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C53.241,24.757,54.774,24.757,55.718,25.701z'></path><path fill='orange' d='M19.298,23.295l-2.581-2.583c-0.944-0.943-0.944-2.479,0-3.421l13.58-13.584c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.576c0.943,0.944,0.944,2.477,0,3.421l-2.587,2.588c-0.944,0.943-2.477,0.943-3.421-0.001l-9.284-9.292l-9.288,9.297C21.777,24.239,20.243,24.241,19.298,23.295z'></path><path fill='orange' d='M19.297,36.701l-2.583,2.583c-0.944,0.944-0.944,2.477,0,3.421l13.58,13.585c0.944,0.944,2.477,0.944,3.421,0l13.583-13.576c0.944-0.944,0.944-2.477,0-3.421l-2.587-2.587c-0.944-0.944-2.477-0.944-3.421,0l-9.284,9.292l-9.288-9.297C21.774,35.757,20.241,35.757,19.297,36.701z'></path><path fill='#fff' fill-opacity='.298' d='M16.715,17.293L30.297,3.707c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.577c-1.957,1.472-4.753,1.317-6.535-0.464l-8.76-8.752l-8.753,8.759C21.47,18.61,18.674,18.765,16.715,17.293z'></path><path fill='#fff' fill-rule='evenodd' d='M23.43,14.577c-0.585-0.585-0.585-1.536,0-2.121l3.024-3.024c0.585-0.585,1.536-0.585,2.121,0c0.585,0.585,0.585,1.536,0,2.121l-3.024,3.024C24.966,15.162,24.015,15.162,23.43,14.577z' clip-rule='evenodd'></path><path fill-opacity='.149' d='M16.715,42.706l13.581,13.585c0.944,0.945,2.477,0.945,3.421,0.001l13.583-13.577c-1.957,1.472-4.753,1.317-6.535,0.464l-8.76,8.752l-8.753-8.759C21.47,41.389,18.674,41.234,16.715,42.706z'></path><path fill-opacity='.298' d='M58.009,61c0-1.656-11.648-3-26-3s-26,1.344-26,3c0,1.656,11.648,3,26,3S58.009,62.656,58.009,61z'></path></svg>` }
  ];
  const container = document.getElementById('paymentMethods');
  console.log('Payment methods container:', container);
  if (!container) {
    console.error('Payment methods container not found!');
    return;
  }
  container.innerHTML = methods.map(m => `
    <label class="payment-method">
      <input type="radio" name="paymentMethod" value="${m.id}" ${m.id === 'efectivo' ? 'checked' : ''}>
      <span>${m.label}</span>
      <span class="payment-method-icon">${m.svg}</span>
    </label>
  `).join('');
  
  // add event listeners for payment method changes
  const radioButtons = container.querySelectorAll('input[name="paymentMethod"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', function() {
      showCashPaymentWidget(this.value === 'efectivo');
    });
  });
  
  // show cash widget initially if efectivo is selected
  showCashPaymentWidget(true);
}

function setupDeliveryOptions() {
  const deliveryOptions = document.querySelectorAll('input[name="deliveryMethod"]');
  const deliveryForm = document.getElementById('deliveryInfoForm');
  const deliveryOptionsContainer = document.getElementById('deliveryOptions');
  
  console.log('Setting up delivery options...');
  console.log('Found delivery options:', deliveryOptions.length);
  console.log('Found delivery form:', deliveryForm);
  console.log('Found delivery options container:', deliveryOptionsContainer);
  
  // check if delivery options container is visible
  if (deliveryOptionsContainer) {
    console.log('Delivery options container styles:', {
      display: deliveryOptionsContainer.style.display,
      visibility: deliveryOptionsContainer.style.visibility,
      opacity: deliveryOptionsContainer.style.opacity,
      classList: deliveryOptionsContainer.classList.toString()
    });
  }
  
  if (!deliveryForm) {
    console.error('Delivery form not found!');
    return;
  }
  
      deliveryOptions.forEach(option => {
      option.addEventListener('change', function() {
        console.log('Delivery option changed to:', this.value);
        if (this.value === 'delivery') {
          console.log('Showing delivery form');
          deliveryForm.style.display = 'block';
          deliveryForm.classList.remove('hidden');
        } else {
          console.log('Hiding delivery form');
          deliveryForm.style.display = 'none';
          deliveryForm.classList.add('hidden');
        }
      });
    });
    
    // Set initial state based on checked option
    const checkedOption = document.querySelector('input[name="deliveryMethod"]:checked');
    if (checkedOption) {
      console.log('Initial delivery option:', checkedOption.value);
      if (checkedOption.value === 'delivery') {
        deliveryForm.style.display = 'block';
        deliveryForm.classList.remove('hidden');
      } else {
        deliveryForm.style.display = 'none';
        deliveryForm.classList.add('hidden');
      }
    }
}

function showCashPaymentWidget(show) {
  console.log('showCashPaymentWidget called with show:', show);
  let widget = document.getElementById('cashPaymentWidget');
  
  if (show) {
    if (!widget) {
      console.log('Creating new cash payment widget');
      widget = document.createElement('div');
      widget.id = 'cashPaymentWidget';
      widget.className = 'cash-payment-widget';
      widget.innerHTML = `
        <div class="cash-widget-content">
          <h3 class="cash-widget-title">💵 Dirección para Recoger (◕‿◕)</h3>
          <div class="address-info">
            <p class="address-text">📍 Carrera 19 con Avenida Vargas, CC Capital Plaza, Segundo piso, Local 80</p>
            <div class="google-maps-widget">
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d448.8496132252689!2d-69.30971028957845!3d10.066832717819146!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e876772ee64127d%3A0xc32c2c566cc7dab7!2sCapital%20Plaza!5e1!3m2!1sen!2sus!4v1754191275022!5m2!1sen!2sus"
                width="100%" 
                height="200" 
                style="border:0; border-radius: 12px;" 
                allowfullscreen="" 
                loading="lazy" 
                referrerpolicy="no-referrer-when-downgrade">
              </iframe>
            </div>
          </div>
          <div class="punto-message">
            <div class="punto-icon">💳</div>
            <p class="punto-text">¡Aceptamos Punto! (◕‿◕)</p>
          </div>
        </div>
      `;
      
      // ALWAYS after payment methods
      const paymentMethods = document.getElementById('paymentMethods');
      if (paymentMethods && paymentMethods.parentNode) {
        console.log('Inserting widget after payment methods');
        paymentMethods.parentNode.insertBefore(widget, paymentMethods.nextSibling);
      } else {
        console.error('Payment methods container not found');
      }
    } else {
      console.log('Widget already exists, showing it');
    }
    widget.style.display = 'block';
    console.log('Cash payment widget shown');
  } else {
    if (widget) {
      console.log('Hiding cash payment widget');
      widget.style.display = 'none';
    } else {
      console.log('No widget to hide');
    }
  }
}

function setupCheckoutButton() {
  const btn = document.getElementById('checkoutBtn');
  if (!btn) return;
  btn.onclick = function() {
    console.log('Checkout button clicked!');
    const cart = getCart();
    if (cart.length === 0) {
      alert('Tu carrito está vacío');
      return;
    }
    
    // check if a delivery method is selected
    const selectedDeliveryMethod = document.querySelector('input[name="deliveryMethod"]:checked');
    if (!selectedDeliveryMethod) {
      alert('Por favor selecciona un método de entrega');
      return;
    }
    
    const deliveryMethod = selectedDeliveryMethod.value;
    console.log('Selected delivery method:', deliveryMethod);
    
    // validate delivery form if delivery is selected
    if (deliveryMethod === 'delivery') {
      console.log('Validating delivery form...');
      const requiredFields = ['customerName', 'customerPhone', 'customerAddress'];
      const missingFields = [];
      
      requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        console.log(`Checking field ${fieldId}:`, field ? field.value : 'field not found');
        if (!field || !field.value.trim()) {
          missingFields.push(fieldId);
          if (field) {
            field.style.borderColor = '#ef4444';
          }
        } else {
          if (field) {
            field.style.borderColor = '#d1d5db';
          }
        }
      });
      
      if (missingFields.length > 0) {
        console.log('Missing fields:', missingFields);
        alert('Por favor completa todos los campos requeridos para la entrega');
        return;
      }
      console.log('Delivery form validation passed');
    } else {
      console.log('Store pickup selected - no delivery form validation needed');
    }
    
    // generate enhanced order number
    const orderNumber = generateOrderNumber();
    const orderInfo = parseOrderNumber(orderNumber);
    
    // calculate totals
    let totalUSD = 0, totalBS = 0;
    cart.forEach(item => {
      totalUSD += (parseFloat(item.USD) || 0) * item.quantity;
      totalBS += (parseFloat(item.Bs) || 0) * item.quantity;
    });
    
    // check if a payment method is selected
    const selectedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked');
    if (!selectedPaymentMethod) {
      alert('Por favor selecciona un método de pago');
      return;
    }
    
    const paymentMethod = selectedPaymentMethod.value;
    const paymentMethodLabel = selectedPaymentMethod.nextElementSibling.textContent;
    
    console.log('Payment method:', paymentMethod);
    console.log('Payment method label:', paymentMethodLabel);
    
    // save order to history with appropriate status
    const orderStatus = paymentMethod === 'efectivo' ? 'pending' : 'pending';
    console.log('Saving order to history:', orderNumber);
    const savedOrder = saveOrderToHistory(orderNumber, cart, totalUSD, totalBS, paymentMethodLabel, orderStatus);
    console.log('Order saved successfully:', savedOrder);
    
    // clear cart after successful order creation
    localStorage.removeItem('cart');
    console.log('Cart cleared');
    
    // show success notification
    const isCashPayment = paymentMethod === 'efectivo';
    showOrderSuccessNotification(orderInfo.shortNumber, isCashPayment);
    
    // redirect to appropriate payment page
    if (paymentMethod === 'efectivo') {
      // redirect to apartado page
      updateUrl({ page: 'apartado', order: orderNumber });
      if (window.handleRouting) {
        window.handleRouting();
      } else if (window.showApartadoPage) {
        window.showApartadoPage(orderNumber);
      }
    } else {
      // redirect to payment page
      updateUrl({ page: 'pay', method: paymentMethod, order: orderNumber });
      if (window.handleRouting) {
        window.handleRouting();
      } else if (window.showPaymentPage) {
        window.showPaymentPage(paymentMethod, orderNumber);
      }
    }
  };
}

function showOrderSuccessNotification(orderNumber, isCashPayment = false) {
  const notification = document.createElement('div');
  notification.className = 'order-success-notification';
  const message = isCashPayment 
    ? `✅ ¡Apartado exitoso! Orden: ${orderNumber} (◕‿◕)`
    : `✅ ¡Orden creada exitosamente! Orden: ${orderNumber} (◕‿◕)`;
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff6b9d, #ff8fab);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 25px rgba(255, 107, 157, 0.3);
      z-index: 10000;
      max-width: 300px;
      animation: slideInRight 0.5s ease-out;
    ">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        ">
        </div>
        <div>
          <div style="font-weight: bold; margin-bottom: 4px;">¡Orden creada!</div>
          <div style="font-size: 14px; opacity: 0.9;">${orderNumber}</div>
        </div>
      </div>
    </div>
  `;
  
  // add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // remove notification after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);
}

// Enhanced show cart notification with emojis
function showCartNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'cart-notification';
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">🛒</span>
      <span class="notification-text">${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // remove notification after 6 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 6000);
}


// expose functions globally
window.showOrderSuccessNotification = showOrderSuccessNotification;
window.setupDeliveryOptions = setupDeliveryOptions;

// initialize checkout page
window.initializeCheckoutPage = function() {
  console.log('Initializing checkout page...');
  renderCheckoutSummary();
  setupPaymentMethods();
  setupCheckoutButton();
  setupDeliveryOptions();
}; 