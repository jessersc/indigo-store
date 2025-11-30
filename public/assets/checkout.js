// checkout.js

// helper function to get first image from comma separated image strings
function getFirstImage(imageString) {
  if (!imageString) return '';
  if (imageString.includes(',')) {
    return imageString.split(',')[0].trim();
  }
  return imageString;
}

// jsonp for cors issues
// Google Script URLs - will be loaded from server config
let ORDER_SCRIPT_URL = '';
let BACKUP_SCRIPT_URL = '';
let ORDER_PAYMENT_TRACKER_URL = '';

// DEPRECATED: Google Scripts config loader - no longer used
// Migration to Supabase in progress - orders/payments will be saved to Supabase
async function loadCheckoutScriptsConfig() {
  try {
    const response = await fetch('/api/config/google-scripts');
    if (!response.ok) {
      console.warn('Google Scripts config endpoint not available (migration in progress)');
      return;
    }
    const config = await response.json();
    
    ORDER_SCRIPT_URL = config.ordersUrl || '';
    BACKUP_SCRIPT_URL = config.ordersUrl || ''; // Using same URL as backup
    ORDER_PAYMENT_TRACKER_URL = config.trackerUrl || '';
    
    if (!config.ordersUrl && !config.trackerUrl) {
      console.warn('Google Scripts URLs not configured - using Supabase instead');
    } else {
      console.log('Checkout scripts config loaded successfully');
    }
  } catch (error) {
    console.warn('Failed to load checkout scripts config (migration in progress):', error);
    // Don't throw - allow page to load even if scripts aren't configured
  }
}

// Initialize config on load (but it's deprecated - migration to Supabase in progress)
loadCheckoutScriptsConfig();

// jsonp callback counter
let jsonpCounter = 0;

// send data to google sheets using jsonp
function sendToGoogleSheets(data, callback, retryCount = 0) {
  // create unique callback name
  const callbackName = 'jsonpCallback_' + (++jsonpCounter);
  
  // create global callback function
  window[callbackName] = function(response) {
    // cleanup
    delete window[callbackName];
    if (document.head.contains(script)) {
      document.head.removeChild(script);
    }
    
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
  
  // use backup url if retrying
  const scriptUrl = retryCount > 0 ? BACKUP_SCRIPT_URL : ORDER_SCRIPT_URL;
  script.src = `${scriptUrl}?${params.toString()}`;
  
  // add error handling
  script.onerror = function() {
    console.error('Script load error for URL:', script.src);
    delete window[callbackName];
    if (document.head.contains(script)) {
      document.head.removeChild(script);
    }
    
    // retry with backup url if this was the first attempt
    if (retryCount === 0) {
      setTimeout(() => {
        sendToGoogleSheets(data, callback, 1);
      }, 1000);
    } else {
      if (callback) {
        callback({ success: false, error: 'Network error - Script failed to load after retry' });
      }
    }
  };
  
  // add timeout
  setTimeout(function() {
    if (window[callbackName]) {
      delete window[callbackName];
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
      
      // retry with backup url if this was the first attempt
      if (retryCount === 0) {
        sendToGoogleSheets(data, callback, 1);
      } else {
        if (callback) {
          callback({ success: false, error: 'Timeout after retry' });
        }
      }
    }
  }, 15000); // 15 second timeout
  
  // add script to page
  document.head.appendChild(script);
}

// function to send data to the order and payment tracker script
function sendToOrderPaymentTracker(data, callback, retryCount = 0) {
  // Check if tracker URL is configured
  if (!ORDER_PAYMENT_TRACKER_URL || ORDER_PAYMENT_TRACKER_URL.trim() === '') {
    console.warn('Order/Payment Tracker URL not configured - skipping tracker save');
    if (callback) {
      callback({ success: false, error: 'Tracker URL not configured' });
    }
    return;
  }
  
  // create unique callback name
  const callbackName = 'trackerCallback_' + (++jsonpCounter);
  
  // create script tag for jsonp
  const script = document.createElement('script');
  
  // Track if callback was called to prevent double execution
  let callbackExecuted = false;
  let timeoutId = null;
  
  // create global callback function
  window[callbackName] = function(response) {
    if (callbackExecuted) return;
    callbackExecuted = true;
    
    // Clear timeout if it exists
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // cleanup
    delete window[callbackName];
    if (document.head.contains(script)) {
      document.head.removeChild(script);
    }
    
    // call the actual callback
    if (callback) {
      callback(response);
    }
  };
  
  // build url with parameters
  const params = new URLSearchParams();
  params.append('callback', callbackName);
  params.append('data', JSON.stringify(data));
  
  script.src = `${ORDER_PAYMENT_TRACKER_URL}?${params.toString()}`;
  
  // add error handling
  script.onerror = function() {
    if (callbackExecuted) return;
    callbackExecuted = true;
    
    console.warn('Order/Payment Tracker script load error - this is non-critical');
    
    // Clear timeout if it exists
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    delete window[callbackName];
    if (document.head.contains(script)) {
      document.head.removeChild(script);
    }
    
    if (callback) {
      callback({ success: false, error: 'Network error - Script failed to load' });
    }
  };
  
  // add timeout
  timeoutId = setTimeout(function() {
    if (window[callbackName] && !callbackExecuted) {
      callbackExecuted = true;
      delete window[callbackName];
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
      
      if (callback) {
        callback({ success: false, error: 'Timeout' });
      }
    }
  }, 10000); // 10 second timeout (reduced from 15)
  
  // add script to page
  document.head.appendChild(script);
}

// function to save order when clking "ir a pagar"
function saveOrderToTracker(orderInfo, callback) {
  const orderData = {
    action: 'saveOrderToTracker',
    orderNumber: orderInfo.orderNumber,
    orderDate: orderInfo.orderDate,
    paymentMethod: orderInfo.paymentMethod,
    products: orderInfo.items.map(item => item.product).join(', '),
    quantities: orderInfo.items.map(item => item.quantity).join(', '),
    totalUSD: orderInfo.totalUSD,
    totalBS: orderInfo.totalBS,
    status: orderInfo.status || 'pending',
    deliveryMethod: orderInfo.deliveryMethod || '',
    customerName: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.name : '',
    customerPhone: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.phone : '',
    customerEmail: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.email : '',
    customerCedula: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.cedula : '',
    customerAddress: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.address : '',
    deliveryInstructions: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.instructions : ''
  };
  
  
  sendToOrderPaymentTracker(orderData, function(response) {
    if (response.success) {
      console.log('Order saved to tracker with cédula:', orderData.customerCedula);
    } else {
      console.error('Error saving order to tracker:', response.error);
    }
    
    if (callback) {
      callback(response);
    }
  });
}

// Function to save payment completion after successful PayPal or Cashea payment
async function savePaymentCompletion(paymentData, callback) {
  try {
    // Validate payment status before saving - don't save as completed if payment failed
    const paymentStatus = paymentData.status || 'pending';
    const validCompletedStatuses = ['completed', 'Completed', 'COMPLETED', 'paid', 'Paid', 'PAID', 'success', 'Success', 'SUCCESS'];
    const isPaymentSuccessful = validCompletedStatuses.includes(paymentStatus);
    
    if (!isPaymentSuccessful && paymentStatus !== 'pending') {
      console.warn('Payment status is not successful:', paymentStatus);
      console.warn('Payment data:', paymentData);
      // Still save but with the correct status
      paymentData.status = paymentStatus;
    } else if (isPaymentSuccessful) {
      paymentData.status = 'completed';
    }
    
    // Get order ID from Supabase (stored when order was created)
    let orderId = paymentData.supabaseOrderId;
    if (!orderId && paymentData.orderNumber) {
      orderId = localStorage.getItem(`order_${paymentData.orderNumber}_supabase_id`);
    }
    
    // If we don't have order ID, try to find order by order_number
    if (!orderId && paymentData.orderNumber) {
      try {
        const supabase = await getSupabaseClient();
        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('order_number', paymentData.orderNumber)
          .single();
        if (order) {
          orderId = order.id;
          localStorage.setItem(`order_${paymentData.orderNumber}_supabase_id`, order.id);
        }
      } catch (error) {
        console.warn('Could not find order ID for payment:', error);
      }
    }
    
    // Check if payment already exists to prevent duplicates
    let existingPayment = null;
    if (paymentData.transactionId && typeof getSupabaseClient !== 'undefined') {
      try {
        const supabase = await getSupabaseClient();
        const { data: existing } = await supabase
          .from('payments')
          .select('id')
          .eq('transaction_id', paymentData.transactionId)
          .maybeSingle();
        
        if (existing) {
          existingPayment = existing;
          console.log('Payment already exists with transaction ID, skipping duplicate:', existing.id);
        }
      } catch (error) {
        console.warn('Could not check for existing payment:', error);
      }
    }
    
    // Save payment to Supabase (only if it doesn't exist)
    let paymentSavedToSupabase = false;
    let paymentError = null;
    
    if (orderId && !existingPayment) {
      try {
        const savedPayment = await savePaymentToSupabase({
          ...paymentData,
          date: paymentData.date || new Date().toISOString(),
          status: paymentData.status || (isPaymentSuccessful ? 'completed' : 'pending')
        }, orderId);
        console.log('Payment saved to Supabase successfully:', savedPayment);
        paymentSavedToSupabase = true;
      } catch (error) {
        paymentError = error;
        console.error('Error saving payment to Supabase:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        // Continue with tracker save for backward compatibility
      }
    } else if (existingPayment) {
      console.log('Payment already exists, skipping duplicate save');
      paymentSavedToSupabase = true; // Consider it successful since it already exists
    } else {
      console.warn('Could not save payment to Supabase - order ID not found');
      console.warn('Payment data:', {
        orderNumber: paymentData.orderNumber,
        paymentMethod: paymentData.paymentMethod,
        totalUSD: paymentData.totalUSD,
        hasSupabaseOrderId: !!paymentData.supabaseOrderId
      });
      // Don't return - still try to save to tracker for backward compatibility
    }
    
    // DEPRECATED: Keep tracker call for backward compatibility
    // TODO: Remove once migration is complete
    const nameWithCedula = paymentData.customerName && paymentData.customerCedula
      ? `${paymentData.customerName} (Cédula: ${paymentData.customerCedula})`
      : paymentData.customerName;

    const data = {
      action: 'savePaymentCompletion',
      orderNumber: paymentData.orderNumber,
      paypalOrderId: paymentData.paypalOrderId || '',
      casheaOrderId: paymentData.casheaOrderId || '',
      providerOrderId: paymentData.providerOrderId || '',
      transactionId: paymentData.transactionId || '',
      totalUSD: paymentData.totalUSD,
      totalBS: paymentData.totalBS || 0,
      paymentMethod: paymentData.paymentMethod || 'Unknown',
      customerName: nameWithCedula,
      customerEmail: paymentData.customerEmail,
      customerPhone: paymentData.customerPhone || '',
      customerCedula: paymentData.customerCedula || '',
      products: paymentData.products || '',
      quantities: paymentData.quantities || '',
      deliveryMethod: paymentData.deliveryMethod || '',
      deliveryType: paymentData.deliveryType || '',
      customerAddress: paymentData.customerAddress || '',
      DcustomerAddress: paymentData.customerAddress || '',
      deliveryInstructions: paymentData.deliveryInstructions || '',
      rawPayPalData: paymentData.rawPayPalData || {},
      rawCasheaData: paymentData.rawCasheaData || {},
      rawData: paymentData.rawData || {}
    };
    
    try {
      sendToOrderPaymentTracker(data, function(response) {
        if (response.success) {
          console.log('Payment completion saved to tracker successfully');
        } else {
          console.warn('Error saving payment completion to tracker (expected during migration):', response.error);
        }
        
        // Call callback once with combined result
        if (callback) {
          // Success if payment was saved to Supabase OR tracker succeeded
          const success = (orderId && !paymentError) || response.success;
          callback({ 
            success: success, 
            message: success ? 'Payment saved successfully' : 'Payment save may have failed',
            error: response.error || (orderId ? null : 'Order ID not found')
          });
        }
      });
    } catch (error) {
      console.warn('Tracker save failed (expected during migration):', error);
      // Call callback with Supabase save status
      if (callback) {
        callback({ 
          success: paymentSavedToSupabase, 
          message: paymentSavedToSupabase ? 'Payment saved to Supabase (tracker failed)' : 'Payment not saved - order ID not found or save failed',
          error: paymentSavedToSupabase ? null : (paymentError ? paymentError.message : 'Order ID not found')
        });
      }
    }
  } catch (error) {
    console.error('Error saving payment completion:', error);
    if (callback) {
      callback({ success: false, error: error.message });
    }
  }
}

// expose functions globally for use in main.js
window.sendToGoogleSheets = sendToGoogleSheets;
window.sendToOrderPaymentTracker = sendToOrderPaymentTracker;
window.saveOrderToTracker = saveOrderToTracker;
window.savePaymentCompletion = savePaymentCompletion;

document.addEventListener('DOMContentLoaded', function() {
  renderCheckoutSummary();
  setupPaymentMethods();
  setupCheckoutButton();
  
  // Load courier data immediately
  loadCourierData();
  
  // setup delivery options when checkout page is shown
  setTimeout(() => {
    setupDeliveryOptions();
  }, 100);
  

});

// enhanced order number generation system - 9 CHARACTERS
function generateOrderNumber() {
  // NEW FORMAT: XXX-RRSSRRHH
  // Where:
  // XXX = 3 random letters from current month name (e.g., "NOVEMBER" -> "NVE", "OME", etc.)
  // RR = random 00-99 (first occurrence)
  // SS = current seconds 00-59
  // RR = random 00-99 (second occurrence)
  // HH = current hour in 24-hour format 00-23
  //
  // Examples:
  // - For November at 14:35:42 -> "NVE-52423514" (NVE from NOVEMBER, random 52, seconds 42, random 35, hour 14)
  // - For May at 09:15:30 -> "AMY-67300909" (AMY from MAY, random 67, seconds 30, random 09, hour 09)
  
  const now = new Date();
  
  // Get month name and convert to uppercase
  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
                      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const monthName = monthNames[now.getMonth()];
  
  // Get all letters from month name (including duplicates if month has repeated letters)
  // This allows for natural variety (e.g., NOVEMBER has two E's, so "EEM" or "NEE" are possible)
  const monthLetters = monthName.split('').filter(letter => /[A-Z]/.test(letter));
  
  // Pick 3 random letters from month name (can repeat if month has duplicate letters)
  let xxx = '';
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * monthLetters.length);
    xxx += monthLetters[randomIndex];
  }
  
  // First RR: random 00-99
  const rr1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  
  // SS: current seconds 00-59
  const ss = String(now.getSeconds()).padStart(2, '0');
  
  // Second RR: random 00-99
  const rr2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  
  // HH: current hour in 24-hour format 00-23
  const hh = String(now.getHours()).padStart(2, '0');
  
  // Combine: XXX-RRSSRRHH
  const orderNumber = `${xxx}-${rr1}${ss}${rr2}${hh}`;
  
  return orderNumber;
}

