// Supabase save functions for orders, payments, and customers

// Save order to Supabase
async function saveOrderToSupabase(orderInfo) {
  try {
    const supabase = await getSupabaseClient();
    
    // Build address information based on delivery type
    let addressInfo = '';
    
    if (orderInfo.deliveryType === 'delivery-national' && orderInfo.deliveryInfo) {
      const { courier, office, state } = orderInfo.deliveryInfo;
      if (courier && office && state) {
        addressInfo = `${office}, ${state}, ${courier}`;
      }
    } else if (orderInfo.deliveryInfo && orderInfo.deliveryInfo.address) {
      addressInfo = orderInfo.deliveryInfo.address;
    }
    
    // Compose delivery instructions
    const combinedInstructions = (orderInfo.deliveryInfo && (orderInfo.deliveryInfo.instructions || orderInfo.deliveryInfo.emailText))
      ? `${orderInfo.deliveryInfo.instructions || ''} ${orderInfo.deliveryInfo.emailText || ''}`.trim()
      : '';
    
    // Prepare order data for Supabase
    // IMPORTANT: Always save orders as "pending" in database for customization
    // The UI can show "completed" to customers, but database stores "pending"
    const orderData = {
      order_number: orderInfo.orderNumber,
      order_date: orderInfo.orderDate,
      payment_method: orderInfo.paymentMethod,
      products: orderInfo.items.map(item => item.product).join(', '),
      quantities: orderInfo.items.map(item => item.quantity).join(', '),
      total_usd: orderInfo.totalUSD.toString(),
      total_bs: orderInfo.totalBS.toString(),
      status: 'pending', // Always save as pending in database (for customization)
      delivery_method: orderInfo.deliveryMethod || '',
      customer_name: orderInfo.deliveryInfo ? (orderInfo.deliveryInfo.name || null) : null,
      customer_phone: orderInfo.deliveryInfo ? (orderInfo.deliveryInfo.phone || null) : null,
      customer_email: orderInfo.deliveryInfo ? (orderInfo.deliveryInfo.email || null) : null,
      customer_address: addressInfo || null,
      delivery_instructions: combinedInstructions || null,
      otro: orderInfo.deliveryInfo && orderInfo.deliveryInfo.cedula ? `Cédula: ${orderInfo.deliveryInfo.cedula}` : null,
      column_1: null
    };
    
    console.log('Saving order to Supabase:', orderData);
    
    // Check if order already exists to prevent duplicates (check both localStorage and Supabase)
    let existingOrder = null;
    
    // First check Supabase directly (most reliable)
    try {
      const { data: supabaseOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderInfo.orderNumber)
        .maybeSingle();
      
      if (supabaseOrder && supabaseOrder.id) {
        existingOrder = supabaseOrder;
        console.log('Order already exists in Supabase, skipping duplicate creation:', supabaseOrder.id);
        localStorage.setItem(`order_${orderInfo.orderNumber}_supabase_id`, supabaseOrder.id);
        
        // Still try to lock stock in case it wasn't locked before
        try {
          if (orderInfo.items && orderInfo.items.length > 0) {
            console.log('Order exists but checking/ensuring stock is locked:', orderInfo.orderNumber);
            await lockStockForOrder(supabaseOrder.id, orderInfo.orderNumber, orderInfo.items);
            console.log('Stock locked for existing order:', orderInfo.orderNumber);
          }
        } catch (stockError) {
          console.warn('Could not lock stock for existing order (may already be locked):', stockError);
        }
        
        return supabaseOrder;
      }
    } catch (checkError) {
      console.warn('Could not check for existing order in Supabase:', checkError);
      // Continue to check localStorage as fallback
    }
    
    // Also check localStorage
    const existingOrderId = localStorage.getItem(`order_${orderInfo.orderNumber}_supabase_id`);
    if (existingOrderId && !existingOrder) {
      // Verify it exists in Supabase
      try {
        const { data: verifiedOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('order_number', orderInfo.orderNumber)
          .maybeSingle();
        
        if (verifiedOrder && verifiedOrder.id) {
          console.log('Order already exists in Supabase (verified from localStorage), skipping duplicate creation:', verifiedOrder.id);
          
          // Still try to lock stock in case it wasn't locked before
          try {
            if (orderInfo.items && orderInfo.items.length > 0) {
              console.log('Order exists but checking/ensuring stock is locked:', orderInfo.orderNumber);
              await lockStockForOrder(verifiedOrder.id, orderInfo.orderNumber, orderInfo.items);
              console.log('Stock locked for existing order:', orderInfo.orderNumber);
            }
          } catch (stockError) {
            console.warn('Could not lock stock for existing order (may already be locked):', stockError);
          }
          
          return verifiedOrder;
        }
      } catch (verifyError) {
        console.warn('Could not verify order from localStorage:', verifyError);
        // Continue with creation
      }
    }
    
    const { data, error } = await supabase
      .from('orders')
      .insert([orderData])
      .select()
      .single();
    
    if (error) {
      console.error('Error saving order to Supabase:', error);
      throw error;
    }
    
    console.log('Order saved to Supabase successfully:', data);
    
    // Lock stock for this order
    try {
      if (!orderInfo.items || orderInfo.items.length === 0) {
        console.warn('No items to lock stock for order:', orderInfo.orderNumber);
      } else {
        console.log('Attempting to lock stock for order:', orderInfo.orderNumber, 'with', orderInfo.items.length, 'items');
        await lockStockForOrder(data.id, orderInfo.orderNumber, orderInfo.items);
        console.log('Stock locked successfully for order:', orderInfo.orderNumber);
      }
    } catch (stockError) {
      console.error('Error locking stock (non-critical):', stockError);
      console.error('Stock locking error details:', {
        orderNumber: orderInfo.orderNumber,
        itemsCount: orderInfo.items?.length || 0,
        items: orderInfo.items,
        error: stockError
      });
      // Don't throw - stock locking failure shouldn't prevent order creation
    }
    
    // Save/update customer if we have customer info
    if (orderInfo.deliveryInfo && (orderInfo.deliveryInfo.email || orderInfo.deliveryInfo.name)) {
      await saveOrUpdateCustomerToSupabase(orderInfo.deliveryInfo, data.id);
    }
    
    return data;
  } catch (error) {
    console.error('Failed to save order to Supabase:', error);
    throw error;
  }
}

// Save or update customer in Supabase
async function saveOrUpdateCustomerToSupabase(deliveryInfo, orderId) {
  try {
    const supabase = await getSupabaseClient();
    
    if (!deliveryInfo.email && !deliveryInfo.name) {
      return; // Can't save customer without email or name
    }
    
    // Try to find existing customer by email or name
    let existingCustomer = null;
    
    if (deliveryInfo.email) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('email', deliveryInfo.email)
        .single();
      existingCustomer = data;
    }
    
    if (!existingCustomer && deliveryInfo.name) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('name', deliveryInfo.name)
        .single();
      existingCustomer = data;
    }
    
    const customerData = {
      name: deliveryInfo.name || 'Unknown',
      email: deliveryInfo.email || null,
      phone: deliveryInfo.phone || null,
      address: deliveryInfo.address || null
    };
    
    if (existingCustomer) {
      // Update existing customer
      const { error } = await supabase
        .from('customers')
        .update({
          ...customerData,
          total_orders: (existingCustomer.total_orders || 0) + 1,
          last_order_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCustomer.id);
      
      if (error) {
        console.error('Error updating customer in Supabase:', error);
      } else {
        console.log('Customer updated in Supabase:', existingCustomer.id);
      }
    } else {
      // Create new customer
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          ...customerData,
          total_orders: 1,
          total_spent_usd: '0',
          total_spent_bs: '0',
          last_order_date: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Error creating customer in Supabase:', error);
      } else {
        console.log('Customer created in Supabase:', data.id);
      }
    }
  } catch (error) {
    console.error('Failed to save/update customer in Supabase:', error);
    // Don't throw - customer saving is not critical
  }
}

