function doGet(e) { 
  const sheet = SpreadsheetApp.openById('1U9-I_UeYLorCqpGXOoZ_ATuMcc92oOjiPyNVG823j60');
  const data = sheet.getSheetByName('Sheet1');
  const values = data.getDataRange().getValues();
  
  const products = values.slice(1).map(row => {
    const usd = parseFloat(String(row[2]).replace(/[^0-9.]/g, "")) || 0; 
    const bs = parseFloat(String(row[4]).replace(/[^0-9.]/g, "")) || 0;   

    return {
      ItemID: row[0],
      Product: row[1] || "",
      USD: usd.toFixed(2),     // verde con 2 decimales
      Bs: Math.round(bs),      // rounded bolos
      Image: row[5] || ""
    };
  });

  return ContentService
    .createTextOutput(JSON.stringify(products))
    .setMimeType(ContentService.MimeType.JSON);
}