function generateSessionId() {
  // generates a 4-character alphanumeric session ID
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// using parseOrderNumber from main.js - no duplicate needed

// ..... getOrderHistory  .... ....... . .. ......... ........ ......

function saveOrderToHistory(orderNumber, cart, totalUSD, totalBS, paymentMethod, status = 'pending') {
  // Prefer delivery info snapshot from pendingOrderData if available (post-redirect)
  let deliveryMethod;
  let deliveryType;
  let deliveryInfo = null;
  try {
    const pending = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
    if (pending && pending.deliveryInfo) {
      deliveryMethod = pending.deliveryMethod || 'pickup';
      deliveryType = pending.deliveryType || 'pickup';
      deliveryInfo = pending.deliveryInfo;
      console.log('Using delivery info from pendingOrderData snapshot:', deliveryInfo);
    }
  } catch (e) {
  }
  
  // If no snapshot, read from DOM (pre-redirect flows)
  if (!deliveryInfo) {
    // get delivery method and information
    const selectedDeliveryOption = document.querySelector('input[name="deliveryMethod"]:checked');
    deliveryMethod = selectedDeliveryOption ? selectedDeliveryOption.value : 'pickup';
    deliveryType = selectedDeliveryOption ? selectedDeliveryOption.id : 'pickup';
    
    // Always collect cédula regardless of delivery method
    const cedulaField = document.getElementById('customerCedula');
    const cedulaValue = cedulaField ? cedulaField.value : '';
    console.log('Cédula field found:', !!cedulaField);
    console.log('Cédula field value:', cedulaValue);
    console.log('Cédula field element:', cedulaField);
    
    if (deliveryMethod === 'delivery') {
      deliveryInfo = {
        name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        cedula: cedulaValue,
        email: document.getElementById('customerEmail').value,
        deliveryType: deliveryType === 'delivery-home' ? 'Entrega a domicilio' : 'Envío Nacionales'
      };
      
      console.log('Complete deliveryInfo:', deliveryInfo);
      
      if (deliveryType === 'delivery-home') {
        // Home delivery specific fields
        deliveryInfo.address = document.getElementById('customerAddress').value;
        deliveryInfo.instructions = document.getElementById('deliveryInstructions').value;
        deliveryInfo.emailText = document.getElementById('emailText').value;
      } else if (deliveryType === 'delivery-national') {
        // National shipping specific fields
        const officeSelect = document.getElementById('officeSelect');
        const officeData = officeSelect.value ? JSON.parse(officeSelect.value) : null;
        
        deliveryInfo.courier = officeData ? officeData.courier : '';
        deliveryInfo.state = officeData ? officeData.state : '';
        deliveryInfo.office = officeData ? officeData.office : '';
        deliveryInfo.officeAddress = officeData ? officeData.address : '';
        deliveryInfo.emailText = document.getElementById('emailTextNational').value;
      }
    } else {
      // For pickup/efectivo orders, collect all customer info (name, phone, email, cédula)
      const customerName = document.getElementById('customerName') ? document.getElementById('customerName').value : '';
      const customerPhone = document.getElementById('customerPhone') ? document.getElementById('customerPhone').value : '';
      const customerEmail = document.getElementById('customerEmail') ? document.getElementById('customerEmail').value : '';
      
      deliveryInfo = {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        cedula: cedulaValue,
        deliveryType: 'Retiro en tienda'
      };
      console.log('Pickup deliveryInfo with all customer info:', deliveryInfo);
    }
  }
  
  const orderInfo = {
    orderNumber,
    orderDate: new Date().toISOString(),
    items: cart.map(item => ({
      // Persist richer item details for downstream payments (e.g., Cashea)
      itemId: item.ItemID,
      product: item.Product,
      quantity: item.quantity,
      priceUSD: item.USD,
      priceBS: item.Bs,
      sku: item.SKU || item.sku || '',
      description: item.Description || '',
      imageUrl: getFirstImage(item.Image || '')
    })),
    totalUSD,
    totalBS,
    paymentMethod,
    status: status,
    // add delivery information
    deliveryMethod: deliveryMethod,
    deliveryType: deliveryType,
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
  
  // Check if order already exists in Supabase before saving (prevent duplicates)
  const existingOrderId = localStorage.getItem(`order_${orderInfo.orderNumber}_supabase_id`);
  if (existingOrderId) {
    console.log('Order already exists in Supabase, skipping duplicate save in saveOrderToHistory:', existingOrderId);
    orderInfo.supabaseOrderId = existingOrderId;
  } else {
    // Save order to Supabase
    saveOrderToSupabase(orderInfo)
      .then(order => {
        console.log('Order saved to Supabase successfully:', order);
        // Store order ID for later payment linking
        if (order && order.id) {
          orderInfo.supabaseOrderId = order.id;
          localStorage.setItem(`order_${orderInfo.orderNumber}_supabase_id`, order.id);
        }
      })
      .catch(error => {
        console.error('Failed to save order to Supabase:', error);
        // Still allow order to proceed - don't block user
      });
  }
  
  // DEPRECATED: Keep Google Sheets call for backward compatibility during migration
  // TODO: Remove once migration is complete
  try {
    sendOrderToGoogleSheets(orderInfo);
  } catch (error) {
    console.warn('Google Sheets save failed (expected during migration):', error);
  }
  
  return orderInfo;
}

// DEPRECATED: This function is kept for backward compatibility
// TODO: Remove once migration to Supabase is complete
function sendOrderToGoogleSheets(orderInfo) {
  // ise the full order number (already 9 characters)
  const orderNumber = orderInfo.orderNumber;
  
  // Build address information based on delivery type
  let addressInfo = '';
  let cedulaInfo = '';
  
  if (orderInfo.deliveryType === 'delivery-national' && orderInfo.deliveryInfo) {
    // For national shipping: Office + State + Delivery Company
    const { courier, office, state } = orderInfo.deliveryInfo;
    if (courier && office && state) {
      addressInfo = `${office}, ${state}, ${courier}`;
    }
  } else if (orderInfo.deliveryInfo && orderInfo.deliveryInfo.address) {
    // For home delivery: Customer's address
    addressInfo = orderInfo.deliveryInfo.address;
  } else if (orderInfo.deliveryInfo && orderInfo.deliveryInfo.deliveryType === 'Retiro en tienda') {
    // For pickup orders: Empty address
    addressInfo = '';
  }
  
  // Cédula goes in NOTAS column
  console.log('Full orderInfo.deliveryInfo:', orderInfo.deliveryInfo);
  if (orderInfo.deliveryInfo && orderInfo.deliveryInfo.cedula) {
    cedulaInfo = `Cédula: ${orderInfo.deliveryInfo.cedula}`;
    console.log('Cédula found in deliveryInfo:', orderInfo.deliveryInfo.cedula);
  } else {
    console.log('No cédula found in deliveryInfo:', orderInfo.deliveryInfo);
    console.log('Available keys in deliveryInfo:', orderInfo.deliveryInfo ? Object.keys(orderInfo.deliveryInfo) : 'deliveryInfo is null');
  }

  // Compose delivery instructions with any additional text
  const combinedInstructions = (orderInfo.deliveryInfo && (orderInfo.deliveryInfo.instructions || orderInfo.deliveryInfo.emailText))
    ? `${orderInfo.deliveryInfo.instructions || ''} ${orderInfo.deliveryInfo.emailText || ''}`.trim()
    : '';

  // Send to main Google Sheets script with correct mapping
  const mainSheetData = {
    action: 'saveOrder',
    orderNumber: orderNumber,
    orderDate: orderInfo.orderDate,
    paymentMethod: orderInfo.paymentMethod,
    products: orderInfo.items.map(item => item.product).join(', '),
    quantities: orderInfo.items.map(item => item.quantity).join(', '),
    totalUSD: orderInfo.totalUSD,
    totalBS: orderInfo.totalBS,
    status: orderInfo.status || 'pending',
    deliveryMethod: orderInfo.deliveryMethod || '',
    deliveryInfo: orderInfo.deliveryInfo,
    // Columns mapping: A..P as described by user
    cedula: orderInfo.deliveryInfo ? (orderInfo.deliveryInfo.cedula || '') : '',        // H
    customerName: orderInfo.deliveryInfo ? (orderInfo.deliveryInfo.name || '') : '',    // J - name only
    customerPhone: orderInfo.deliveryInfo ? (orderInfo.deliveryInfo.phone || '') : '',  // K
    customerEmail: orderInfo.deliveryInfo ? (orderInfo.deliveryInfo.email || '') : '',  // L
    customerAddress: addressInfo,                                                      // M
    DcustomerAddress: addressInfo,                                                    // mirror if needed by sheet
    deliveryInstructions: combinedInstructions,                                       // N - instructions + additional text
    paymentStage: 'payment_initiated'                                                 // P - stage marker
  };

  // Debug: Log the data being sent to Google Sheets
  console.log('Sending to Google Sheets:', {
    customerName: mainSheetData.customerName,
    customerPhone: mainSheetData.customerPhone,
    customerEmail: mainSheetData.customerEmail,
    customerAddress: mainSheetData.customerAddress,
    cedulaInfo: cedulaInfo,
    addressInfo: addressInfo
  });
  console.log('Full mainSheetData:', mainSheetData);
  console.log('Cédula info being sent:', cedulaInfo);
  console.log('Email + Cédula being sent:', mainSheetData.customerEmail);

  // Send to main Google Sheets
  sendToGoogleSheets(mainSheetData, function(response) {
    if (response.success) {
      console.log('Order saved to main Google Sheets successfully');
    } else {
      console.error('Error saving order to main Google Sheets:', response.error);
    }
  });

  // NEW!!: send also to tracker system
  const trackerData = {
    action: 'saveOrderToTracker',
    orderNumber: orderNumber,
    orderDate: orderInfo.orderDate,
    paymentMethod: orderInfo.paymentMethod,
    products: orderInfo.items.map(item => item.product).join(', '),
    quantities: orderInfo.items.map(item => item.quantity).join(', '),
    totalUSD: orderInfo.totalUSD,
    totalBS: orderInfo.totalBS,
    status: orderInfo.status || 'pending',
    deliveryMethod: orderInfo.deliveryMethod || '',
    deliveryType: orderInfo.deliveryType || '',
    customerName: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.name : '',
    customerPhone: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.phone : '',
    customerEmail: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.email : '',
    customerAddress: addressInfo,
    deliveryInstructions: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.instructions : '',
    // Additional fields for reference
    customerCedula: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.cedula : '',
    courier: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.courier : '',
    state: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.state : '',
    office: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.office : '',
    officeAddress: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.officeAddress : '',
    emailText: orderInfo.deliveryInfo ? orderInfo.deliveryInfo.emailText : ''
  };
  
  
  sendToOrderPaymentTracker(trackerData, function(response) {
    if (response.success) {
    } else {
      console.error('Error sending order to tracker:', response.error);
    }
  });
}

// using getCart from main.js - no duplicate needed

function renderCheckoutSummary() {
  let cart = getCart();
  
  // Check for buyNowProduct from sessionStorage
  const buyNowProductData = sessionStorage.getItem('buyNowProduct');
  if (buyNowProductData) {
    const buyNowProduct = JSON.parse(buyNowProductData);
    cart = [buyNowProduct]; // Use only the buyNow product, ignore cart
    
    // DON'T clear sessionStorage here - only clear when order is created
  }
  
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
    // check  offers/discounts
    const discountInfo = calculateDiscountedPrices(item);
    const itemPriceUSD = discountInfo ? discountInfo.discountedUSD : (parseFloat(item.USD) || 0);
    const itemPriceBS = discountInfo ? discountInfo.discountedBS : (parseFloat(item.Bs) || 0);
    
    const itemTotalUSD = itemPriceUSD * item.quantity;
    const itemTotalBS = itemPriceBS * item.quantity;
    totalUSD += itemTotalUSD;
    totalBS += itemTotalBS;
    
    // get the first image for display
    const displayImage = getFirstImage(item.Image);
    
    return `
      <div class="checkout-item-row">
        <img src="${displayImage}" class="checkout-item-img" alt="${item.Product}" onerror="this.style.display='none'">
        <div class="checkout-item-info">
          <div class="checkout-item-title">${item.Product}</div>
          <div class="checkout-item-qty">cantidad: ${item.quantity}</div>
          ${discountInfo ? `
            <div class="checkout-item-price">
              <div class="checkout-original-price">$${discountInfo.originalUSD.toFixed(2)} | Bs ${discountInfo.originalBS.toFixed(2)}</div>
              <div class="checkout-discounted-price">$${itemPriceUSD.toFixed(2)} | Bs ${itemPriceBS.toFixed(2)}</div>
              <div class="checkout-discount-badge">${discountInfo.percentage ? `${discountInfo.percentage}% OFF` : 'OFERTA'}</div>
            </div>
          ` : `
            <div class="checkout-item-price">$${item.USD} | Bs ${item.Bs}</div>
          `}
          <div class="checkout-item-total">total: $${itemTotalUSD.toFixed(2)} | Bs ${itemTotalBS.toFixed(2)}</div>
        </div>
      </div>
    `;
  }).join('') + `
    <div class="checkout-summary-total">
      <span>total:</span>
      <span>$${totalUSD.toFixed(2)} | Bs ${totalBS.toFixed(2)}</span>
    </div>
    <div class="checkout-summary-charges assets-loading" id="shipping-charges-message">${window.shippingChargesMessage || 'Posibles cargos de envio: $4.00 - $8.00'}</div>
  `;
}

