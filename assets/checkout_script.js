// script for order management

// constants
const SPREADSHEET_ID = '1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY';
const DRIVE_FOLDER_ID = '11bAJHQedyfaOxk1p1Hh_kFka0AEXPw2E';

// utility functions
function getSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
}

function findOrderRow(orderNumber) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === orderNumber) {
      return i + 1; // +1 because sheet rows are 1-indexed
    }
  }
  return -1;
}

function createResponse(success, data = {}) {
  const response = { success, ...data };
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(error) {
  return createResponse(false, { error: error.toString() });
}

function createSuccessResponse(data = {}) {
  return createResponse(true, data);
}

function doPost(e) {
  try {
    // check if its a getAllOrderStatuses request
    if (e.parameter.action === 'getAllOrderStatuses') {
      return getAllOrderStatuses(e);
    }
    
    // check if its a reprocessPayment request
    if (e.parameter.action === 'reprocessPayment') {
      return reprocessPaymentInSheet(e);
    }
    
    // parse the incoming data for normal order submission
    const data = JSON.parse(e.postData.contents);
    
    // get spreadsheet
    const sheet = getSheet();
    
    // uploads image if true
    let imageLink = '';
    if (data.imageData && data.orderNumber) {
      imageLink = saveImageToDrive(data.imageData, data.orderNumber, data.imageType || 'png');
    }
    
    // ROW INFROMATION - ORDER INFORMARION
    const rowData = [
      data.orderNumber,                    // A - ORDER ID
      data.orderDate,                      // B - FECHA Y HORA
      data.paymentMethod,                  // C - METODO
      data.products,                       // D - PRODUCTS
      data.quantities,                     // E - QUANTITY
      data.totalBS,                        // F - TOTAL BS
      data.totalUSD,                       // G - TOTAL USD
      data.transactionId || '',            // H - TRANSACTION ID
      data.status || 'Pendiente',          // I - STATUS
      imageLink,                           // J - IMAGE LINK?
      data.deliveryMethod || '',           // K - DELIVERY METHOD
      data.deliveryInfo ? JSON.stringify(data.deliveryInfo) : '', // L - DELIVERY INFO
      data.customerName || '',             // M - CUSTOMER NAME
      data.customerPhone || '',            // N - CUSTOMER PHONE
      data.customerEmail || '',            // O - CUSTOMER EMAIL
      data.customerAddress || '',          // P - CUSTOMER ADDRESS
      data.deliveryInstructions || ''      // Q - DELIVERY INSTRUCTIONS
    ];
    
    // adds the row
    sheet.appendRow(rowData);
    
    // success response
    return createSuccessResponse({ 
      message: 'Order added successfully',
      imageLink: imageLink
    });
      
  } catch (error) {
    return createErrorResponse(error);
  }
}

function doGet(e) {
  const action = e.parameter.action;
  
  switch (action) {
    case 'getOrderStatus':
      return getOrderStatus(e.parameter.orderNumber);
    case 'getOrder':
      return getOrder(e.parameter.orderNumber);
    case 'deleteOrder':
      return deleteOrderFromSheet(e.parameter.orderNumber);
    default:
      return ContentService
        .createTextOutput('Google Apps Script is running')
        .setMimeType(ContentService.MimeType.TEXT);
  }
}

// function save image to g drive
function saveImageToDrive(imageData, orderNumber, imageType) {
  try {
    // get the folder
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // Remove image data - before
    let base64Data = imageData;
    if (imageData.startsWith('data:image/')) {
      base64Data = imageData.split(',')[1];
    }
    
    // convert base64 to blob
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), `image/${imageType}`, `${orderNumber}.${imageType}`);
    
    // create file in the folder
    const file = folder.createFile(blob);
    
    // set file permissions to anyone with link can view
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // return the file URL
    return file.getUrl();
    
  } catch (error) {
    console.error('Error saving image:', error.toString());
    return '';
  }
}



