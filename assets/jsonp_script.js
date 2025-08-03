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
    case 'saveImageOnly':
      return saveImageOnly(data);
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
    const sheet = SpreadsheetApp.openById('1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY');
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
    console.log('Saving payment for order:', data.orderNumber);
    
    const sheet = SpreadsheetApp.openById('1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY');
    const paymentSheet = sheet.getSheetByName('Payments');
    
    let imageUrl = '';
    if (data.imageData) {
      console.log('Processing image upload...');
      imageUrl = saveImageToDrive(data.imageData, data.imageType, data.orderNumber);
      console.log('Image upload result:', imageUrl ? 'Success' : 'Failed');
    } else {
      console.log('No image data provided');
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
    console.log('Payment data saved to spreadsheet successfully');
    
    return { success: true, message: 'Payment saved successfully', imageUrl: imageUrl };
  } catch (error) {
    console.error('Error in savePayment:', error);
    return { success: false, error: error.toString() };
  }
}

function saveImageToDrive(imageData, imageType, orderNumber) {
  try {
    console.log('=== STARTING IMAGE UPLOAD ===');
    console.log('Order number:', orderNumber);
    console.log('Image type:', imageType);
    console.log('Image data length:', imageData ? imageData.length : 'null');
    
    // validate input
    if (!imageData || !imageType || !orderNumber) {
      console.error('Missing required parameters:', { imageData: !!imageData, imageType, orderNumber });
      return '';
    }
    
    // clean base64 data
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    console.log('Base64 data length after cleaning:', base64Data.length);
    
    if (!base64Data) {
      console.error('Invalid image data format');
      return '';
    }
    
    // create blob
    console.log('Creating blob...');
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), `image/${imageType}`, `${orderNumber}_payment.${imageType}`);
    console.log('Blob created successfully, size:', blob.getBytes().length);
    
    // always create a new folder to avoid permission issues
    let folder;
    try {
      console.log('Looking for existing folder...');
      // first try to find existing folder by name
      const folders = DriveApp.getFoldersByName('Indigo Store Payment Images');
      if (folders.hasNext()) {
        folder = folders.next();
        console.log('Found existing folder:', folder.getName(), 'ID:', folder.getId());
      } else {
        console.log('No existing folder found, creating new one...');
        // create new folder
        folder = DriveApp.createFolder('Indigo Store Payment Images');
        console.log('Created new folder:', folder.getName(), 'ID:', folder.getId());
      }
    } catch (folderError) {
      console.error('Error with folder creation:', folderError);
      console.error('Folder error details:', folderError.toString());
      // fallback: save to root
      console.log('Using root folder as fallback...');
      folder = DriveApp.getRootFolder();
      console.log('Root folder ID:', folder.getId());
    }
    
    // create file
    console.log('Creating file in folder...');
    const file = folder.createFile(blob);
    console.log('File created successfully:', file.getName(), 'ID:', file.getId());
    
    // set sharing permissions
    try {
      console.log('Setting file sharing permissions...');
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      console.log('File sharing set successfully');
    } catch (sharingError) {
      console.error('Error setting file sharing:', sharingError);
      console.error('Sharing error details:', sharingError.toString());
    }
    
    const fileUrl = file.getUrl();
    console.log('=== IMAGE UPLOAD SUCCESSFUL ===');
    console.log('File URL:', fileUrl);
    return fileUrl;
  } catch (error) {
    console.error('=== IMAGE UPLOAD FAILED ===');
    console.error('Error saving image:', error);
    console.error('Error details:', error.toString());
    console.error('Error stack:', error.stack);
    return '';
  }
}

function saveImageOnly(data) {
  try {
    console.log('=== SAVE IMAGE ONLY ===');
    console.log('Order number:', data.orderNumber);
    console.log('Image type:', data.imageType);
    console.log('Image data length:', data.imageData ? data.imageData.length : 'null');
    
    if (!data.imageData || !data.imageType || !data.orderNumber) {
      return { success: false, error: 'Missing required image data' };
    }
    
    const imageUrl = saveImageToDrive(data.imageData, data.imageType, data.orderNumber);
    
    if (imageUrl) {
      console.log('Image saved successfully:', imageUrl);
      return { success: true, imageUrl: imageUrl };
    } else {
      console.error('Failed to save image');
      return { success: false, error: 'Failed to save image to Drive' };
    }
  } catch (error) {
    console.error('Error in saveImageOnly:', error);
    return { success: false, error: error.toString() };
  }
}

function getOrderStatus(orderNumber) {
  try {
    const sheet = SpreadsheetApp.openById('1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY');
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
    const sheet = SpreadsheetApp.openById('1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY');
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
    const sheet = SpreadsheetApp.openById('1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY');
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
    const sheet = SpreadsheetApp.openById('1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY');
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
    const sheet = SpreadsheetApp.openById('1n6jHeyW_6M8zyUTeaX5k2VxiHllwlWxOLEoOD7Ke8iY');
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