function setupPaymentMethods() {
  const container = document.getElementById('paymentMethods');
  
  if (!container) {
    console.error('Payment methods container not found! Element with id="paymentMethods" is missing.');
    return;
  }
  
  
  const methods = [
    { id: 'efectivo', label: 'Efectivo', svg: `<svg viewBox='0 0 32 32' width='18' height='18' fill='none'><rect x='2' y='8' width='28' height='10' rx='2' fill='#82DCC7'/><rect x='2' y='18' width='28' height='6' rx='2' fill='#74CBB4'/><ellipse cx='16' cy='13' rx='4' ry='5' fill='#74CBB4'/><rect x='2' y='8' width='28' height='16' rx='2' stroke='#3b65d8' stroke-width='1.5'/></svg>` },
    { id: 'pago-movil', label: 'Pago Móvil', svg: `<svg viewBox='0 0 32 32' width='18' height='18' fill='none'><rect x='3' y='6' width='8' height='18' rx='2' fill='#69d3cc' stroke='#3b65d8' stroke-width='1.5'/><rect x='6' y='8' width='4' height='1' rx='0.5' fill='#3b65d8'/><circle cx='8' cy='23' r='1' fill='#3b65d8'/><rect x='21' y='6' width='8' height='18' rx='2' fill='#f9a8a8' stroke='#3b65d8' stroke-width='1.5'/><rect x='24' y='8' width='4' height='1' rx='0.5' fill='#3b65d8'/><circle cx='26' cy='23' r='1' fill='#3b65d8'/></svg>` },
    { id: 'cashea', label: 'Cashea', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="18" height="18"> <rect x="30" y="30" width="940" height="940" rx="220" ry="220" fill="#FFF212" /> <circle cx="500" cy="520" r="320" fill="#373435"/> <circle cx="500" cy="520" r="170" fill="#FFF212"/> <rect x="665" y="420" width="300" height="200" fill="#FFF212" /> <rect x="470" y="112" width="60" height="220" fill="#FFF212" /> <rect x="640" y="440" width="40" height="40" fill="#FFF212" /> </svg>` },
    { id: 'debito', label: 'Debito', svg: `<svg width="800px" height="800px" viewBox="0 0 1024 1024" class="icon"  version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M894.509511 249.605689H330.752a37.660444 37.660444 0 0 0-37.546667 37.762844v342.448356a37.660444 37.660444 0 0 0 37.546667 37.762844h563.757511a37.660444 37.660444 0 0 0 37.558045-37.762844V287.368533a37.660444 37.660444 0 0 0-37.558045-37.762844z" fill="#CCCCCC" /><path d="M293.216711 333.585067H932.067556v97.655466H293.216711z" fill="#4D4D4D" /><path d="M688.685511 388.278044H124.928a37.660444 37.660444 0 0 0-37.546667 37.762845v342.448355a37.660444 37.660444 0 0 0 37.546667 37.762845h563.757511a37.660444 37.660444 0 0 0 37.546667-37.762845V426.040889a37.660444 37.660444 0 0 0-37.546667-37.762845z" fill="#FFCA6C" /><path d="M87.381333 472.257422h638.850845v97.655467H87.381333z" fill="#4D4D4D" /><path d="M213.595022 692.974933a58.595556 58.254222 90 1 0 116.508445 0 58.595556 58.254222 90 1 0-116.508445 0Z" fill="#47A7DD" /><path d="M155.3408 692.974933a58.595556 58.254222 90 1 0 116.508444 0 58.595556 58.254222 90 1 0-116.508444 0Z" fill="#FC583D" /><path d="M894.509511 234.951111H720.406756c-8.044089 0-14.563556 6.5536-14.563556 14.6432s6.519467 14.654578 14.563556 14.654578h174.102755c12.686222 0 22.994489 10.376533 22.994489 23.131022v31.561956H307.768889V287.379911c0-12.754489 10.308267-23.131022 22.994489-23.131022H671.857778c8.044089 0 14.552178-6.564978 14.552178-14.654578S679.913244 234.951111 671.869156 234.951111h-341.105778c-28.740267 0-52.1216 23.517867-52.1216 52.417422v86.254934H124.928c-28.728889 0-52.110222 23.517867-52.110222 52.417422V663.665778c0 8.100978 6.519467 14.654578 14.563555 14.654578 8.044089 0 14.563556-6.564978 14.563556-14.654578v-79.086934h609.723733v183.9104c0 12.743111-10.308267 23.108267-22.983111 23.108267H124.928a23.074133 23.074133 0 0 1-22.983111-23.108267v-55.990044c0-8.0896-6.519467-14.6432-14.563556-14.6432-8.044089 0-14.563556 6.5536-14.563555 14.6432v55.990044c0 28.899556 23.381333 52.406044 52.110222 52.406045h563.757511c28.728889 0 52.110222-23.506489 52.110222-52.406045V426.040889c0-28.899556-23.381333-52.417422-52.110222-52.417422H307.780267v-25.383823h609.735111v68.357689H772.846933c-8.044089 0-14.563556 6.5536-14.563555 14.6432s6.519467 14.654578 14.563555 14.654578h144.668445v183.9104a23.096889 23.096889 0 0 1-22.994489 23.131022H774.781156c-8.044089 0-14.552178 6.5536-14.552178 14.6432s6.508089 14.6432 14.552178 14.6432h119.728355c28.728889 0 52.1216-23.506489 52.1216-52.417422V287.379911C946.631111 258.468978 923.249778 234.951111 894.509511 234.951111z m-182.840889 191.089778v31.573333H178.642489c-8.044089 0-14.563556 6.5536-14.563556 14.6432s6.519467 14.654578 14.563556 14.654578h533.026133v68.357689H101.944889v-68.357689h28.16c8.044089 0 14.563556-6.564978 14.563555-14.654578s-6.519467-14.6432-14.563555-14.6432H101.944889v-31.573333c0-12.743111 10.308267-23.119644 22.983111-23.119645h563.757511a23.096889 23.096889 0 0 1 22.983111 23.119645z" fill="" /><path d="M242.744889 760.069689a72.100978 72.100978 0 0 0 29.104355 6.155378c40.152178 0 72.817778-32.8704 72.817778-73.250134 0-40.402489-32.6656-73.250133-72.817778-73.250133-10.069333 0-19.979378 2.127644-29.104355 6.132622a72.078222 72.078222 0 0 0-29.149867-6.132622c-40.152178 0-72.817778 32.847644-72.817778 73.250133 0 40.379733 32.6656 73.250133 72.817778 73.250134 10.365156 0 20.218311-2.218667 29.149867-6.155378z m72.795022-67.094756c0 24.223289-19.603911 43.9296-43.690667 43.9296h-0.034133a73.056711 73.056711 0 0 0 14.609067-43.9296 73.079467 73.079467 0 0 0-14.609067-43.952355h0.034133c24.098133 0 43.690667 19.706311 43.690667 43.952355z m-145.624178 0c0-24.246044 19.592533-43.952356 43.690667-43.952355 24.086756 0 43.690667 19.706311 43.690667 43.952355 0 24.223289-19.603911 43.9296-43.690667 43.9296-24.098133 0.011378-43.690667-19.706311-43.690667-43.9296zM655.633067 647.5776c8.032711 0 14.563556-6.5536 14.563555-14.6432s-6.530844-14.6432-14.563555-14.6432H440.103822c-8.044089 0-14.563556 6.5536-14.563555 14.6432s6.519467 14.6432 14.563555 14.6432h215.529245z" fill="" /></svg>`},
    { id: 'credito', label: 'Credito', svg: `<svg height="800px" width="800px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve"> <path style="fill:#B4E66E;" d="M418.472,367.164H25.119c-9.446,0-17.102-7.656-17.102-17.102V93.528 c0-9.446,7.656-17.102,17.102-17.102h393.353c9.446,0,17.102,7.656,17.102,17.102v256.534 C435.574,359.508,427.918,367.164,418.472,367.164z"/> <path style="fill:#A0D755;" d="M401.37,204.693c-70.84,0-128.267,57.427-128.267,128.267c0,11.865,1.739,23.3,4.754,34.205h140.615 c9.445,0,17.102-7.658,17.102-17.102V209.447C424.669,206.432,413.234,204.693,401.37,204.693z"/> <path style="fill:#FFC850;" d="M136.284,204.693H67.875c-4.722,0-8.551-3.829-8.551-8.551v-51.307c0-4.722,3.829-8.551,8.551-8.551 h68.409c4.722,0,8.551,3.829,8.551,8.551v51.307C144.835,200.864,141.006,204.693,136.284,204.693z"/> <circle style="fill:#FF507D;" cx="294.48" cy="166.212" r="38.48"/> <circle style="fill:#FFC850;" cx="345.787" cy="166.212" r="38.48"/> <path style="fill:#FF8C66;" d="M307.307,166.212c0,11.352,5.008,21.451,12.827,28.493c7.819-7.043,12.827-17.142,12.827-28.493 c0-11.352-5.008-21.451-12.827-28.493C312.315,144.762,307.307,154.861,307.307,166.212z"/> <circle style="fill:#FFFFFF;" cx="401.37" cy="332.96" r="102.614"/> <path d="M273.102,359.148H25.119c-5.01,0-9.086-4.076-9.086-9.086V93.528c0-5.01,4.076-9.086,9.086-9.086h393.353 c5.01,0,9.086,4.076,9.086,9.086v111.167c0,4.427,3.589,8.017,8.017,8.017c4.427,0,8.017-3.589,8.017-8.017V93.528 c0-13.851-11.268-25.119-25.119-25.119H25.119C11.268,68.409,0,79.677,0,93.528v256.534c0,13.851,11.268,25.119,25.119,25.119 h247.983c4.427,0,8.017-3.589,8.017-8.017C281.119,362.737,277.53,359.148,273.102,359.148z"/> <path d="M401.37,222.329c-22.525,0-44.124,6.74-62.382,19.243l2.014-6.31c1.346-4.218-0.982-8.729-5.2-10.074 c-4.216-1.348-8.729,0.982-10.074,5.2l-10.51,32.937c-0.822,2.574-0.291,5.388,1.411,7.487c1.531,1.888,3.823,2.966,6.225,2.966 c0.268,0,0.539-0.014,0.809-0.041l34.397-3.488c4.405-0.447,7.614-4.38,7.168-8.784c-0.447-4.405-4.38-7.606-8.784-7.168 l-8.94,0.906c15.724-10.926,34.384-16.841,53.867-16.841c52.161,0,94.597,42.436,94.597,94.597 c0,51.636-41.587,93.734-93.027,94.577c0.001-0.006,0.002-0.013,0.004-0.019c-1.782,0.033-3.563,0.035-5.333-0.033 c-4.408-0.177-8.15,3.274-8.323,7.698c-0.173,4.424,3.274,8.15,7.698,8.323c1.452,0.057,2.927,0.085,4.384,0.085 c61.002,0,110.63-49.629,110.63-110.63S462.371,222.329,401.37,222.329z"/> <path d="M67.875,212.709h68.409c9.136,0,16.568-7.432,16.568-16.568v-51.307c0-9.136-7.432-16.568-16.568-16.568H67.875 c-9.136,0-16.568,7.432-16.568,16.568v51.307C51.307,205.277,58.739,212.709,67.875,212.709z M136.818,144.835v51.307 c0,0.295-0.239,0.534-0.534,0.534h-34.739v-18.171h9.086c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017h-9.086 V144.3h34.739C136.579,144.3,136.818,144.54,136.818,144.835z M67.34,144.835c0-0.295,0.239-0.534,0.534-0.534h17.637v52.376H67.875 c-0.295,0-0.534-0.239-0.534-0.534V144.835z"/> <path d="M345.787,212.709c25.638,0,46.497-20.858,46.497-46.497s-20.858-46.497-46.497-46.497c-9.467,0-18.278,2.851-25.632,7.729 c-7.571-5.017-16.488-7.729-25.675-7.729c-25.638,0-46.497,20.858-46.497,46.497s20.858,46.497,46.497,46.497 c9.47,0,18.284-2.853,25.641-7.734C327.693,209.988,336.62,212.709,345.787,212.709z M376.251,166.212 c0,16.798-13.666,30.463-30.463,30.463c-4.773,0-9.444-1.129-13.651-3.237c5.554-7.66,8.841-17.064,8.841-27.227 c0-4.427-3.589-8.017-8.017-8.017c-4.427,0-8.017,3.589-8.017,8.017c0,6.037-1.772,11.666-4.814,16.404 c-3.102-4.848-4.806-10.52-4.806-16.404c0-16.798,13.666-30.463,30.463-30.463C362.585,135.749,376.251,149.415,376.251,166.212z M264.017,166.212c0-16.798,13.666-30.463,30.463-30.463c4.781,0,9.448,1.127,13.652,3.234c-5.555,7.66-8.842,17.065-8.842,27.229 c0,9.885,3.145,19.378,8.824,27.23c-4.106,2.064-8.734,3.233-13.634,3.233C277.683,196.676,264.017,183.01,264.017,166.212z"/> <path d="M59.324,272.567h68.409c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017H59.324 c-4.427,0-8.017,3.589-8.017,8.017C51.307,268.978,54.896,272.567,59.324,272.567z"/> <path d="M59.324,323.874h205.228c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017H59.324 c-4.427,0-8.017,3.589-8.017,8.017C51.307,320.285,54.896,323.874,59.324,323.874z"/> <path d="M230.347,272.567c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017h-68.409 c-4.427,0-8.017,3.589-8.017,8.017c0,4.427,3.589,8.017,8.017,8.017H230.347z"/> <path d="M281.653,256.534h-17.102c-4.427,0-8.017,3.589-8.017,8.017c0,4.427,3.589,8.017,8.017,8.017h17.102 c4.427,0,8.017-3.589,8.017-8.017C289.67,260.123,286.081,256.534,281.653,256.534z"/> <path d="M299.519,289.7c-2.321,5.458-4.213,11.147-5.621,16.91c-1.051,4.3,1.583,8.64,5.884,9.691 c0.639,0.156,1.279,0.231,1.91,0.231c3.609,0,6.886-2.453,7.782-6.115c1.203-4.921,2.818-9.78,4.8-14.442 c1.733-4.075-0.166-8.782-4.24-10.515C305.959,283.727,301.252,285.626,299.519,289.7z"/> <path d="M309.522,355.698c-1.21-4.907-2.03-9.96-2.438-15.019c-0.356-4.412-4.215-7.7-8.635-7.346 c-4.413,0.356-7.702,4.221-7.346,8.635c0.477,5.916,1.437,11.827,2.853,17.57c0.901,3.655,4.175,6.099,7.777,6.099 c0.635,0,1.282-0.076,1.926-0.235C307.956,364.341,310.581,359.997,309.522,355.698z"/> <path d="M367.876,421.459c-4.732-1.791-9.359-3.987-13.751-6.525c-3.834-2.214-8.737-0.902-10.952,2.932 c-2.215,3.834-0.901,8.737,2.932,10.952c5.14,2.968,10.555,5.538,16.094,7.635c0.935,0.354,1.893,0.522,2.837,0.522 c3.237,0,6.285-1.974,7.499-5.18C374.102,427.654,372.017,423.027,367.876,421.459z"/> <path d="M321.443,383.585c-2.373-3.739-7.326-4.844-11.065-2.471c-3.738,2.373-4.844,7.327-2.471,11.065 c3.172,4.997,6.776,9.777,10.71,14.208c1.584,1.784,3.786,2.695,5.998,2.695c1.893,0,3.792-0.667,5.32-2.022 c3.311-2.939,3.612-8.007,0.672-11.317C327.241,391.95,324.158,387.86,321.443,383.585z"/> <path d="M375.182,357.01c0-4.427-3.589-8.017-8.017-8.017c-4.427,0-8.017,3.589-8.017,8.017c0,13.489,14.236,24.034,34.205,26.274 v0.982c0,4.427,3.589,8.017,8.017,8.017c4.427,0,8.017-3.589,8.017-8.017v-0.982c19.969-2.24,34.205-12.786,34.205-26.274 c0-18.805-18.787-25.929-34.205-30.21v-27.974c11.431,1.758,18.171,6.984,18.171,10.084c0,4.427,3.589,8.017,8.017,8.017 c4.427,0,8.017-3.589,8.017-8.017c0-13.489-14.236-24.034-34.205-26.274v-0.982c0-4.427-3.589-8.017-8.017-8.017 c-4.427,0-8.017,3.589-8.017,8.017v0.982c-19.969,2.24-34.205,12.786-34.205,26.274c0,18.805,18.787,25.929,34.205,30.21v27.974 C381.922,365.336,375.182,360.11,375.182,357.01z M427.557,357.01c0,3.1-6.74,8.326-18.171,10.084v-23.531 C422.758,347.768,427.557,351.521,427.557,357.01z M375.182,308.91c0-3.1,6.74-8.326,18.171-10.084v23.531 C379.981,318.151,375.182,314.398,375.182,308.91z"/> </svg>`},
    { id: 'paypal', label: 'PayPal', svg: `<svg viewBox='0 0 48 48' width='18' height='18'><path fill='#0d62ab' d='M18.7,13.767l0.005,0.002C18.809,13.326,19.187,13,19.66,13h13.472c0.017,0,0.034-0.007,0.051-0.006C32.896,8.215,28.887,6,25.35,6H11.878c-0.474,0-0.852,0.335-0.955,0.777l-0.005-0.002L5.029,33.813l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,0.991,1,0.991h8.071L18.7,13.767z'></path><path fill='#199be2' d='M33.183,12.994c0.053,0.876-0.005,1.829-0.229,2.882c-1.281,5.995-5.912,9.115-11.635,9.115c0,0-3.47,0-4.313,0c-0.521,0-0.767,0.306-0.88,0.54l-1.74,8.049l-0.305,1.429h-0.006l-1.263,5.796l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,1,1,1h7.333l0.013-0.01c0.472-0.007,0.847-0.344,0.945-0.788l0.018-0.015l1.812-8.416c0,0,0.126-0.803,0.97-0.803s4.178,0,4.178,0c5.723,0,10.401-3.106,11.683-9.102C42.18,16.106,37.358,13.019,33.183,12.994z'></path><path fill='#006fc4' d='M19.66,13c-0.474,0-0.852,0.326-0.955,0.769L18.7,13.767l-2.575,11.765c0.113-0.234,0.359-0.54,0.88-0.54c0.844,0,4.235,0,4.235,0c5.723,0,10.432-3.12,11.713-9.115c0.225-1.053,0.282-2.006,0.229-2.882C33.166,12.993,33.148,13,33.132,13H19.66z'></path></svg>` },
    { id: 'zelle', label: 'Zelle', svg: `<svg viewBox='0 0 48 48' width='18' height='18'><path fill='#a0f' d='M35,42H13c-3.866,0-7-3.134-7-7V13c0-3.866,3.134-7,7-7h22c3.866,0,7,3.134,7,7v22 C42,38.866,38.866,42,35,42z'></path><path fill='#fff' d='M17.5,18.5h14c0.552,0,1-0.448,1-1V15c0-0.552-0.448-1-1-1h-14c-0.552,0-1,0.448-1,1v2.5C16.5,18.052,16.948,18.5,17.5,18.5z'></path><path fill='#fff' d='M17,34.5h14.5c0.552,0,1-0.448,1-1V31c0-0.552-0.448-1-1-1H17c-0.552,0-1,0.448-1,1v2.5C16,34.052,16.448,34.5,17,34.5z'></path><path fill='#fff' d='M22.25,11v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,10.5,22.25,10.724,22.25,11z'></path><path fill='#fff' d='M22.25,32v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,31.5,22.25,31.724,22.25,32z'></path><path fill='#fff' d='M16.578,30.938H22l10.294-12.839c0.178-0.222,0.019-0.552-0.266-0.552H26.5L16.275,30.298C16.065,30.553,16.247,30.938,16.578,30.938z'></path></svg>` },
    { id: 'binance', label: 'Binance', svg: `<svg viewBox='0 0 64 64' width='18' height='18'><path fill='orange' d='M33.721,25.702l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C31.243,24.758,32.777,24.758,33.721,25.702z'></path><path fill='orange' d='M11.725,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C9.247,24.757,10.781,24.757,11.725,25.701z'></path><path fill='orange' d='M55.718,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C53.241,24.757,54.774,24.757,55.718,25.701z'></path><path fill='orange' d='M19.298,23.295l-2.581-2.583c-0.944-0.943-0.944-2.479,0-3.421l13.58-13.584c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.576c0.943,0.944,0.944,2.477,0,3.421l-2.587,2.588c-0.944,0.943-2.477,0.943-3.421-0.001l-9.284-9.292l-9.288,9.297C21.777,24.239,20.243,24.241,19.298,23.295z'></path><path fill='orange' d='M19.297,36.701l-2.583,2.583c-0.944,0.944-0.944,2.477,0,3.421l13.58,13.585c0.944,0.944,2.477,0.944,3.421,0l13.583-13.576c0.944-0.944,0.944-2.477,0-3.421l-2.587-2.587c-0.944-0.944-2.477-0.944-3.421,0l-9.284,9.292l-9.288-9.297C21.774,35.757,20.241,35.757,19.297,36.701z'></path><path fill='#fff' fill-opacity='.298' d='M16.715,17.293L30.297,3.707c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.577c-1.957,1.472-4.753,1.317-6.535-0.464l-8.76-8.752l-8.753,8.759C21.47,18.61,18.674,18.765,16.715,17.293z'></path><path fill='#fff' fill-rule='evenodd' d='M23.43,14.577c-0.585-0.585-0.585-1.536,0-2.121l3.024-3.024c0.585-0.585,1.536-0.585,2.121,0c0.585,0.585,0.585,1.536,0,2.121l-3.024,3.024C24.966,15.162,24.015,15.162,23.43,14.577z' clip-rule='evenodd'></path><path fill-opacity='.149' d='M16.715,42.706l13.581,13.585c0.944,0.945,2.477,0.945,3.421,0.001l13.583-13.577c-1.957,1.472-4.753,1.317-6.535,0.464l-8.76,8.752l-8.753-8.759C21.47,41.389,18.674,41.234,16.715,42.706z'></path><path fill-opacity='.298' d='M58.009,61c0-1.656-11.648-3-26-3s-26,1.344-26,3c0,1.656,11.648,3,26,3S58.009,62.656,58.009,61z'></path></svg>` },
    { id: 'zinli', label: 'Zinli', svg: `<svg viewBox='0 0 52 22' width='18' height='18'><path d='M49.84 6.554v13.954h-3.318V6.553h3.317zM22.4 6.554v13.954h-3.315V6.553H22.4zM43.579.995v19.513h-3.32V.995h3.32zM18.595 2.166a2.164 2.164 0 112.161 2.162 2.179 2.179 0 01-2.161-2.162zM46.04 3.166a2.163 2.163 0 112.163 2.162 2.179 2.179 0 01-2.164-2.162zM33.988 6.562v7.16l-8.235-7.14a.342.342 0 00-.568.251V20.52h3.317v-7.175l8.238 7.162a.344.344 0 00.57-.251V6.562h-3.322zM6.489 20.513h9.64v-3.315H9.364l-2.875 3.315zM4.612 20.507L16.23 7.114a.344.344 0 00-.251-.57H2.22V9.86h7.36L.725 19.947a.344.344 0 00.251.57l3.635-.01z' fill='#22c55e'></path></svg>` }
  ];
  
  container.innerHTML = methods.map(m => `
    <label class="payment-method">
      <input type="radio" name="paymentMethod" value="${m.id}" ${m.id === 'efectivo' ? 'checked' : ''}>
      <span>${m.label}</span>
      <span class="payment-method-icon">${m.svg}</span>
    </label>
  `).join('');
  
  
  // add event listeners for payment method changes
  const radioButtons = container.querySelectorAll('input[name="paymentMethod"]');
  
  radioButtons.forEach((radio, index) => {
    radio.addEventListener('change', function() {
      showCashPaymentWidget(this.value === 'efectivo');
    });
  });
  
  // show cash widget initially if efectivo is selected
  showCashPaymentWidget(true);
  
}

// Global variables for CSV data
let courierData = {
  mrw: [],
  zoom: [],
  tealca: []
};

// Load courier data from Supabase couriers table
async function loadCourierData() {
  try {
    console.log('Loading courier data from Supabase...');
    
    // Ensure getSupabaseClient is available
    if (typeof getSupabaseClient === 'undefined') {
      console.error('getSupabaseClient is not available. Make sure supabase-config.js is loaded.');
      // Fallback to CSV loading if Supabase is not available
      await loadCourierDataFromCSV();
      return;
    }
    
    const supabase = await getSupabaseClient();
    
    if (!supabase) {
      console.error('Supabase client is null or undefined');
      await loadCourierDataFromCSV();
      return;
    }
    
    console.log('📡 Querying Supabase couriers table...');
    
    // Fetch all couriers from Supabase
    // Note: Supabase only supports one .order() call, so we'll sort in JavaScript
    const { data: couriers, error } = await supabase
      .from('couriers')
      .select('*');
    
    if (error) {
      console.error('Error loading couriers from Supabase:', {
        error: error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      // Fallback to CSV if Supabase fails
      await loadCourierDataFromCSV();
      return;
    }
    
    console.log('Supabase query result:', {
      hasData: !!couriers,
      dataType: typeof couriers,
      isArray: Array.isArray(couriers),
      length: couriers ? couriers.length : 0,
      sample: couriers && couriers.length > 0 ? couriers[0] : null
    });
    
    if (!couriers || couriers.length === 0) {
      console.warn('No couriers found in Supabase, falling back to CSV');
      console.warn('This could mean:');
      console.warn('1. The couriers table is empty');
      console.warn('2. Row Level Security (RLS) is blocking the query');
      console.warn('3. There is a permissions issue');
      // Check if we can access the table at all
      try {
        const { count } = await supabase
          .from('couriers')
          .select('*', { count: 'exact', head: true });
        console.log('Total couriers in table (count only):', count);
        if (count && count > 0) {
          console.error('RLS ISSUE: Table has', count, 'couriers but query returned 0. Check Row Level Security policies!');
        }
      } catch (countError) {
        console.error('Could not count couriers:', countError);
      }
      await loadCourierDataFromCSV();
      return;
    }
    
    console.log(`Loaded ${couriers.length} courier offices from Supabase`);
    
    // Sort couriers by name, then state, then office (JavaScript sorting since Supabase only supports one order)
    couriers.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      
      const stateA = (a.state || '').toLowerCase();
      const stateB = (b.state || '').toLowerCase();
      if (stateA !== stateB) return stateA.localeCompare(stateB);
      
      const officeA = (a.office || '').toLowerCase();
      const officeB = (b.office || '').toLowerCase();
      return officeA.localeCompare(officeB);
    });
    
    // Group couriers by courier name (normalized to lowercase)
    const groupedCouriers = {};
    
    couriers.forEach(courier => {
      const courierName = (courier.name || courier.courier_name || '').toLowerCase().trim();
      
      if (!courierName) {
        console.warn('Courier entry missing name:', courier);
        return;
      }
      
      if (!groupedCouriers[courierName]) {
        groupedCouriers[courierName] = [];
      }
      
      // Build office data structure matching CSV format
      groupedCouriers[courierName].push({
        State: courier.state || '',
        Office: courier.office || '',
        Address: courier.address || courier.office_address || courier.office || '',
        Courier: courierName
      });
    });
    
    // Map to expected format (mrw, zoom, tealca keys)
    courierData = {
      mrw: groupedCouriers['mrw'] || groupedCouriers['mrk'] || [],
      zoom: groupedCouriers['zoom'] || [],
      tealca: groupedCouriers['tealca'] || groupedCouriers['tealca'] || [],
      // Also store all couriers for dynamic access
      ...groupedCouriers
    };
    
    console.log('Courier data loaded from Supabase:', {
      mrw: courierData.mrw.length,
      zoom: courierData.zoom.length,
      tealca: courierData.tealca.length,
      allCouriers: Object.keys(groupedCouriers)
    });
    
  } catch (error) {
    console.error('Error loading courier data from Supabase:', error);
    // Fallback to CSV loading
    await loadCourierDataFromCSV();
  }
}

// Fallback function to load from CSV files (deprecated - will be removed)
async function loadCourierDataFromCSV() {
  try {
    console.warn('Loading courier data from CSV (fallback mode)');
    const couriers = ['mrw', 'zoom', 'tealca'];
    
    for (const courier of couriers) {
      const response = await fetch(`./data/${courier}.csv`);
      
      if (!response.ok) {
        console.error(`Failed to load ${courier}.csv:`, response.status, response.statusText);
        continue;
      }
      
      const csvText = await response.text();
      
      // Parse CSV (format: State,Office)
      const lines = csvText.split('\n');
      const data = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',');
          if (values.length >= 2) {
            const state = values[0].trim();
            const office = values[1].trim();
            data.push({
              State: state,
              Office: office
            });
          }
        }
      }
      
      courierData[courier] = data;
    }
  } catch (error) {
    console.error('Error loading courier data from CSV:', error);
  }
}

