// Mercantil Payment Modals
// Handles Pago Móvil, Tarjeta de Crédito, and Tarjeta de Débito payments

// Global state for current payment
let currentMercantilPayment = null;

// Helper function to format and validate cédula
function formatCedula(cedula) {
    if (!cedula) return { valid: false, formatted: '', error: 'La cédula es requerida' };
    
    // Remove spaces, dashes, and dots
    let cleaned = cedula.trim().replace(/[\s\-\.]/g, '').toUpperCase();
    
    // Check if it starts with V, E, J, P, G
    const validPrefixes = ['V', 'E', 'J', 'P', 'G'];
    let prefix = '';
    let number = '';
    
    if (validPrefixes.includes(cleaned.charAt(0))) {
        prefix = cleaned.charAt(0);
        number = cleaned.substring(1);
    } else {
        return { 
            valid: false, 
            formatted: '', 
            error: 'La cédula debe iniciar con una letra (V, E, J, P, G). Ejemplo: V12345678' 
        };
    }
    
    // Validate number is numeric and max 10 digits (total 11 chars with letter)
    if (!/^\d{6,10}$/.test(number)) {
        return { 
            valid: false, 
            formatted: '', 
            error: 'La cédula debe tener entre 6 y 10 dígitos después de la letra. Ejemplo: V12345678' 
        };
    }
    
    return { 
        valid: true, 
        formatted: prefix + number,
        error: '' 
    };
}

// Helper function to format and validate Venezuelan phone number
function formatVenezuelanPhone(phone) {
    if (!phone) return { valid: false, formatted: '', error: 'El teléfono es requerido' };
    
    // Remove spaces, dashes, parentheses, and plus signs
    let cleaned = phone.trim().replace(/[\s\-\(\)\+]/g, '');
    
    // Remove leading 58 (country code) if present
    if (cleaned.startsWith('58') && cleaned.length === 12) {
        cleaned = cleaned.substring(2);
    }
    
    // Add leading 0 if missing (e.g., 4241234567 -> 04241234567)
    if (!cleaned.startsWith('0') && cleaned.length === 10) {
        cleaned = '0' + cleaned;
    }
    
    // Validate format: 11 digits total, starting with 0
    if (!/^0\d{10}$/.test(cleaned)) {
        return { 
            valid: false, 
            formatted: '', 
            error: 'Formato de teléfono inválido. Debe tener el formato: 0123 123 1234 o 0424 123 1234' 
        };
    }
    
    return { 
        valid: true, 
        formatted: cleaned,
        error: '' 
    };
}

// Helper function to format card number (remove spaces)
function formatCardNumber(cardNumber) {
    if (!cardNumber) return { valid: false, formatted: '', error: 'El número de tarjeta es requerido' };
    
    let cleaned = cardNumber.trim().replace(/[\s\-]/g, '');
    
    // Validate it's 16 digits
    if (!/^\d{16}$/.test(cleaned)) {
        return { 
            valid: false, 
            formatted: '', 
            error: 'El número de tarjeta debe tener 16 dígitos' 
        };
    }
    
    return { 
        valid: true, 
        formatted: cleaned,
        error: '' 
    };
}

// Helper function to format expiry date (MM/YY or MMYY to MMYY)
function formatExpiryDate(expiry) {
    if (!expiry) return { valid: false, formatted: '', error: 'La fecha de expiración es requerida' };
    
    let cleaned = expiry.trim().replace(/[\s\/\-]/g, '');
    
    // Validate format MMYY (4 digits)
    if (!/^\d{4}$/.test(cleaned)) {
        return { 
            valid: false, 
            formatted: '', 
            error: 'Formato de fecha inválido. Use MM/AA, ejemplo: 12/25' 
        };
    }
    
    const month = cleaned.substring(0, 2);
    const year = cleaned.substring(2, 4);
    
    // Validate month (01-12)
    if (parseInt(month) < 1 || parseInt(month) > 12) {
        return { 
            valid: false, 
            formatted: '', 
            error: 'Mes inválido. Debe estar entre 01 y 12' 
        };
    }
    
    return { 
        valid: true, 
        formatted: cleaned,
        error: '' 
    };
}

// Helper function to format CVV
function formatCVV(cvv) {
    if (!cvv) return { valid: false, formatted: '', error: 'El CVV es requerido' };
    
    let cleaned = cvv.trim();
    
    // Validate it's 3 or 4 digits
    if (!/^\d{3,4}$/.test(cleaned)) {
        return { 
            valid: false, 
            formatted: '', 
            error: 'El CVV debe tener 3 o 4 dígitos' 
        };
    }
    
    return { 
        valid: true, 
        formatted: cleaned,
        error: '' 
    };
}

