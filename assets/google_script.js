// Google Apps Script for Indigo Store
// Deploy as web app with access: Anyone, even anonymous
// Execute as: Me

function doGet(e) { 
  const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
  const data = sheet.getSheetByName('Sheet1');
  const values = data.getDataRange().getValues();
  
  const products = values.slice(1).map(row => ({
    ItemID: row[0],
    Product: row[1] || "",
    USD: parseFloat(row[2]).toFixed(2), // verde con 2 decimales
    Bs: Math.round(parseFloat(row[4])), // rounded bolos
    Image: row[5],
    Collection: row[6] || "",
    Description: row[7] || "",
    Category: row[8] || "",
    Stock: row[9] || 0
  }));

  return ContentService
    .createTextOutput(JSON.stringify(products))
    .setMimeType(ContentService.MimeType.JSON);
}