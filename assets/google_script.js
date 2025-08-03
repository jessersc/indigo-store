// google_script.js - comunnicates to google scripst
// jsonp for cors issues

// google script web app url
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzbm1Z0oUGclFxS4Xn4AzdPhVkXcvWOsVdCixgcfCzGNv95pBx22mwVCbjWfaiTGcqWKA/exec';

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
  
  script.src = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
  
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

// send order to google sheets
function sendOrderToGoogleSheets(orderInfo, callback) {
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
  
  sendToGoogleSheets(orderData, callback);
}

// send payment image to google sheets
function sendImageToGoogleSheets(imageData, orderNumber, imageType, transactionId, method, order, callback) {
  const orderData = {
    action: 'savePayment',
    orderNumber: orderNumber,
    orderDate: new Date(order.orderDate).toLocaleString('es-ES'),
    paymentMethod: method,
    products: order.items.map(item => item.product).join(', '),
    quantities: order.items.map(item => item.quantity).join(', '),
    totalBS: order.totalBS.toFixed(2),
    totalUSD: order.totalUSD.toFixed(2),
    transactionId: transactionId,
    status: 'processing',
    imageData: imageData,
    imageType: imageType,
    deliveryMethod: order.deliveryMethod || '',
    deliveryInfo: order.deliveryInfo || null,
    customerName: order.deliveryInfo ? order.deliveryInfo.name : '',
    customerPhone: order.deliveryInfo ? order.deliveryInfo.phone : '',
    customerEmail: order.deliveryInfo ? order.deliveryInfo.email : '',
    customerAddress: order.deliveryInfo ? order.deliveryInfo.address : '',
    deliveryInstructions: order.deliveryInfo ? order.deliveryInfo.instructions : ''
  };
  
  sendToGoogleSheets(orderData, callback);
}

// get order status from google sheets
function getOrderStatus(orderNumber, callback) {
  const data = {
    action: 'getOrderStatus',
    orderNumber: orderNumber
  };
  
  sendToGoogleSheets(data, callback);
}

// get all order statuses
function getAllOrderStatuses(callback) {
  const data = {
    action: 'getAllOrderStatuses'
  };
  
  sendToGoogleSheets(data, callback);
}

// delete order from google sheets
function deleteOrderFromGoogleSheets(orderNumber, callback) {
  const data = {
    action: 'deleteOrder',
    orderNumber: orderNumber
  };
  
  sendToGoogleSheets(data, callback);
}

// get order from google sheets
function getOrderFromGoogleSheets(orderNumber, callback) {
  const data = {
    action: 'getOrder',
    orderNumber: orderNumber
  };
  
  sendToGoogleSheets(data, callback);
}

// send reprocessed payment
function sendReprocessedPaymentToGoogleSheets(imageData, orderNumber, imageType, transactionId, newPaymentMethod, callback) {
  const orderData = {
    action: 'reprocessPayment',
    orderNumber: orderNumber,
    transactionId: transactionId,
    newPaymentMethod: newPaymentMethod,
    imageData: imageData,
    imageType: imageType
  };
  
  sendToGoogleSheets(orderData, callback);
}