function setupDeliveryOptions() {
  const deliveryOptions = document.querySelectorAll('input[name="deliveryMethod"]');
  const deliveryForm = document.getElementById('deliveryInfoForm');
  const deliveryOptionsContainer = document.getElementById('deliveryOptions');
  
  
  // check if delivery options container is visible
  if (deliveryOptionsContainer) {
  }
  
  if (!deliveryForm) {
    console.error('Delivery form not found!');
    return;
  }
  
  deliveryOptions.forEach(option => {
    option.addEventListener('change', function() {
      if (this.value === 'delivery') {
        deliveryForm.style.display = 'block';
        deliveryForm.classList.remove('hidden');
        
        // Show appropriate section based on delivery type
        const homeDeliveryFields = document.getElementById('homeDeliveryFields');
        const nationalShippingFields = document.getElementById('nationalShippingFields');
        
        if (this.id === 'delivery-home') {
          homeDeliveryFields.classList.remove('hidden');
          nationalShippingFields.classList.add('hidden');
          setRequiredFields(['customerName', 'customerPhone', 'customerCedula', 'customerAddress']);
        } else if (this.id === 'delivery-national') {
          homeDeliveryFields.classList.add('hidden');
          nationalShippingFields.classList.remove('hidden');
          setRequiredFields(['customerName', 'customerPhone', 'customerCedula', 'courierSelect', 'stateSelect', 'officeSelect']);
        }
      } else if (this.value === 'store') {
        // Pickup in store: show simple form and require name + cedula
        deliveryForm.style.display = 'block';
        deliveryForm.classList.remove('hidden');
        const homeDeliveryFields = document.getElementById('homeDeliveryFields');
        const nationalShippingFields = document.getElementById('nationalShippingFields');
        homeDeliveryFields.classList.add('hidden');
        nationalShippingFields.classList.add('hidden');
        setRequiredFields(['customerName', 'customerCedula']);
      } else {
        deliveryForm.style.display = 'none';
        deliveryForm.classList.add('hidden');
        clearRequiredFields();
      }
    });
  });
  
  // Set initial state based on checked option
  const checkedOption = document.querySelector('input[name="deliveryMethod"]:checked');
  if (checkedOption) {
    if (checkedOption.value === 'delivery') {
      deliveryForm.style.display = 'block';
      deliveryForm.classList.remove('hidden');
      
      const homeDeliveryFields = document.getElementById('homeDeliveryFields');
      const nationalShippingFields = document.getElementById('nationalShippingFields');
      
      if (checkedOption.id === 'delivery-home') {
        homeDeliveryFields.classList.remove('hidden');
        nationalShippingFields.classList.add('hidden');
      } else if (checkedOption.id === 'delivery-national') {
        homeDeliveryFields.classList.add('hidden');
        nationalShippingFields.classList.remove('hidden');
      }
    } else if (checkedOption.value === 'store') {
      // Default to simple form with required name + cedula
      deliveryForm.style.display = 'block';
      deliveryForm.classList.remove('hidden');
      const homeDeliveryFields = document.getElementById('homeDeliveryFields');
      const nationalShippingFields = document.getElementById('nationalShippingFields');
      homeDeliveryFields.classList.add('hidden');
      nationalShippingFields.classList.add('hidden');
      setRequiredFields(['customerName', 'customerCedula']);
    } else {
      deliveryForm.style.display = 'none';
      deliveryForm.classList.add('hidden');
    }
  }
  
  // Setup courier selection functionality
  setupCourierSelection();
}