// function to handle image upload seprates
function uploadImage(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (!data.imageData || !data.orderNumber) {
      return createErrorResponse('Missing image data or order number');
    }
    
    const imageLink = saveImageToDrive(data.imageData, data.orderNumber, data.imageType || 'png');
    
    if (imageLink) {
      // spdate sthe spreadsheet with the image link
      updateImageLinkInSheet(data.orderNumber, imageLink);
      
      return createSuccessResponse({ 
        message: 'Image uploaded successfully',
        imageLink: imageLink
      });
    } else {
      return createErrorResponse('Failed to save image');
    }
    
  } catch (error) {
    return createErrorResponse(error);
  }
}

// function to update image link in spreadsheet
function updateImageLinkInSheet(orderNumber, imageLink) {
  try {
    const sheet = getSheet();
    const orderRow = findOrderRow(orderNumber);
    
    if (orderRow !== -1) {
      // update image link (column J = 10th column)
      sheet.getRange(orderRow, 10).setValue(imageLink);
    }
    
  } catch (error) {
    console.error('Error updating image link in sheet:', error);
  }
}

// function to handle reprocessed payments
function reprocessPaymentInSheet(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet();
    const orderRow = findOrderRow(data.orderNumber);
    
    if (orderRow === -1) {
      return createErrorResponse('Order not found');
    }
    
    // save new image to drive
    let newImageLink = '';
    if (data.imageData && data.orderNumber) {
      // create a new filename with timestamp to avoid conflicts
      const timestamp = new Date().getTime();
      const newOrderNumber = `${data.orderNumber}-reprocess-${timestamp}`;
      newImageLink = saveImageToDrive(data.imageData, newOrderNumber, data.imageType || 'png');
    }
    
    // update payment method (column C = 3rd column)
    sheet.getRange(orderRow, 3).setValue(data.newPaymentMethod);
    
    // update transaction ID (column H = 8th column)
    if (data.newTransactionId) {
      sheet.getRange(orderRow, 8).setValue(data.newTransactionId);
    }
    
    // update image link (column J = 10th column)
    if (newImageLink) {
      sheet.getRange(orderRow, 10).setValue(newImageLink);
    }
    
    // update status to processing (column I = 9th column)
    sheet.getRange(orderRow, 9).setValue('processing');
    
    // update order date to current time (column B = 2nd column)
    sheet.getRange(orderRow, 2).setValue(new Date().toLocaleString('es-ES'));
    
    return createSuccessResponse({ 
      message: 'Payment reprocessed successfully',
      imageLink: newImageLink
    });
    
  } catch (error) {
    return createErrorResponse(error);
  }
}



// get order statistics
function getOrderStats() {
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return { totalOrders: 0, message: 'No orders found' };
    }
    
    // get all data
    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    
    // calculate statistics
    const totalOrders = data.length;
    const totalRevenueUSD = data.reduce((sum, row) => sum + parseFloat(row[6] || 0), 0);
    const totalRevenueBS = data.reduce((sum, row) => sum + parseFloat(row[5] || 0), 0);
    
    // count by payment method
    const paymentMethods = {};
    data.forEach(row => {
      const method = row[2] || 'Unknown';
      paymentMethods[method] = (paymentMethods[method] || 0) + 1;
    });
    
    // count by status
    const statuses = {};
    data.forEach(row => {
      const status = row[8] || 'Unknown';
      statuses[status] = (statuses[status] || 0) + 1;
    });
    
    return {
      totalOrders,
      totalRevenueUSD: totalRevenueUSD.toFixed(2),
      totalRevenueBS: totalRevenueBS.toFixed(2),
      paymentMethods,
      statuses,
      message: 'Statistics retrieved successfully'
    };
    
  } catch (error) {
    return { error: error.toString() };
  }
}