// Save payment to Supabase
async function savePaymentToSupabase(paymentData, orderId) {
  try {
    const supabase = await getSupabaseClient();
    
    // Get order_number from orderId (orderId might be UUID or order_number)
    let orderNumber = paymentData.orderNumber;
    
    // If orderId is a UUID, look up the order_number
    if (!orderNumber && orderId) {
      // Check if orderId is a UUID (contains hyphens)
      if (orderId.includes('-') && orderId.length > 20) {
        // It's a UUID, look up the order_number
        try {
          const { data: order } = await supabase
            .from('orders')
            .select('order_number')
            .eq('id', orderId)
            .single();
          
          if (order && order.order_number) {
            orderNumber = order.order_number;
            console.log('Found order_number from UUID:', orderNumber);
          }
        } catch (error) {
          console.warn('Could not find order_number from UUID:', error);
        }
      } else {
        // It's likely already an order_number
        orderNumber = orderId;
      }
    }
    
    if (!orderNumber) {
      console.error('Could not determine order_number for payment');
      throw new Error('Order number is required for payment');
    }
    
    // Prepare payment data for Supabase
    const paymentInsert = {
      order_id: orderNumber, // Use order_number, not UUID
      date: paymentData.date || new Date().toISOString(),
      method: paymentData.paymentMethod || paymentData.method || 'unknown',
      transaction_id: paymentData.transactionId || paymentData.paypalOrderId || paymentData.casheaOrderId || null,
      transaction_id_2: paymentData.transactionId2 || null,
      usd: paymentData.totalUSD.toString(),
      bs: paymentData.totalBS ? paymentData.totalBS.toString() : '0',
      name: paymentData.customerName || null,
      email: paymentData.customerEmail || null,
      items: paymentData.products || '',
      quantity: paymentData.quantities || '',
      delivery_method: paymentData.deliveryMethod || '',
      status: paymentData.status || (paymentData.paymentMethod && ['zelle', 'binance', 'zinli', 'efectivo', 'cash'].includes(paymentData.paymentMethod.toLowerCase()) ? 'pending' : (paymentData.status || 'pending')),
      currency: 'USD',
      date_other: null,
      wrapped: null
    };
    
    console.log('Saving payment to Supabase:', paymentInsert);
    
    const { data, error } = await supabase
      .from('payments')
      .insert([paymentInsert])
      .select()
      .single();
    
    if (error) {
      console.error('Error saving payment to Supabase:', error);
      throw error;
    }
    
    console.log('Payment saved to Supabase successfully:', data);
    
    // Note: Orders are always kept as "pending" in database for customization
    // Payment status is saved as "completed" but order status remains "pending"
    // The UI can display "completed" to customers based on payment status
    
    return data;
  } catch (error) {
    console.error('Failed to save payment to Supabase:', error);
    throw error;
  }
}

