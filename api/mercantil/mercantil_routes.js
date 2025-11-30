import express from 'express';
import { processMercantilPayment } from './mercantil_payment.js';

const router = express.Router();

// Main payment endpoint
router.post('/payment', async (req, res) => {
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
            res.json({
                success: true,
                message: 'Pago procesado exitosamente',
                transactionId: result.transactionId,
                invoiceNumber: result.invoiceNumber,
                data: result.data,
                timestamp: result.timestamp
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message || 'Error al procesar el pago',
                error: result.data?.error_list || result.data?.message || 'Unknown error',
                data: result.data
            });
        }

    } catch (error) {
        console.error('Payment API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Mercantil Payment API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Test endpoint
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Mercantil API is working',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production'
    });
});

export default router;