// Show Pago Móvil Modal
window.showPagoMovilModal = function(orderData) {
    currentMercantilPayment = {
        orderNumber: orderData.orderNumber,
        totalUSD: orderData.totalUSD,
        totalBS: orderData.totalBS,
        paymentMethod: 'pago-movil',
        customerName: orderData.deliveryInfo?.name || '',
        customerEmail: orderData.deliveryInfo?.email || '',
        customerCedula: orderData.deliveryInfo?.cedula || '',
        customerPhone: orderData.deliveryInfo?.phone || ''
    };

    const modal = document.createElement('div');
    modal.id = 'pagoMovilModal';
    modal.className = 'mercantil-modal-overlay';
    modal.innerHTML = `
        <div class="mercantil-modal">
            <button class="mercantil-modal-close" onclick="closeMercantilModal('pagoMovilModal')">&times;</button>
            
            <div class="mercantil-modal-header">
                <h2>💳 Pago Móvil Mercantil</h2>
                <p class="mercantil-modal-subtitle">Complete los datos para procesar su pago</p>
            </div>

            <div class="mercantil-modal-body">
                <!-- Order Summary -->
                <div class="mercantil-order-summary">
                    <div class="summary-row">
                        <span>Orden:</span>
                        <strong>${orderData.orderNumber}</strong>
                    </div>
                    <div class="summary-row">
                        <span>Total USD:</span>
                        <strong>$${orderData.totalUSD.toFixed(2)}</strong>
                    </div>
                    <div class="summary-row">
                        <span>Total Bs:</span>
                        <strong>Bs ${orderData.totalBS.toFixed(2)}</strong>
                    </div>
                </div>

                <!-- Payment Form -->
                <form id="pagoMovilForm" class="mercantil-payment-form">
                    <div class="form-group">
                        <label>Cédula *</label>
                        <div class="input-with-prefix">
                            <select id="pm_cedula_prefix" class="prefix-select">
                                <option value="V">V</option>
                                <option value="E">E</option>
                                <option value="J">J</option>
                                <option value="P">P</option>
                                <option value="G">G</option>
                            </select>
                            <input 
                                type="text" 
                                id="pm_cedula" 
                                placeholder="12345678"
                                maxlength="10"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Teléfono *</label>
                        <div class="input-with-prefix">
                            <select id="pm_phone_prefix" class="prefix-select">
                                <option value="0412">0412</option>
                                <option value="0414">0414</option>
                                <option value="0424">0424</option>
                                <option value="0416">0416</option>
                                <option value="0426">0426</option>
                            </select>
                            <input 
                                type="text" 
                                id="pm_phone" 
                                placeholder="1234567"
                                maxlength="7"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Código OTP (Clave de Pago Móvil) *</label>
                        <input 
                            type="password" 
                            id="pm_otp" 
                            placeholder="****"
                            required
                            maxlength="8"
                        />
                        <small class="form-hint">Ingrese su clave de Pago Móvil (4 a 8 dígitos)</small>
                    </div>

                    <div class="mercantil-modal-actions">
                        <button type="button" class="btn-cancel" onclick="closeMercantilModal('pagoMovilModal')">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-primary" id="pm_submit">
                            <span class="btn-text">Procesar Pago</span>
                            <span class="btn-loading" style="display: none;">
                                <span class="spinner"></span> Procesando...
                            </span>
                        </button>
                    </div>
                </form>

                <div id="pm_error" class="mercantil-error" style="display: none;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Real-time phone validation
    document.getElementById('pm_phone').addEventListener('input', (e) => {
        // Only validate if user has entered something
        const phoneValue = e.target.value.trim();
        const errorDiv = document.getElementById('pm_error');
        
        if (!phoneValue) {
            e.target.style.borderColor = '';
            return;
        }
        
        // Validate it's 7 digits
        if (!/^\d{7}$/.test(phoneValue)) {
            errorDiv.textContent = '📱 El teléfono debe tener 7 dígitos';
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = '#10b981';
        }
    });

    // Real-time cédula validation
    document.getElementById('pm_cedula').addEventListener('input', (e) => {
        // Only validate if user has entered something
        const cedulaValue = e.target.value.trim();
        const errorDiv = document.getElementById('pm_error');
        
        if (!cedulaValue) {
            e.target.style.borderColor = '';
            return;
        }
        
        // Validate it's 6-10 digits
        if (!/^\d{6,10}$/.test(cedulaValue)) {
            errorDiv.textContent = 'La cédula debe tener entre 6 y 10 dígitos (solo números)';
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = '#10b981';
        }
    });

    // Real-time OTP validation (4 to 8 digits)
    document.getElementById('pm_otp').addEventListener('input', (e) => {
        const errorDiv = document.getElementById('pm_error');
        // Only allow digits, max 8
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
        
        if (e.target.value.length > 0 && e.target.value.length < 4) {
            errorDiv.textContent = 'La clave OTP debe tener entre 4 y 8 dígitos';
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else if (e.target.value.length >= 4) {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = '#10b981';
        } else {
            e.target.style.borderColor = '';
        }
    });

    // Form submission
    document.getElementById('pagoMovilForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await processPagoMovil();
    });

    // Prevent modal close on click inside
    modal.querySelector('.mercantil-modal').addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close on overlay click
    modal.addEventListener('click', () => {
        closeMercantilModal('pagoMovilModal');
    });
};

// Show Credit Card Modal
window.showCreditCardModal = function(orderData) {
    currentMercantilPayment = {
        orderNumber: orderData.orderNumber,
        totalUSD: orderData.totalUSD,
        totalBS: orderData.totalBS,
        paymentMethod: 'credito',
        customerName: orderData.deliveryInfo?.name || '',
        customerEmail: orderData.deliveryInfo?.email || '',
        customerCedula: orderData.deliveryInfo?.cedula || ''
    };

    const modal = document.createElement('div');
    modal.id = 'creditCardModal';
    modal.className = 'mercantil-modal-overlay';
    modal.innerHTML = `
        <div class="mercantil-modal">
            <button class="mercantil-modal-close" onclick="closeMercantilModal('creditCardModal')">&times;</button>
            
            <div class="mercantil-modal-header">
                <h2>💳 Tarjeta de Crédito</h2>
                <p class="mercantil-modal-subtitle">Ingrese los datos de su tarjeta</p>
            </div>

            <div class="mercantil-modal-body">
                <!-- Order Summary -->
                <div class="mercantil-order-summary">
                    <div class="summary-row">
                        <span>Orden:</span>
                        <strong>${orderData.orderNumber}</strong>
                    </div>
                    <div class="summary-row">
                        <span>Total USD:</span>
                        <strong>$${orderData.totalUSD.toFixed(2)}</strong>
                    </div>
                    <div class="summary-row">
                        <span>Total Bs:</span>
                        <strong>Bs ${orderData.totalBS.toFixed(2)}</strong>
                    </div>
                </div>

                <!-- Payment Form -->
                <form id="creditCardForm" class="mercantil-payment-form">
                    <div class="form-group">
                        <label>Cédula del Titular *</label>
                        <div class="input-with-prefix">
                            <select id="cc_cedula_prefix" class="prefix-select">
                                <option value="V">V</option>
                                <option value="E">E</option>
                                <option value="J">J</option>
                                <option value="P">P</option>
                                <option value="G">G</option>
                            </select>
                            <input 
                                type="text" 
                                id="cc_cedula" 
                                placeholder="12345678"
                                maxlength="10"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Número de Tarjeta *</label>
                        <input 
                            type="text" 
                            id="cc_number" 
                            placeholder="1234 5678 9012 3456"
                            required
                            maxlength="19"
                            inputmode="numeric"
                        />
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha de Vencimiento *</label>
                            <input 
                                type="text" 
                                id="cc_expiry" 
                                placeholder="MM/YY"
                                required
                                maxlength="5"
                                pattern="[0-9]{2}/[0-9]{2}"
                            />
                        </div>
                        <div class="form-group">
                            <label>CVV *</label>
                            <input 
                                type="password" 
                                id="cc_cvv" 
                                placeholder="123"
                                required
                                maxlength="4"
                                pattern="[0-9]{3,4}"
                            />
                        </div>
                    </div>

                    <div class="mercantil-modal-actions">
                        <button type="button" class="btn-cancel" onclick="closeMercantilModal('creditCardModal')">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-primary" id="cc_submit">
                            <span class="btn-text">Procesar Pago</span>
                            <span class="btn-loading" style="display: none;">
                                <span class="spinner"></span> Procesando...
                            </span>
                        </button>
                    </div>
                </form>

                <div id="cc_error" class="mercantil-error" style="display: none;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Real-time cédula validation
    document.getElementById('cc_cedula').addEventListener('input', (e) => {
        const cedulaValue = e.target.value.trim();
        const errorDiv = document.getElementById('cc_error');
        
        if (!cedulaValue) {
            e.target.style.borderColor = '';
            return;
        }
        
        // Validate it's 6-10 digits
        if (!/^\d{6,10}$/.test(cedulaValue)) {
            errorDiv.textContent = 'La cédula debe tener entre 6 y 10 dígitos (solo números)';
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = '#10b981';
        }
    });

    // Format and validate card number
    document.getElementById('cc_number').addEventListener('input', (e) => {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
        
        const cardResult = formatCardNumber(value);
        const errorDiv = document.getElementById('cc_error');
        if (value && !cardResult.valid) {
            errorDiv.textContent = '💳 ' + cardResult.error;
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = cardResult.valid ? '#10b981' : '';
        }
    });

    // Format and validate expiry date
    document.getElementById('cc_expiry').addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
        
        const expiryResult = formatExpiryDate(e.target.value);
        const errorDiv = document.getElementById('cc_error');
        if (e.target.value && !expiryResult.valid) {
            errorDiv.textContent = '📅 ' + expiryResult.error;
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = expiryResult.valid ? '#10b981' : '';
        }
    });

    // Validate CVV
    document.getElementById('cc_cvv').addEventListener('input', (e) => {
        // Only allow digits, max 4
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        
        const cvvResult = formatCVV(e.target.value);
        const errorDiv = document.getElementById('cc_error');
        if (e.target.value && !cvvResult.valid) {
            errorDiv.textContent = '🔒 ' + cvvResult.error;
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = cvvResult.valid ? '#10b981' : '';
        }
    });

    // Form submission
    document.getElementById('creditCardForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await processCreditCard();
    });

    // Prevent modal close on click inside
    modal.querySelector('.mercantil-modal').addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close on overlay click
    modal.addEventListener('click', () => {
        closeMercantilModal('creditCardModal');
    });
};