// Helper functions for managing required fields
function setRequiredFields(fieldIds) {
  // Clear all required fields first
  clearRequiredFields();
  
  fieldIds.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.required = true;
      field.style.borderColor = '';
    }
  });
}

function clearRequiredFields() {
  const allFields = ['customerName', 'customerPhone', 'customerCedula', 'customerEmail', 
                    'customerAddress', 'courierSelect', 'stateSelect', 'officeSelect'];
  
  allFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.required = false;
      field.style.borderColor = '';
    }
  });
}

// Setup courier selection functionality
function setupCourierSelection() {
  const courierSelect = document.getElementById('courierSelect');
  const stateSelect = document.getElementById('stateSelect');
  const officeSelect = document.getElementById('officeSelect');
  const cedulaInput = document.getElementById('customerCedula');
  
  // Cedula input validation (numbers only)
  if (cedulaInput) {
    cedulaInput.addEventListener('input', function(e) {
      // Remove any non-numeric characters
      this.value = this.value.replace(/[^0-9]/g, '');
    });
  }
  
  if (!courierSelect || !stateSelect || !officeSelect) {
    console.error('Courier selection elements not found');
    return;
  }
  
  // Populate courier dropdown from loaded data
  function populateCourierDropdown() {
    courierSelect.innerHTML = '<option value="">Selecciona una empresa</option>';
    
    // Get unique courier names from courierData
    const uniqueCouriers = [...new Set(
      Object.keys(courierData).filter(key => 
        courierData[key] && Array.isArray(courierData[key]) && courierData[key].length > 0
      )
    )];
    
    // Sort couriers (prioritize mrw, zoom, tealca)
    const prioritizedCouriers = ['mrw', 'zoom', 'tealca'];
    const sortedCouriers = [
      ...prioritizedCouriers.filter(c => uniqueCouriers.includes(c)),
      ...uniqueCouriers.filter(c => !prioritizedCouriers.includes(c)).sort()
    ];
    
    sortedCouriers.forEach(courierKey => {
      const option = document.createElement('option');
      option.value = courierKey;
      // Format display name (capitalize first letter)
      const displayName = courierKey.charAt(0).toUpperCase() + courierKey.slice(1);
      option.textContent = displayName;
      courierSelect.appendChild(option);
    });
    
    console.log(`Populated courier dropdown with ${sortedCouriers.length} courier(s) from Supabase`);
  }
  
  // Populate dropdown when courier data is loaded
  populateCourierDropdown();
  
  // Re-populate if courier data changes
  const checkCourierData = setInterval(() => {
    const hasData = Object.keys(courierData).some(key => 
      courierData[key] && Array.isArray(courierData[key]) && courierData[key].length > 0
    );
    if (hasData && courierSelect.options.length <= 1) {
      populateCourierDropdown();
      clearInterval(checkCourierData);
    }
  }, 500);
  
  // Stop checking after 10 seconds
  setTimeout(() => clearInterval(checkCourierData), 10000);
  
  // Courier selection handler
  courierSelect.addEventListener('change', function() {
    const selectedCourier = this.value;
    
    if (selectedCourier && courierData[selectedCourier]) {
      // Get unique states for selected courier
      const states = [...new Set(courierData[selectedCourier].map(office => office.State))].sort();
      
      // Populate state dropdown
      stateSelect.innerHTML = '<option value="">Selecciona un estado</option>';
      states.forEach(state => {
        const option = document.createElement('option');
        option.value = state;
        option.textContent = state;
        stateSelect.appendChild(option);
      });
      
      stateSelect.disabled = false;
      officeSelect.disabled = true;
      officeSelect.innerHTML = '<option value="">Primero selecciona un estado</option>';
      
    } else {
      stateSelect.disabled = true;
      officeSelect.disabled = true;
      stateSelect.innerHTML = '<option value="">Primero selecciona una empresa</option>';
      officeSelect.innerHTML = '<option value="">Primero selecciona un estado</option>';
    }
  });
  
  // State selection handler
  stateSelect.addEventListener('change', function() {
    const selectedCourier = courierSelect.value;
    const selectedState = this.value;
    
    if (selectedCourier && selectedState && courierData[selectedCourier]) {
      // Get offices for selected courier and state
      const offices = courierData[selectedCourier]
        .filter(office => office.State === selectedState)
        .sort((a, b) => a.Office.localeCompare(b.Office));
      
      // Populate office dropdown
      officeSelect.innerHTML = '<option value="">Selecciona una oficina</option>';
      offices.forEach(office => {
        const option = document.createElement('option');
        option.value = JSON.stringify({
          courier: selectedCourier,
          state: selectedState,
          office: office.Office,
          address: office.Address || office.Office // Use Address field if available, otherwise Office
        });
        option.textContent = office.Office;
        officeSelect.appendChild(option);
      });
      
      officeSelect.disabled = false;
    } else {
      officeSelect.disabled = true;
      officeSelect.innerHTML = '<option value="">Primero selecciona un estado</option>';
    }
  });
}

