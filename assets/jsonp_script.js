// JSONP requests to avoid CORS issues

function doGet(e) {
  const callback = e.parameter.callback;
  const dataParam = e.parameter.data;
  
  if (callback && dataParam) {
    try {
      const data = JSON.parse(dataParam);
      const result = processRequest(data);
      
      const response = callback + '(' + JSON.stringify(result) + ')';
      return ContentService
        .createTextOutput(response)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } catch (error) {
      const errorResponse = {
        success: false,
        error: error.toString()
      };
      const response = callback + '(' + JSON.stringify(errorResponse) + ')';
      return ContentService
        .createTextOutput(response)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: 'Invalid request' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function processRequest(data) {
  const action = data.action;
  
  switch (action) {
    case 'saveOrder':
      return saveOrder(data);
    case 'savePayment':
      return savePayment(data);
    case 'getOrderStatus':
      return getOrderStatus(data.orderNumber);
    case 'getAllOrderStatuses':
      return getAllOrderStatuses();
    case 'deleteOrder':
      return deleteOrder(data.orderNumber);
    case 'getOrder':
      return getOrder(data.orderNumber);
    case 'reprocessPayment':
      return reprocessPayment(data);
    default:
      return { success: false, error: 'Unknown action' };
  }
}

function saveOrder(data) {
  try {
    const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
    const orderSheet = sheet.getSheetByName('Orders');
    
    const rowData = [
      data.orderNumber,
      data.orderDate,
      data.paymentMethod,
      data.products,
      data.quantities,
      data.totalUSD,
      data.totalBS,
      data.status || 'pending',
      data.deliveryMethod || '',
      data.customerName || '',
      data.customerPhone || '',
      data.customerEmail || '',
      data.customerAddress || '',
      data.deliveryInstructions || '',
      new Date().toISOString()
    ];
    
    orderSheet.appendRow(rowData);
    
    return { success: true, message: 'Order saved successfully' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function savePayment(data) {
  try {
    const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
    const paymentSheet = sheet.getSheetByName('Payments');
    
    let imageUrl = '';
    if (data.imageData) {
      imageUrl = saveImageToDrive(data.imageData, data.imageType, data.orderNumber);
    }
    
    const rowData = [
      data.orderNumber,
      data.orderDate,
      data.paymentMethod,
      data.products,
      data.quantities,
      data.totalUSD,
      data.totalBS,
      data.transactionId || '',
      data.status || 'processing',
      imageUrl,
      data.deliveryMethod || '',
      data.customerName || '',
      data.customerPhone || '',
      data.customerEmail || '',
      data.customerAddress || '',
      data.deliveryInstructions || '',
      new Date().toISOString()
    ];
    
    paymentSheet.appendRow(rowData);
    
    return { success: true, message: 'Payment saved successfully', imageUrl: imageUrl };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function saveImageToDrive(imageData, imageType, orderNumber) {
  try {
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), `image/${imageType}`, `${orderNumber}_payment.${imageType}`);
    
    const folder = DriveApp.getFolderById('11bAJHQedyfaOxk1p1Hh_kFka0AEXPw2E'); 
    const file = folder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
  } catch (error) {
    console.error('Error saving image:', error);
    return '';
  }
}

function getOrderStatus(orderNumber) {
  try {
    const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
    const orderSheet = sheet.getSheetByName('Orders');
    const data = orderSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === orderNumber) {
        return { success: true, status: data[i][7] }; // status is column 7
      }
    }
    
    return { success: false, error: 'Order not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getAllOrderStatuses() {
  try {
    const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
    const orderSheet = sheet.getSheetByName('Orders');
    const data = orderSheet.getDataRange().getValues();
    
    const statuses = [];
    for (let i = 1; i < data.length; i++) {
      statuses.push({
        orderNumber: data[i][0],
        status: data[i][7]
      });
    }
    
    return { success: true, statuses: statuses };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deleteOrder(orderNumber) {
  try {
    const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
    const orderSheet = sheet.getSheetByName('Orders');
    const data = orderSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === orderNumber) {
        orderSheet.deleteRow(i + 1); // +1 because sheet rows are 1-indexed
        return { success: true, message: 'Order deleted successfully' };
      }
    }
    
    return { success: false, error: 'Order not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getOrder(orderNumber) {
  try {
    const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
    const orderSheet = sheet.getSheetByName('Orders');
    const data = orderSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === orderNumber) {
        const order = {
          orderNumber: data[i][0],
          orderDate: data[i][1],
          paymentMethod: data[i][2],
          products: data[i][3],
          quantities: data[i][4],
          totalUSD: data[i][5],
          totalBS: data[i][6],
          status: data[i][7],
          deliveryMethod: data[i][8],
          customerName: data[i][9],
          customerPhone: data[i][10],
          customerEmail: data[i][11],
          customerAddress: data[i][12],
          deliveryInstructions: data[i][13]
        };
        
        return { success: true, order: order };
      }
    }
    
    return { success: false, error: 'Order not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function reprocessPayment(data) {
  try {
    const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
    const paymentSheet = sheet.getSheetByName('Payments');
    
    let imageUrl = '';
    if (data.imageData) {
      imageUrl = saveImageToDrive(data.imageData, data.imageType, data.orderNumber);
    }
    
    const rowData = [
      data.orderNumber,
      data.orderDate,
      data.newPaymentMethod,
      data.products,
      data.quantities,
      data.totalUSD,
      data.totalBS,
      data.newTransactionId || '',
      'processing',
      imageUrl,
      data.deliveryMethod || '',
      data.customerName || '',
      data.customerPhone || '',
      data.customerEmail || '',
      data.customerAddress || '',
      data.deliveryInstructions || '',
      new Date().toISOString()
    ];
    
    paymentSheet.appendRow(rowData);
    
    return { success: true, message: 'Payment reprocessed successfully', imageUrl: imageUrl };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
} 