// Lock stock for an order (called when order is created)
async function lockStockForOrder(orderId, orderNumber, items) {
  try {
    const supabase = await getSupabaseClient();
    
    console.log('lockStockForOrder called:', { orderId, orderNumber, itemsCount: items?.length, items });
    
    if (!items || items.length === 0) {
      console.warn('No items to lock stock for order:', orderNumber);
      return;
    }
    
    // Fetch all products and variants to match by name/SKU
    const [productsResult, variantsResult] = await Promise.all([
      supabase.from('products').select('id, product, sku'),
      supabase.from('product_variants').select('id, variant_name, product_id, sku')
    ]);
    
    if (productsResult.error) {
      console.error('Error fetching products for stock locking:', productsResult.error);
      return;
    }
    
    if (variantsResult.error) {
      console.error('Error fetching variants for stock locking:', variantsResult.error);
      return;
    }
    
    const products = productsResult.data || [];
    const variants = variantsResult.data || [];
    
    const lockedStockEntries = [];
    
    for (const item of items) {
      const productName = item.product || item.Product || item.name || '';
      const quantity = parseInt(item.quantity || 1);
      const sku = item.sku || item.SKU || '';
      
      if (!productName || quantity <= 0) continue;
      
      // Try to find variant first (variants have more specific names)
      let variant = variants.find(v => 
        v.variant_name === productName || 
        (sku && v.sku === sku)
      );
      
      if (variant) {
        // Lock variant stock
        lockedStockEntries.push({
          order_id: orderNumber,
          variant_id: variant.id,
          product_id: null,
          quantity: quantity,
          status: 'locked'
        });
      } else {
        // Try to find product
        let product = products.find(p => 
          p.product === productName || 
          (sku && p.sku === sku)
        );
        
        if (product) {
          // Lock product stock
          lockedStockEntries.push({
            order_id: orderNumber,
            variant_id: null,
            product_id: product.id,
            quantity: quantity,
            status: 'locked'
          });
        } else {
          console.warn('Could not find product/variant for stock locking:', productName);
        }
      }
    }
    
    if (lockedStockEntries.length > 0) {
      // Check if stock is already locked for this order to avoid duplicates
      const { data: existingLocks, error: checkError } = await supabase
        .from('locked_stock')
        .select('id, product_id, variant_id, quantity, status')
        .eq('order_id', orderNumber)
        .in('status', ['locked', 'completed']);
      
      if (checkError) {
        console.warn('Could not check for existing stock locks:', checkError);
      }
      
      // Filter out entries that are already locked
      const existingLockMap = new Map();
      if (existingLocks && existingLocks.length > 0) {
        existingLocks.forEach(lock => {
          const key = `${lock.product_id || 'null'}_${lock.variant_id || 'null'}`;
          existingLockMap.set(key, lock);
        });
      }
      
      const newLockedStockEntries = lockedStockEntries.filter(entry => {
        const key = `${entry.product_id || 'null'}_${entry.variant_id || 'null'}`;
        const existing = existingLockMap.get(key);
        if (existing && existing.status === 'locked') {
          console.log(`Stock already locked for order ${orderNumber}, product_id: ${entry.product_id}, variant_id: ${entry.variant_id}`);
          return false; // Skip this entry, already locked
        }
        return true; // Include this entry
      });
      
      if (newLockedStockEntries.length > 0) {
        const { error: insertError } = await supabase
          .from('locked_stock')
          .insert(newLockedStockEntries);
        
        if (insertError) {
          console.error('Error inserting locked stock entries:', insertError);
          throw insertError;
        }
        
        console.log(`Locked stock for ${newLockedStockEntries.length} item(s) in order ${orderNumber}`);
      } else {
        console.log(`ℹAll stock already locked for order ${orderNumber}`);
      }
    } else {
      console.warn(`No stock entries to lock for order ${orderNumber}`);
    }
  } catch (error) {
    console.error('Failed to lock stock for order:', error);
    throw error;
  }
}