function showCashPaymentWidget(show) {
  let widget = document.getElementById('cashPaymentWidget');
  
  if (show) {
    if (!widget) {
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
        paymentMethods.parentNode.insertBefore(widget, paymentMethods.nextSibling);
      } else {
        console.error('Payment methods container not found');
      }
    } else {
    }
    widget.style.display = 'block';
  } else {
    if (widget) {
      widget.style.display = 'none';
    } else {
    }
  }
}

function setupCheckoutButton() {
  const btn = document.getElementById('checkoutBtn');
  if (!btn) {
    console.error('Checkout button not found!');
    return;
  }
  
  console.log('Checkout button found, setting up click handler');
  
  btn.onclick = function() {
    console.log('Checkout button clicked!');
    
    const cart = getCart();
    const buyNowProduct = sessionStorage.getItem('buyNowProduct');
    
    console.log('🛒 Cart and buyNow check:', {
      cartLength: cart.length,
      hasBuyNowProduct: !!buyNowProduct
    });
    
    // Check if we have either cart items or buyNow product
    if (cart.length === 0 && !buyNowProduct) {
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
    
    // validate delivery form based on selection
    if (deliveryMethod === 'delivery') {
      const deliveryType = selectedDeliveryMethod.id;
      let requiredFields = ['customerName', 'customerPhone', 'customerCedula'];
      
      if (deliveryType === 'delivery-home') {
        requiredFields.push('customerAddress');
      } else if (deliveryType === 'delivery-national') {
        requiredFields.push('courierSelect', 'stateSelect', 'officeSelect');
      }
      
      const missingFields = [];
      
      requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
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
      
      // Special validation for cedula (must be numbers only)
      const cedulaField = document.getElementById('customerCedula');
      if (cedulaField && cedulaField.value.trim()) {
        if (!/^\d+$/.test(cedulaField.value.trim())) {
          missingFields.push('customerCedula');
          cedulaField.style.borderColor = '#ef4444';
          console.log('Cedula must contain only numbers');
        }
      }
      
      if (missingFields.length > 0) {
        alert('Por favor completa todos los campos requeridos para la entrega');
        return;
      }
    } else if (deliveryMethod === 'store') {
      // Require name and cedula for store pickup
      const requiredFields = ['customerName', 'customerCedula'];
      const missingFields = [];
      requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field || !field.value.trim()) {
          missingFields.push(fieldId);
          if (field) field.style.borderColor = '#ef4444';
        } else {
          field.style.borderColor = '#d1d5db';
        }
      });
      const cedulaField = document.getElementById('customerCedula');
      if (cedulaField && cedulaField.value.trim() && !/^\d+$/.test(cedulaField.value.trim())) {
        missingFields.push('customerCedula');
        cedulaField.style.borderColor = '#ef4444';
      }
      if (missingFields.length > 0) {
        alert('Para retirar en tienda, nombre y cédula son obligatorios');
        return;
      }
    }
    
    // check if a payment method is selected
    const selectedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked');
    if (!selectedPaymentMethod) {
      alert('Por favor selecciona un método de pago');
      return;
    }
    
    const paymentMethod = selectedPaymentMethod.value;
    const paymentMethodLabel = selectedPaymentMethod.nextElementSibling.textContent;
    
    // Get the actual cart to use (either regular cart or buyNow product)
    let actualCart = cart;
    const buyNowProductData = sessionStorage.getItem('buyNowProduct');
    if (buyNowProductData) {
      const buyNowProduct = JSON.parse(buyNowProductData);
      actualCart = [buyNowProduct]; // Use only the buyNow product
      
      // Clear the buyNow product from sessionStorage to prevent interference
      sessionStorage.removeItem('buyNowProduct');
      console.log('🧹 Cleared buyNowProduct from sessionStorage');
    }
    
    // calculate totals
    let totalUSD = 0, totalBS = 0;
    actualCart.forEach(item => {
      // Check for offers/discounts
      const discountInfo = calculateDiscountedPrices(item);
      const itemPriceUSD = discountInfo ? discountInfo.discountedUSD : (parseFloat(item.USD) || 0);
      const itemPriceBS = discountInfo ? discountInfo.discountedBS : (parseFloat(item.Bs) || 0);
      
      totalUSD += itemPriceUSD * item.quantity;
      totalBS += itemPriceBS * item.quantity;
    });
    
    // NEW FLOW: Show payment method information instead of creating order immediately
    console.log('Calling showPaymentMethodInfo with:', {
      paymentMethod,
      actualCartLength: actualCart.length,
      totalUSD,
      totalBS,
      deliveryMethod
    });
    
    showPaymentMethodInfo(paymentMethod, actualCart, totalUSD, totalBS, deliveryMethod, selectedDeliveryMethod);
  };
}

