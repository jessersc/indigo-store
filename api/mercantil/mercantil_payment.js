import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables (needed for serverless functions and local development)
dotenv.config();

// Note: Vercel's Node.js runtime has native fetch, no need to import

// Validate required environment variables
function validateEnvironment() {
    // Debug: Log what we're reading
    console.log('Checking Mercantil environment variables:');
    console.log('  MERCANTIL_INTEGRATOR_ID:', process.env.MERCANTIL_INTEGRATOR_ID ? 'Set' : 'Missing');
    console.log('  MERCANTIL_TERMINAL_ID:', process.env.MERCANTIL_TERMINAL_ID ? 'Set' : 'Missing');
    console.log('  MERCANTIL_C2P_ENCRYPTION_KEY:', process.env.MERCANTIL_C2P_ENCRYPTION_KEY ? 'Set' : 'Missing');
    console.log('  MERCANTIL_C2P_MERCHANT_ID:', process.env.MERCANTIL_C2P_MERCHANT_ID ? 'Set' : 'Missing');
    console.log('  MERCANTIL_C2P_CLIENT_ID:', process.env.MERCANTIL_C2P_CLIENT_ID ? 'Set' : 'Missing');
    console.log('  MERCANTIL_ORIGIN_PHONE:', process.env.MERCANTIL_ORIGIN_PHONE ? 'Set' : 'Missing');
    console.log('  MERCANTIL_CARDS_ENCRYPTION_KEY:', process.env.MERCANTIL_CARDS_ENCRYPTION_KEY ? 'Set' : 'Missing');
    console.log('  MERCANTIL_CARDS_MERCHANT_ID:', process.env.MERCANTIL_CARDS_MERCHANT_ID ? 'Set' : 'Missing');
    console.log('  MERCANTIL_CARDS_CLIENT_ID:', process.env.MERCANTIL_CARDS_CLIENT_ID ? 'Set' : 'Missing');
    
    // Shared required variables
    const requiredShared = {
        MERCANTIL_INTEGRATOR_ID: 'Integrator ID is required',
        MERCANTIL_TERMINAL_ID: 'Terminal ID is required'
    };

    // C2P specific (only validate if being used)
    const requiredC2P = {
        MERCANTIL_C2P_ENCRYPTION_KEY: 'C2P Encryption key is required',
        MERCANTIL_C2P_MERCHANT_ID: 'C2P Merchant ID is required',
        MERCANTIL_C2P_CLIENT_ID: 'C2P Client ID is required',
        MERCANTIL_ORIGIN_PHONE: 'Origin phone (business phone where payments go) is required for Pago Móvil'
    };

    // Cards specific (only validate if being used)
    const requiredCards = {
        MERCANTIL_CARDS_ENCRYPTION_KEY: 'Cards Encryption key is required',
        MERCANTIL_CARDS_MERCHANT_ID: 'Cards Merchant ID is required',
        MERCANTIL_CARDS_CLIENT_ID: 'Cards Client ID is required'
    };

    const missing = [];
    
    // Always check shared variables
    for (const [key, message] of Object.entries(requiredShared)) {
        if (!process.env[key]) {
            missing.push(`${key}: ${message}`);
        }
    }
    
    // Check if at least one payment method is configured
    const hasC2P = process.env.MERCANTIL_C2P_ENCRYPTION_KEY && 
                   process.env.MERCANTIL_C2P_MERCHANT_ID && 
                   process.env.MERCANTIL_C2P_CLIENT_ID &&
                   process.env.MERCANTIL_ORIGIN_PHONE;
    
    const hasCards = process.env.MERCANTIL_CARDS_ENCRYPTION_KEY && 
                     process.env.MERCANTIL_CARDS_MERCHANT_ID && 
                     process.env.MERCANTIL_CARDS_CLIENT_ID;

    if (!hasC2P && !hasCards) {
        missing.push('At least one payment method (C2P or Cards) must be configured');
        // List what's missing for each
        if (!hasC2P) {
            for (const [key, message] of Object.entries(requiredC2P)) {
                if (!process.env[key]) {
                    missing.push(`  C2P: ${key}: ${message}`);
                }
            }
        }
        if (!hasCards) {
            for (const [key, message] of Object.entries(requiredCards)) {
                if (!process.env[key]) {
                    missing.push(`  Cards: ${key}: ${message}`);
                }
            }
        }
    }

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables:\n${missing.join('\n')}`);
    }

    return { hasC2P, hasCards };
}

// Initialize configuration
let ENCRYPTION_CONFIG = {};

function initializeConfig() {
    try {
        const { hasC2P, hasCards } = validateEnvironment();
        
        ENCRYPTION_CONFIG = {
            algorithm: 'aes-128-ecb',
            enabled: {
                c2p: hasC2P,
                cards: hasCards
            }
        };

        // Initialize C2P config if available
        if (hasC2P) {
            ENCRYPTION_CONFIG.c2p = {
                encryptionKey: process.env.MERCANTIL_C2P_ENCRYPTION_KEY,
                merchantId: parseInt(process.env.MERCANTIL_C2P_MERCHANT_ID),
                clientId: process.env.MERCANTIL_C2P_CLIENT_ID,
                integratorId: parseInt(process.env.MERCANTIL_INTEGRATOR_ID),
                terminalId: process.env.MERCANTIL_TERMINAL_ID,
                originPhone: process.env.MERCANTIL_ORIGIN_PHONE
            };
        }

        // Initialize Cards config if available
        if (hasCards) {
            ENCRYPTION_CONFIG.cards = {
                encryptionKey: process.env.MERCANTIL_CARDS_ENCRYPTION_KEY,
                merchantId: parseInt(process.env.MERCANTIL_CARDS_MERCHANT_ID),
                clientId: process.env.MERCANTIL_CARDS_CLIENT_ID,
                integratorId: parseInt(process.env.MERCANTIL_INTEGRATOR_ID),
                terminalId: process.env.MERCANTIL_TERMINAL_ID
            };
        }
        
        console.log('Mercantil Config initialized:', {
            c2p: hasC2P ? {
                merchantId: ENCRYPTION_CONFIG.c2p.merchantId,
                encryptionKey: 'Set',
                originPhone: ENCRYPTION_CONFIG.c2p.originPhone?.substring(0, 4) + '***',
                apiUrl: getAPIUrls().c2p || 'NOT SET'
            } : 'Not configured',
            cards: hasCards ? {
                merchantId: ENCRYPTION_CONFIG.cards.merchantId,
                encryptionKey: 'Set',
                apiUrl: getAPIUrls().pay || 'NOT SET'
            } : 'Not configured',
            shared: {
                integratorId: process.env.MERCANTIL_INTEGRATOR_ID,
                terminalId: process.env.MERCANTIL_TERMINAL_ID
            }
        });
        
        return true;
    } catch (error) {
        console.error('Mercantil Config initialization failed:', error.message);
        ENCRYPTION_CONFIG = { enabled: { c2p: false, cards: false } };
        return false;
    }
}

// Export function to initialize config from server
export { initializeConfig };

// API URLS - Read from environment variables at runtime
function getAPIUrls() {
    return {
        c2p: process.env.MERCANTIL_C2P_URL,
        pay: process.env.MERCANTIL_PAY_URL,
        getauth: process.env.MERCANTIL_GETAUTH_URL
    };
}

// Encryption function (exact copy from documentation)
function encryptData(message, key) {
    try {
        const algorithm = "aes-128-ecb";
        // convert encryption key to SHA256
        const hash = crypto.createHash('sha256');
        hash.update(key);
        
        // Obtain first 16 bytes of the hash
        const keyString = hash.copy().digest('hex');
        const firstHalf = keyString.slice(0, keyString.length / 2);
        const keyHex = Buffer.from(firstHalf, 'hex');
        
        // encrypt message using the new key
        const cipher = crypto.createCipheriv(algorithm, keyHex, null);
        
        let ciphertext = cipher.update(message, 'utf8', 'base64');
        ciphertext += cipher.final('base64');
        
        return ciphertext; // returned value - base64
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Error encrypting data');
    }
}

// Generate random invoice number
function generateInvoiceNumber() {
    return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
}

// Convert from MMYY or MM/YY to YYYY/MM 
function convertDateFormat(mmYyDate) {
    try {
        let month, year;
        
        if (mmYyDate.includes('/')) {
            // Format: MM/YY
            [month, year] = mmYyDate.split('/');
        } else if (mmYyDate.length === 4) {
            // Format: MMYY
            month = mmYyDate.substring(0, 2);
            year = mmYyDate.substring(2, 4);
        } else {
            throw new Error('Invalid date format');
        }
        
        const fullYear = '20' + year;
        return `${fullYear}/${month}`;
    } catch (error) {
        console.error('Date conversion error:', error);
        return mmYyDate;
    }
}

// Get client IP address
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
}

// Extract short browser name from user-agent (Mercantil requires max ~20 chars)
function getShortBrowserAgent(req) {
    const userAgent = req.headers['user-agent'] || '';
    
    // Extract browser and version
    let browser = 'Chrome';
    let version = '18.1.3';
    
    if (userAgent.includes('Firefox/')) {
        browser = 'Firefox';
        const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
        version = match ? match[1] + '.0' : '95.0.0';
    } else if (userAgent.includes('Edg/')) {
        browser = 'Edge';
        const match = userAgent.match(/Edg\/(\d+\.\d+)/);
        version = match ? match[1] + '.0' : '96.0.0';
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
        browser = 'Safari';
        const match = userAgent.match(/Version\/(\d+\.\d+)/);
        version = match ? match[1] + '.0' : '15.0.0';
    } else if (userAgent.includes('Chrome/')) {
        browser = 'Chrome';
        const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
        version = match ? match[1] + '.0' : '96.0.0';
    }
    
    // Return short format: "Browser Major.Minor.Patch"
    return `${browser} ${version}`;
}

// Process Pago Móvil (C2P) payment
async function processPagoMovilPayment(paymentData, req) {
    if (!ENCRYPTION_CONFIG.enabled?.c2p) {
        throw new Error('Pago Móvil (C2P) is not configured. Please check environment variables.');
    }
    
    const apiUrls = getAPIUrls();
    if (!apiUrls.c2p) {
        throw new Error('MERCANTIL_C2P_URL environment variable is not set');
    }
    
    const config = ENCRYPTION_CONFIG.c2p;
    const invoiceNumber = paymentData.invoiceNumber || generateInvoiceNumber();
    
    console.log('Processing Pago Móvil payment:', {
        amount: paymentData.amount,
        fromCustomer: paymentData.customerPhone?.substring(0, 4) + '***',
        toBusiness: config.originPhone?.substring(0, 4) + '***'
    });
    
    const requestBody = {
        merchant_identify: {
            integratorId: config.integratorId,
            merchantId: config.merchantId,
            terminalId: config.terminalId
        },
        client_identify: {
            ipaddress: getClientIP(req),
            browser_agent: getShortBrowserAgent(req),
            mobile: {
                manufacturer: 'Samsung'
            }
        },
        transaction_c2p: {
            amount: parseFloat(paymentData.amount),
            currency: 'ves',
            destination_bank_id: 105,
            destination_id: encryptData(paymentData.customerCedula, config.encryptionKey),
            destination_mobile_number: encryptData(paymentData.customerPhone, config.encryptionKey),
            origin_mobile_number: encryptData(config.originPhone, config.encryptionKey),
            payment_reference: '',
            trx_type: 'compra',
            payment_method: 'c2p',
            invoice_number: String(invoiceNumber),
            twofactor_auth: encryptData(paymentData.otpCode, config.encryptionKey)
        }
    };

    console.log('C2P Request Body:', JSON.stringify(requestBody, null, 2));

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-IBM-Client-ID': config.clientId
        },
        body: JSON.stringify(requestBody)
    };

    console.log('Sending C2P request to:', apiUrls.c2p);
    const response = await fetch(apiUrls.c2p, requestOptions);
    const result = await response.json();
    
    console.log('C2P Response:', result);
    
    // Log success/failure
    if (result.infoMsg && result.infoMsg.guId) {
        console.log('Pago Móvil APPROVED:', {
            transactionId: result.infoMsg.guId,
            amount: paymentData.amount,
            processingDate: result.processingDate
        });
    } else if (result.status && (result.status.errorTech || result.status.errorCode)) {
        console.log('Pago Móvil REJECTED:', {
            errorCode: result.status.errorTech || result.status.errorCode,
            errorDesc: result.status.descTech || result.status.descUser,
            amount: paymentData.amount
        });
    }
    
    return result;
}

// Process Card payment (Credit or Debit)
async function processCardPayment(paymentData, req) {
    if (!ENCRYPTION_CONFIG.enabled?.cards) {
        throw new Error('Card payments (TDC/TDD) are not configured. Please check environment variables.');
    }
    
    const apiUrls = getAPIUrls();
    if (!apiUrls.pay) {
        throw new Error('MERCANTIL_PAY_URL environment variable is not set');
    }
    
    const config = ENCRYPTION_CONFIG.cards;
    const invoiceNumber = paymentData.invoiceNumber || generateInvoiceNumber();
    const isDebitCard = paymentData.paymentMethod === 'tdd';
    
    console.log('Processing card payment:', {
        type: isDebitCard ? 'Debit' : 'Credit',
        amount: paymentData.amount,
        cardLast4: paymentData.cardNumber?.slice(-4)
    });
    
    const requestBody = {
        merchant_identify: {
            integratorId: config.integratorId,
            merchantId: config.merchantId,
            terminalId: config.terminalId
        },
        client_identify: {
            ipaddress: getClientIP(req),
            browser_agent: getShortBrowserAgent(req),
            mobile: {
                manufacturer: 'Samsung'
            }
        },
        transaction: {
            trx_type: 'compra',
            payment_method: paymentData.paymentMethod, // 'tdc' or 'tdd'
            customer_id: paymentData.customerCedula,
            card_number: paymentData.cardNumber,
            expiration_date: convertDateFormat(paymentData.expiryDate),
            cvv: encryptData(paymentData.cvv, config.encryptionKey),
            currency: 'ves',
            amount: parseFloat(paymentData.amount),
            invoice_number: invoiceNumber
        }
    };

    // Add two-factor auth for debit cards
    if (isDebitCard && paymentData.otpCode) {
        requestBody.transaction.twofactor_auth = encryptData(paymentData.otpCode, config.encryptionKey);
        requestBody.transaction.account_type = 'cc'; // Current account
    }

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-IBM-Client-ID': config.clientId
        },
        body: JSON.stringify(requestBody)
    };

    console.log('Sending card payment request to:', apiUrls.pay);
    const response = await fetch(apiUrls.pay, requestOptions);
    const result = await response.json();
    
    console.log('Card payment response:', result);
    
    return result;
}

// Check if payment was successful based on Mercantil response
function isPaymentSuccessful(result) {
    // Check for error_list first
    if (result && result.error_list && result.error_list.length > 0) {
        return false;
    }
    
    // Check for status errors (C2P and Cards)
    if (result && result.status) {
        // If status has any error code, it's a failure
        if (result.status.errorTech || result.status.errorCode) {
            return false;
        }
    }
    
    return result && (
        // Card payments response
        (result.transaction_response && result.transaction_response.trx_status === 'approved') ||
        (result.transaction_response && result.transaction_response.trx_internal_status === '0000') ||
        
        // C2P payments response (must have infoMsg with guId for success)
        (result.infoMsg && result.infoMsg.guId) ||
        
        // Generic success indicators
        result.status === 'success' || 
        result.response_code === '00' || 
        result.codigo === '00' ||
        result.code === '00' ||
        result.code === 0 ||
        (result.transaction && result.transaction.status === 'approved')
    );
}

// Main payment processing function
export async function processMercantilPayment(paymentData, req) {
    try {
        // Validate payment data
        if (!paymentData.paymentMethod || !paymentData.amount || !paymentData.customerCedula) {
            throw new Error('Missing required payment fields');
        }

        let result;
        
        switch (paymentData.paymentMethod) {
            case 'pago-movil':
            case 'c2p':
                if (!paymentData.customerPhone || !paymentData.otpCode) {
                    throw new Error('Pago Móvil requires phone and OTP code');
                }
                result = await processPagoMovilPayment({ ...paymentData, paymentMethod: 'c2p' }, req);
                break;

            case 'debito':
            case 'tdd':
                if (!paymentData.cardNumber || !paymentData.expiryDate || !paymentData.cvv) {
                    throw new Error('Debit card requires card details and OTP');
                }
                result = await processCardPayment({ ...paymentData, paymentMethod: 'tdd' }, req);
                break;

            case 'credito':
            case 'tdc':
                if (!paymentData.cardNumber || !paymentData.expiryDate || !paymentData.cvv) {
                    throw new Error('Credit card requires card details');
                }
                result = await processCardPayment({ ...paymentData, paymentMethod: 'tdc' }, req);
                break;

            default:
                throw new Error('Invalid payment method');
        }

        const success = isPaymentSuccessful(result);
        
        if (success) {
            console.log('Payment APPROVED:', {
                method: paymentData.paymentMethod,
                amount: paymentData.amount,
                status: result.transaction_response?.trx_status || result.infoMsg?.guId ? 'approved' : 'completed'
            });
        } else {
            console.log('Payment REJECTED:', {
                method: paymentData.paymentMethod,
                amount: paymentData.amount,
                error: result.status?.descTech || result.error_list?.[0]?.description || 'Unknown error'
            });
        }
        
        return {
            success,
            message: success ? 'Pago procesado exitosamente' : 'Pago rechazado',
            data: result,
            transactionId: result?.transaction_response?.payment_reference || 
                          result?.infoMsg?.guId || 
                          result?.transaction?.id || 
                          null,
            invoiceNumber: result?.transaction_response?.invoice_number || 
                          result?.invoice_number || 
                          paymentData.invoiceNumber,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Mercantil payment error:', error);
        return {
            success: false,
            message: error.message || 'Payment processing error',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        };
    }
}

export default {
    initializeConfig,
    processMercantilPayment
};