// Show Debit Card Modal
window.showDebitCardModal = function(orderData) {
    currentMercantilPayment = {
        orderNumber: orderData.orderNumber,
        totalUSD: orderData.totalUSD,
        totalBS: orderData.totalBS,
        paymentMethod: 'debito',
        customerName: orderData.deliveryInfo?.name || '',
        customerEmail: orderData.deliveryInfo?.email || '',
        customerCedula: orderData.deliveryInfo?.cedula || ''
    };

    const modal = document.createElement('div');
    modal.id = 'debitCardModal';
    modal.className = 'mercantil-modal-overlay';
    modal.innerHTML = `
        <div class="mercantil-modal">
            <button class="mercantil-modal-close" onclick="closeMercantilModal('debitCardModal')">&times;</button>
            
            <div class="mercantil-modal-header">
                <h2>💳 Tarjeta de Débito</h2>
                <p class="mercantil-modal-subtitle">Ingrese los datos de su tarjeta</p>
            </div>

            <div class="mercantil-modal-body">
                <!-- Order Summary -->
                <div class="mercantil-order-summary">
                    <div class="summary-row">
                        <span>Orden:</span>
                        <strong>${orderData.orderNumber}</strong>
                    </div>
                    <div class="summary-row">
                        <span>Total USD:</span>
                        <strong>$${orderData.totalUSD.toFixed(2)}</strong>
                    </div>
                    <div class="summary-row">
                        <span>Total Bs:</span>
                        <strong>Bs ${orderData.totalBS.toFixed(2)}</strong>
                    </div>
                </div>

                <!-- Payment Form -->
                <form id="debitCardForm" class="mercantil-payment-form">
                    <div class="form-group">
                        <label>Cédula del Titular *</label>
                        <div class="input-with-prefix">
                            <select id="dc_cedula_prefix" class="prefix-select">
                                <option value="V">V</option>
                                <option value="E">E</option>
                                <option value="J">J</option>
                                <option value="P">P</option>
                                <option value="G">G</option>
                            </select>
                            <input 
                                type="text" 
                                id="dc_cedula" 
                                placeholder="12345678"
                                maxlength="10"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Número de Tarjeta *</label>
                        <input 
                            type="text" 
                            id="dc_number" 
                            placeholder="1234 5678 9012 3456"
                            required
                            maxlength="19"
                            inputmode="numeric"
                        />
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha de Vencimiento *</label>
                            <input 
                                type="text" 
                                id="dc_expiry" 
                                placeholder="MM/YY"
                                required
                                maxlength="5"
                                pattern="[0-9]{2}/[0-9]{2}"
                            />
                        </div>
                        <div class="form-group">
                            <label>CVV *</label>
                            <input 
                                type="password" 
                                id="dc_cvv" 
                                placeholder="123"
                                required
                                maxlength="4"
                                pattern="[0-9]{3,4}"
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Código OTP (Clave de Autenticación) *</label>
                        <input 
                            type="password" 
                            id="dc_otp" 
                            placeholder="****"
                            required
                            maxlength="8"
                        />
                        <small class="form-hint">Ingrese su clave de autenticación (4 a 8 dígitos)</small>
                    </div>

                    <div class="mercantil-modal-actions">
                        <button type="button" class="btn-cancel" onclick="closeMercantilModal('debitCardModal')">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-primary" id="dc_submit">
                            <span class="btn-text">Procesar Pago</span>
                            <span class="btn-loading" style="display: none;">
                                <span class="spinner"></span> Procesando...
                            </span>
                        </button>
                    </div>
                </form>

                <div id="dc_error" class="mercantil-error" style="display: none;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Real-time cédula validation
    document.getElementById('dc_cedula').addEventListener('input', (e) => {
        const cedulaValue = e.target.value.trim();
        const errorDiv = document.getElementById('dc_error');
        
        if (!cedulaValue) {
            e.target.style.borderColor = '';
            return;
        }
        
        // Validate it's 6-10 digits
        if (!/^\d{6,10}$/.test(cedulaValue)) {
            errorDiv.textContent = 'La cédula debe tener entre 6 y 10 dígitos (solo números)';
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = '#10b981';
        }
    });

    // Format and validate card number
    document.getElementById('dc_number').addEventListener('input', (e) => {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
        
        const cardResult = formatCardNumber(value);
        const errorDiv = document.getElementById('dc_error');
        if (value && !cardResult.valid) {
            errorDiv.textContent = '💳 ' + cardResult.error;
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = cardResult.valid ? '#10b981' : '';
        }
    });

    // Format and validate expiry date
    document.getElementById('dc_expiry').addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
        
        const expiryResult = formatExpiryDate(e.target.value);
        const errorDiv = document.getElementById('dc_error');
        if (e.target.value && !expiryResult.valid) {
            errorDiv.textContent = '📅 ' + expiryResult.error;
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = expiryResult.valid ? '#10b981' : '';
        }
    });

    // Validate CVV
    document.getElementById('dc_cvv').addEventListener('input', (e) => {
        // Only allow digits, max 4
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        
        const cvvResult = formatCVV(e.target.value);
        const errorDiv = document.getElementById('dc_error');
        if (e.target.value && !cvvResult.valid) {
            errorDiv.textContent = '🔒 ' + cvvResult.error;
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = cvvResult.valid ? '#10b981' : '';
        }
    });

    // Validate OTP (4 to 8 digits)
    document.getElementById('dc_otp').addEventListener('input', (e) => {
        // Only allow digits, max 8
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
        
        const errorDiv = document.getElementById('dc_error');
        if (e.target.value.length > 0 && e.target.value.length < 4) {
            errorDiv.textContent = 'La clave OTP debe tener entre 4 y 8 dígitos';
            errorDiv.style.display = 'block';
            e.target.style.borderColor = '#ef4444';
        } else if (e.target.value.length >= 4) {
            errorDiv.style.display = 'none';
            e.target.style.borderColor = '#10b981';
        } else {
            e.target.style.borderColor = '';
        }
    });

    // Form submission
    document.getElementById('debitCardForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await processDebitCard();
    });

    // Prevent modal close on click inside
    modal.querySelector('.mercantil-modal').addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close on overlay click
    modal.addEventListener('click', () => {
        closeMercantilModal('debitCardModal');
    });
};

// Close Modal
window.closeMercantilModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
    currentMercantilPayment = null;
};

// Process Pago Móvil Payment
async function processPagoMovil() {
    const submitBtn = document.getElementById('pm_submit');
    const errorDiv = document.getElementById('pm_error');
    
    try {
        // Show loading state
        submitBtn.querySelector('.btn-text').style.display = 'none';
        submitBtn.querySelector('.btn-loading').style.display = 'inline-flex';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        // Get and validate inputs with prefixes
        const phonePrefix = document.getElementById('pm_phone_prefix').value;
        const phoneNumber = document.getElementById('pm_phone').value.trim();
        const cedulaPrefix = document.getElementById('pm_cedula_prefix').value;
        const cedulaNumber = document.getElementById('pm_cedula').value.trim();
        const otpInput = document.getElementById('pm_otp').value.trim();

        // Validate phone number (7 digits)
        if (!/^\d{7}$/.test(phoneNumber)) {
            throw new Error('El teléfono debe tener 7 dígitos');
        }

        // Validate cédula number (max 10 digits)
        if (!/^\d{6,10}$/.test(cedulaNumber)) {
            throw new Error('La cédula debe tener entre 6 y 10 dígitos');
        }

        // Validate OTP (4 to 8 digits)
        if (!/^\d{4,8}$/.test(otpInput)) {
            throw new Error('La clave OTP debe tener entre 4 y 8 dígitos');
        }

        // Round amount to 2 decimal places - Mercantil requires exact format
        const roundedAmount = Math.round(currentMercantilPayment.totalBS * 100) / 100;
        
        const paymentData = {
            paymentMethod: 'pago-movil',
            amount: roundedAmount,
            orderNumber: currentMercantilPayment.orderNumber,
            customerName: currentMercantilPayment.customerName,
            customerEmail: currentMercantilPayment.customerEmail,
            customerCedula: cedulaPrefix + cedulaNumber,
            customerPhone: phonePrefix + phoneNumber,
            otpCode: otpInput
        };

        console.log('🏦 Processing Pago Móvil payment:', paymentData);

        const response = await fetch('/api/mercantil/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentData)
        });

        const result = await response.json();

        // Validate payment success
        if (!result.success || !result.transactionId) {
            // Extract detailed error from Mercantil response
            let errorMessage = result.message || 'Error al procesar el pago';
            
            if (result.data) {
                // Check for Mercantil error_list
                if (result.data.error_list && result.data.error_list.length > 0) {
                    const firstError = result.data.error_list[0];
                    errorMessage = `Error ${firstError.error_code || ''}: ${firstError.description || 'Error al procesar el pago'}`;
                }
                // Check for status errors
                else if (result.data.status) {
                    const status = result.data.status;
                    errorMessage = `Error ${status.errorTech || status.errorCode || ''}: ${status.descTech || status.descUser || 'Error al procesar el pago'}`;
                }
            }
            
            throw new Error(errorMessage);
        }
        
        console.log('Pago Móvil payment successful:', result);
        
        // Verify currentMercantilPayment is set
        if (!currentMercantilPayment) {
            console.error('currentMercantilPayment is null! This should not happen.');
            throw new Error('Error interno: datos de pago no disponibles');
        }
        
        // Store all data before closing modal (modal close clears currentMercantilPayment)
        const orderNumber = currentMercantilPayment.orderNumber;
        const totalUSD = currentMercantilPayment.totalUSD;
        const totalBS = currentMercantilPayment.totalBS;
        const customerName = currentMercantilPayment.customerName;
        const customerEmail = currentMercantilPayment.customerEmail;
        
        // Create order ONLY after successful payment
        try {
            if (window.saveOrderToSupabase) {
                // Get order data from pendingOrderData or construct it
                const pendingData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
                const orderData = {
                    orderNumber: orderNumber,
                    orderDate: new Date().toISOString(),
                    items: pendingData.cart ? pendingData.cart.map(item => ({
                        product: item.Product || item.product || '',
                        quantity: item.quantity || 1,
                        priceUSD: parseFloat(item.USD || item.priceUSD || 0),
                        priceBS: parseFloat(item.Bs || item.priceBS || 0),
                        sku: item.sku || item.SKU || ''
                    })) : [],
                    totalUSD: totalUSD,
                    totalBS: totalBS,
                    paymentMethod: 'pago-movil',
                    status: 'pending',
                    deliveryMethod: pendingData.deliveryMethod || '',
                    deliveryType: pendingData.deliveryType || '',
                    deliveryInfo: pendingData.deliveryInfo || {}
                };
                
                const savedOrder = await window.saveOrderToSupabase(orderData);
                if (!savedOrder || !savedOrder.id) {
                    throw new Error('Failed to create order');
                }
                console.log('Order created after successful Mercantil Pago Móvil payment:', savedOrder.id);
                
                // Store order ID for payment linking
                const orderId = savedOrder.id;
                localStorage.setItem(`order_${orderNumber}_supabase_id`, orderId);
                
                // Save payment to tracker with order ID
                if (window.savePaymentCompletion) {
                    const pendingData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
                    const trackerData = {
                        orderNumber: orderNumber,
                        transactionId: result.transactionId,
                        totalUSD: totalUSD,
                        totalBS: totalBS,
                        paymentMethod: 'Pago Móvil Mercantil',
                        customerName: customerName,
                        customerEmail: customerEmail,
                        customerPhone: paymentData.customerPhone,
                        customerCedula: paymentData.customerCedula,
                        products: pendingData.cart ? pendingData.cart.map(i => i.Product || i.product || '').join(', ') : '',
                        quantities: pendingData.cart ? pendingData.cart.map(i => i.quantity).join(', ') : '',
                        deliveryMethod: pendingData.deliveryMethod || '',
                        deliveryType: pendingData.deliveryType || '',
                        customerAddress: pendingData.deliveryInfo ? (pendingData.deliveryInfo.address || pendingData.deliveryInfo.officeAddress || '') : '',
                        courier: pendingData.deliveryInfo ? pendingData.deliveryInfo.courier : '',
                        state: pendingData.deliveryInfo ? pendingData.deliveryInfo.state : '',
                        office: pendingData.deliveryInfo ? pendingData.deliveryInfo.office : '',
                        officeAddress: pendingData.deliveryInfo ? pendingData.deliveryInfo.officeAddress : '',
                        supabaseOrderId: orderId,
                        status: 'completed',
                        rawData: result.data
                    };
                    
                    // Wait for payment to be saved before redirecting
                    await new Promise((resolve) => {
                        window.savePaymentCompletion(trackerData, function(response) {
                            if (response && response.success) {
                                console.log('Payment saved to Supabase successfully:', response);
                            } else {
                                console.error('Failed to save payment to Supabase:', response);
                            }
                            resolve(response);
                        });
                    });
                } else {
                    console.error('savePaymentCompletion function not available!');
                }
            } else {
                throw new Error('saveOrderToSupabase not available');
            }
        } catch (orderError) {
            console.error('Failed to create order after payment:', orderError);
            alert('Error: El pago se completó pero no se pudo crear la orden. Por favor, contacta soporte con el número de transacción: ' + (result.transactionId || 'N/A'));
            return;
        }
        
        // Close modal
        closeMercantilModal('pagoMovilModal');
        
        // Clear cart and redirect to success
        localStorage.removeItem('cart');
        if (window.updateCartIconCount) window.updateCartIconCount();
        window.location.href = `/?page=payment_success&idNumber=${orderNumber}&method=mercantil-pm`;
        
        return; // Exit early since we handled success

    } catch (error) {
        console.error('Pago Móvil error:', error);
        errorDiv.textContent = error.message || 'Error al procesar el pago. Por favor intente nuevamente.';
        errorDiv.style.display = 'block';
        
        // Reset button
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loading').style.display = 'none';
        submitBtn.disabled = false;
    }
}

// Process Credit Card Payment
async function processCreditCard() {
    const submitBtn = document.getElementById('cc_submit');
    const errorDiv = document.getElementById('cc_error');
    
    try {
        // Show loading state
        submitBtn.querySelector('.btn-text').style.display = 'none';
        submitBtn.querySelector('.btn-loading').style.display = 'inline-flex';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        // Get and validate inputs with prefixes
        const cedulaPrefix = document.getElementById('cc_cedula_prefix').value;
        const cedulaNumber = document.getElementById('cc_cedula').value.trim();
        const cardNumberInput = document.getElementById('cc_number').value;
        const expiryInput = document.getElementById('cc_expiry').value;
        const cvvInput = document.getElementById('cc_cvv').value;

        // Validate cédula number (max 10 digits)
        if (!/^\d{6,10}$/.test(cedulaNumber)) {
            throw new Error('La cédula debe tener entre 6 y 10 dígitos');
        }

        // Validate card number
        const cardResult = formatCardNumber(cardNumberInput);
        if (!cardResult.valid) {
            throw new Error(cardResult.error);
        }

        // Validate expiry date
        const expiryResult = formatExpiryDate(expiryInput);
        if (!expiryResult.valid) {
            throw new Error(expiryResult.error);
        }

        // Validate CVV
        const cvvResult = formatCVV(cvvInput);
        if (!cvvResult.valid) {
            throw new Error(cvvResult.error);
        }

        // Round amount to 2 decimal places - Mercantil requires exact format
        const roundedAmount = Math.round(currentMercantilPayment.totalBS * 100) / 100;
        
        const paymentData = {
            paymentMethod: 'credito',
            amount: roundedAmount,
            orderNumber: currentMercantilPayment.orderNumber,
            customerName: currentMercantilPayment.customerName,
            customerEmail: currentMercantilPayment.customerEmail,
            customerCedula: cedulaPrefix + cedulaNumber,
            cardNumber: cardResult.formatted,
            expiryDate: expiryResult.formatted,
            cvv: cvvResult.formatted
        };

        console.log('💳 Processing credit card payment');

        const response = await fetch('/api/mercantil/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentData)
        });

        const result = await response.json();

        // Validate payment success
        if (!result.success || !result.transactionId) {
            // Extract detailed error from Mercantil response
            let errorMessage = result.message || 'Error al procesar el pago';
            
            if (result.data) {
                // Check for Mercantil error_list
                if (result.data.error_list && result.data.error_list.length > 0) {
                    const firstError = result.data.error_list[0];
                    errorMessage = `Error ${firstError.error_code || ''}: ${firstError.description || 'Error al procesar el pago'}`;
                }
                // Check for status errors
                else if (result.data.status) {
                    const status = result.data.status;
                    errorMessage = `Error ${status.errorTech || status.errorCode || ''}: ${status.descTech || status.descUser || 'Error al procesar el pago'}`;
                }
            }
            
            throw new Error(errorMessage);
        }
        
        console.log('Credit card payment successful:', result);
        
        // Verify currentMercantilPayment is set
        if (!currentMercantilPayment) {
            console.error('currentMercantilPayment is null! This should not happen.');
            throw new Error('Error interno: datos de pago no disponibles');
        }
        
        // Store all data before closing modal (modal close clears currentMercantilPayment)
        const orderNumber = currentMercantilPayment.orderNumber;
        const totalUSD = currentMercantilPayment.totalUSD;
        const totalBS = currentMercantilPayment.totalBS;
        const customerName = currentMercantilPayment.customerName;
        const customerEmail = currentMercantilPayment.customerEmail;
        
        // Create order ONLY after successful payment
        try {
            if (window.saveOrderToSupabase) {
                // Get order data from pendingOrderData or construct it
                const pendingData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
                const orderData = {
                    orderNumber: orderNumber,
                    orderDate: new Date().toISOString(),
                    items: pendingData.cart ? pendingData.cart.map(item => ({
                        product: item.Product || item.product || '',
                        quantity: item.quantity || 1,
                        priceUSD: parseFloat(item.USD || item.priceUSD || 0),
                        priceBS: parseFloat(item.Bs || item.priceBS || 0),
                        sku: item.sku || item.SKU || ''
                    })) : [],
                    totalUSD: totalUSD,
                    totalBS: totalBS,
                    paymentMethod: 'credito',
                    status: 'pending',
                    deliveryMethod: pendingData.deliveryMethod || '',
                    deliveryType: pendingData.deliveryType || '',
                    deliveryInfo: pendingData.deliveryInfo || {}
                };
                
                const savedOrder = await window.saveOrderToSupabase(orderData);
                if (!savedOrder || !savedOrder.id) {
                    throw new Error('Failed to create order');
                }
                console.log('Order created after successful Mercantil Credit Card payment:', savedOrder.id);
                
                // Store order ID for payment linking
                const orderId = savedOrder.id;
                localStorage.setItem(`order_${orderNumber}_supabase_id`, orderId);
                
                // Save payment to tracker with order ID
                if (window.savePaymentCompletion) {
                    const pendingData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
                    const trackerData = {
                        orderNumber: orderNumber,
                        transactionId: result.transactionId,
                        totalUSD: totalUSD,
                        totalBS: totalBS,
                        paymentMethod: 'Tarjeta de Crédito Mercantil',
                        customerName: customerName,
                        customerEmail: customerEmail,
                        customerCedula: paymentData.customerCedula,
                        products: pendingData.cart ? pendingData.cart.map(i => i.Product || i.product || '').join(', ') : '',
                        quantities: pendingData.cart ? pendingData.cart.map(i => i.quantity).join(', ') : '',
                        deliveryMethod: pendingData.deliveryMethod || '',
                        deliveryType: pendingData.deliveryType || '',
                        customerAddress: pendingData.deliveryInfo ? (pendingData.deliveryInfo.address || pendingData.deliveryInfo.officeAddress || '') : '',
                        courier: pendingData.deliveryInfo ? pendingData.deliveryInfo.courier : '',
                        state: pendingData.deliveryInfo ? pendingData.deliveryInfo.state : '',
                        office: pendingData.deliveryInfo ? pendingData.deliveryInfo.office : '',
                        officeAddress: pendingData.deliveryInfo ? pendingData.deliveryInfo.officeAddress : '',
                        supabaseOrderId: orderId,
                        status: 'completed',
                        rawData: result.data
                    };
                    
                    // Wait for payment to be saved before redirecting
                    await new Promise((resolve) => {
                        window.savePaymentCompletion(trackerData, function(response) {
                            if (response && response.success) {
                                console.log('Payment saved to Supabase successfully:', response);
                            } else {
                                console.error('Failed to save payment to Supabase:', response);
                            }
                            resolve(response);
                        });
                    });
                } else {
                    console.error('savePaymentCompletion function not available!');
                }
            } else {
                throw new Error('saveOrderToSupabase not available');
            }
        } catch (orderError) {
            console.error('Failed to create order after payment:', orderError);
            alert('Error: El pago se completó pero no se pudo crear la orden. Por favor, contacta soporte con el número de transacción: ' + (result.transactionId || 'N/A'));
            return;
        }
        
        // Close modal
        closeMercantilModal('creditCardModal');
        
        // Clear cart and redirect to success
        localStorage.removeItem('cart');
        if (window.updateCartIconCount) window.updateCartIconCount();
        window.location.href = `/?page=payment_success&idNumber=${orderNumber}&method=mercantil-cc`;
        
        return; // Exit early since we handled success

    } catch (error) {
        console.error('Credit card error:', error);
        errorDiv.textContent = error.message || 'Error al procesar el pago. Por favor intente nuevamente.';
        errorDiv.style.display = 'block';
        
        // Reset button
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loading').style.display = 'none';
        submitBtn.disabled = false;
    }
}

// Process Debit Card Payment
async function processDebitCard() {
    const submitBtn = document.getElementById('dc_submit');
    const errorDiv = document.getElementById('dc_error');
    
    try {
        // Show loading state
        submitBtn.querySelector('.btn-text').style.display = 'none';
        submitBtn.querySelector('.btn-loading').style.display = 'inline-flex';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        // Get and validate inputs with prefixes
        const cedulaPrefix = document.getElementById('dc_cedula_prefix').value;
        const cedulaNumber = document.getElementById('dc_cedula').value.trim();
        const cardNumberInput = document.getElementById('dc_number').value;
        const expiryInput = document.getElementById('dc_expiry').value;
        const cvvInput = document.getElementById('dc_cvv').value;
        const otpInput = document.getElementById('dc_otp').value.trim();

        // Validate cédula number (max 10 digits)
        if (!/^\d{6,10}$/.test(cedulaNumber)) {
            throw new Error('La cédula debe tener entre 6 y 10 dígitos');
        }

        // Validate card number
        const cardResult = formatCardNumber(cardNumberInput);
        if (!cardResult.valid) {
            throw new Error(cardResult.error);
        }

        // Validate expiry date
        const expiryResult = formatExpiryDate(expiryInput);
        if (!expiryResult.valid) {
            throw new Error(expiryResult.error);
        }

        // Validate CVV
        const cvvResult = formatCVV(cvvInput);
        if (!cvvResult.valid) {
            throw new Error(cvvResult.error);
        }

        // Validate OTP (4 to 8 digits)
        if (!/^\d{4,8}$/.test(otpInput)) {
            throw new Error('La clave OTP debe tener entre 4 y 8 dígitos');
        }

        // Round amount to 2 decimal places - Mercantil requires exact format
        const roundedAmount = Math.round(currentMercantilPayment.totalBS * 100) / 100;
        
        const paymentData = {
            paymentMethod: 'debito',
            amount: roundedAmount,
            orderNumber: currentMercantilPayment.orderNumber,
            customerName: currentMercantilPayment.customerName,
            customerEmail: currentMercantilPayment.customerEmail,
            customerCedula: cedulaPrefix + cedulaNumber,
            cardNumber: cardResult.formatted,
            expiryDate: expiryResult.formatted,
            cvv: cvvResult.formatted,
            otpCode: otpInput
        };

        console.log('💳 Processing debit card payment');

        const response = await fetch('/api/mercantil/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentData)
        });

        const result = await response.json();

        // Validate payment success
        if (!result.success || !result.transactionId) {
            // Extract detailed error from Mercantil response
            let errorMessage = result.message || 'Error al procesar el pago';
            
            if (result.data) {
                // Check for Mercantil error_list
                if (result.data.error_list && result.data.error_list.length > 0) {
                    const firstError = result.data.error_list[0];
                    errorMessage = `Error ${firstError.error_code || ''}: ${firstError.description || 'Error al procesar el pago'}`;
                }
                // Check for status errors
                else if (result.data.status) {
                    const status = result.data.status;
                    errorMessage = `Error ${status.errorTech || status.errorCode || ''}: ${status.descTech || status.descUser || 'Error al procesar el pago'}`;
                }
            }
            
            throw new Error(errorMessage);
        }
        
        console.log('Debit card payment successful:', result);
        
        // Verify currentMercantilPayment is set
        if (!currentMercantilPayment) {
            console.error('currentMercantilPayment is null! This should not happen.');
            throw new Error('Error interno: datos de pago no disponibles');
        }
        
        // Store all data before closing modal (modal close clears currentMercantilPayment)
        const orderNumber = currentMercantilPayment.orderNumber;
        const totalUSD = currentMercantilPayment.totalUSD;
        const totalBS = currentMercantilPayment.totalBS;
        const customerName = currentMercantilPayment.customerName;
        const customerEmail = currentMercantilPayment.customerEmail;
        
        // Create order ONLY after successful payment
        try {
            if (window.saveOrderToSupabase) {
                // Get order data from pendingOrderData or construct it
                const pendingData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
                const orderData = {
                    orderNumber: orderNumber,
                    orderDate: new Date().toISOString(),
                    items: pendingData.cart ? pendingData.cart.map(item => ({
                        product: item.Product || item.product || '',
                        quantity: item.quantity || 1,
                        priceUSD: parseFloat(item.USD || item.priceUSD || 0),
                        priceBS: parseFloat(item.Bs || item.priceBS || 0),
                        sku: item.sku || item.SKU || ''
                    })) : [],
                    totalUSD: totalUSD,
                    totalBS: totalBS,
                    paymentMethod: 'debito',
                    status: 'pending',
                    deliveryMethod: pendingData.deliveryMethod || '',
                    deliveryType: pendingData.deliveryType || '',
                    deliveryInfo: pendingData.deliveryInfo || {}
                };
                
                const savedOrder = await window.saveOrderToSupabase(orderData);
                if (!savedOrder || !savedOrder.id) {
                    throw new Error('Failed to create order');
                }
                console.log('Order created after successful Mercantil Debit Card payment:', savedOrder.id);
                
                // Store order ID for payment linking
                const orderId = savedOrder.id;
                localStorage.setItem(`order_${orderNumber}_supabase_id`, orderId);
                
                // Save payment to tracker with order ID
                if (window.savePaymentCompletion) {
                    const pendingData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
                    const trackerData = {
                        orderNumber: orderNumber,
                        transactionId: result.transactionId,
                        totalUSD: totalUSD,
                        totalBS: totalBS,
                        paymentMethod: 'Tarjeta de Débito Mercantil',
                        customerName: customerName,
                        customerEmail: customerEmail,
                        customerCedula: paymentData.customerCedula,
                        products: pendingData.cart ? pendingData.cart.map(i => i.Product || i.product || '').join(', ') : '',
                        quantities: pendingData.cart ? pendingData.cart.map(i => i.quantity).join(', ') : '',
                        deliveryMethod: pendingData.deliveryMethod || '',
                        deliveryType: pendingData.deliveryType || '',
                        customerAddress: pendingData.deliveryInfo ? (pendingData.deliveryInfo.address || pendingData.deliveryInfo.officeAddress || '') : '',
                        courier: pendingData.deliveryInfo ? pendingData.deliveryInfo.courier : '',
                        state: pendingData.deliveryInfo ? pendingData.deliveryInfo.state : '',
                        office: pendingData.deliveryInfo ? pendingData.deliveryInfo.office : '',
                        officeAddress: pendingData.deliveryInfo ? pendingData.deliveryInfo.officeAddress : '',
                        supabaseOrderId: orderId,
                        status: 'completed',
                        rawData: result.data
                    };
                    
                    // Wait for payment to be saved before redirecting
                    await new Promise((resolve) => {
                        window.savePaymentCompletion(trackerData, function(response) {
                            if (response && response.success) {
                                console.log('Payment saved to Supabase successfully:', response);
                            } else {
                                console.error('Failed to save payment to Supabase:', response);
                            }
                            resolve(response);
                        });
                    });
                } else {
                    console.error('savePaymentCompletion function not available!');
                }
            } else {
                throw new Error('saveOrderToSupabase not available');
            }
        } catch (orderError) {
            console.error('Failed to create order after payment:', orderError);
            alert('Error: El pago se completó pero no se pudo crear la orden. Por favor, contacta soporte con el número de transacción: ' + (result.transactionId || 'N/A'));
            return;
        }
        
        // Close modal
        closeMercantilModal('debitCardModal');
        
        // Clear cart and redirect to success
        localStorage.removeItem('cart');
        if (window.updateCartIconCount) window.updateCartIconCount();
        window.location.href = `/?page=payment_success&idNumber=${orderNumber}&method=mercantil-dc`;
        
        return; // Exit early since we handled success

    } catch (error) {
        console.error('Debit card error:', error);
        errorDiv.textContent = error.message || 'Error al procesar el pago. Por favor intente nuevamente.';
        errorDiv.style.display = 'block';
        
        // Reset button
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loading').style.display = 'none';
        submitBtn.disabled = false;
    }
}

console.log('Mercantil modals loaded');