// Update stock based on order status change
async function updateStockForOrderStatusChange(orderNumber, oldStatus, newStatus) {
  try {
    const supabase = await getSupabaseClient();
    
    // Only process if status actually changed
    if (oldStatus === newStatus) {
      return;
    }
    
    // Fetch locked stock entries for this order
    const { data: lockedStockEntries, error: fetchError } = await supabase
      .from('locked_stock')
      .select('*')
      .eq('order_id', orderNumber)
      .eq('status', 'locked');
    
    if (fetchError) {
      console.error('Error fetching locked stock entries:', fetchError);
      return;
    }
    
    if (!lockedStockEntries || lockedStockEntries.length === 0) {
      console.log('No locked stock found for order:', orderNumber);
      return;
    }
    
    if (newStatus === 'cancelled') {
      // Release locked stock - just mark entries as released (stock was never decremented, just locked)
      for (const entry of lockedStockEntries) {
        await supabase
          .from('locked_stock')
          .update({ status: 'released', updated_at: new Date().toISOString() })
          .eq('id', entry.id);
      }
      
      console.log(`Released stock lock for cancelled order: ${orderNumber}`);
      
    } else if (newStatus === 'completed') {
      // Permanently decrement stock and mark lock as completed
      for (const entry of lockedStockEntries) {
        if (entry.product_id) {
          // Decrement product stock
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('stock')
            .eq('id', entry.product_id)
            .single();
          
          if (!productError && product) {
            const newStock = Math.max(0, (product.stock || 0) - entry.quantity);
            await supabase
              .from('products')
              .update({ 
                stock: newStock,
                updated_at: new Date().toISOString()
              })
              .eq('id', entry.product_id);
          }
        } else if (entry.variant_id) {
          // Decrement variant stock
          const { data: variant, error: variantError } = await supabase
            .from('product_variants')
            .select('stock')
            .eq('id', entry.variant_id)
            .single();
          
          if (!variantError && variant) {
            const newStock = Math.max(0, (variant.stock || 0) - entry.quantity);
            await supabase
              .from('product_variants')
              .update({ 
                stock: newStock,
                updated_at: new Date().toISOString()
              })
              .eq('id', entry.variant_id);
          }
        }
        
        // Mark locked stock entry as completed (lock becomes permanent)
        await supabase
          .from('locked_stock')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', entry.id);
      }
      
      console.log(`Committed stock for completed order: ${orderNumber}`);
    }
    // For 'pending' or 'processing', stock remains locked (no action needed)
    
  } catch (error) {
    console.error('Failed to update stock for order status change:', error);
    throw error;
  }
}

// Update order status in Supabase
async function updateOrderStatusInSupabase(orderNumber, status) {
  try {
    const supabase = await getSupabaseClient();
    
    // Fetch current order to get old status
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('status')
      .eq('order_number', orderNumber)
      .single();
    
    const oldStatus = currentOrder?.status;
    
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('order_number', orderNumber)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating order status in Supabase:', error);
      throw error;
    }
    
    console.log('Order status updated in Supabase:', data);
    
    // Update stock based on status change
    if (oldStatus && oldStatus !== status) {
      try {
        await updateStockForOrderStatusChange(orderNumber, oldStatus, status);
      } catch (stockError) {
        console.error('Error updating stock for order status change (non-critical):', stockError);
        // Don't throw - stock update failure shouldn't prevent status update
      }
    }
    
    return data;
  } catch (error) {
    console.error('Failed to update order status in Supabase:', error);
    throw error;
  }
}

// Expose functions globally for use in other scripts
window.saveOrderToSupabase = saveOrderToSupabase;
window.savePaymentToSupabase = savePaymentToSupabase;
window.updateOrderStatusInSupabase = updateOrderStatusInSupabase;