// NEW FUNCTION: Show payment method information instead of creating order immediately
function showPaymentMethodInfo(paymentMethod, cart, totalUSD, totalBS, deliveryMethod, selectedDeliveryMethod) {
  console.log('showPaymentMethodInfo called with:', {
    paymentMethod,
    cartLength: cart.length,
    totalUSD,
    totalBS,
    deliveryMethod
  });
  
  // Snapshot delivery info from the form so it can be used after redirects/payment flows
  let deliveryInfoSnapshot = null;
  let deliveryType = 'pickup';
  try {
    if (deliveryMethod === 'delivery') {
      const typeId = selectedDeliveryMethod ? selectedDeliveryMethod.id : '';
      deliveryType = typeId || 'delivery-home';
      const cedulaField = document.getElementById('customerCedula');
      const officeSelect = document.getElementById('officeSelect');
      const officeData = officeSelect && officeSelect.value ? JSON.parse(officeSelect.value) : null;
      deliveryInfoSnapshot = {
        name: document.getElementById('customerName') ? document.getElementById('customerName').value : '',
        phone: document.getElementById('customerPhone') ? document.getElementById('customerPhone').value : '',
        cedula: cedulaField ? cedulaField.value : '',
        email: document.getElementById('customerEmail') ? document.getElementById('customerEmail').value : '',
        deliveryType: typeId === 'delivery-home' ? 'Entrega a domicilio' : 'Envío Nacionales',
        address: typeId === 'delivery-home' && document.getElementById('customerAddress') ? document.getElementById('customerAddress').value : '',
        instructions: typeId === 'delivery-home' && document.getElementById('deliveryInstructions') ? document.getElementById('deliveryInstructions').value : '',
        emailText: typeId === 'delivery-home' && document.getElementById('emailText') ? document.getElementById('emailText').value : (document.getElementById('emailTextNational') ? document.getElementById('emailTextNational').value : ''),
        courier: typeId === 'delivery-national' && officeData ? officeData.courier : '',
        state: typeId === 'delivery-national' && officeData ? officeData.state : '',
        office: typeId === 'delivery-national' && officeData ? officeData.office : '',
        officeAddress: typeId === 'delivery-national' && officeData ? officeData.address : ''
      };
    } else if (deliveryMethod === 'store') {
      const cedulaField = document.getElementById('customerCedula');
      deliveryType = 'pickup';
      deliveryInfoSnapshot = {
        name: document.getElementById('customerName') ? document.getElementById('customerName').value : '',
        phone: document.getElementById('customerPhone') ? document.getElementById('customerPhone').value : '',
        email: document.getElementById('customerEmail') ? document.getElementById('customerEmail').value : '',
        cedula: cedulaField ? cedulaField.value : '',
        deliveryType: 'Retiro en tienda'
      };
    }
  } catch (e) {
    console.warn('Failed to snapshot delivery info:', e);
  }

  // Store order data temporarily for later use
  const orderData = {
    cart: cart,
    totalUSD: totalUSD,
    totalBS: totalBS,
    deliveryMethod: deliveryMethod,
    selectedDeliveryMethod: selectedDeliveryMethod,
    deliveryType: deliveryType,
    deliveryInfo: deliveryInfoSnapshot,
    paymentMethod: paymentMethod,
    timestamp: new Date().toISOString()
  };
  
  // Store in sessionStorage for later use
  sessionStorage.setItem('pendingOrderData', JSON.stringify(orderData));
  console.log('Pending order data stored:', orderData);
  
  // Determine if this is an API-based payment method
  const apiPaymentMethods = ['paypal', 'cashea', 'pago-movil', 'debito', 'credito'];
  const isApiPayment = apiPaymentMethods.includes(paymentMethod);
  
  console.log('Payment type determination:', {
    paymentMethod,
    isApiPayment,
    apiPaymentMethods
  });
  
  if (isApiPayment) {
    // For API payment methods, show payment page with API buttons
    console.log('Calling showApiPaymentPage for:', paymentMethod);
    showApiPaymentPage(paymentMethod, orderData);
  } else {
    // For manual payment methods, show payment information and confirm button
    console.log('Calling showManualPaymentPage for:', paymentMethod);
    showManualPaymentPage(paymentMethod, orderData);
  }
}

// Show payment page for API-based payment methods
function showApiPaymentPage(paymentMethod, orderData) {
  console.log('showApiPaymentPage called with:', { paymentMethod, orderData });
  
  // Generate a temporary order number for display
  const tempOrderNumber = generateOrderNumber();
  console.log('Generated temp order number:', tempOrderNumber);
  
  // Update URL to show payment page
  if (window.updateUrl) {
    console.log('Updating URL to payment page');
    window.updateUrl({ page: 'pay', method: paymentMethod, order: tempOrderNumber });
  } else {
    console.error('updateUrl function not available');
  }
  
  // Navigate to payment page
  if (window.handleRouting) {
    console.log('Calling handleRouting');
    window.handleRouting();
  } else if (window.showPaymentPage) {
    console.log('Calling showPaymentPage directly');
    window.showPaymentPage(paymentMethod, tempOrderNumber);
  } else {
    console.error('No navigation method available');
  }
  
  // Store temp order number for later use
  sessionStorage.setItem('tempOrderNumber', tempOrderNumber);
  console.log('Temp order number stored:', tempOrderNumber);
}

// Show payment information for manual payment methods
function showManualPaymentPage(paymentMethod, orderData) {
  console.log('showManualPaymentPage called with:', { paymentMethod, orderData });
  
  // Generate a temporary order number for display
  const tempOrderNumber = generateOrderNumber();
  console.log('Generated temp order number:', tempOrderNumber);
  
  // Update URL to show apartado page
  if (window.updateUrl) {
    console.log('Updating URL to apartado page');
    window.updateUrl({ page: 'apartado', order: tempOrderNumber });
  } else {
    console.error('updateUrl function not available');
  }
  
  // Navigate to apartado page
  if (window.handleRouting) {
    console.log('Calling handleRouting');
    window.handleRouting();
  } else if (window.showApartadoPage) {
    console.log('Calling showApartadoPage directly');
    window.showApartadoPage(tempOrderNumber);
  } else {
    console.error('No navigation method available');
  }
  
  // Store temp order number for later use
  sessionStorage.setItem('tempOrderNumber', tempOrderNumber);
  console.log('Temp order number stored:', tempOrderNumber);
}

// Function to create order after successful API payment
// Track which orders are being processed to prevent duplicate calls
const processingOrders = new Set();

function createOrderAfterApiPayment(paymentMethod, orderNumber) {
  // Sanitize order number in case it contains query parameters
  if (typeof orderNumber === 'string' && orderNumber.includes('?')) {
    orderNumber = orderNumber.split('?')[0];
  }
  
  // Prevent duplicate processing
  if (processingOrders.has(orderNumber)) {
    console.log('Order already being processed, skipping:', orderNumber);
    return;
  }
  
  processingOrders.add(orderNumber);
  
  console.log('createOrderAfterApiPayment called:', { paymentMethod, orderNumber });
  
  // Check if order already exists in history first
  // Try multiple ways to access getOrderFromHistory
  let existingOrder = null;
  if (typeof getOrderFromHistory === 'function') {
    existingOrder = getOrderFromHistory(orderNumber);
  } else if (window.getOrderFromHistory && typeof window.getOrderFromHistory === 'function') {
    existingOrder = window.getOrderFromHistory(orderNumber);
  } else {
    // Fallback: search history directly
    const history = getOrderHistory();
    existingOrder = history.find(order => order.orderNumber === orderNumber);
  }
  
  if (existingOrder) {
    console.log('Order already exists in history:', orderNumber);
    
    // Update local order status for UI display (but keep as "pending" in database)
    // The UI can show "completed" to customers, but database stores "pending"
    if (existingOrder.status !== 'completed') {
      const history = getOrderHistory();
      const orderIndex = history.findIndex(o => o.orderNumber === orderNumber);
      if (orderIndex !== -1) {
        history[orderIndex].status = 'completed'; // For UI display only
        localStorage.setItem('orderHistory', JSON.stringify(history));
        console.log('Updated local order status to completed (UI only):', orderNumber);
        console.log('Note: Order remains "pending" in database for customization');
      }
    }
    
    // Ensure order exists in Supabase
    (async () => {
      try {
        // Check if order exists in Supabase
        let orderId = localStorage.getItem(`order_${orderNumber}_supabase_id`);
        
        if (!orderId && typeof getSupabaseClient !== 'undefined') {
          try {
            const supabase = await getSupabaseClient();
            const { data: supabaseOrder } = await supabase
              .from('orders')
              .select('id')
              .eq('order_number', orderNumber)
              .single();
            
            if (supabaseOrder && supabaseOrder.id) {
              orderId = supabaseOrder.id;
              localStorage.setItem(`order_${orderNumber}_supabase_id`, orderId);
              console.log('Found existing order in Supabase (skipping duplicate creation):', orderId);
              // Order already exists, don't create again
            } else {
              // Order doesn't exist in Supabase, but it should have been created before payment
              // Only create if we have order data from history
              console.warn('Order not found in Supabase but exists in history. Order should have been created before payment.');
              // Don't create here - order should already exist from renderPaymentPage
              // This is just a safety check, not a creation point
            }
          } catch (error) {
            console.error('Error checking/creating order in Supabase:', error);
          }
        }
      } catch (error) {
        console.error('Error ensuring order in Supabase:', error);
      } finally {
        processingOrders.delete(orderNumber);
      }
    })();
    
    // Clear cart if not already cleared
    localStorage.removeItem('cart');
    if (window.updateCartIconCount) window.updateCartIconCount();
    
    // Always redirect to success page after handling existing order
    // Continue to redirect logic below
  } else {
    // Try to get pending order data
    let orderData = null;
    try {
      const pendingDataStr = sessionStorage.getItem('pendingOrderData');
      if (pendingDataStr) {
        orderData = JSON.parse(pendingDataStr);
      }
    } catch (e) {
      console.error('Error parsing pending order data:', e);
    }
    
    if (!orderData || !orderData.cart || orderData.cart.length === 0) {
      console.warn('No pending order data found and order does not exist in history');
      console.warn('Order number:', orderNumber);
      console.warn('This might mean the order was already processed or data was cleared');
      // Still redirect to success page even if order data is missing
    } else {
      // Create the actual order with proper payment method
      // Note: Order status is always "pending" in database (for customization)
      // UI can show "completed" to customers, but database stores "pending"
      console.log('Creating order with payment method:', paymentMethod);
      const savedOrder = saveOrderToHistory(orderNumber, orderData.cart, orderData.totalUSD, orderData.totalBS, paymentMethod, 'pending');
      
      // Clear pending order data
      sessionStorage.removeItem('pendingOrderData');
      sessionStorage.removeItem('tempOrderNumber');
      
  // Ensure order is created in Supabase (but check if it already exists first)
  (async () => {
    try {
      // Check if order already exists in Supabase before creating
      let orderId = localStorage.getItem(`order_${orderNumber}_supabase_id`);
      
      if (!orderId && typeof getSupabaseClient !== 'undefined') {
        try {
          const supabase = await getSupabaseClient();
          const { data: existingSupabaseOrder } = await supabase
            .from('orders')
            .select('id')
            .eq('order_number', orderNumber)
            .single();
          
          if (existingSupabaseOrder && existingSupabaseOrder.id) {
            orderId = existingSupabaseOrder.id;
            localStorage.setItem(`order_${orderNumber}_supabase_id`, orderId);
            console.log('Order already exists in Supabase (skipping duplicate creation):', orderId);
            processingOrders.delete(orderNumber);
            return; // Don't create duplicate
          }
        } catch (error) {
          // Error checking, continue to create
          console.warn('Could not check for existing order:', error);
        }
      }
      
      // Only create if order doesn't exist
      if (!orderId && window.saveOrderToSupabase && savedOrder) {
        const supabaseOrder = await window.saveOrderToSupabase(savedOrder);
        if (supabaseOrder && supabaseOrder.id) {
          localStorage.setItem(`order_${orderNumber}_supabase_id`, supabaseOrder.id);
          console.log('Created order in Supabase:', supabaseOrder.id);
        }
      } else if (orderId) {
        console.log('Order already exists in Supabase, skipping duplicate creation');
      }
    } catch (error) {
      console.error('Error creating order in Supabase:', error);
    } finally {
      processingOrders.delete(orderNumber);
    }
  })();
    }
    
    // Clear cart if not already cleared
    localStorage.removeItem('cart');
    if (window.updateCartIconCount) window.updateCartIconCount();
  }
  
  // Always redirect to success page (whether order existed or was created)
  // Don't redirect if already on success page
  const currentUrl = window.location.href;
  if (!currentUrl.includes('page=payment_success')) {
    setTimeout(() => {
      console.log('Redirecting to success page for order:', orderNumber);
      window.location.href = `/?page=payment_success&idNumber=${orderNumber}`;
    }, 500);
  } else {
    processingOrders.delete(orderNumber);
  }
}