// update order status
function updateOrderStatus(orderNumber, newStatus) {
  try {
    const sheet = getSheet();
    const orderRow = findOrderRow(orderNumber);
    
    if (orderRow === -1) {
      return { success: false, error: 'Order not found' };
    }
    
    // updates status (column I = 9th column)
    sheet.getRange(orderRow, 9).setValue(newStatus);
    
    return { success: true, message: 'Order status updated successfully' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// add image link to order
function addImageLink(orderNumber, imageLink) {
  try {
    const sheet = getSheet();
    const orderRow = findOrderRow(orderNumber);
    
    if (orderRow === -1) {
      return { success: false, error: 'Order not found' };
    }
    
    // ppdate image linkk (column J = 10th column)
    sheet.getRange(orderRow, 10).setValue(imageLink);
    
    return { success: true, message: 'Image link added successfully' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
} 

// function to get order status
function getOrderStatus(orderNumber) {
  try {
    const sheet = getSheet();
    const orderRow = findOrderRow(orderNumber);
    
    if (orderRow === -1) {
      return createErrorResponse('Order not found');
    }
    
    // get status (column I = 9th column, index 8)
    const status = sheet.getRange(orderRow, 9).getValue();
    
    return createSuccessResponse({ status: status });
      
  } catch (error) {
    return createErrorResponse(error);
  }
}

// function to get all order statuses
function getAllOrderStatuses(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const orderNumbers = data.orderNumbers || [];
    
    const sheet = getSheet();
    
    // get all data
    const sheetData = sheet.getDataRange().getValues();
    const statuses = [];
    
    // find statuses for requested order
    orderNumbers.forEach(orderNumber => {
      for (let i = 1; i < sheetData.length; i++) {
        if (sheetData[i][0] === orderNumber) {
          statuses.push({
            orderNumber: orderNumber,
            status: sheetData[i][8] || 'pendiente' // column I = index 8
          });
          break;
        }
      }
    });
    
    return createSuccessResponse({ statuses: statuses });
      
  } catch (error) {
    return createErrorResponse(error);
  }
}

// get complete order data
function getOrder(orderNumber) {
  try {
    const sheet = getSheet();
    const orderRow = findOrderRow(orderNumber);
    
    if (orderRow === -1) {
      return createErrorResponse('Order not found');
    }
    
    // get all order data (row data, 0-indexed)
    const data = sheet.getDataRange().getValues();
    const orderData = data[orderRow - 1];
    
    const order = {
      orderNumber: orderData[0],           // A - ORDER ID
      orderDate: orderData[1],             // B - FECHA Y HORA
      paymentMethod: orderData[2],         // C - METODO
      products: orderData[3],              // D - PRODUCTS
      quantities: orderData[4],            // E - QUANTITY
      totalBS: orderData[5],               // F - TOTAL BS
      totalUSD: orderData[6],              // G - TOTAL USD
      transactionId: orderData[7],         // H - TRANSACTION ID
      status: orderData[8],                // I - STATUS
      imageLink: orderData[9],             // J - IMAGE LINK?
      deliveryMethod: orderData[10],       // K - DELIVERY METHOD
      deliveryInfo: orderData[11],         // L - DELIVERY INFO
      customerName: orderData[12],         // M - CUSTOMER NAME
      customerPhone: orderData[13],        // N - CUSTOMER PHONE
      customerEmail: orderData[14],        // O - CUSTOMER EMAIL
      customerAddress: orderData[15],      // P - CUSTOMER ADDRESS
      deliveryInstructions: orderData[16]  // Q - DELIVERY INSTRUCTIONS
    };
    
    return createSuccessResponse({ order: order });
      
  } catch (error) {
    return createErrorResponse(error);
  }
}

// delete order from spreadsheet
function deleteOrderFromSheet(orderNumber) {
  try {
    const sheet = getSheet();
    const orderRow = findOrderRow(orderNumber);
    
    if (orderRow === -1) {
      return createErrorResponse('Order not found');
    }
    
    // check if order status is pendiente - only pendiente orders can be deleted
    const status = sheet.getRange(orderRow, 9).getValue(); // column I = 9th column
    if (status.toLowerCase() !== 'pendiente') {
      return createErrorResponse('Only orders with status "pendiente" can be deleted');
    }
    
    // Delete the row
    sheet.deleteRow(orderRow);
    
    return createSuccessResponse({ message: 'Order deleted successfully' });
      
  } catch (error) {
    return createErrorResponse(error);
  }
} 