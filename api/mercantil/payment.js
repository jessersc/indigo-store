// Mercantil payment endpoint for Vercel
import { processMercantilPayment, initializeConfig } from './mercantil_payment.js';

// Initialize config on module load
initializeConfig();

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false,
            error: 'Method not allowed. Use POST.' 
        });
    }

    try {
        console.log('Mercantil payment request received:', {
            method: req.body.paymentMethod,
            amount: req.body.amount,
            orderNumber: req.body.orderNumber
        });

        const paymentData = {
            paymentMethod: req.body.paymentMethod,
            amount: req.body.amount,
            orderNumber: req.body.orderNumber,
            customerName: req.body.customerName,
            customerEmail: req.body.customerEmail,
            customerCedula: req.body.customerCedula,
            customerPhone: req.body.customerPhone,
            
            // Card-specific fields
            cardNumber: req.body.cardNumber,
            expiryDate: req.body.expiryDate,
            cvv: req.body.cvv,
            
            // OTP for Pago Móvil and Debit Card
            otpCode: req.body.otpCode,
            
            // Invoice number
            invoiceNumber: req.body.invoiceNumber
        };

        const result = await processMercantilPayment(paymentData, req);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: 'Pago procesado exitosamente',
                transactionId: result.transactionId,
                invoiceNumber: result.invoiceNumber,
                data: result.data,
                timestamp: result.timestamp
            });
        } else {
            return res.status(400).json({
                success: false,
                message: result.message || 'Error al procesar el pago',
                error: result.data?.error_list || result.data?.message || 'Unknown error',
                data: result.data
            });
        }

    } catch (error) {
        console.error('Payment API error:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
        });
    }
}