// Function to create order for manual payment methods
function createOrderForManualPayment() {
  const orderData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
  
  if (!orderData.cart || orderData.cart.length === 0) {
    console.error('No pending order data found');
    return;
  }
  
  // Generate final order number
  const orderNumber = generateOrderNumber();
  
  // Create the actual order
  // saveOrderToHistory will save to Supabase automatically, so we just call it once
  const savedOrder = saveOrderToHistory(orderNumber, orderData.cart, orderData.totalUSD, orderData.totalBS, orderData.paymentMethod, 'pending');
  
  // Wait for saveOrderToHistory to complete and get the order ID from it
  // Then create the editable payment record
  (async () => {
    try {
      // Wait a moment for saveOrderToHistory to complete its Supabase save
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the order ID from localStorage (set by saveOrderToHistory)
      let supabaseOrderId = localStorage.getItem(`order_${orderNumber}_supabase_id`);
      
      // If not in localStorage, check Supabase directly
      if (!supabaseOrderId && typeof getSupabaseClient !== 'undefined') {
        try {
          const supabase = await getSupabaseClient();
          const { data: existingOrder } = await supabase
            .from('orders')
            .select('id')
            .eq('order_number', orderNumber)
            .single();
          
          if (existingOrder && existingOrder.id) {
            supabaseOrderId = existingOrder.id;
            localStorage.setItem(`order_${orderNumber}_supabase_id`, supabaseOrderId);
            console.log('Found order in Supabase from saveOrderToHistory:', supabaseOrderId);
          }
        } catch (error) {
          console.warn('Could not find order in Supabase:', error);
        }
      }
      
      if (supabaseOrderId) {
        // Create editable payment record for manual payment methods
        // This allows admin to edit transaction_id and status later
        if (window.savePaymentToSupabase) {
          const paymentData = {
            orderNumber: orderNumber,
            paymentMethod: orderData.paymentMethod || 'unknown',
            totalUSD: orderData.totalUSD || 0,
            totalBS: orderData.totalBS || 0,
            customerName: orderData.deliveryInfo ? orderData.deliveryInfo.name : null,
            customerEmail: orderData.deliveryInfo ? orderData.deliveryInfo.email : null,
            customerPhone: orderData.deliveryInfo ? orderData.deliveryInfo.phone : null,
            customerCedula: orderData.deliveryInfo ? orderData.deliveryInfo.cedula : null,
            products: Array.isArray(orderData.cart) ? orderData.cart.map(item => item.Product || item.product || item.name).join(', ') : '',
            quantities: Array.isArray(orderData.cart) ? orderData.cart.map(item => item.quantity || 1).join(', ') : '',
            deliveryMethod: orderData.deliveryMethod || '',
            deliveryType: orderData.deliveryType || '',
            customerAddress: orderData.deliveryInfo ? (orderData.deliveryInfo.address || (`${orderData.deliveryInfo.office || ''}${orderData.deliveryInfo.state ? ', ' + orderData.deliveryInfo.state : ''}${orderData.deliveryInfo.courier ? ', ' + orderData.deliveryInfo.courier : ''}`).trim()) : '',
            deliveryInstructions: orderData.deliveryInfo ? orderData.deliveryInfo.instructions : '',
            transactionId: null, // Empty for admin to fill in
            status: 'pending', // Pending status for admin to update
            date: new Date().toISOString()
          };
          
          try {
            const savedPayment = await window.savePaymentToSupabase(paymentData, supabaseOrderId);
            console.log('Created editable payment record for manual payment:', savedPayment);
            console.log('Admin can edit transaction_id and status in admin panel');
          } catch (paymentError) {
            console.error('Error creating payment record for manual payment:', paymentError);
            // Don't block order creation if payment save fails
          }
        } else {
          console.warn('savePaymentToSupabase not available - payment record not created');
        }
      } else {
        console.warn('Cannot create payment record - order ID not available');
      }
    } catch (error) {
      console.error('Error creating manual payment order in Supabase:', error);
    }
  })();
  
  // Clear pending order data
  sessionStorage.removeItem('pendingOrderData');
  sessionStorage.removeItem('tempOrderNumber');
  
  // Clear cart
  localStorage.removeItem('cart');
  
  // Redirect to pending page
  if (window.updateUrl) {
    window.updateUrl({ page: 'payment_pending', idNumber: orderNumber });
  }
  
  if (window.handleRouting) {
    window.handleRouting();
  }
  
  // Redirect to WhatsApp after client clicks "Confirmar Orden"
  setTimeout(() => {
    redirectToWhatsApp(orderNumber);
  }, 2000);
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
  
  // Note: WhatsApp redirect is handled by the success page button
}

function redirectToWhatsApp(orderNumber, isCashPayment = false) {
  console.log('Preparing WhatsApp redirect for order:', orderNumber);
  
  // Check if we've already redirected for this order to prevent double redirects
  const redirectKey = `whatsapp_redirected_${orderNumber}`;
  if (sessionStorage.getItem(redirectKey)) {
    console.log('WhatsApp already redirected for this order, skipping');
    return;
  }
  
  // Mark that we've redirected for this order
  sessionStorage.setItem(redirectKey, 'true');
  
  // Get order details from order history (more reliable than cart/sessionStorage)
  const orderHistory = getOrderHistory();
  const order = orderHistory.find(o => o.orderNumber === orderNumber);
  
  if (!order) {
    console.error('Order not found in history:', orderNumber);
    return;
  }
  
  console.log('Found order in history:', order);
  
  // Get order information from the saved order
  const orderItems = order.items || [];
  const paymentMethod = order.paymentMethod || 'No especificado';
  const deliveryOption = order.deliveryMethod || 'No especificado';
  const deliveryInfo = order.deliveryInfo || null;
  
  console.log('Order details for WhatsApp:', {
    orderNumber: orderNumber,
    paymentMethod: paymentMethod,
    deliveryOption: deliveryOption,
    totalUSD: order.totalUSD,
    totalBS: order.totalBS
  });
  
  // Use totals from the saved order
  const totalUSD = order.totalUSD || 0;
  const totalBS = order.totalBS || 0;
  
  const orderItemsText = orderItems.map(item => {
    const itemPriceUSD = parseFloat(item.priceUSD) || 0;
    const itemPriceBS = parseFloat(item.priceBS) || 0;
    const itemTotalUSD = itemPriceUSD * item.quantity;
    const itemTotalBS = itemPriceBS * item.quantity;
    
    return `🔸 ${item.product} (x${item.quantity})\n   💵 $${itemTotalUSD.toFixed(2)} / Bs ${itemTotalBS.toFixed(2)}`;
  }).join('\n\n');
  
  // Create WhatsApp message with proper emojis and encoding
  const message = `🛒 *NUEVA ORDEN - ${orderNumber}*

📦 *Productos:*
${orderItemsText}

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL:* $${totalUSD.toFixed(2)} / Bs ${totalBS.toFixed(2)}

💳 *Metodo de pago:* ${paymentMethod}
🚚 *Entrega:* ${deliveryOption}${deliveryInfo ? `

👤 *Datos del cliente:*
• Nombre: ${deliveryInfo.name}
• Teléfono: ${deliveryInfo.phone}
• Cédula: ${deliveryInfo.cedula}${deliveryInfo.email ? `
• Email: ${deliveryInfo.email}` : ''}${deliveryInfo.deliveryType === 'Entrega a domicilio' ? `

🏠 *Dirección de entrega:*
${deliveryInfo.address}${deliveryInfo.instructions ? `
📝 *Instrucciones:* ${deliveryInfo.instructions}` : ''}${deliveryInfo.emailText ? `
💬 *Información adicional:* ${deliveryInfo.emailText}` : ''}` : ''}${deliveryInfo.deliveryType === 'Envío Nacionales' ? `

📦 *Oficina de envío:*
🚚 Empresa: ${deliveryInfo.courier ? deliveryInfo.courier.toUpperCase() : 'No especificado'}
🏛️ Estado: ${deliveryInfo.state || 'No especificado'}
🏢 Oficina: ${deliveryInfo.office || 'No especificado'}
📍 Dirección: ${deliveryInfo.officeAddress || 'No especificado'}${deliveryInfo.emailText ? `
💬 *Información adicional:* ${deliveryInfo.emailText}` : ''}` : ''}` : ''}

━━━━━━━━━━━━━━━━━━━━
¡Gracias por tu compra! 😊🎉

*Indigo Store* 🌟`;

  // WhatsApp business number
  const whatsappNumber = '584128503608'; // +58 412-8503608
  
  // Debug: Check message
  console.log('Original message:', message);
  console.log('Message length:', message.length, 'characters');
  
  // Encode the message for URL
  const encodedMessage = encodeURIComponent(message);
  
  // Create WhatsApp URL
  const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
  
  console.log('Encoded URL length:', whatsappURL.length, 'characters');
  console.log('Opening WhatsApp with message...');
  
  // Open WhatsApp with improved reliability
  try {
    console.log('WhatsApp URL:', whatsappURL);
    
    // Try to open WhatsApp in a new tab
    const whatsappWindow = window.open(whatsappURL, '_blank', 'noopener,noreferrer');
    
    // Check if the window was blocked (popup blockers return null)
    if (!whatsappWindow) {
      console.warn('WhatsApp popup was blocked by browser - user can use the WhatsApp button instead');
    } else {
      // Check if window was immediately closed (some browsers do this)
      setTimeout(() => {
        if (whatsappWindow.closed) {
          console.warn('WhatsApp window was closed immediately');
        } else {
          console.log('WhatsApp opened successfully');
        }
      }, 100);
    }
  } catch (error) {
    console.error('Error opening WhatsApp:', error);
    console.log('User can use the WhatsApp button on the page instead');
  }
  
  // Clear cart after successful order (only if not buyNow)
  try {
    const buyNowProductData = sessionStorage.getItem('buyNowProduct');
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    if (!buyNowProductData && cart.length > 0) {
      localStorage.setItem('cart', JSON.stringify([]));
      if (window.updateCartIconCount) {
        window.updateCartIconCount();
      }
      console.log('🛒 Cart cleared after order completion');
    }
  } catch (e) {
  }
}

function showCartNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'cart-notification';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}


// expose functions globally
window.showOrderSuccessNotification = showOrderSuccessNotification;
window.setupDeliveryOptions = setupDeliveryOptions;
window.setupPaymentMethods = setupPaymentMethods;
window.setupCheckoutButton = setupCheckoutButton;
window.renderCheckoutSummary = renderCheckoutSummary;
window.redirectToWhatsApp = redirectToWhatsApp;
window.loadCourierData = loadCourierData;

// initialize checkout page
window.initializeCheckoutPage = function() {
  console.log('Initializing checkout page...');
  renderCheckoutSummary();
  setupPaymentMethods();
  setupCheckoutButton();
  setupDeliveryOptions();
  
  // Load courier data
  loadCourierData();
};

// Expose new functions globally
window.createOrderAfterApiPayment = createOrderAfterApiPayment;
window.createOrderForManualPayment = createOrderForManualPayment;
window.showPaymentMethodInfo = showPaymentMethodInfo;
window.showApiPaymentPage = showApiPaymentPage;
window.showManualPaymentPage = showManualPaymentPage; 