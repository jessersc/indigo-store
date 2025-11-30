// Google Script URL will be loaded from server config
let API_URL = "";
let allProducts = [];
let allProductsWithVariants = [];
let searchTimeout;

// Cache configuration
const CACHE_KEY = 'indigo_products_cache';
const CACHE_VERSION_KEY = 'indigo_cache_version';
const CACHE_TIMESTAMP_KEY = 'indigo_cache_timestamp';
// CACHE_DURATION removed - cache never expires automatically, only via admin panel webhook trigger
const CURRENT_CACHE_VERSION = '2.7.1'; // Update this to force cache refresh

// Real time update configuration
const UPDATE_CHECK_INTERVAL = 10000; // Check for updates every 10 seconds (responsive to webhooks)
const LAST_UPDATE_KEY = 'indigo_last_update_check';
const WEBHOOK_TRIGGER_KEY = 'indigo_webhook_trigger';
const REFRESH_COOLDOWN = 30000; // 30 seconds cooldown between refreshes
const LAST_REFRESH_KEY = 'indigo_last_refresh';

// Cache management functions
function isCacheValid() {
  try {
    const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    const cachedData = localStorage.getItem(CACHE_KEY);
    
    console.log('Checking cache validity:', {
      hasData: !!cachedData,
      hasTimestamp: !!cachedTimestamp,
      hasVersion: !!cachedVersion,
      cachedVersion: cachedVersion,
      currentVersion: CURRENT_CACHE_VERSION
    });
    
    if (!cachedData || !cachedTimestamp || !cachedVersion) {
      console.log('Cache invalid: missing data');
      return false;
    }
    
    // Check version - cache only invalidates if version changes (via admin panel webhook)
    if (cachedVersion !== CURRENT_CACHE_VERSION) {
      console.log('Cache invalid: version mismatch', cachedVersion, 'vs', CURRENT_CACHE_VERSION);
      return false;
    }
    
    // Timestamp expiry removed - cache never expires automatically
    // Cache only refreshes when triggered from admin panel via webhook
    const now = Date.now();
    const cacheAge = now - parseInt(cachedTimestamp);
    console.log('Cache valid (no expiry):', Math.round(cacheAge / (1000 * 60 * 60)), 'hours old', '- only refreshes via admin panel trigger');
    return true;
  } catch (error) {
    console.error('Error checking cache validity:', error);
    return false;
  }
}

function getCachedData() {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Error retrieving cached data:', error);
    return null;
  }
}

function setCacheData(data) {
  try {
    const timestamp = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
    localStorage.setItem(CACHE_TIMESTAMP_KEY, timestamp.toString());
    
    // Also cache the icon maps
    if (window.categoryIconsMap) {
      localStorage.setItem('categoryIconsMap', JSON.stringify(window.categoryIconsMap));
      console.log('Category icons map cached:', Object.keys(window.categoryIconsMap).length, 'categories');
    }
    if (window.collectionIconsMap) {
      localStorage.setItem('collectionIconsMap', JSON.stringify(window.collectionIconsMap));
      console.log('Collection icons map cached:', Object.keys(window.collectionIconsMap).length, 'collections');
    }
    
    console.log('Data cached successfully:', {
      version: CURRENT_CACHE_VERSION,
      timestamp: new Date(timestamp).toISOString(),
      dataSize: JSON.stringify(data).length + ' characters',
      hasCategoryIcons: !!window.categoryIconsMap,
      hasCollectionIcons: !!window.collectionIconsMap
    });
  } catch (error) {
    console.error('Error caching data:', error);
    // If localStorage is full, clear old cache and try again
    if (error.name === 'QuotaExceededError') {
      console.log('localStorage full, clearing old cache...');
      clearCache();
      try {
        const timestamp = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
        localStorage.setItem(CACHE_TIMESTAMP_KEY, timestamp.toString());
        
        // Try to cache icon maps again
        if (window.categoryIconsMap) {
          localStorage.setItem('categoryIconsMap', JSON.stringify(window.categoryIconsMap));
        }
        if (window.collectionIconsMap) {
          localStorage.setItem('collectionIconsMap', JSON.stringify(window.collectionIconsMap));
        }
        
        console.log('Data cached successfully after clearing old cache:', {
          version: CURRENT_CACHE_VERSION,
          timestamp: new Date(timestamp).toISOString()
        });
      } catch (retryError) {
        console.error('Failed to cache data even after clearing:', retryError);
      }
    }
  }
}

function clearCache() {
  try {
    const beforeClear = {
      hasData: !!localStorage.getItem(CACHE_KEY),
      hasVersion: !!localStorage.getItem(CACHE_VERSION_KEY),
      hasTimestamp: !!localStorage.getItem(CACHE_TIMESTAMP_KEY),
      hasCategoryIcons: !!localStorage.getItem('categoryIconsMap'),
      hasCollectionIcons: !!localStorage.getItem('collectionIconsMap')
    };
    
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_VERSION_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    localStorage.removeItem('categoryIconsMap');
    localStorage.removeItem('collectionIconsMap');
    
    // Also clear from window objects
    if (window.categoryIconsMap) {
      window.categoryIconsMap = {};
    }
    if (window.collectionIconsMap) {
      window.collectionIconsMap = {};
    }
    
    console.log('Cache cleared successfully:', {
      beforeClear: beforeClear,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

// Function to check if we're in refresh cooldown
function isInRefreshCooldown() {
  const lastRefresh = localStorage.getItem(LAST_REFRESH_KEY);
  if (!lastRefresh) return false;
  
  const now = Date.now();
  const timeSinceLastRefresh = now - parseInt(lastRefresh);
  return timeSinceLastRefresh < REFRESH_COOLDOWN;
}

// Function to force refresh data from API
function refreshCache() {
  // Check if we're in cooldown period
  if (isInRefreshCooldown()) {
    console.log('Refresh in cooldown period, skipping...');
    return;
  }
  
  console.log('Forcing cache refresh...');
  localStorage.setItem(LAST_REFRESH_KEY, Date.now().toString());
  clearCache();
  console.log('Reloading page to fetch fresh data...');
  location.reload();
}

// Function to check for webhook triggers and auto-refresh
function checkForUpdates() {
  const webhookTrigger = localStorage.getItem(WEBHOOK_TRIGGER_KEY);
  const lastUpdateCheck = localStorage.getItem(LAST_UPDATE_KEY);
  const now = Date.now();
  
  console.log('Checking for updates:', {
    hasWebhookTrigger: !!webhookTrigger,
    lastUpdateCheck: lastUpdateCheck ? new Date(parseInt(lastUpdateCheck)).toISOString() : 'never',
    currentTime: new Date(now).toISOString()
  });
  
  // If there's a webhook trigger, clear cache and refresh
  if (webhookTrigger) {
    const triggerData = JSON.parse(webhookTrigger);
    const triggerTime = new Date(triggerData.timestamp).getTime();
    const cacheTime = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0');
    
    console.log('Webhook trigger found:', {
      triggerTime: new Date(triggerTime).toISOString(),
      cacheTime: new Date(cacheTime).toISOString(),
      isNewer: triggerTime > cacheTime
    });
    
    // If webhook trigger is newer than cache, refresh
    if (triggerTime > cacheTime && !isInRefreshCooldown()) {
      console.log('Webhook trigger detected, refreshing cache...');
      localStorage.removeItem(WEBHOOK_TRIGGER_KEY);
      showDataUpdateNotification();
      refreshCache();
      return;
    } else if (isInRefreshCooldown()) {
      console.log('Webhook trigger found but in cooldown period, skipping refresh');
    }
  }
  
  // Check server version periodically to force refresh when needed
  // This is the primary mechanism for detecting webhook-triggered refreshes
  checkServerVersion();
  
  // Update last check timestamp
  localStorage.setItem(LAST_UPDATE_KEY, now.toString());
}

// Function to check server version and force refresh if needed
async function checkServerVersion() {
  try {
    const url = '/api/cache-version?t=' + Date.now();
    console.log('Checking server version:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('Cache version endpoint returned non-OK status:', response.status);
      return;
    }
    
    const data = await response.json();
    
    console.log('Server version response:', {
      status: response.status,
      version: data.version,
      force_refresh: data.force_refresh,
      timestamp: data.timestamp,
      currentVersion: CURRENT_CACHE_VERSION,
      webhook_triggers: data.webhook_triggers,
      time_since_force_refresh: data.time_since_force_refresh
    });
    
    // Check if there are recent webhook triggers
    if (data.webhook_triggers > 0) {
      console.log('Recent webhook triggers detected:', data.webhook_triggers, 'triggers');
    }
    
    // Priority 1: Check force_refresh flag (most reliable for webhook triggers)
    if (data.force_refresh && !isInRefreshCooldown()) {
      console.log('Server requested force refresh, clearing cache...', {
        reason: data.webhook_triggers > 0 ? 'webhook trigger' : 'manual request',
        version: data.version
      });
      clearCache();
      // Update cached version to match server version to prevent immediate re-trigger
      if (data.version) {
        localStorage.setItem(CACHE_VERSION_KEY, data.version);
      }
      showDataUpdateNotification();
      refreshCache();
      return; // Exit early after triggering refresh
    }
    
    // Priority 2: Check version mismatch (for manual version bumps)
    const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY) || CURRENT_CACHE_VERSION;
    if (data.version !== cachedVersion && !isInRefreshCooldown()) {
      // Check if it's a timestamp-based version (webhook trigger) or a real version change
      const isTimestampVersion = data.version.startsWith('2.7.1-');
      if (isTimestampVersion || data.version !== CURRENT_CACHE_VERSION) {
        console.log('Version mismatch detected, refreshing cache...', {
          serverVersion: data.version,
          cachedVersion: cachedVersion,
          clientVersion: CURRENT_CACHE_VERSION,
          isTimestampVersion: isTimestampVersion
        });
        clearCache();
        localStorage.setItem(CACHE_VERSION_KEY, data.version);
        showDataUpdateNotification();
        refreshCache();
        return; // Exit early after triggering refresh
      }
    }
    
    if (isInRefreshCooldown()) {
      console.log('Refresh in cooldown period, skipping version check refresh');
    } else {
      console.log('Server version matches client version, no refresh needed');
    }
  } catch (error) {
    console.error('Error checking server version:', error);
  }
}

// Function to simulate webhook trigger (for Google Sheets to call)
function triggerCacheRefresh(source = 'manual') {
  const triggerData = {
    timestamp: new Date().toISOString(),
    source: source,
    trigger: 'webhook'
  };
  
  console.log('Triggering cache refresh:', {
    source: source,
    timestamp: triggerData.timestamp,
    triggerData: triggerData
  });
  
  localStorage.setItem(WEBHOOK_TRIGGER_KEY, JSON.stringify(triggerData));
  checkForUpdates();
}

// Function to show data update notification
function showDataUpdateNotification() {
  showStyledNotification(
    'Datos actualizados',
    'Los productos han sido actualizados desde la hoja de cálculo',
    'info',
    4000
  );
}

// Function to get cache info for debugging
function getCacheInfo() {
  const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
  const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
  const cachedData = localStorage.getItem(CACHE_KEY);
  const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY);
  const webhookTrigger = localStorage.getItem(WEBHOOK_TRIGGER_KEY);
  
  if (!cachedData || !cachedTimestamp || !cachedVersion) {
    return { status: 'No cache found' };
  }
  
  const now = Date.now();
  const cacheAge = now - parseInt(cachedTimestamp);
  const cacheDate = new Date(parseInt(cachedTimestamp));
  
  return {
    version: cachedVersion,
    created: cacheDate.toLocaleString(),
    ageMinutes: Math.round(cacheAge / (1000 * 60)),
    ageHours: Math.round(cacheAge / (1000 * 60 * 60)),
    sizeKB: Math.round(cachedData.length / 1024),
    isValid: isCacheValid(),
    lastUpdateCheck: lastUpdate ? new Date(parseInt(lastUpdate)).toLocaleString() : 'Never',
    hasWebhookTrigger: !!webhookTrigger,
    webhookData: webhookTrigger ? JSON.parse(webhookTrigger) : null
  };
}

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    page: params.get('page') || 'home',
    category: params.get('category'),
    collection: params.get('collection'),
    product: params.get('product'),
    variant: params.get('variant'),
    method: params.get('method'),
    order: params.get('order')
  };
}

function updateUrl(params) {
  const url = new URL(window.location);
  Object.keys(params).forEach(key => {
    if (params[key]) {
      url.searchParams.set(key, params[key]);
    } else {
      url.searchParams.delete(key);
    }
  });
  window.history.pushState({}, '', url.toString());
}

function navigateToCategory(categoryName) {
  updateUrl({ page: 'category', category: categoryName, collection: null, product: null });
  showCategoryPage(categoryName, 'category');
}

function navigateToCollection(collectionName) {
  updateUrl({ page: 'collection', collection: collectionName, category: null, product: null });
  showCategoryPage(collectionName, 'collection');
}

function navigateToProduct(productId) {
  if (window.innerWidth <= 768 && window.closeMobileMenu) {
    window.closeMobileMenu();
  }
  updateUrl({ page: 'product', product: productId });
  showProductPage(productId);
  
  // Scroll to top when navigating to product
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateToHome() {
  updateUrl({ page: 'home', category: null, collection: null, product: null });
  showHomePage();
}

function navigateToNewProducts() {
  updateUrl({ page: 'new-products', category: null, collection: null, product: null });
  showNewProductsPage();
}

function navigateToOfertasEspeciales() {
  updateUrl({ page: 'ofertas-especiales', category: null, collection: null, product: null });
  showOfertasEspecialesPage();
  
  // Scroll to top when navigating to special offers
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateToCheckout() {
  updateUrl({ page: 'checkout' });
  showCheckoutPage();
}

function showCheckoutPage() {
  hideAllPages();
  document.getElementById('checkout-page').classList.remove('hidden');
  
  // DON'T clear buyNowProduct here - it's needed for the checkout summary
  // It will be cleared when the checkout button is clicked in checkout.js
  
  const cart = getCart();
  const buyNowProduct = sessionStorage.getItem('buyNowProduct');
  const hasItems = cart.length > 0 || buyNowProduct;
  
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn && !hasItems) {
    checkoutBtn.style.display = 'none';
  }
  
  if (window.renderCheckoutSummary) {
    window.renderCheckoutSummary();
    window.setupPaymentMethods();
    window.setupCheckoutButton();
    window.setupDeliveryOptions();
  } else {
    setTimeout(() => {
      if (window.renderCheckoutSummary) {
        window.renderCheckoutSummary();
        window.setupPaymentMethods();
        window.setupCheckoutButton();
        window.setupDeliveryOptions();
      }
    }, 100);
  }
}

function showPaymentPage(method, orderNumber) {
  hideAllPages();
  document.getElementById('payment-page').classList.remove('hidden');
  renderPaymentPage(method, orderNumber);
  document.getElementById('orderIdInput').value = orderNumber;
}

function showApartadoPage(orderNumber) {
  hideAllPages();
  document.getElementById('apartado-page').classList.remove('hidden');
  renderApartadoPage(orderNumber);
  document.getElementById('apartadoOrderIdInput').value = orderNumber;
}

function hideAllPages() {
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('category-page').classList.add('hidden');
  document.getElementById('product-page').classList.add('hidden');
  document.getElementById('checkout-page').classList.add('hidden');
  document.getElementById('payment-page').classList.add('hidden');
  document.getElementById('apartado-page').classList.add('hidden');
  document.getElementById('order-details-page').classList.add('hidden');
  document.getElementById('new-products-page').classList.add('hidden');
  document.getElementById('breadcrumb').classList.add('hidden');
  
  // Hide payment success and pending pages
  const successPage = document.getElementById('payment-success-page');
  const pendingPage = document.getElementById('payment-pending-page');
  if (successPage) successPage.classList.add('hidden');
  if (pendingPage) pendingPage.classList.add('hidden');
  
  // Hide hero section on all pages except home
  const heroSection = document.getElementById('hero-section');
  if (heroSection) {
    heroSection.classList.add('hidden');
  }
  
  // Clear any persistent notifications/messages
  const notifications = document.querySelectorAll('.cart-notification, .notification-popup, .success-message');
  notifications.forEach(notification => {
    notification.remove();
  });
}

function showHomePage() {
  hideAllPages();
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('search').value = '';
  // Show hero section only on home page
  const heroSection = document.getElementById('hero-section');
  if (heroSection) {
    heroSection.classList.remove('hidden');
  }
}

function showNewProductsPage() {
  hideAllPages();
  document.getElementById('new-products-page').classList.remove('hidden');
  document.getElementById('search').value = '';
  
  // Get the last 40 products and render them (newest first)
  const last40Products = allProducts.slice(-40).reverse();
  const grid = document.getElementById('new-products-grid');
  
  if (grid && last40Products.length > 0) {
    grid.innerHTML = '';
    last40Products.forEach(product => {
      const productCard = renderCard(product);
      grid.appendChild(productCard);
    });
  }
}

function showOfertasEspecialesPage() {
  hideAllPages();
  document.getElementById('category-page').classList.remove('hidden');
  
  const title = document.getElementById('category-title');
  title.textContent = 'Ofertas Especiales';
  
  const breadcrumb = document.getElementById('breadcrumb');
  breadcrumb.innerHTML = `
    <a href="#" onclick="navigateToHome()">Inicio</a> / 
    <span>Promociones</span> / 
    <strong>Ofertas Especiales</strong>
  `;
  breadcrumb.classList.remove('hidden');
  
  // Check if products are loaded
  if (!window.allProductsWithVariants || window.allProductsWithVariants.length === 0) {
    document.getElementById('product-count').textContent = 'Cargando ofertas especiales...';
    
    // Try again after a short delay
    setTimeout(() => {
      if (window.allProductsWithVariants && window.allProductsWithVariants.length > 0) {
        showOfertasEspecialesPage();
      } else {
        document.getElementById('product-count').textContent = 'No hay ofertas especiales disponibles en este momento';
      }
    }, 1000);
    return;
  }
  
  // Filter products that have discounts
  const discountedProducts = window.allProductsWithVariants.filter(product => {
    const discountInfo = calculateDiscountedPrices(product);
    return discountInfo !== null;
  });
  
  
  if (discountedProducts.length === 0) {
    document.getElementById('product-count').textContent = 'No hay ofertas especiales disponibles en este momento';
    const grid = document.getElementById('category-products');
    if (grid) {
      grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-600">No hay productos con descuento disponibles.</div>';
    }
  } else {
    document.getElementById('product-count').textContent = `${discountedProducts.length} ofertas especiales encontradas`;
    renderCategoryProducts(discountedProducts);
    setupSorting(discountedProducts);
  }
}

function showCategoryPage(name, type) {
  hideAllPages();
  document.getElementById('category-page').classList.remove('hidden');
  
  const title = document.getElementById('category-title');
  title.textContent = name;
  
  const breadcrumb = document.getElementById('breadcrumb');
  const typeText = type === 'category' ? 'Categoría' : 'Colección';
  breadcrumb.innerHTML = `
    <a href="#" onclick="navigateToHome()">Inicio</a> / 
    <span>${typeText}</span> / 
    <strong>${name}</strong>
  `;
  breadcrumb.classList.remove('hidden');
  
  const field = type === 'category' ? 'Category' : 'Collection';
  const filtered = allProducts.filter(product => {
    const values = (product[field] || '').split(',').map(v => v.trim().toLowerCase());
    return values.includes(name.toLowerCase());
  });
  
  document.getElementById('product-count').textContent = `${filtered.length} productos encontrados`;
  
  renderCategoryProducts(filtered);
  
  setupSorting(filtered);
}

function showProductPage(productId) {
  hideAllPages();
  
  const params = getUrlParams();
  const variantId = params.variant;
  
  let product;
  if (variantId && variantId.toString().startsWith(productId.toString().split('.')[0])) {
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === variantId);
  } else {
    product = allProducts.find(p => p.ItemID.toString() === productId.toString());
    
    if (variantId && !variantId.toString().startsWith(productId.toString().split('.')[0])) {
      const currentUrl = new URL(window.location);
      currentUrl.searchParams.delete('variant');
      window.history.replaceState({}, '', currentUrl.toString());
    }
  }
  
  if (!product) {
    alert('Producto no encontrado');
    navigateToHome();
    return;
  }
  
  document.getElementById('product-page').classList.remove('hidden');
  
  const breadcrumb = document.getElementById('breadcrumb');
  breadcrumb.innerHTML = `
    <a href="#" onclick="navigateToHome()">Inicio</a> / 
    <a href="#" onclick="history.back()">Productos</a> / 
    <strong>${product.Product}</strong>
  `;
  breadcrumb.classList.remove('hidden');
  
  // product details render
  renderProductDetail(product);
}

function renderCategoryProducts(products) {
  const container = document.getElementById('category-products-grid');
  container.innerHTML = '';
  products.forEach(product => {
    container.appendChild(renderCard(product));
  });
}

function renderProductDetail(product) {
  const container = document.getElementById('product-detail');
  
  // collect all available images from the spreadsheet, comma separated urls
  let images = [];
  if (product.Image) {
    const imageUrls = product.Image.split(',').map(url => url.trim());
    images = imageUrls.filter(url => url && url.length > 0); // remove empty urls
  }
  // fallback to old method if no comma separated urls is found
  if (images.length === 0 && product.Image) {
    images = [product.Image];
    if (product.Image2) images.push(product.Image2);
    if (product.Image3) images.push(product.Image3);
  }
  
  // if multiple images exist create simple image display, thumbnails below will handle navigation
  const imageCarousel = images.length > 1 ? `
    <div class="image-display-container relative" id="imageDisplay-${product.ItemID}">
      ${images.map((img, index) => `
        <img src="${img}" alt="${product.Product}" class="main-product-image w-full rounded-lg shadow-lg ${index === 0 ? 'active' : 'hidden'}" data-index="${index}">
      `).join('')}
    </div>
  ` : `
    <img src="${product.Image}" alt="${product.Product}" class="w-full rounded-lg shadow-lg">
  `;
  

  

  
  // check if this product has variants
  const variants = getVariantThumbnails(product.ItemID);
  const hasVariants = variants.length > 0;
  
  // Determine the active product/variant to use for controls
  // If URL has variant parameter, use that; otherwise use the main product
  const urlParams = new URLSearchParams(window.location.search);
  const urlVariantId = urlParams.get('variant');
  let activeProduct = product;
  
  if (hasVariants && urlVariantId) {
    // Try to find the specific variant from URL
    const urlVariant = window.allProductsWithVariants.find(p => p.ItemID.toString() === urlVariantId.toString());
    if (urlVariant) {
      activeProduct = urlVariant;
    }
  }
  
  
  // Calculate stock status based on activeProduct (important for variants)
  const stock = parseInt(activeProduct.Stock) || 0;
  const maxQuantity = stock <= 1 ? 1 : stock;
  const isLowStock = stock <= 1;
  const isSoldOut = stock <= 0 || activeProduct.Stock === null || activeProduct.Stock === undefined || activeProduct.Stock === '';
  
  // debug log to see stock values
  
  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        
        <!-- Product Images -->
        <div class="space-y-4">
          <!-- Main Image -->
          <div class="product-image rounded-3xl p-8 kawaii-shadow">
            <div class="aspect-square bg-gradient-to-br from-pink-100 to-purple-100 rounded-2xl flex items-center justify-center relative">
            ${(() => {
              const discountInfo = calculateDiscountedPrices(product);
              if (discountInfo) {
                return `
                    <div class="absolute top-4 right-4 bg-kawaii-pink text-white px-3 py-1 rounded-full text-sm font-medium">
                      ${discountInfo.percentage}% OFF
                    </div>
                `;
              }
              return '';
            })()}
            ${imageCarousel}
          </div>
          </div>
          
          <!-- Product Images Thumbnails (show if multiple images exist for same item) -->
          ${images.length > 1 ? `
            <div class="flex space-x-3 overflow-x-auto pb-2">
                ${images.map((imageUrl, index) => {
                  const isActive = index === 0; // first image is initially active
                  
                  return `
                  <div class="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 bg-white rounded-xl border${isActive ? '-2 border-kawaii-pink' : ' border-gray-200'} p-2 cursor-pointer hover-lift" data-image-index="${index}" onclick="switchToProductImage('${product.ItemID}', ${index})">
                    <div class="w-full h-full bg-pink-100 rounded-lg flex items-center justify-center overflow-hidden">
                      <img src="${imageUrl}" alt="${product.Product}" class="w-full h-full object-cover">
                    </div>
                    </div>
                  `;
                }).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Product Info -->
        <div class="space-y-6">
          <!-- Collection -->
          <div class="text-sm text-gray-600 uppercase tracking-wide">
            ${product.Category || 'INDIGO STORE'}
      </div>

          <!-- Product Title -->
          <h1 class="text-3xl lg:text-4xl font-bold text-gray-900 font-kawaii">
            ${product.Product}
          </h1>

          <!-- Price -->
        ${(() => {
          const discountInfo = calculateDiscountedPrices(product);
          if (discountInfo) {
            return `
                <div class="flex items-center space-x-4">
                  <span class="text-3xl font-bold text-kawaii-pink">$${discountInfo.discountedUSD.toFixed(2)} | Bs ${discountInfo.discountedBS.toFixed(2)}</span>
                  <span class="text-xl text-gray-500 line-through">$${discountInfo.originalUSD.toFixed(2)} | Bs ${discountInfo.originalBS.toFixed(2)}</span>
                  <span class="bg-kawaii-pink text-white px-3 py-1 rounded-full text-sm font-medium">${discountInfo.percentage}% OFF</span>
              </div>
            `;
          } else {
            return `
                <div class="flex items-center space-x-4">
                  <span class="text-3xl font-bold text-kawaii-pink">$${product.USD || 0} | Bs ${(parseFloat(product.Bs) || 0).toFixed(2)}</span>
              </div>
            `;
          }
        })()}

          <!-- Shipping Information -->
          <div class="flex items-center text-sm text-gray-600">
            <i class="fas fa-truck mr-2 text-kawaii-pink"></i>
            <span id="shipping-price-message" class="assets-loading">${window.shippingPriceMessage || 'Precio de envio varia segun localidad'}</span>
          </div>
        
          ${hasVariants ? `
            <!-- Variant Selection -->
            <div class="space-y-3">
              <h3 class="text-lg font-semibold text-gray-900">Modelo</h3>
              <div class="text-sm text-gray-600">Selecciona el modelo que deseas:</div>
              <div class="variant-selector-list space-y-2 max-h-32 overflow-y-auto">
                ${renderVariantOptions(variants, activeProduct.ItemID)}
              </div>
            </div>
          ` : ''}
          
          <!-- Quantity -->
          <div class="space-y-3">
            <h3 class="text-lg font-semibold text-gray-900">Quantity</h3>
            <div class="quantity-controls">
              <button class="quantity-btn minus-btn ${isSoldOut ? 'disabled' : ''}" onclick="changeQuantity('${activeProduct.ItemID}', -1)" ${isSoldOut ? 'disabled' : ''}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <span class="quantity-display" id="quantity-display-${activeProduct.ItemID}">${isSoldOut ? '0' : '1'}</span>
              <button class="quantity-btn plus-btn ${isSoldOut ? 'disabled' : ''}" onclick="changeQuantity('${activeProduct.ItemID}', 1)" ${isSoldOut ? 'disabled' : ''}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="space-y-2">
            ${isSoldOut ? 
              `<button class="sold-out-button w-full" onclick="showSoldOutMessage()">
                SOLD OUT
              </button>` : 
              `<button class="add-to-cart-small w-full" onclick="addToCartWithQuantity('${activeProduct.ItemID}')" data-product-id="${activeProduct.ItemID}">
                AGREGAR AL CARRITO
              </button>
              <button class="comprar-ahora-button w-full" onclick="buyNowWithQuantity('${activeProduct.ItemID}')" data-product-id="${activeProduct.ItemID}">
                COMPRAR AHORA
              </button>`
            }
          </div>

          <!-- Payment Methods -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-gray-900">Métodos de pago disponibles:</h3>
            <div class="grid grid-cols-3 gap-2">
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- Efectivo SVG -->
                <svg viewBox="0 0 32 32" width="18" height="18" fill="none"><rect x="2" y="8" width="28" height="10" rx="2" fill="#82DCC7"/><rect x="2" y="18" width="28" height="6" rx="2" fill="#74CBB4"/><ellipse cx="16" cy="13" rx="4" ry="5" fill="#74CBB4"/><rect x="2" y="8" width="28" height="16" rx="2" stroke="#3b65d8" stroke-width="1.5"/></svg>
              </div>
              <span class="payment-method-label">Efectivo</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- Pago Móvil SVG -->
                <svg viewBox="0 0 32 32" width="18" height="18" fill="none"><rect x="3" y="6" width="8" height="18" rx="2" fill="#69d3cc" stroke="#3b65d8" stroke-width="1.5"/><rect x="6" y="8" width="4" height="1" rx="0.5" fill="#3b65d8"/><circle cx="8" cy="23" r="1" fill="#3b65d8"/><rect x="21" y="6" width="8" height="18" rx="2" fill="#f9a8a8" stroke="#3b65d8" stroke-width="1.5"/><rect x="24" y="8" width="4" height="1" rx="0.5" fill="#3b65d8"/><circle cx="26" cy="23" r="1" fill="#3b65d8"/></svg>
              </div>
              <span class="payment-method-label">Pago Móvil</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- CASHEA SVG -->
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="18" height="18"> <rect x="30" y="30" width="940" height="940" rx="220" ry="220" fill="#FFF212" /> <circle cx="500" cy="520" r="320" fill="#373435"/> <circle cx="500" cy="520" r="170" fill="#FFF212"/> <rect x="665" y="420" width="300" height="200" fill="#FFF212" /> <rect x="470" y="112" width="60" height="220" fill="#FFF212" /> <rect x="640" y="440" width="40" height="40" fill="#FFF212" /> </svg>
              </div>
              <span class="payment-method-label">Cashea</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- TARJETA DE DEBITO SVG -->
                <svg width="800px" height="800px" viewBox="0 0 1024 1024" class="icon"  version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M894.509511 249.605689H330.752a37.660444 37.660444 0 0 0-37.546667 37.762844v342.448356a37.660444 37.660444 0 0 0 37.546667 37.762844h563.757511a37.660444 37.660444 0 0 0 37.558045-37.762844V287.368533a37.660444 37.660444 0 0 0-37.558045-37.762844z" fill="#CCCCCC" /><path d="M293.216711 333.585067H932.067556v97.655466H293.216711z" fill="#4D4D4D" /><path d="M688.685511 388.278044H124.928a37.660444 37.660444 0 0 0-37.546667 37.762845v342.448355a37.660444 37.660444 0 0 0 37.546667 37.762845h563.757511a37.660444 37.660444 0 0 0 37.546667-37.762845V426.040889a37.660444 37.660444 0 0 0-37.546667-37.762845z" fill="#FFCA6C" /><path d="M87.381333 472.257422h638.850845v97.655467H87.381333z" fill="#4D4D4D" /><path d="M213.595022 692.974933a58.595556 58.254222 90 1 0 116.508445 0 58.595556 58.254222 90 1 0-116.508445 0Z" fill="#47A7DD" /><path d="M155.3408 692.974933a58.595556 58.254222 90 1 0 116.508444 0 58.595556 58.254222 90 1 0-116.508444 0Z" fill="#FC583D" /><path d="M894.509511 234.951111H720.406756c-8.044089 0-14.563556 6.5536-14.563556 14.6432s6.519467 14.654578 14.563556 14.654578h174.102755c12.686222 0 22.994489 10.376533 22.994489 23.131022v31.561956H307.768889V287.379911c0-12.754489 10.308267-23.131022 22.994489-23.131022H671.857778c8.044089 0 14.552178-6.564978 14.552178-14.654578S679.913244 234.951111 671.869156 234.951111h-341.105778c-28.740267 0-52.1216 23.517867-52.1216 52.417422v86.254934H124.928c-28.728889 0-52.110222 23.517867-52.110222 52.417422V663.665778c0 8.100978 6.519467 14.654578 14.563555 14.654578 8.044089 0 14.563556-6.564978 14.563556-14.654578v-79.086934h609.723733v183.9104c0 12.743111-10.308267 23.108267-22.983111 23.108267H124.928a23.074133 23.074133 0 0 1-22.983111-23.108267v-55.990044c0-8.0896-6.519467-14.6432-14.563556-14.6432-8.044089 0-14.563556 6.5536-14.563555 14.6432v55.990044c0 28.899556 23.381333 52.406044 52.110222 52.406045h563.757511c28.728889 0 52.110222-23.506489 52.110222-52.406045V426.040889c0-28.899556-23.381333-52.417422-52.110222-52.417422H307.780267v-25.383823h609.735111v68.357689H772.846933c-8.044089 0-14.563556 6.5536-14.563555 14.6432s6.519467 14.654578 14.563555 14.654578h144.668445v183.9104a23.096889 23.096889 0 0 1-22.994489 23.131022H774.781156c-8.044089 0-14.552178 6.5536-14.552178 14.6432s6.508089 14.6432 14.552178 14.6432h119.728355c28.728889 0 52.1216-23.506489 52.1216-52.417422V287.379911C946.631111 258.468978 923.249778 234.951111 894.509511 234.951111z m-182.840889 191.089778v31.573333H178.642489c-8.044089 0-14.563556 6.5536-14.563556 14.6432s6.519467 14.654578 14.563556 14.654578h533.026133v68.357689H101.944889v-68.357689h28.16c8.044089 0 14.563556-6.564978 14.563555-14.654578s-6.519467-14.6432-14.563555-14.6432H101.944889v-31.573333c0-12.743111 10.308267-23.119644 22.983111-23.119645h563.757511a23.096889 23.096889 0 0 1 22.983111 23.119645z" fill="" /><path d="M242.744889 760.069689a72.100978 72.100978 0 0 0 29.104355 6.155378c40.152178 0 72.817778-32.8704 72.817778-73.250134 0-40.402489-32.6656-73.250133-72.817778-73.250133-10.069333 0-19.979378 2.127644-29.104355 6.132622a72.078222 72.078222 0 0 0-29.149867-6.132622c-40.152178 0-72.817778 32.847644-72.817778 73.250133 0 40.379733 32.6656 73.250133 72.817778 73.250134 10.365156 0 20.218311-2.218667 29.149867-6.155378z m72.795022-67.094756c0 24.223289-19.603911 43.9296-43.690667 43.9296h-0.034133a73.056711 73.056711 0 0 0 14.609067-43.9296 73.079467 73.079467 0 0 0-14.609067-43.952355h0.034133c24.098133 0 43.690667 19.706311 43.690667 43.952355z m-145.624178 0c0-24.246044 19.592533-43.952356 43.690667-43.952355 24.086756 0 43.690667 19.706311 43.690667 43.952355 0 24.223289-19.603911 43.9296-43.690667 43.9296-24.098133 0.011378-43.690667-19.706311-43.690667-43.9296zM655.633067 647.5776c8.032711 0 14.563556-6.5536 14.563555-14.6432s-6.530844-14.6432-14.563555-14.6432H440.103822c-8.044089 0-14.563556 6.5536-14.563555 14.6432s6.519467 14.6432 14.563555 14.6432h215.529245z" fill="" /></svg>
              </div>
              <span class="payment-method-label">Debito</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- TARJETA DE CREDITO SVG -->
                <svg height="800px" width="800px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve"> <path style="fill:#B4E66E;" d="M418.472,367.164H25.119c-9.446,0-17.102-7.656-17.102-17.102V93.528 c0-9.446,7.656-17.102,17.102-17.102h393.353c9.446,0,17.102,7.656,17.102,17.102v256.534 C435.574,359.508,427.918,367.164,418.472,367.164z"/> <path style="fill:#A0D755;" d="M401.37,204.693c-70.84,0-128.267,57.427-128.267,128.267c0,11.865,1.739,23.3,4.754,34.205h140.615 c9.445,0,17.102-7.658,17.102-17.102V209.447C424.669,206.432,413.234,204.693,401.37,204.693z"/> <path style="fill:#FFC850;" d="M136.284,204.693H67.875c-4.722,0-8.551-3.829-8.551-8.551v-51.307c0-4.722,3.829-8.551,8.551-8.551 h68.409c4.722,0,8.551,3.829,8.551,8.551v51.307C144.835,200.864,141.006,204.693,136.284,204.693z"/> <circle style="fill:#FF507D;" cx="294.48" cy="166.212" r="38.48"/> <circle style="fill:#FFC850;" cx="345.787" cy="166.212" r="38.48"/> <path style="fill:#FF8C66;" d="M307.307,166.212c0,11.352,5.008,21.451,12.827,28.493c7.819-7.043,12.827-17.142,12.827-28.493 c0-11.352-5.008-21.451-12.827-28.493C312.315,144.762,307.307,154.861,307.307,166.212z"/> <circle style="fill:#FFFFFF;" cx="401.37" cy="332.96" r="102.614"/> <path d="M273.102,359.148H25.119c-5.01,0-9.086-4.076-9.086-9.086V93.528c0-5.01,4.076-9.086,9.086-9.086h393.353 c5.01,0,9.086,4.076,9.086,9.086v111.167c0,4.427,3.589,8.017,8.017,8.017c4.427,0,8.017-3.589,8.017-8.017V93.528 c0-13.851-11.268-25.119-25.119-25.119H25.119C11.268,68.409,0,79.677,0,93.528v256.534c0,13.851,11.268,25.119,25.119,25.119 h247.983c4.427,0,8.017-3.589,8.017-8.017C281.119,362.737,277.53,359.148,273.102,359.148z"/> <path d="M401.37,222.329c-22.525,0-44.124,6.74-62.382,19.243l2.014-6.31c1.346-4.218-0.982-8.729-5.2-10.074 c-4.216-1.348-8.729,0.982-10.074,5.2l-10.51,32.937c-0.822,2.574-0.291,5.388,1.411,7.487c1.531,1.888,3.823,2.966,6.225,2.966 c0.268,0,0.539-0.014,0.809-0.041l34.397-3.488c4.405-0.447,7.614-4.38,7.168-8.784c-0.447-4.405-4.38-7.606-8.784-7.168 l-8.94,0.906c15.724-10.926,34.384-16.841,53.867-16.841c52.161,0,94.597,42.436,94.597,94.597 c0,51.636-41.587,93.734-93.027,94.577c0.001-0.006,0.002-0.013,0.004-0.019c-1.782,0.033-3.563,0.035-5.333-0.033 c-4.408-0.177-8.15,3.274-8.323,7.698c-0.173,4.424,3.274,8.15,7.698,8.323c1.452,0.057,2.927,0.085,4.384,0.085 c61.002,0,110.63-49.629,110.63-110.63S462.371,222.329,401.37,222.329z"/> <path d="M67.875,212.709h68.409c9.136,0,16.568-7.432,16.568-16.568v-51.307c0-9.136-7.432-16.568-16.568-16.568H67.875 c-9.136,0-16.568,7.432-16.568,16.568v51.307C51.307,205.277,58.739,212.709,67.875,212.709z M136.818,144.835v51.307 c0,0.295-0.239,0.534-0.534,0.534h-34.739v-18.171h9.086c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017h-9.086 V144.3h34.739C136.579,144.3,136.818,144.54,136.818,144.835z M67.34,144.835c0-0.295,0.239-0.534,0.534-0.534h17.637v52.376H67.875 c-0.295,0-0.534-0.239-0.534-0.534V144.835z"/> <path d="M345.787,212.709c25.638,0,46.497-20.858,46.497-46.497s-20.858-46.497-46.497-46.497c-9.467,0-18.278,2.851-25.632,7.729 c-7.571-5.017-16.488-7.729-25.675-7.729c-25.638,0-46.497,20.858-46.497,46.497s20.858,46.497,46.497,46.497 c9.47,0,18.284-2.853,25.641-7.734C327.693,209.988,336.62,212.709,345.787,212.709z M376.251,166.212 c0,16.798-13.666,30.463-30.463,30.463c-4.773,0-9.444-1.129-13.651-3.237c5.554-7.66,8.841-17.064,8.841-27.227 c0-4.427-3.589-8.017-8.017-8.017c-4.427,0-8.017,3.589-8.017,8.017c0,6.037-1.772,11.666-4.814,16.404 c-3.102-4.848-4.806-10.52-4.806-16.404c0-16.798,13.666-30.463,30.463-30.463C362.585,135.749,376.251,149.415,376.251,166.212z M264.017,166.212c0-16.798,13.666-30.463,30.463-30.463c4.781,0,9.448,1.127,13.652,3.234c-5.555,7.66-8.842,17.065-8.842,27.229 c0,9.885,3.145,19.378,8.824,27.23c-4.106,2.064-8.734,3.233-13.634,3.233C277.683,196.676,264.017,183.01,264.017,166.212z"/> <path d="M59.324,272.567h68.409c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017H59.324 c-4.427,0-8.017,3.589-8.017,8.017C51.307,268.978,54.896,272.567,59.324,272.567z"/> <path d="M59.324,323.874h205.228c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017H59.324 c-4.427,0-8.017,3.589-8.017,8.017C51.307,320.285,54.896,323.874,59.324,323.874z"/> <path d="M230.347,272.567c4.427,0,8.017-3.589,8.017-8.017c0-4.427-3.589-8.017-8.017-8.017h-68.409 c-4.427,0-8.017,3.589-8.017,8.017c0,4.427,3.589,8.017,8.017,8.017H230.347z"/> <path d="M281.653,256.534h-17.102c-4.427,0-8.017,3.589-8.017,8.017c0,4.427,3.589,8.017,8.017,8.017h17.102 c4.427,0,8.017-3.589,8.017-8.017C289.67,260.123,286.081,256.534,281.653,256.534z"/> <path d="M299.519,289.7c-2.321,5.458-4.213,11.147-5.621,16.91c-1.051,4.3,1.583,8.64,5.884,9.691 c0.639,0.156,1.279,0.231,1.91,0.231c3.609,0,6.886-2.453,7.782-6.115c1.203-4.921,2.818-9.78,4.8-14.442 c1.733-4.075-0.166-8.782-4.24-10.515C305.959,283.727,301.252,285.626,299.519,289.7z"/> <path d="M309.522,355.698c-1.21-4.907-2.03-9.96-2.438-15.019c-0.356-4.412-4.215-7.7-8.635-7.346 c-4.413,0.356-7.702,4.221-7.346,8.635c0.477,5.916,1.437,11.827,2.853,17.57c0.901,3.655,4.175,6.099,7.777,6.099 c0.635,0,1.282-0.076,1.926-0.235C307.956,364.341,310.581,359.997,309.522,355.698z"/> <path d="M367.876,421.459c-4.732-1.791-9.359-3.987-13.751-6.525c-3.834-2.214-8.737-0.902-10.952,2.932 c-2.215,3.834-0.901,8.737,2.932,10.952c5.14,2.968,10.555,5.538,16.094,7.635c0.935,0.354,1.893,0.522,2.837,0.522 c3.237,0,6.285-1.974,7.499-5.18C374.102,427.654,372.017,423.027,367.876,421.459z"/> <path d="M321.443,383.585c-2.373-3.739-7.326-4.844-11.065-2.471c-3.738,2.373-4.844,7.327-2.471,11.065 c3.172,4.997,6.776,9.777,10.71,14.208c1.584,1.784,3.786,2.695,5.998,2.695c1.893,0,3.792-0.667,5.32-2.022 c3.311-2.939,3.612-8.007,0.672-11.317C327.241,391.95,324.158,387.86,321.443,383.585z"/> <path d="M375.182,357.01c0-4.427-3.589-8.017-8.017-8.017c-4.427,0-8.017,3.589-8.017,8.017c0,13.489,14.236,24.034,34.205,26.274 v0.982c0,4.427,3.589,8.017,8.017,8.017c4.427,0,8.017-3.589,8.017-8.017v-0.982c19.969-2.24,34.205-12.786,34.205-26.274 c0-18.805-18.787-25.929-34.205-30.21v-27.974c11.431,1.758,18.171,6.984,18.171,10.084c0,4.427,3.589,8.017,8.017,8.017 c4.427,0,8.017-3.589,8.017-8.017c0-13.489-14.236-24.034-34.205-26.274v-0.982c0-4.427-3.589-8.017-8.017-8.017 c-4.427,0-8.017,3.589-8.017,8.017v0.982c-19.969,2.24-34.205,12.786-34.205,26.274c0,18.805,18.787,25.929,34.205,30.21v27.974 C381.922,365.336,375.182,360.11,375.182,357.01z M427.557,357.01c0,3.1-6.74,8.326-18.171,10.084v-23.531 C422.758,347.768,427.557,351.521,427.557,357.01z M375.182,308.91c0-3.1,6.74-8.326,18.171-10.084v23.531 C379.981,318.151,375.182,314.398,375.182,308.91z"/> </svg> </div>
              <span class="payment-method-label">Credito</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- PayPal SVG -->
                <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#0d62ab" d="M18.7,13.767l0.005,0.002C18.809,13.326,19.187,13,19.66,13h13.472c0.017,0,0.034-0.007,0.051-0.006C32.896,8.215,28.887,6,25.35,6H11.878c-0.474,0-0.852,0.335-0.955,0.777l-0.005-0.002L5.029,33.813l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,0.991,1,0.991h8.071L18.7,13.767z"></path><path fill="#199be2" d="M33.183,12.994c0.053,0.876-0.005,1.829-0.229,2.882c-1.281,5.995-5.912,9.115-11.635,9.115c0,0-3.47,0-4.313,0c-0.521,0-0.767,0.306-0.88,0.54l-1.74,8.049l-0.305,1.429h-0.006l-1.263,5.796l0.013,0.001c-0.014,0.064-0.039,0.125-0.039,0.194c0,0.553,0.447,1,1,1h7.333l0.013-0.01c0.472-0.007,0.847-0.344,0.945-0.788l0.018-0.015l1.812-8.416c0,0,0.126-0.803,0.97-0.803s4.178,0,4.178,0c5.723,0,10.401-3.106,11.683-9.102C42.18,16.106,37.358,13.019,33.183,12.994z"></path><path fill="#006fc4" d="M19.66,13c-0.474,0-0.852,0.326-0.955,0.769L18.7,13.767l-2.575,11.765c0.113-0.234,0.359-0.54,0.88-0.54c0.844,0,4.235,0,4.235,0c5.723,0,10.432-3.12,11.713-9.115c0.225-1.053,0.282-2.006,0.229-2.882C33.166,12.993,33.148,13,33.132,13H19.66z"></path></svg>
              </div>
              <span class="payment-method-label">PayPal</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- Zelle SVG -->
                <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#a0f" d="M35,42H13c-3.866,0-7-3.134-7-7V13c0-3.866,3.134-7,7-7h22c3.866,0,7,3.134,7,7v22 C42,38.866,38.866,42,35,42z"></path><path fill="#fff" d="M17.5,18.5h14c0.552,0,1-0.448,1-1V15c0-0.552-0.448-1-1-1h-14c-0.552,0-1,0.448-1,1v2.5C16.5,18.052,16.948,18.5,17.5,18.5z"></path><path fill="#fff" d="M17,34.5h14.5c0.552,0,1-0.448,1-1V31c0-0.552-0.448-1-1-1H17c-0.552,0-1,0.448-1,1v2.5C16,34.052,16.448,34.5,17,34.5z"></path><path fill="#fff" d="M22.25,11v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,10.5,22.25,10.724,22.25,11z"></path><path fill="#fff" d="M22.25,32v6c0,0.276,0.224,0.5,0.5,0.5h3.5c0.276,0,0.5-0.224,0.5-0.5v-6c0-0.276-0.224-0.5-0.5-0.5h-3.5C22.474,31.5,22.25,31.724,22.25,32z"></path><path fill="#fff" d="M16.578,30.938H22l10.294-12.839c0.178-0.222,0.019-0.552-0.266-0.552H26.5L16.275,30.298C16.065,30.553,16.247,30.938,16.578,30.938z"></path></svg>
              </div>
              <span class="payment-method-label">Zelle</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- Binance SVG -->
                <svg viewBox="0 0 64 64" width="18" height="18"><path fill="orange" d="M33.721,25.702l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C31.243,24.758,32.777,24.758,33.721,25.702z"></path><path fill="orange" d="M11.725,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C9.247,24.757,10.781,24.757,11.725,25.701z"></path><path fill="orange" d="M55.718,25.701l2.583,2.581c0.944,0.944,0.944,2.477,0,3.421l-2.587,2.587c-0.944,0.944-2.477,0.944-3.421,0l-2.583-2.583c-0.944-0.944-0.944-2.477,0-3.421l2.587-2.585C53.241,24.757,54.774,24.757,55.718,25.701z"></path><path fill="orange" d="M19.298,23.295l-2.581-2.583c-0.944-0.943-0.944-2.479,0-3.421l13.58-13.584c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.576c0.943,0.944,0.944,2.477,0,3.421l-2.587,2.588c-0.944,0.943-2.477,0.943-3.421-0.001l-9.284-9.292l-9.288,9.297C21.777,24.239,20.243,24.241,19.298,23.295z"></path><path fill="orange" d="M19.297,36.701l-2.583,2.583c-0.944,0.944-0.944,2.477,0,3.421l13.58,13.585c0.944,0.944,2.477,0.944,3.421,0l13.583-13.576c0.944-0.944,0.944-2.477,0-3.421l-2.587-2.587c-0.944-0.944-2.477-0.944-3.421,0l-9.284,9.292l-9.288-9.297C21.774,35.757,20.241,35.757,19.297,36.701z"></path><path fill="#fff" fill-opacity=".298" d="M16.715,17.293L30.297,3.707c0.944-0.945,2.477-0.945,3.421-0.001l13.583,13.577c-1.957,1.472-4.753,1.317-6.535-0.464l-8.76-8.752l-8.753,8.759C21.47,18.61,18.674,18.765,16.715,17.293z"></path><path fill="#fff" fill-rule="evenodd" d="M23.43,14.577c-0.585-0.585-0.585-1.536,0-2.121l3.024-3.024c0.585-0.585,1.536-0.585,2.121,0c0.585,0.585,0.585,1.536,0,2.121l-3.024,3.024C24.966,15.162,24.015,15.162,23.43,14.577z" clip-rule="evenodd"></path><path fill-opacity=".149" d="M16.715,42.706l13.581,13.585c0.944,0.945,2.477,0.945,3.421,0.001l13.583-13.577c-1.957-1.472-4.753-1.317-6.535,0.464l-8.76,8.752l-8.753-8.759C21.47,41.389,18.674,41.234,16.715,42.706z"></path><path fill-opacity=".298" d="M58.009,61c0-1.656-11.648-3-26-3s-26,1.344-26,3c0,1.656,11.648,3,26,3S58.009,62.656,58.009,61z"></path></svg>
              </div>
              <span class="payment-method-label">Binance</span>
            </div>
            <div class="payment-method-item">
              <div class="payment-method-icon">
                <!-- Zinli SVG -->
                <svg viewBox="0 0 52 22" width="18" height="18"><path d="M49.84 6.554v13.954h-3.318V6.553h3.317zM22.4 6.554v13.954h-3.315V6.553H22.4zM43.579.995v19.513h-3.32V.995h3.32zM18.595 2.166a2.164 2.164 0 112.161 2.162 2.179 2.179 0 01-2.161-2.162zM46.04 3.166a2.163 2.163 0 112.163 2.162 2.179 2.179 0 01-2.164-2.162zM33.988 6.562v7.16l-8.235-7.14a.342.342 0 00-.568.251V20.52h3.317v-7.175l8.238 7.162a.344.344 0 00.57-.251V6.562h-3.322zM6.489 20.513h9.64v-3.315H9.364l-2.875 3.315zM4.612 20.507L16.23 7.114a.344.344 0 00-.251-.57H2.22V9.86h7.36L.725 19.947a.344.344 0 00.251.57l3.635-.01z" fill="#22c55e"></path></svg>
              </div>
              <span class="payment-method-label">Zinli</span>
            </div>
          </div>
        </div>
        
          <!-- More Details Accordion -->
          <div class="border-t pt-6">
            <button class="flex items-center justify-between w-full text-left" onclick="toggleAccordion('description-${product.ItemID}')">
              <span class="text-lg font-semibold text-gray-900">Descripción</span>
              <i class="fas fa-chevron-down transform transition-transform" id="desc-arrow-${product.ItemID}"></i>
            </button>
            <div id="description-${product.ItemID}" class="mt-4 hidden">
              <div class="bg-kawaii-lavender/20 p-4 rounded-xl">
                <p class="text-gray-700">
                  ${product.Description || 'Sin descripción disponible'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add related products section after the main content
  setTimeout(() => {
    // Remove any existing related products sections to prevent duplicates
    const existingSections = document.querySelectorAll('[id^="related-products-section-"]');
    existingSections.forEach(section => section.remove());
    
    const relatedSection = document.createElement('section');
    relatedSection.id = `related-products-section-${product.ItemID}`;
    relatedSection.className = 'mt-16 pt-16 pb-16 bg-white border-t-4 border-kawaii-pink';
    relatedSection.style.cssText = 'margin-top: 4rem; border-top: 4px solid #ff6b9d; clear: both;';
    relatedSection.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 class="text-3xl font-bold text-gray-900 mb-8 text-center font-kawaii">TAMBIEN TE PUEDE INTERESAR</h2>
        <div id="related-products-${product.ItemID}" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <!-- Loading placeholder -->
          <div class="col-span-1 sm:col-span-2 lg:col-span-4 text-center py-8">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-kawaii-pink"></div>
            <p class="mt-2 text-gray-600">Cargando productos relacionados...</p>
          </div>
        </div>
      </div>
    `;
    
    // Insert the section after the main container
    container.parentNode.insertBefore(relatedSection, container.nextSibling);
    
    // Load related products
    loadRelatedProducts(product);
  }, 100);
}

// Toggle accordion function for product description
function toggleAccordion(id) {
  const element = document.getElementById(id);
  const arrow = document.getElementById(`desc-arrow-${id.split('-')[1]}`);
  
  if (element && arrow) {
    if (element.classList.contains('hidden')) {
      element.classList.remove('hidden');
      arrow.classList.add('rotate-180');
    } else {
      element.classList.add('hidden');
      arrow.classList.remove('rotate-180');
    }
  }
}

// Load related products for product detail page
function loadRelatedProducts(currentProduct) {
  const relatedProducts = getRelatedProducts(currentProduct);
  const container = document.getElementById(`related-products-${currentProduct.ItemID}`);
  
  if (!container) return;
  
  if (relatedProducts.length === 0) {
    container.innerHTML = `
      <div class="col-span-1 sm:col-span-2 lg:col-span-4 text-center py-8">
        <p class="text-gray-600">No hay productos relacionados disponibles.</p>
      </div>
    `;
    return;
  }
  
  // Clear container and render related products
  container.innerHTML = '';
  relatedProducts.forEach(product => {
    const card = createRelatedProductCard(product);
    container.appendChild(card);
  });
}

// Get related products based on collection and category
function getRelatedProducts(currentProduct) {
  if (!window.allProductsWithVariants || window.allProductsWithVariants.length === 0) return [];
  
  const currentCollection = currentProduct.Collection || '';
  const currentCategory = currentProduct.Category || '';
  const currentId = currentProduct.ItemID.toString();
  
  // Filter out current product and get products from same collection first
  const sameCollection = window.allProductsWithVariants.filter(product => 
    product.ItemID.toString() !== currentId && 
    product.Collection && 
    currentCollection &&
    product.Collection.toLowerCase().includes(currentCollection.toLowerCase())
  );
  
  // Get products from same category (excluding those already in sameCollection)
  const sameCategory = window.allProductsWithVariants.filter(product => 
    product.ItemID.toString() !== currentId && 
    product.Category && 
    currentCategory &&
    product.Category.toLowerCase() === currentCategory.toLowerCase() &&
    !sameCollection.find(p => p.ItemID.toString() === product.ItemID.toString())
  );
  
  // Get random products if we need more (excluding current product and already selected)
  const otherProducts = window.allProductsWithVariants.filter(product => 
    product.ItemID.toString() !== currentId &&
    !sameCollection.find(p => p.ItemID.toString() === product.ItemID.toString()) &&
    !sameCategory.find(p => p.ItemID.toString() === product.ItemID.toString())
  );
  
  // Combine and prioritize: collection first, then category, then random
  let relatedProducts = [
    ...sameCollection.slice(0, 4), // Prioritize same collection (up to 4)
    ...sameCategory.slice(0, 4 - sameCollection.length), // Fill remaining with same category
    ...shuffleArray(otherProducts).slice(0, 4 - sameCollection.length - sameCategory.length) // Fill with random
  ];
  
  // Take first 4 products
  relatedProducts = relatedProducts.slice(0, 4);
  
  return relatedProducts;
}

// Shuffle array utility
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Create related product card element
function createRelatedProductCard(product) {
  if (!product || !product.ItemID) {
    console.warn('Invalid product data for related card:', product);
    return document.createElement('div');
  }

  const card = document.createElement('div');
  card.className = 'group hover-lift cursor-pointer';
  card.onclick = () => navigateToProduct(product.ItemID);
  
  const discountInfo = calculateDiscountedPrices(product);
  const firstImage = getFirstImage(product.Image);
  const stock = parseInt(product.Stock) || 0;
  const isSoldOut = stock <= 0;
  
  card.innerHTML = `
    <div class="bg-gradient-to-br from-pink-100 to-purple-100 rounded-2xl p-6 mb-4 kawaii-shadow">
      <div class="w-full h-48 bg-white rounded-xl flex items-center justify-center mb-4 overflow-hidden">
        ${firstImage ? 
          `<img src="${firstImage}" alt="${product.Product || 'Producto'}" class="w-full h-full object-cover rounded-xl transition-transform duration-300 group-hover:scale-105">` :
          `<i class="fas fa-image text-gray-400 text-4xl"></i>`
        }
      </div>
    </div>
    <h3 class="font-semibold text-gray-900 mb-2 text-center">${product.Product || 'Producto sin nombre'}</h3>
    <p class="text-sm text-gray-600 mb-3 text-center">${product.Collection || product.Category || 'Sin colección'}</p>
    <div class="text-center">
      ${discountInfo ? `
        <span class="text-kawaii-pink font-bold text-lg">$${discountInfo.discountedUSD.toFixed(2)} | Bs ${discountInfo.discountedBS.toFixed(2)}</span>
      ` : `
        <span class="text-kawaii-pink font-bold text-lg">$${product.USD || '0.00'} | Bs ${(parseFloat(product.Bs) || 0).toFixed(2)}</span>
      `}
    </div>
  `;
  
  return card;
}

// Get first image from comma-separated image URLs
function getFirstImage(imageString) {
  if (!imageString) return null;
  
  // Handle comma-separated URLs
  if (imageString.includes(',')) {
    return imageString.split(',')[0].trim();
  }
  
  return imageString.trim();
}

// variant processing functions
function processProductVariants(products) {
  const mainProducts = [];
  const allProductsWithVariants = [...products];
  
  // group products by their base ID (without decimals)
  const productGroups = {};
  
  products.forEach(product => {
    const baseId = product.ItemID.toString().split('.')[0];
    if (!productGroups[baseId]) {
      productGroups[baseId] = [];
    }
    productGroups[baseId].push(product);
  });
  
  // process each group
  Object.keys(productGroups).forEach(baseId => {
    const variants = productGroups[baseId];
    
    if (variants.length === 1) {
      // single product, no variants
      mainProducts.push(variants[0]);
    } else {
      // multiple variants - find the main one (without decimal)
      const mainVariant = variants.find(v => v.ItemID.toString() === baseId);
      if (mainVariant) {
        // add variant info to main product
        mainVariant.variants = variants;
        mainProducts.push(mainVariant);
      } else {
        // fallback: use first variant as main
        variants[0].variants = variants;
        mainProducts.push(variants[0]);
      }
    }
  });
  
  return { mainProducts, allProductsWithVariants };
}

function getProductVariants(productId) {
  const product = window.allProductsWithVariants.find(p => p.ItemID.toString() === productId.toString());
  if (product && product.variants) {
    return product.variants;
  }
  return [product];
}

function getVariantThumbnails(productId) {
  // find the main product that has variants (base ID without decimals)
  const baseId = productId.toString().split('.')[0];
  const mainProduct = window.allProductsWithVariants.find(p => p.ItemID.toString() === baseId);
  
  if (mainProduct && mainProduct.variants) {
    // return all variants including the main product
    return mainProduct.variants;
  }
  return [];
}

// Optimized variant options renderer
function renderVariantOptions(variants, activeProductId) {
  if (!variants || variants.length === 0) return '';
  
  // Hide main/base item (without decimal) from the list
  const baseId = activeProductId.toString().split('.')[0];
  const visibleVariants = variants.filter(v => v.ItemID.toString() !== baseId);

  return visibleVariants.map(variant => {
    const isActive = variant.ItemID.toString() === activeProductId.toString();
    const stock = parseInt(variant.Stock) || 0;
    const isSoldOut = stock <= 0;
    const firstImage = variant.Image ? variant.Image.split(',')[0].trim() : '';
    
    return `
      <div class="variant-option ${isActive ? 'active' : ''} ${isSoldOut ? 'sold-out' : ''}" 
           data-variant-id="${variant.ItemID}" 
           onclick="switchToVariant('${variant.ItemID}')">
        <div class="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:border-kawaii-pink transition-colors ${isActive ? 'border-kawaii-pink bg-kawaii-pink/5' : 'border-gray-200'}">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              <img src="${firstImage}" alt="${variant.Product}" class="w-full h-full object-cover" loading="lazy">
            </div>
            <div>
              <div class="font-medium text-gray-900 ${isSoldOut ? 'line-through text-gray-400' : ''}">${variant.Product}</div>
              <div class="text-sm text-kawaii-pink">$${variant.USD || 0} | Bs ${(parseFloat(variant.Bs) || 0).toFixed(2)}</div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            ${isSoldOut ? '<span class="text-xs text-red-500 font-medium">Agotado</span>' : (stock <= 3 ? `<span class="text-xs text-orange-500">Solo ${stock}</span>` : '')}
            ${isActive ? '<div class="w-4 h-4 bg-kawaii-pink rounded-full flex items-center justify-center"><svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg></div>' : '<div class="w-4 h-4 border-2 border-gray-300 rounded-full"></div>'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function switchToVariant(variantId) {
  console.log('switchToVariant called with variantId:', variantId);
  
  // Find the variant in the allProductsWithVariants array
  let variant = null;
  let baseProductId = null;
  
  // First, try to find the variant directly
  for (const product of window.allProductsWithVariants) {
    if (product.variants) {
      const foundVariant = product.variants.find(v => v.ItemID.toString() === variantId.toString());
      if (foundVariant) {
        variant = foundVariant;
        baseProductId = product.ItemID;
        break;
      }
    }
  }
  
  if (!variant) {
    console.error('Variant not found:', variantId);
    console.log('Available variants:', window.allProductsWithVariants.flatMap(p => p.variants ? p.variants.map(v => ({ id: v.ItemID, name: v.Product })) : []));
    return;
  }
  
  console.log('Variant found:', { variantId, variantName: variant.Product, baseProductId });
  
  // Check if variant is sold out
  const stock = parseInt(variant.Stock) || 0;
  const isSoldOut = stock <= 0;
  
  if (isSoldOut) {
    // Show sold out message and don't switch
    showCartNotification('Este modelo está agotado. Selecciona otro modelo.');
    return;
  }
  
  console.log('Switching to variant:', variant.Product, 'ID:', variant.ItemID, 'Stock:', stock, 'BaseProductId:', baseProductId);
  
  // Update variant option active state with improved performance
  const variantOptions = document.querySelectorAll('.variant-option');
  variantOptions.forEach(option => {
    const optionVariantId = option.getAttribute('data-variant-id');
    const optionDiv = option.querySelector('div');
    const radioButton = option.querySelector('.w-4.h-4:last-child');
    
    if (optionVariantId === variantId.toString()) {
      // Activate this variant
      option.classList.add('active');
      if (optionDiv) {
        optionDiv.classList.remove('border-gray-200');
        optionDiv.classList.add('border-kawaii-pink', 'bg-kawaii-pink/5');
      }
      if (radioButton) {
        radioButton.innerHTML = '<div class="w-4 h-4 bg-kawaii-pink rounded-full flex items-center justify-center"><svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg></div>';
      }
    } else {
      // Deactivate other variants
      option.classList.remove('active');
      if (optionDiv) {
        optionDiv.classList.add('border-gray-200');
        optionDiv.classList.remove('border-kawaii-pink', 'bg-kawaii-pink/5');
      }
      if (radioButton) {
        radioButton.innerHTML = '<div class="w-4 h-4 border-2 border-gray-300 rounded-full"></div>';
      }
    }
  });
  
  console.log('Variant option states updated');
  
  // Update product images to show the new variant's images
  // Parse the variant's images
  let variantImages = [];
  if (variant.Image) {
    const imageUrls = variant.Image.split(',').map(url => url.trim());
    variantImages = imageUrls.filter(url => url && url.length > 0);
  }
  
  // === UPDATE IMAGES (DETAILED DEBUG) ===
  console.log('Variant:', variant.Product, 'ID:', variant.ItemID);
  console.log('Base Product ID:', baseProductId);
  console.log('Variant images:', variantImages);
  
  // Try to find image containers with detailed logging
  console.log('Searching for image elements...');
  
  const imageContainerById = document.getElementById(`imageDisplay-${baseProductId}`);
  const imageContainerByVariantId = document.getElementById(`imageDisplay-${variant.ItemID}`);
  const imageContainerByClass = document.querySelector('.image-display-container');
  const allMainImages = document.querySelectorAll('.main-product-image');
  const thumbnailContainer = document.querySelector('.flex.space-x-3.overflow-x-auto.pb-2');
  
  console.log('Image containers found:', {
    byBaseId: !!imageContainerById,
    byVariantId: !!imageContainerByVariantId,
    byClass: !!imageContainerByClass,
    mainImages: allMainImages.length,
    thumbnailContainer: !!thumbnailContainer
  });
  
  // Log all elements with 'imageDisplay' in their ID
  const allImageDisplays = document.querySelectorAll('[id*="imageDisplay"]');
  console.log('All imageDisplay elements:', Array.from(allImageDisplays).map(el => el.id));
  
  if (variantImages.length > 0) {
    let imageUpdated = false;
    
    // Try different approaches in order of preference
    let imageContainer = imageContainerById || imageContainerByVariantId || imageContainerByClass;
    
    // If still not found, create a container inside the product image wrapper
    if (!imageContainer) {
      const productImageWrapper = document.querySelector('.product-image .aspect-square');
      if (productImageWrapper) {
        const newContainer = document.createElement('div');
        newContainer.className = 'image-display-container relative';
        newContainer.id = `imageDisplay-${baseProductId}`;
        productImageWrapper.appendChild(newContainer);
        imageContainer = newContainer;
        console.log('Created image container with id:', newContainer.id);
      }
    }
    
    if (imageContainer) {
      console.log('Updating via container:', imageContainer.id || imageContainer.className);
      imageContainer.innerHTML = variantImages.map((img, index) => `
        <img src="${img}" alt="${variant.Product}" class="main-product-image w-full rounded-lg shadow-lg ${index === 0 ? 'active' : 'hidden'}" data-index="${index}">
      `).join('');
      // Remove any orphan single images that might overlap the container
      const productImageWrapper2 = document.querySelector('.product-image .aspect-square');
      if (productImageWrapper2) {
        const orphanSingles = productImageWrapper2.querySelectorAll(':scope > img:not(.main-product-image)');
        orphanSingles.forEach(img => img.remove());
      }
      imageUpdated = true;
      console.log('Images updated via container');
    } else if (allMainImages.length > 0) {
      console.log('Updating existing images directly, count:', allMainImages.length);
      allMainImages.forEach((img, index) => {
        if (index < variantImages.length) {
          console.log(`Updating image ${index}: ${img.src} -> ${variantImages[index]}`);
          img.src = variantImages[index];
          img.alt = variant.Product;
          img.style.display = index === 0 ? 'block' : 'none';
          img.classList.toggle('active', index === 0);
          img.classList.toggle('hidden', index !== 0);
        } else {
          img.style.display = 'none';
          img.classList.remove('active');
          img.classList.add('hidden');
        }
      });
      imageUpdated = true;
      console.log('Images updated directly');
      // Also try to remove any orphan single images
      const productImageWrapper3 = document.querySelector('.product-image .aspect-square');
      if (productImageWrapper3) {
        const orphanSingles2 = productImageWrapper3.querySelectorAll(':scope > img:not(.main-product-image)');
        orphanSingles2.forEach(img => img.remove());
      }
    }
    
    // Update thumbnails
    if (thumbnailContainer && variantImages.length > 1) {
      console.log('Updating thumbnails');
      thumbnailContainer.innerHTML = variantImages.map((imageUrl, index) => `
        <div class="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 bg-white rounded-xl border${index === 0 ? '-2 border-kawaii-pink' : ' border-gray-200'} p-2 cursor-pointer hover-lift" data-image-index="${index}" onclick="switchToProductImage('${baseProductId}', ${index})">
          <div class="w-full h-full bg-pink-100 rounded-lg flex items-center justify-center overflow-hidden">
            <img src="${imageUrl}" alt="${variant.Product}" class="w-full h-full object-cover">
          </div>
        </div>
      `).join('');
      thumbnailContainer.style.display = 'flex';
      console.log('Thumbnails updated');
    } else if (thumbnailContainer) {
      thumbnailContainer.style.display = 'none';
      console.log('Thumbnails hidden (single image)');
    }
    
    if (!imageUpdated) {
      console.error('Could not find any image containers to update');
      console.log('Available elements:', {
        imageDisplayElements: document.querySelectorAll('[id*="imageDisplay"]').length,
        mainImageElements: document.querySelectorAll('.main-product-image').length,
        imageContainers: document.querySelectorAll('.image-display-container').length
      });
    }
  } else {
    console.error('No variant images available');
  }
  
  // Keep main product title (do not change on variant switch)
  
  // Update price
  const priceSection = document.querySelector('.text-3xl.font-bold.text-kawaii-pink');
  if (priceSection && priceSection.parentElement) {
    const discountInfo = calculateDiscountedPrices(variant);
    if (discountInfo) {
      priceSection.parentElement.innerHTML = `
        <span class="text-3xl font-bold text-kawaii-pink">$${discountInfo.discountedUSD.toFixed(2)} | Bs ${discountInfo.discountedBS.toFixed(2)}</span>
        <span class="text-xl text-gray-500 line-through">$${discountInfo.originalUSD.toFixed(2)} | Bs ${discountInfo.originalBS.toFixed(2)}</span>
        <span class="bg-kawaii-pink text-white px-3 py-1 rounded-full text-sm font-medium">${discountInfo.percentage}% OFF</span>
      `;
            } else {
      priceSection.parentElement.innerHTML = `
        <span class="text-3xl font-bold text-kawaii-pink">$${variant.USD || 0} | Bs ${(parseFloat(variant.Bs) || 0).toFixed(2)}</span>
      `;
    }
  }
  
  // Main product image is now handled above in the image display container update
  
  // === UPDATE CONTROLS (BETTER APPROACH) ===
  console.log('Updating controls for variant:', variant.ItemID);
  
  // Check stock status for controls
  const controlsStock = parseInt(variant.Stock) || 0;
  const controlsIsLowStock = controlsStock <= 1;
  const controlsIsSoldOut = controlsStock <= 0 || variant.Stock === null || variant.Stock === undefined || variant.Stock === '';
  
  console.log('Stock info:', { controlsStock, controlsIsLowStock, controlsIsSoldOut });
  
  // Update existing quantity controls instead of re-rendering
  const minusBtn = document.querySelector('.quantity-btn.minus-btn');
  const plusBtn = document.querySelector('.quantity-btn.plus-btn');
  const quantityDisplay = document.querySelector('.quantity-display');
  
  if (minusBtn) {
    minusBtn.setAttribute('onclick', `changeQuantity('${variant.ItemID}', -1)`);
    if (controlsIsSoldOut) {
      minusBtn.setAttribute('disabled', '');
      minusBtn.classList.add('disabled');
    } else {
      minusBtn.removeAttribute('disabled');
      minusBtn.classList.remove('disabled');
    }
    console.log('Updated minus button');
  }
  
  if (plusBtn) {
    plusBtn.setAttribute('onclick', `changeQuantity('${variant.ItemID}', 1)`);
    if (controlsIsSoldOut) {
      plusBtn.setAttribute('disabled', '');
      plusBtn.classList.add('disabled');
    } else {
      plusBtn.removeAttribute('disabled');
      plusBtn.classList.remove('disabled');
    }
    console.log('Updated plus button');
  }
  
  if (quantityDisplay) {
    quantityDisplay.id = `quantity-display-${variant.ItemID}`;
    quantityDisplay.textContent = controlsIsSoldOut ? '0' : '1';
    console.log('Updated quantity display');
  }
  
  // Update existing action buttons instead of re-rendering
  const addToCartBtn = document.querySelector('.add-to-cart-small');
  const buyNowBtn = document.querySelector('.comprar-ahora-button');
  const soldOutBtn = document.querySelector('.sold-out-button');
  
  if (controlsIsSoldOut) {
    // Hide add to cart and buy now buttons, show sold out
    if (addToCartBtn) addToCartBtn.style.display = 'none';
    if (buyNowBtn) buyNowBtn.style.display = 'none';
    if (soldOutBtn) soldOutBtn.style.display = 'block';
  } else {
    // Show add to cart and buy now buttons, hide sold out
    if (addToCartBtn) {
      addToCartBtn.style.display = 'block';
      addToCartBtn.setAttribute('onclick', `addToCartWithQuantity('${variant.ItemID}')`);
      console.log('Updated add to cart button with onclick:', `addToCartWithQuantity('${variant.ItemID}')`);
      console.log('Button onclick attribute after update:', addToCartBtn.getAttribute('onclick'));
    }
    if (buyNowBtn) {
      buyNowBtn.style.display = 'block';
      buyNowBtn.setAttribute('onclick', `buyNowWithQuantity('${variant.ItemID}')`);
      console.log('Updated buy now button');
    }
    if (soldOutBtn) soldOutBtn.style.display = 'none';
  }
  
  // Update description in accordion
  const descriptionContent = document.querySelector('[id*="description-"] .bg-kawaii-lavender\\/20 p');
  if (descriptionContent) {
    descriptionContent.textContent = variant.Description || 'Sin descripción disponible';
  }
  
  // Update URL to reflect the current variant
    const currentUrl = new URL(window.location);
    currentUrl.searchParams.set('variant', variantId);
    window.history.pushState({}, '', currentUrl.toString());
}

// function to switch between product images using thumbnails
function switchToProductImage(productId, imageIndex) {
  
  const imageContainer = document.getElementById(`imageDisplay-${productId}`);
  if (!imageContainer) {
    console.error('Image display container not found for product:', productId);
    return;
  }
  
  const images = imageContainer.querySelectorAll('.main-product-image');
  const thumbnails = document.querySelectorAll(`[data-image-index]`);
  
  // hide all images first
  images.forEach(img => {
    img.classList.remove('active');
    img.classList.add('hidden');
  });
  
  // remove active state from all thumbnails
  thumbnails.forEach(thumb => {
    thumb.classList.remove('border-2', 'border-kawaii-pink');
    thumb.classList.add('border', 'border-gray-200');
  });
  
  // show the selected image
  if (images[imageIndex]) {
    images[imageIndex].classList.add('active');
    images[imageIndex].classList.remove('hidden');
  }
  
  // highlight the selected thumbnail
  const activeThumbnail = document.querySelector(`[data-image-index="${imageIndex}"]`);
  if (activeThumbnail) {
    activeThumbnail.classList.remove('border', 'border-gray-200');
    activeThumbnail.classList.add('border-2', 'border-kawaii-pink');
  }
  
}

// legacy image carousel functions - for when products have multiple images (kept for backward compatibility)
function changeImage(productId, direction) {
  const carousel = document.getElementById(`imageCarousel-${productId}`);
  if (!carousel) {
    console.error('Carousel not found for product:', productId);
    return;
  }
  
  const images = carousel.querySelectorAll('.carousel-image');
  const container = carousel.closest('.image-carousel-container');
  const dots = container.querySelectorAll('.carousel-dot');
  
  // find which image is currently showing
  let currentIndex = 0;
  images.forEach((img, index) => {
    if (img.classList.contains('active')) {
      currentIndex = index;
    }
  });
  
  // calculate new index with wrap around
  let newIndex = currentIndex + direction;
  if (newIndex < 0) newIndex = images.length - 1;
  if (newIndex >= images.length) newIndex = 0;
  
  // hide current image and dot
  images[currentIndex].classList.remove('active');
  dots[currentIndex].classList.remove('active');
  
  // show new image and dot
  images[newIndex].classList.add('active');
  dots[newIndex].classList.add('active');
  
}

function goToImage(productId, index) {
  const carousel = document.getElementById(`imageCarousel-${productId}`);
  if (!carousel) {
    console.error('Carousel not found for product:', productId);
    return;
  }
  
  const images = carousel.querySelectorAll('.carousel-image');
  const container = carousel.closest('.image-carousel-container');
  const dots = container.querySelectorAll('.carousel-dot');
  
  // hide all images and dots first
  images.forEach(img => img.classList.remove('active'));
  dots.forEach(dot => dot.classList.remove('active'));
  
  // show the selected image and dot
  images[index].classList.add('active');
  dots[index].classList.add('active');
  
}

function setupSorting(products) {
  const sortSelect = document.getElementById('sort-select');
  sortSelect.onchange = () => {
    const value = sortSelect.value;
    let sorted = [...products];
    
    switch (value) {
      case 'name-asc':
        sorted.sort((a, b) => a.Product.localeCompare(b.Product));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.Product.localeCompare(a.Product));
        break;
      case 'price-asc':
        sorted.sort((a, b) => parseFloat(a.USD) - parseFloat(b.USD));
        break;
      case 'price-desc':
        sorted.sort((a, b) => parseFloat(b.USD) - parseFloat(a.USD));
        break;
      default:
        sorted = products;
    }
    
    renderCategoryProducts(sorted);
  };
}

// back - forward buttonss
window.addEventListener('popstate', () => {
  handleRouting();
});

// Duplicate handleRouting function removed - using the one at line ~5110 instead

// this is the cart code alledgely (no se como se escribe)
function getCart() {
  return JSON.parse(localStorage.getItem("cart") || "[]");
}

function saveCart(cart) {
  // Clean cart items to remove circular references before saving
  const cleanedCart = cart.map(item => {
    const cleanItem = { ...item };
    // Remove properties that might cause circular references
    delete cleanItem.variants;
    delete cleanItem.parentProduct;
    return cleanItem;
  });
  localStorage.setItem("cart", JSON.stringify(cleanedCart));
}

// quantity control functions
function changeQuantity(productId, change) {
  
  let quantityDisplay = document.getElementById(`quantity-display-${productId}`) ||
                        document.getElementById(`quantity-${productId}`) || 
                        document.getElementById(`quantity-card-${productId}`) ||
                        document.querySelector('.quantity-display');
  
  if (!quantityDisplay) {
    console.error('Quantity display not found for productId:', productId);
    return;
  }
  
  const currentQuantity = parseInt(quantityDisplay.textContent) || 1;
  let product;
  
  // handle both card- prefixed IDs and regular IDs
  if (productId.startsWith('card-')) {
    const realId = productId.replace('card-', '');
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === realId.toString());
  } else {
    // First try to find in allProductsWithVariants
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === productId.toString());
    
    // If not found, it might be a variant - try to find it in the variants of main products
    if (!product) {
      const baseId = productId.toString().split('.')[0];
      const mainProduct = window.allProductsWithVariants.find(p => p.ItemID.toString() === baseId);
      if (mainProduct && mainProduct.variants) {
        product = mainProduct.variants.find(v => v.ItemID.toString() === productId.toString());
      }
    }
  }
  
  if (!product) {
    console.error('Product not found for quantity change:', productId);
    return;
  }
  
  // check if product is sold out
  const stock = parseInt(product.Stock) || 0;
  if (stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '') {
    showCartNotification('No hay stock disponible para este producto.');
    return;
  }
  
  const maxQuantity = stock <= 1 ? 1 : stock;
  const newQuantity = Math.max(1, Math.min(maxQuantity, currentQuantity + change));
  quantityDisplay.textContent = newQuantity;
  
  // update button states
  const minusBtn = quantityDisplay.previousElementSibling;
  const plusBtn = quantityDisplay.nextElementSibling;
  
  if (minusBtn) {
    minusBtn.disabled = newQuantity <= 1;
    if (minusBtn.disabled) {
      minusBtn.classList.add('disabled');
    } else {
      minusBtn.classList.remove('disabled');
    }
  }
  
  if (plusBtn) {
    plusBtn.disabled = newQuantity >= maxQuantity;
    if (plusBtn.disabled) {
      plusBtn.classList.add('disabled');
    } else {
      plusBtn.classList.remove('disabled');
    }
  }
}

function addToCartWithQuantity(productId) {
  console.log('addToCartWithQuantity called with productId:', productId);
  
  // Debug: Check which button was clicked
  const clickedButton = event.target;
  console.log('Clicked button:', {
    onclick: clickedButton.getAttribute('onclick'),
    dataProductId: clickedButton.getAttribute('data-product-id'),
    className: clickedButton.className
  });
  
  let product, quantityDisplay;
  
  // handle both card- prefixed IDs and regular IDs
  if (productId.startsWith('card-')) {
    const realId = productId.replace('card-', '');
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === realId.toString());
    quantityDisplay = document.getElementById(`quantity-card-${realId}`);
    console.log('Card product search:', { realId, found: !!product });
  } else {
    // First try to find in allProductsWithVariants
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === productId.toString());
    console.log('Direct product search:', { productId, found: !!product });
    
    // If not found, it might be a variant - try to find it in the variants of main products
    if (!product) {
      const baseId = productId.toString().split('.')[0];
      console.log('Searching for variant, baseId:', baseId);
      
      const mainProduct = window.allProductsWithVariants.find(p => p.ItemID.toString() === baseId);
      console.log('Main product found:', { baseId, found: !!mainProduct, hasVariants: !!(mainProduct && mainProduct.variants) });
      
      if (mainProduct && mainProduct.variants) {
        product = mainProduct.variants.find(v => v.ItemID.toString() === productId.toString());
        console.log('Variant search result:', { productId, found: !!product });
      }
    }
    
    quantityDisplay = document.getElementById(`quantity-${productId}`) || 
                      document.getElementById(`quantity-display-${productId}`);
  }
  
  if (!product) {
    console.error('Product not found:', productId);
    console.log('Available products:', window.allProductsWithVariants.map(p => p.ItemID));
    console.log('Available variants:', window.allProductsWithVariants.flatMap(p => p.variants ? p.variants.map(v => v.ItemID) : []));
    return;
  }
  
  console.log('Product found:', { productId, productName: product.Product, stock: product.Stock });
  
  if (!quantityDisplay) {
    // Try to find quantity display with different patterns
    quantityDisplay = document.querySelector(`[id*="quantity"][id*="${productId}"]`) ||
                      document.querySelector('input[type="number"]') ||
                      document.querySelector('.quantity-display');
    
    if (!quantityDisplay) {
      console.error('Quantity display not found for product:', productId);
      return;
    }
  }
  
  // check if product is sold out
  const stock = parseInt(product.Stock) || 0;
  if (stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '') {
    showCartNotification('No hay stock disponible para este producto.');
    return;
  }
  
  // Get quantity from different types of elements
  let quantity = 1;
  if (quantityDisplay.tagName === 'INPUT') {
    quantity = parseInt(quantityDisplay.value) || 1;
  } else {
    quantity = parseInt(quantityDisplay.textContent) || 1;
  }
  
  
  const cart = getCart();
  const existing = cart.find(p => p.ItemID.toString() === product.ItemID.toString());
  
  if (existing) {
    const stock = parseInt(product.Stock) || 0;
    const maxQuantity = stock <= 1 ? 1 : stock;
    const newTotalQuantity = existing.quantity + quantity;
    
    if (newTotalQuantity > maxQuantity) {
      showCartNotification('No hay suficiente stock disponible.');
      return;
    }
    existing.quantity = newTotalQuantity;
  } else {
    product.quantity = quantity;
    cart.push(product);
  }
  
  saveCart(cart);
  updateCartIconCount(); // update cart count immediately
  showCartNotification(`${quantity} ${quantity === 1 ? 'unidad' : 'unidades'} agregada${quantity === 1 ? '' : 's'} al carrito`);
}

// updated addToCart function for product cards (keeps existing behavior)
function addToCart(product) {
  // check if product is sold out
  const stock = parseInt(product.Stock) || 0;
  if (stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '') {
    showCartNotification('No hay stock disponible para este producto.');
    return;
  }
  
  const cart = getCart();
  const existing = cart.find(p => p.ItemID.toString() === product.ItemID.toString());
  
  if (existing) {
    const maxQuantity = stock <= 1 ? 1 : stock;
    
    if (existing.quantity >= maxQuantity) {
      showCartNotification('No hay suficiente stock disponible.');
      return;
    }
    
    existing.quantity += 1;
  } else {
    product.quantity = 1;
    cart.push(product);
  }
  
  saveCart(cart);
  updateCartIconCount(); // update cart count immediately
  showCartNotification("Agregado al carrito");
}

// Buy now function - adds product to cart and goes directly to checkout
function buyNowWithQuantity(productId) {
  let product, quantityDisplay;
  
  // handle both card- prefixed IDs and regular IDs
  if (productId.startsWith('card-')) {
    const realId = productId.replace('card-', '');
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === realId.toString());
    quantityDisplay = document.getElementById(`quantity-card-${realId}`);
  } else {
    // First try to find in allProductsWithVariants
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === productId.toString());
    
    // If not found, it might be a variant - try to find it in the variants of main products
    if (!product) {
      const baseId = productId.toString().split('.')[0];
      const mainProduct = window.allProductsWithVariants.find(p => p.ItemID.toString() === baseId);
      if (mainProduct && mainProduct.variants) {
        product = mainProduct.variants.find(v => v.ItemID.toString() === productId.toString());
      }
    }
    
    quantityDisplay = document.getElementById(`quantity-${productId}`) || 
                      document.getElementById(`quantity-display-${productId}`);
  }
  
  if (!product) {
    console.error('Product not found:', productId);
    console.log('Available products:', window.allProductsWithVariants.map(p => p.ItemID));
    return;
  }
  
  if (!quantityDisplay) {
    // Try to find quantity display with different patterns
    quantityDisplay = document.querySelector(`[id*="quantity"][id*="${productId}"]`) ||
                      document.querySelector('input[type="number"]') ||
                      document.querySelector('.quantity-display');
    
    if (!quantityDisplay) {
      console.error('Quantity display not found for product:', productId);
      return;
    }
  }
  
  // check if product is sold out
  const stock = parseInt(product.Stock) || 0;
  if (stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '') {
    showCartNotification('No hay stock disponible para este producto.');
    return;
  }
  
  // Get quantity from different types of elements
  let quantity = 1;
  if (quantityDisplay.tagName === 'INPUT') {
    quantity = parseInt(quantityDisplay.value) || 1;
  } else {
    quantity = parseInt(quantityDisplay.textContent) || 1;
  }
  
  
  // Store the product temporarily for checkout without adding to cart
  const buyNowProduct = {
    ...product,
    quantity: quantity
  };
  
  // Clean product to remove circular references
  delete buyNowProduct.variants;
  delete buyNowProduct.parentProduct;
  
  // Store in sessionStorage for checkout page to access
  sessionStorage.setItem('buyNowProduct', JSON.stringify(buyNowProduct));
  
  
  // Navigate directly to checkout
  navigateToCheckout();
}

function showCartNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'cart-notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
}

// Unified styled notification system
function showStyledNotification(title, message, type = 'success', duration = 5000) {
  const notification = document.createElement('div');
  notification.className = 'styled-notification';
  
  // Define colors and icons based on type
  let bgGradient, boxShadowColor, icon;
  switch (type) {
    case 'success':
      bgGradient = 'linear-gradient(135deg, #10b981, #34d399)';
      boxShadowColor = 'rgba(16, 185, 129, 0.3)';
      icon = '✅';
      break;
    case 'error':
      bgGradient = 'linear-gradient(135deg, #ef4444, #f87171)';
      boxShadowColor = 'rgba(239, 68, 68, 0.3)';
      icon = '❌';
      break;
    case 'warning':
      bgGradient = 'linear-gradient(135deg, #f59e0b, #fbbf24)';
      boxShadowColor = 'rgba(245, 158, 11, 0.3)';
      icon = '⚠️';
      break;
    case 'info':
      bgGradient = 'linear-gradient(135deg, #3b82f6, #60a5fa)';
      boxShadowColor = 'rgba(59, 130, 246, 0.3)';
      icon = 'ℹ️';
      break;
    case 'delete':
      bgGradient = 'linear-gradient(135deg, #dc2626, #ef4444)';
      boxShadowColor = 'rgba(220, 38, 38, 0.3)';
      icon = '🗑️';
      break;
    default:
      bgGradient = 'linear-gradient(135deg, #ff6b9d, #ff8fab)';
      boxShadowColor = 'rgba(255, 107, 157, 0.3)';
      icon = '✨';
  }
  
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${bgGradient};
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 25px ${boxShadowColor};
      z-index: 10000;
      max-width: 320px;
      animation: slideInRight 0.5s ease-out;
    ">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        ">
          ${icon}
        </div>
        <div>
          <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
          <div style="font-size: 14px; opacity: 0.9;">${message}</div>
        </div>
      </div>
    </div>
  `;
  
  // Add animation styles if not already present
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Remove notification after specified duration
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, duration);
}

function showSoldOutMessage() {
  showCartNotification('No hay stock disponible para este producto.');
}

function openCartModal() {
  renderCartModal();
  document.getElementById('cartModal').style.display = 'flex';
}
function closeCartModal() {
  document.getElementById('cartModal').style.display = 'none';
}







// Helper function to get first image from comma-separated image string
function getFirstImage(imageString) {
  if (!imageString) return '';
  if (imageString.includes(',')) {
    return imageString.split(',')[0].trim();
  }
  return imageString;
}

// Helper function to calculate discounted prices
function calculateDiscountedPrices(product) {
  // Debug: Log the product structure to see what fields are available
  // Note: Removed suspicious BS price warning as database values are correct
  // The issue is with parsing/comma handling which is fixed in loadProductsData
  
  console.log('Product data for discount calculation:', {
    ItemID: product.ItemID,
    Product: product.Product,
    USD: product.USD,
    Bs: product.Bs,
    Discount: product.Discount,
    DiscountedUSD: product.DiscountedUSD,
    DiscountedBs: product.DiscountedBs,
    Offers: product.Offers
  });
  
  // Check if product has discount data from the new spreadsheet structure
  if (product.Discount && product.Discount > 0 && product.DiscountedUSD && product.DiscountedBs) {
    const discountPercentage = parseFloat(product.Discount);
    const originalUSD = parseFloat(product.USD) || 0;
    const originalBS = parseFloat(product.Bs) || 0;
    const discountedUSD = parseFloat(product.DiscountedUSD) || 0;
    const discountedBS = parseFloat(product.DiscountedBs) || 0;
    
    console.log('Found discount data:', {
      percentage: discountPercentage,
      originalUSD: originalUSD,
      originalBS: originalBS,
      discountedUSD: discountedUSD,
      discountedBS: discountedBS
    });
    
    return {
      percentage: discountPercentage,
      originalUSD: originalUSD,
      originalBS: originalBS,
      discountedUSD: discountedUSD,
      discountedBS: discountedBS,
      offersText: `${discountPercentage}% OFF`
    };
  }
  
  // Alternative: Check if we can calculate discount from the original prices
  // This handles cases where the Google Apps Script might not be returning the calculated fields
  if (product.Discount && product.Discount > 0) {
    const discountPercentage = parseFloat(product.Discount);
    const originalUSD = parseFloat(product.USD) || 0;
    const originalBS = parseFloat(product.Bs) || 0;
    
    // Calculate discounted prices manually
    const discountedUSD = originalUSD * (1 - discountPercentage / 100);
    const discountedBS = originalBS * (1 - discountPercentage / 100);
    
    console.log('Calculated discount data manually:', {
      percentage: discountPercentage,
      originalUSD: originalUSD,
      originalBS: originalBS,
      discountedUSD: discountedUSD,
      discountedBS: discountedBS
    });
    
    return {
      percentage: discountPercentage,
      originalUSD: originalUSD,
      originalBS: originalBS,
      discountedUSD: discountedUSD,
      discountedBS: discountedBS,
      offersText: `${discountPercentage}% OFF`
    };
  }
  
  // Fallback to old Offers column logic if needed
  if (product.Offers && product.Offers.trim()) {
    const offersText = product.Offers.trim();
    
    // Check if it's a percentage discount (e.g., "20%", "15% off", "25% discount")
    const percentageMatch = offersText.match(/(\d+)%/);
    if (percentageMatch) {
      const discountPercentage = parseInt(percentageMatch[1]);
      if (discountPercentage > 0 && discountPercentage <= 100) {
        const originalUSD = parseFloat(product.USD) || 0;
        const originalBS = parseFloat(product.Bs) || 0;
        
        const discountedUSD = originalUSD * (1 - discountPercentage / 100);
        const discountedBS = originalBS * (1 - discountPercentage / 100);
        
        return {
          percentage: discountPercentage,
          originalUSD: originalUSD,
          originalBS: originalBS,
          discountedUSD: discountedUSD,
          discountedBS: discountedBS,
          offersText: offersText
        };
      }
    }
    
    // Check if it's a fixed amount discount (e.g., "$5 off", "Bs 10 off")
    const fixedUSDMatch = offersText.match(/\$(\d+(?:\.\d{2})?)/i);
    const fixedBSMatch = offersText.match(/Bs\s*(\d+(?:\.\d{2})?)/i);
    
    if (fixedUSDMatch || fixedBSMatch) {
      const originalUSD = parseFloat(product.USD) || 0;
      const originalBS = parseFloat(product.Bs) || 0;
      
      let discountedUSD = originalUSD;
      let discountedBS = originalBS;
      
      if (fixedUSDMatch) {
        const discountUSD = parseFloat(fixedUSDMatch[1]);
        discountedUSD = Math.max(0, originalUSD - discountUSD);
      }
      
      if (fixedBSMatch) {
        const discountBS = parseFloat(fixedBSMatch[1]);
        discountedBS = Math.max(0, originalBS - discountBS);
      }
      
      return {
        percentage: null,
        originalUSD: originalUSD,
        originalBS: originalBS,
        discountedUSD: discountedUSD,
        discountedBS: discountedBS,
        offersText: offersText
      };
    }
  }
  
  return null;
}

function renderCartModal() {
  const cart = getCart();
  const cartItemsContainer = document.getElementById('cartItemsContainer');
  const cartSummaryContainer = document.getElementById('cartSummaryContainer');
  if (!cartItemsContainer || !cartSummaryContainer) return;
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<div class="text-center text-gray-500">Tu carrito está vacío.</div>';
    cartSummaryContainer.innerHTML = '';
    updateCartIconCount();
    return;
  }
  let totalUSD = 0, totalBS = 0, totalCount = 0;
  cartItemsContainer.innerHTML = cart.map(item => {
    const stock = parseInt(item.Stock) || 0;
    const maxQuantity = stock <= 1 ? 1 : stock;
    
    // Check for offers/discounts
    const discountInfo = calculateDiscountedPrices(item);
    const itemPriceUSD = discountInfo ? discountInfo.discountedUSD : (parseFloat(item.USD) || 0);
    // Parse BS price more carefully - handle undefined, null, and string values
    let itemPriceBS = 0;
    if (discountInfo && discountInfo.discountedBS !== undefined && discountInfo.discountedBS !== null) {
      itemPriceBS = parseFloat(discountInfo.discountedBS) || 0;
    } else if (item.Bs !== undefined && item.Bs !== null && item.Bs !== '') {
      itemPriceBS = parseFloat(item.Bs) || 0;
    }
    
    // Debug log if BS price is missing or invalid
    if (itemPriceBS === 0 && itemPriceUSD > 0) {
      console.warn('Item has USD price but missing/invalid BS price:', {
        ItemID: item.ItemID,
        Product: item.Product,
        USD: item.USD,
        Bs: item.Bs,
        hasBsField: 'Bs' in item,
        allFields: Object.keys(item)
      });
    }
    
    totalUSD += itemPriceUSD * item.quantity;
    totalBS += itemPriceBS * item.quantity;
    totalCount += item.quantity;
    
    // Get the first image for display
    const displayImage = getFirstImage(item.Image);
    
    return `
      <div class="cart-item-row">
        <img src="${displayImage}" class="cart-item-img" alt="${item.Product}" onerror="this.style.display='none'">
        <div class="cart-item-info">
          <div class="cart-item-title">${item.Product}</div>
          ${discountInfo ? `
            <div class="cart-item-price">
              <div class="cart-original-price">$${discountInfo.originalUSD.toFixed(2)} | Bs ${discountInfo.originalBS.toFixed(2)}</div>
              <div class="cart-discounted-price">$${itemPriceUSD.toFixed(2)} | Bs ${itemPriceBS.toFixed(2)}</div>
              <div class="cart-discount-badge">${discountInfo.percentage ? `${discountInfo.percentage}% OFF` : 'OFERTA'}</div>
            </div>
          ` : `
            <div class="cart-item-price">$${item.USD} | Bs ${(parseFloat(item.Bs) || 0).toFixed(2)}</div>
          `}
        </div>
        <div class="cart-item-qty-controls">
          <button class="cart-item-qty-btn" onclick="updateCartItemQty('${item.ItemID.toString()}', -1)">-</button>
          <span class="cart-item-qty">${item.quantity}</span>
          <button class="cart-item-qty-btn" onclick="updateCartItemQty('${item.ItemID.toString()}', 1)">+</button>
        </div>
      </div>
    `;
  }).join('');
  cartSummaryContainer.innerHTML = `
    <div class="cart-summary-row"><span>Items:</span><span>${totalCount}</span></div>
    <div class="cart-summary-row"><span>Total USD:</span><span>$${totalUSD.toFixed(2)}</span></div>
    <div class="cart-summary-row"><span>Total Bs:</span><span>Bs ${totalBS.toFixed(2)}</span></div>
    <div class="cart-summary-total"><span>Total:</span><span>$${totalUSD.toFixed(2)} | Bs ${totalBS.toFixed(2)}</span></div>
    <button class="cart-modal-checkout" style="width:100%;margin-top:1.5rem;" onclick="closeCartModal();navigateToCheckout();">Ir a Pagar!</button>
  `;
  updateCartIconCount();
}

function updateCartItemQty(itemId, change) {
  const cart = getCart();
  const item = cart.find(p => p.ItemID.toString() === itemId.toString());
  if (!item) return;
  const stock = parseInt(item.Stock) || 0;
  const maxQuantity = stock <= 1 ? 1 : stock;
  if (change === 1 && item.quantity >= maxQuantity) {
    showCartNotification('No hay suficiente stock disponible.');
    return;
  }
  item.quantity += change;
  if (item.quantity <= 0) {
    // Remove item from cart
    const idx = cart.findIndex(p => p.ItemID.toString() === itemId.toString());
    if (idx !== -1) cart.splice(idx, 1);
  }
  saveCart(cart);
  updateCartIconCount(); // update cart count immediately
  renderCartModal();
}

function updateCartIconCount() {
  const cart = getCart();
  let count = 0;
  cart.forEach(item => { count += item.quantity; });
  // Add badge to cart icons
  [document.getElementById('cartIconBtn'), document.getElementById('cartIconBtnMobile')].forEach(btn => {
    if (!btn) return;
    let badge = btn.querySelector('.cart-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'cart-badge';
      btn.appendChild(badge);
    }
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', updateCartIconCount);
window.addEventListener('storage', updateCartIconCount);

// Normalize text for search (removes accents, hyphens, and converts special characters to base letters)
function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') // Decompose combined characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (accents) - converts ê, é, è to e
    .replace(/-/g, '') // Remove hyphens
    .replace(/[^\w\s]/g, ' ') // Replace other special chars with space
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();
}

// Get compressed image URL for search results (faster loading)
function getCompressedImageUrl(imageUrl, width = 300, quality = 70) {
  if (!imageUrl) return '';
  
  // If it's a Cloudinary URL, add compression parameters
  if (imageUrl.includes('cloudinary.com')) {
    // Check if URL already has transformation parameters
    if (imageUrl.includes('/upload/')) {
      const parts = imageUrl.split('/upload/');
      if (parts.length === 2) {
        // Insert compression parameters before the filename
        return `${parts[0]}/upload/c_limit,w_${width},q_${quality},f_auto/${parts[1]}`;
      }
    }
  }
  
  // For non-Cloudinary URLs, return as-is (or implement other CDN compression if needed)
  return imageUrl;
}

// Preload full quality image in background
function preloadFullQualityImage(imageUrl) {
  if (!imageUrl) return;
  
  const img = new Image();
  img.src = imageUrl;
  // Image will be cached by browser for when user clicks to product detail
}

// mi bb
function setupSearch() {
  const searchInput = document.getElementById("search");
  const searchMobileInput = document.getElementById("search-mobile");
  const searchResults = document.getElementById("search-results");
  const mobileSearchResults = document.getElementById("mobile-search-results");
  const mainContent = document.getElementById("main-content");
  const searchProducts = document.getElementById("search-products");
  const noResults = document.getElementById("no-results");
  const clearSearchBtn = document.getElementById("clear-search");
  const searchLoading = document.getElementById("search-loading");
  const mobileSearchBar = document.getElementById('mobileSearchBar');

  function clearSearch() {
    if (searchInput) searchInput.value = "";
    if (searchMobileInput) searchMobileInput.value = "";
    searchResults.classList.add("hidden");
    if (mobileSearchResults) mobileSearchResults.innerHTML = "";
    
    // Reset previous search results
    previousSearchResults.mobile = null;
    previousSearchResults.desktop = null;
    
    // Close mobile search bar and show main content
    const mobileSearchBar = document.getElementById('mobileSearchBar');
    const mainContent = document.getElementById('main-content');
    const clearMobileSearchBtn = document.getElementById('clearMobileSearch');
    
    if (mobileSearchBar) mobileSearchBar.style.display = 'none';
    if (mainContent) mainContent.classList.remove('hidden');
    if (clearMobileSearchBtn) clearMobileSearchBtn.style.display = 'none';
    
    // Ensure search icon is visible
    const searchIconBtn = document.getElementById('searchIconBtn');
    if (searchIconBtn) searchIconBtn.style.display = 'block';
    
    handleRouting(); // return - volver
    searchProducts.innerHTML = "";
    noResults.classList.add("hidden");
  }

  // Track previous search results to avoid unnecessary re-renders
  let previousSearchResults = {
    mobile: null,
    desktop: null
  };

  function renderSearchResults(products, isMobile) {
    // Check if results actually changed
    const resultsKey = JSON.stringify(products.map(p => p.ItemID).sort());
    const previousKey = isMobile 
      ? (previousSearchResults.mobile ? JSON.stringify(previousSearchResults.mobile.map(p => p.ItemID).sort()) : null)
      : (previousSearchResults.desktop ? JSON.stringify(previousSearchResults.desktop.map(p => p.ItemID).sort()) : null);
    
    // If results haven't changed, don't re-render
    if (resultsKey === previousKey) {
      return;
    }
    
    // Update previous results
    if (isMobile) {
      previousSearchResults.mobile = products;
    } else {
      previousSearchResults.desktop = products;
    }
    
    if (isMobile && mobileSearchResults) {
      mobileSearchResults.innerHTML = "";
      if (!products.length) {
        mobileSearchResults.innerHTML = '<p class="text-center text-gray-500 py-8 text-lg">No se encontraron productos.</p>';
        return;
      }
      // Create a mobile-optimized grid for search results
      const resultsGrid = document.createElement('div');
      resultsGrid.className = 'grid grid-cols-1 gap-4';
      
      products.forEach(product => {
        if (product.Product && product.Image) {
          const mobileCard = renderMobileSearchCard(product, true); // Pass true to indicate search result
          resultsGrid.appendChild(mobileCard);
          
          // Preload full quality image in background
          let fullImage = product.Image;
          if (product.Image && product.Image.includes(',')) {
            fullImage = product.Image.split(',')[0].trim();
          }
          preloadFullQualityImage(fullImage);
        }
      });
      
      mobileSearchResults.appendChild(resultsGrid);
    } else {
      searchProducts.innerHTML = "";
      if (!products.length) {
        noResults.classList.remove("hidden");
        return;
      } else {
        noResults.classList.add("hidden");
      }
      products.forEach(product => {
        if (product.Product && product.Image) {
          const card = renderCard(product, true); // Pass true to indicate search result
          searchProducts.appendChild(card);
          
          // Preload full quality image in background
          let fullImage = product.Image;
          if (product.Image && product.Image.includes(',')) {
            fullImage = product.Image.split(',')[0].trim();
          }
          preloadFullQualityImage(fullImage);
        }
      });
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      const term = e.target.value.trim();
      if (!term) {
        clearSearch();
        // Reset previous results
        previousSearchResults.desktop = null;
        return;
      }
      searchTimeout = setTimeout(() => {
        const normalizedTerm = normalizeText(term);
        const filtered = allProducts.filter(product => {
          const matches = [product.Product, product.Description, product.Category, product.Collection].some(field =>
            normalizeText(field).includes(normalizedTerm)
          );
          return matches;
        });
        
        // Check if results actually changed before updating UI
        const resultsKey = JSON.stringify(filtered.map(p => p.ItemID).sort());
        const previousKey = previousSearchResults.desktop 
          ? JSON.stringify(previousSearchResults.desktop.map(p => p.ItemID).sort())
          : null;
        
        // Only update UI if results changed
        if (resultsKey !== previousKey) {
          searchLoading.classList.remove("hidden");
          hideAllPages();
          searchResults.classList.remove("hidden");
          renderSearchResults(filtered, false);
          searchLoading.classList.add("hidden");
        }
      }, 300);
    });
  }

  if (searchMobileInput) {
    const clearMobileSearchBtn = document.getElementById('clearMobileSearch');
    let isMobileSearchOpen = false;
    
    // Show/hide clear button based on input
    searchMobileInput.addEventListener("input", (e) => {
      const term = e.target.value.trim();
      if (clearMobileSearchBtn) {
        clearMobileSearchBtn.style.display = term ? 'block' : 'none';
      }
      
      clearTimeout(searchTimeout);
      // Hide main search results when overlay is open
      if (searchResults) searchResults.classList.add("hidden");
      
      if (!term) {
        if (mobileSearchResults) mobileSearchResults.innerHTML = "";
        // SHOW MAIN CONTENT AGAIN IF SEARCH IS CLEARED
        if (mainContent) mainContent.classList.remove("hidden");
        mobileSearchBar.style.display = 'none';
        isMobileSearchOpen = false;
        // Ensure search icon is visible again
        const searchIconBtn = document.getElementById('searchIconBtn');
        if (searchIconBtn) searchIconBtn.style.display = 'block';
        // Reset previous results
        previousSearchResults.mobile = null;
        return;
      }
      
      // Only hide main content and show search bar on first search (not on every keystroke)
      if (!isMobileSearchOpen) {
        // HIDE MAIN CONTENT ON MOBILE SEARCH (only first time)
        if (mainContent) mainContent.classList.add("hidden");
        isMobileSearchOpen = true;
      }
      
      // Don't show loading message on every keystroke - only update if results change
      searchTimeout = setTimeout(() => {
        const normalizedTerm = normalizeText(term);
        const filtered = allProducts.filter(product => {
          const matches = [product.Product, product.Description, product.Category, product.Collection].some(field =>
            normalizeText(field).includes(normalizedTerm)
          );
          return matches;
        });
        // Only show loading if we don't have results yet
        if (!mobileSearchResults || mobileSearchResults.innerHTML === "") {
          if (mobileSearchResults) mobileSearchResults.innerHTML = '<div class="w-full text-center py-4 text-pink-400">Buscando...</div>';
        }
        renderSearchResults(filtered, true);
      }, 300);
    });
    
    // Clear mobile search functionality
    if (clearMobileSearchBtn) {
      clearMobileSearchBtn.addEventListener("click", () => {
        searchMobileInput.value = "";
        if (mobileSearchResults) mobileSearchResults.innerHTML = "";
        if (mainContent) mainContent.classList.remove("hidden");
        mobileSearchBar.style.display = 'none';
        clearMobileSearchBtn.style.display = 'none';
        // Ensure search icon is visible again
        const searchIconBtn = document.getElementById('searchIconBtn');
        if (searchIconBtn) searchIconBtn.style.display = 'block';
      });
    }
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", clearSearch);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !searchResults.classList.contains("hidden")) {
      clearSearch();
    }
  });
}

// prduct card render
function renderCard(product, isSearchResult = false) {
  // validate product data
  if (!product || !product.ItemID || !product.Product) {
    console.warn('Invalid product data for card rendering:', product);
    return document.createElement('div'); // return empty div
  }
  
  const stock = parseInt(product.Stock) || 0;
  const maxQuantity = stock <= 1 ? 1 : stock;
  const isLowStock = stock <= 1;
  const isSoldOut = stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '';
  const cardId = `card-${product.ItemID}`;
  
  // Check for offers/discounts
  const discountInfo = calculateDiscountedPrices(product);
  
  // Debug: Log discount info for this product
  if (discountInfo) {
    console.log(`Product ${product.Product} (ID: ${product.ItemID}) has discount:`, discountInfo);
  }

  // Check if product has variants
  const hasVariants = product.variants && product.variants.length > 1;

  const div = document.createElement("div");
  div.className = "product-card-kawaii fade-in";
  // get first image from comma separated urls for the card
  let firstImage = product.Image;
  if (product.Image && product.Image.includes(',')) {
    firstImage = product.Image.split(',')[0].trim();
  }
  
  // Use compressed image for search results, full quality otherwise
  const displayImage = isSearchResult ? getCompressedImageUrl(firstImage, 300, 70) : firstImage;
  
  div.innerHTML = `
    <div class="cursor-pointer" onclick="navigateToProduct(${product.ItemID})">
      <div class="image-container relative">
        ${discountInfo ? `<div class="offer-badge-above-image">🔥 OFERTA ESPECIAL: ${discountInfo.percentage}% DE DESCUENTO</div>` : ''}
        <img src="${displayImage}" alt="${product.Product}" class="w-full h-48 object-cover rounded-t-lg" loading="lazy">
        </div>
      <div class="p-4">
        <h3 class="product-title mb-2">${product.Product}</h3>
        ${discountInfo ? `
          <div class="offer-price-section mb-3">
            <div class="original-price">
              <span class="price-usd original">$${discountInfo.originalUSD.toFixed(2)}</span>
              <span class="price-separator">|</span>
              <span class="price-bs original">Bs ${discountInfo.originalBS.toFixed(2)}</span>
            </div>
            <div class="discounted-price">
              <span class="price-usd discounted">$${discountInfo.discountedUSD.toFixed(2)}</span>
              <span class="price-separator">|</span>
              <span class="price-bs discounted">Bs ${discountInfo.discountedBS.toFixed(2)}</span>
            </div>
          </div>
        ` : `
          <p class="product-price mb-3">
            <span class="price-usd">$${product.USD}</span>
            <span class="price-separator">|</span>
            <span class="price-bs">Bs ${(parseFloat(product.Bs) || 0).toFixed(2)}</span>
          </p>
        `}
      </div>
    </div>
    
    <!-- stock warning - only show for low stock, not sold out -->
    ${isLowStock && !isSoldOut ? '<p class="stock-warning px-4 mb-3">Stock limitado</p>' : ''}

    ${hasVariants ? 
      `<!-- Product with variants - show select model button in middle -->
      <div class="px-4 py-4">
        <button class="comprar-ahora-button w-full" onclick="navigateToProduct(${product.ItemID})">
          SELECCIONAR MODELO
        </button>
      </div>
      <!-- spacer to fill remaining space -->
      <div style="flex-grow: 1;"></div>` :
      `<!-- spacer to push controls to bottom -->
      <div style="flex-grow: 1;"></div>`
    }

    ${!hasVariants ? 
      `<!-- quantity controls buttons centered at bottom - always visible -->
      <div class="quantity-controls px-4 mb-3" style="justify-content: center;">
        <button class="quantity-btn minus-btn ${isSoldOut ? 'disabled' : ''}" onclick="changeQuantity('card-${product.ItemID}', -1)" ${isSoldOut ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <span class="quantity-display" id="quantity-card-${product.ItemID}">${isSoldOut ? '0' : '1'}</span>
        <button class="quantity-btn plus-btn ${isSoldOut ? 'disabled' : ''}" onclick="changeQuantity('card-${product.ItemID}', 1)" ${isSoldOut ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      <!-- buttons section -->
      <div class="px-4 pb-4 space-y-2">
        ${isSoldOut ? 
          `<button class="sold-out-button w-full" onclick="showSoldOutMessage()">
            SOLD OUT
          </button>` : 
          `<button class="add-to-cart-small cart-icon w-full" onclick="addToCartWithQuantity('card-${product.ItemID}')">
            Agregar al carrito
          </button>
          <button class="comprar-ahora-button w-full" onclick="buyNowWithQuantity('card-${product.ItemID}')">
            COMPRAR AHORA
          </button>`
        }
      </div>` : ''
    }
  `;
  return div;
}

// Mobile-optimized search result card
function renderMobileSearchCard(product, isSearchResult = false) {
  // validate product data
  if (!product || !product.ItemID || !product.Product) {
    console.warn('Invalid product data for mobile card rendering:', product);
    return document.createElement('div'); // return empty div
  }
  
  const stock = parseInt(product.Stock) || 0;
  const isSoldOut = stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '';
  
  // Check for offers/discounts
  const discountInfo = calculateDiscountedPrices(product);

  const div = document.createElement("div");
  div.className = "mobile-search-card bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow";
  
  // get first image from comma separated urls for the card
  let firstImage = product.Image;
  if (product.Image && product.Image.includes(',')) {
    firstImage = product.Image.split(',')[0].trim();
  }
  
  // Use compressed image for search results, full quality otherwise
  const displayImage = isSearchResult ? getCompressedImageUrl(firstImage, 150, 70) : firstImage;
  
  div.innerHTML = `
    <div class="flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors p-2 -m-2 rounded-lg" onclick="handleMobileProductClick(${product.ItemID})">
      <img src="${displayImage}" alt="${product.Product}" class="w-16 h-16 object-cover rounded-lg flex-shrink-0" loading="lazy">
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-gray-800 mb-1 text-sm leading-tight line-clamp-2">${product.Product}</h3>
        <p class="text-xs text-gray-600 mb-2 line-clamp-1">${product.Description || ''}</p>
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-pink-500">
            $${product.USD} | Bs ${(parseFloat(product.Bs) || 0).toFixed(2)}
          </p>
          ${isSoldOut ? 
            '<span class="text-xs text-red-500 font-medium">SOLD OUT</span>' : 
            '<span class="text-xs text-green-500 font-medium">En stock</span>'
          }
        </div>
      </div>
    </div>
  `;
  return div;
}

// Handle mobile product click - close search and navigate
function handleMobileProductClick(productId) {
  // Close mobile search bar
  const mobileSearchBar = document.getElementById('mobileSearchBar');
  const searchMobileInput = document.getElementById('search-mobile');
  const mobileSearchResults = document.getElementById('mobile-search-results');
  const mainContent = document.getElementById('main-content');
  const clearMobileSearchBtn = document.getElementById('clearMobileSearch');
  
  if (mobileSearchBar) mobileSearchBar.style.display = 'none';
  if (searchMobileInput) searchMobileInput.value = '';
  if (mobileSearchResults) mobileSearchResults.innerHTML = '';
  if (mainContent) mainContent.classList.remove('hidden');
  if (clearMobileSearchBtn) clearMobileSearchBtn.style.display = 'none';
  
  // Navigate to product
  navigateToProduct(productId);
}

function renderProductMini(product) {
  // get first image from comma separated urls for the mini card
  let firstImage = product.Image;
  if (product.Image && product.Image.includes(',')) {
    firstImage = product.Image.split(',')[0].trim();
  }
  
  // ensure we have valid data
  if (!product.Product || !product.ItemID) {
    console.warn('Invalid product data:', product);
    return '';
  }
  
  return `
    <div class="block hover:bg-gray-100 p-3 rounded-lg cursor-pointer transition-colors" onclick="navigateToProduct(${product.ItemID})">
      <div class="flex gap-3 items-center">
        <img src="${firstImage}" alt="${product.Product}" class="w-12 h-12 object-cover rounded-lg" onerror="this.style.display='none'">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-800 mb-1 leading-tight truncate">${product.Product}</p>
          ${(() => {
            const discountInfo = calculateDiscountedPrices(product);
            if (discountInfo) {
              return `
                <div class="mini-offer-price">
                  <p class="text-xs text-gray-400 line-through">
                    $${discountInfo.originalUSD.toFixed(2)} | Bs ${discountInfo.originalBS.toFixed(2)}
                  </p>
                  <p class="text-xs font-medium" style="background: linear-gradient(135deg, #ff6b9d, #ff8fab); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                    $${discountInfo.discountedUSD.toFixed(2)} | Bs ${discountInfo.discountedBS.toFixed(2)}
                  </p>
                  <span class="mini-discount-badge">
                    ${discountInfo.percentage ? `${discountInfo.percentage}% OFF` : 'OFERTA'}
                  </span>
                </div>
              `;
            } else {
              return `
                <p class="text-xs font-medium" style="background: linear-gradient(135deg, #ff6b9d, #ff8fab); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                  $${product.USD || '0'} | Bs ${(parseFloat(product.Bs) || 0).toFixed(2)}
                </p>
              `;
            }
          })()}
        </div>
      </div>
    </div>
  `;
}

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// Check for payment success in URL parameters on page load
document.addEventListener('DOMContentLoaded', function() {
  const params = getUrlParams();
  
  // Check if we're on the success page
  if (params.page === 'payment_success' && params.idNumber) {
    console.log('Payment success page loaded with order:', params.idNumber);
    
    // Clean the order number - remove any query parameters that might be embedded
    let cleanOrderNumber = params.idNumber;
    if (cleanOrderNumber && cleanOrderNumber.includes('?')) {
      // If order number contains query params, extract just the order number part
      cleanOrderNumber = cleanOrderNumber.split('?')[0];
      console.log('Order number had query params, cleaned:', cleanOrderNumber);
    }
    
    // Always show the success page immediately
    if (window.showPaymentSuccessPage) {
      showPaymentSuccessPage(cleanOrderNumber);
    }
    
    // Prefer using pending order data (redirect flow) to finalize order and tracking
    let pendingData = null;
    try {
      pendingData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
    } catch (e) {
      pendingData = null;
    }

    const order = getOrderFromHistory(cleanOrderNumber);
    const hasPending = pendingData && Array.isArray(pendingData.cart) && pendingData.cart.length > 0;
    const tempOrderNumber = sessionStorage.getItem('tempOrderNumber') || '';
    const finalOrderNumber = tempOrderNumber || params.order || params.id || cleanOrderNumber;
    
    // Determine payment method from URL params (most reliable) or pending data
    // URL params method takes priority since it's set explicitly during redirect
    const paymentMethod = params.method || (pendingData && pendingData.paymentMethod) || (order && order.paymentMethod) || '';
    // Only treat as Cashea if explicitly Cashea - PayPal, Mercantil, etc. should not trigger Cashea logic
    // Check URL params first, then pending data payment method
    const isCasheaPayment = params.method === 'cashea' || 
                            (params.method !== 'paypal' && params.method !== 'mercantil-pm' && params.method !== 'mercantil-cc' && params.method !== 'mercantil-dc' && 
                             !params.method && hasPending && pendingData && (pendingData.paymentMethod === 'Cashea' || pendingData.paymentMethod === 'cashea'));

    // Only finalize Cashea orders if this is actually a Cashea payment
    // For PayPal and other methods, the order and payment are already saved in handleSuccessfulPayPalPayment
    if (hasPending && isCasheaPayment) {
      console.log('Finalizing Cashea order from pending data on success page...');

      // Try to fetch Cashea order details to store payment completion in sheet/tracker
      (async () => {
        try {
          // Use cleanOrderNumber or finalOrderNumber instead of params.idNumber which might have query params
          const res = await fetch(`/api/cashea-handler?action=orders&idNumber=${encodeURIComponent(finalOrderNumber)}`);
          const casheaData = await res.json().catch(() => ({}));

          // Build tracker payment data using available info
          const trackerPaymentData = {
            orderNumber: finalOrderNumber,
            casheaOrderId: casheaData?.id || casheaData?.orderId || '',
            transactionId: (casheaData?.payments && casheaData.payments[0] && (casheaData.payments[0].id || casheaData.payments[0].transactionId)) || '',
            totalUSD: pendingData.totalUSD || 0,
            totalBS: pendingData.totalBS || 0,
            paymentMethod: 'Cashea',
            customerName: (pendingData.deliveryInfo && pendingData.deliveryInfo.name) || '',
            customerEmail: (pendingData.deliveryInfo && pendingData.deliveryInfo.email) || '',
            customerPhone: (pendingData.deliveryInfo && pendingData.deliveryInfo.phone) || '',
            customerCedula: (pendingData.deliveryInfo && pendingData.deliveryInfo.cedula) || '',
            products: Array.isArray(pendingData.cart) ? pendingData.cart.map(i => i.Product).join(', ') : '',
            quantities: Array.isArray(pendingData.cart) ? pendingData.cart.map(i => i.quantity).join(', ') : '',
            deliveryMethod: pendingData.deliveryMethod || '',
            customerAddress: (pendingData.deliveryInfo && (pendingData.deliveryInfo.address || pendingData.deliveryInfo.officeAddress)) || '',
            courier: pendingData.deliveryInfo ? pendingData.deliveryInfo.courier : '',
            state: pendingData.deliveryInfo ? pendingData.deliveryInfo.state : '',
            office: pendingData.deliveryInfo ? pendingData.deliveryInfo.office : '',
            officeAddress: pendingData.deliveryInfo ? pendingData.deliveryInfo.officeAddress : '',
            emailText: pendingData.deliveryInfo ? pendingData.deliveryInfo.emailText : '',
            rawCasheaData: casheaData
          };

          // Validate payment status before saving
          // If API call failed or returned error, try to save anyway using pending data (order/payment already saved in handleSuccessfulCasheaPayment)
          const hasError = casheaData?.error || !casheaData || Object.keys(casheaData).length === 0;
          const casheaPaymentStatus = casheaData?.status || casheaData?.paymentStatus || 
                                    (casheaData?.payments && casheaData.payments[0]?.status);
          const validStatuses = ['paid', 'Paid', 'PAID', 'completed', 'Completed', 'COMPLETED', 'success', 'Success', 'SUCCESS'];
          const isPaymentSuccessful = validStatuses.includes(casheaPaymentStatus);
          
          // If API call failed, don't try to save payment here - it should already be saved in handleSuccessfulCasheaPayment
          // Only save if we got valid data from API
          if (hasError) {
            console.warn('Could not fetch Cashea order from API (may be SSL issue), but order/payment should already be saved in handleSuccessfulCasheaPayment');
            console.log('Payment data from API:', casheaData);
            return;
          }
          
          if (!isPaymentSuccessful) {
            console.error('Cannot save payment - Cashea payment not successful. Status:', casheaPaymentStatus);
            console.error('Payment data:', casheaData);
            // DO NOT save payment if it's not successful
            return;
          }
          
          if (window.savePaymentCompletion) {
            try {
              // Ensure payment status is correct
              trackerPaymentData.status = 'completed';
              window.savePaymentCompletion(trackerPaymentData, function(response){
                if (response && response.success) {
                  console.log('Saved Cashea payment completion from success page.');
                } else {
                  console.error('Failed to save payment completion:', response);
                }
              });
            } catch (e) {
              console.error('Failed to save payment completion:', e);
            }
          }
        } catch (err) {
          console.warn('Could not fetch Cashea order details for tracker:', err);
        }

        // Order should already exist (created in handleSuccessfulCasheaPayment)
        // DO NOT create order here - it would create duplicates
        // Just verify payment status before saving payment
        console.log('Order should already exist from handleSuccessfulCasheaPayment');
      })();
    } else if (hasPending && !isCasheaPayment) {
      // For non-Cashea payments (PayPal, Mercantil, etc.), order and payment are already saved
      // Just confirm success page is shown properly
      console.log(`${paymentMethod || 'Payment'} success - order and payment already saved. Showing success page.`);
      // Success page is already shown above, no need to do anything else
    } else if (order && (order.paymentMethod === 'cashea' || params.method === 'cashea')) {
      // If order already exists in history, ensure success page renders properly
      console.log('Cashea payment success detected with existing order.');
      // Re-render success page to show order details
      if (window.renderPaymentSuccessPage) {
        renderPaymentSuccessPage(finalOrderNumber);
      }
      // Order already exists, no need to create again
      // createOrderAfterApiPayment will check and skip if order exists
    } else {
      // No pending data and no order in history - just show success message
      // This happens when payment succeeded but order data isn't available yet
      console.log('Payment success but order data not available yet, showing success message');
      // DO NOT create order here - orders should only be created after verified successful payment
    }
  }
});

function uniqueValues(list, key) {
  const set = new Set();
  list.forEach(item => {
    const values = (item[key] || "").split(",").map(v => v.trim());
    values.forEach(v => { if (v) set.add(v); });
  });
  return [...set];
}

function renderTagButtons(containerId, values, key, products, outputId, isCollection = false) {
  const box = document.getElementById(containerId);
  const output = document.getElementById(outputId);
  
  if (!box || !output) {
    console.error(`Elements not found: ${containerId} or ${outputId}`);
    return;
  }
  
  // Ensure icon maps are initialized
  if (isCollection && !window.collectionIconsMap) {
    window.collectionIconsMap = {};
    console.warn('Collection icons map not initialized, creating empty map');
  }
  if (!isCollection && !window.categoryIconsMap) {
    window.categoryIconsMap = {};
    console.warn('Category icons map not initialized, creating empty map');
  }
  
  box.innerHTML = "";
  output.innerHTML = "";
 

  values.forEach(name => {
    const trimmedName = name.trim();
    const iconMap = isCollection ? window.collectionIconsMap : window.categoryIconsMap;
    
    // Debug logging (only log once per render, not for every item)
    if (values.indexOf(name) === 0) {
      console.log(`Rendering ${isCollection ? 'collections' : 'categories'}:`, {
        total: values.length,
        mapExists: !!iconMap,
        mapSize: iconMap ? Object.keys(iconMap).length : 0,
        sampleKeys: iconMap ? Object.keys(iconMap).slice(0, 5) : [],
        firstItem: trimmedName
      });
    }
    
    // Get icon - try exact match first, then case-insensitive
    let icon = '♡';
    if (iconMap) {
      // Try exact match first
      if (iconMap[trimmedName]) {
        icon = iconMap[trimmedName];
      } else if (iconMap[name]) {
        icon = iconMap[name];
      } else {
        // Try case-insensitive match
        const matchingKey = Object.keys(iconMap).find(key => 
          key.trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (matchingKey) {
          icon = iconMap[matchingKey];
        }
      }
    }
    
    if (!iconMap || icon === '♡') {
      console.warn(`Icon not found for ${isCollection ? 'collection' : 'category'}: "${trimmedName}"`, {
        availableKeys: iconMap ? Object.keys(iconMap).slice(0, 10) : 'map not initialized',
        mapExists: !!iconMap,
        searchedFor: [trimmedName, name]
      });
    }
    
    // Create card (works for both categories and collections)
    const card = document.createElement("div");
    card.className = "group cursor-pointer hover-lift";
    
    // Create icon container div to properly render SVG or image
    const iconContainer = document.createElement("div");
    iconContainer.className = "flex justify-center items-center mb-3 w-8 h-8 mx-auto";
    
    if (icon && icon !== '♡') {
      iconContainer.innerHTML = icon;
    } else {
      iconContainer.textContent = '♡';
    }
    
    card.innerHTML = `
      <div class="bg-white rounded-xl p-4 text-center kawaii-shadow hover:shadow-lg transition-all">
        <h3 class="font-medium text-sm text-gray-900">${name}</h3>
      </div>
    `;
    
    // Insert icon before the title
    const cardContent = card.querySelector('.bg-white');
    cardContent.insertBefore(iconContainer, cardContent.querySelector('h3'));
    card.onclick = () => {
      if (isCollection) {
        navigateToCollection(name);
      } else {
        navigateToCategory(name);
      }
    };
    box.appendChild(card);
  });
}

function renderDropdownLinks(containerId, list, type) {
  const box = document.getElementById(containerId);
  if (!box) {
    console.error(`Element not found: ${containerId}`);
    return;
  }
  
  box.innerHTML = "";
  list.forEach(name => {
    const link = document.createElement("a");
    link.href = "#";
    link.className = "block text-sm text-gray-700 hover:text-pink-500 mb-1 px-2 py-1 rounded hover:bg-pink-50";
    link.textContent = name;
    link.onclick = (e) => {
      e.preventDefault();
      if (type === 'category') {
        navigateToCategory(name);
      } else {
        navigateToCollection(name);
      }
    };
    box.appendChild(link);
  });
}

// order history and tracking functions
function getOrderHistory() {
  const history = localStorage.getItem('orderHistory');
  return history ? JSON.parse(history) : [];
}

function displayOrderHistory() {
  const history = getOrderHistory();
  if (history.length === 0) {
    return '<div class="text-center text-gray-500 py-8">No hay órdenes en tu historial.</div>';
  }
  
  return history.map(order => {
    const orderDate = new Date(order.orderDate).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const itemsList = order.items.map(item => 
      `<div class="text-sm text-gray-600">• ${item.product} x${item.quantity}</div>`
    ).join('');
    
    // determine if order can be reprocessed (pending, apartado, or ending status)
    const canReprocess = order.status === 'pending' || order.status === 'apartado' || order.status === 'ending';
    
    // determines if order can be deleted (only pending)
    const canDelete = order.status === 'pending';
    
    // get order number from spreadsheet if available, otherwise use local
    const displayOrderNumber = order.spreadsheetOrderNumber || order.orderNumber || 'ORD-ERROR';
    
    return `
      <div class="order-history-item" style="
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        background: white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      ">
        <!-- Header: Order ID and Status -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: bold; color: #ff6b9d; font-size: 16px;">${displayOrderNumber}</div>
          <div style="
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            background: ${getStatusBackgroundColor(order.status)};
            color: ${getStatusTextColor(order.status)};
          ">
            ${getStatusDisplayText(order.status)}
          </div>
        </div>
        
        <!-- Date and Payment Method -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #6b7280;">${orderDate}</div>
          <div style="font-size: 12px; color: #6b7280;">${getPaymentMethodLabel(order.paymentMethod)}</div>
        </div>
        
        <!-- Items (compact) -->
        <div style="margin-bottom: 8px; font-size: 12px; color: #374151;">
          ${order.items.length} producto${order.items.length > 1 ? 's' : ''} • $${order.totalUSD.toFixed(2)}
          ${order.deliveryMethod === 'delivery' ? ` • ${getDeliveryMethodEmoji(order.deliveryType || 'delivery')} ${order.deliveryType === 'delivery-national' ? 'Envío Nacionales' : 'Entrega a domicilio'}` : ''}
        </div>
        
        <!-- Action Buttons (compact) -->
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button onclick="viewOrderDetails('${order.orderNumber}')" 
                  style="
                    padding: 4px 8px;
                    background: #f3f4f6;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #374151;
                    cursor: pointer;
                    transition: all 0.2s;
                  " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
            📋 Detalles
          </button>
          
          <button onclick="contactSupport('${order.orderNumber}')" 
                  style="
                    padding: 4px 8px;
                    background: #dbeafe;
                    border: 1px solid #93c5fd;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #1e40af;
                    cursor: pointer;
                    transition: all 0.2s;
                  " onmouseover="this.style.background='#bfdbfe'" onmouseout="this.style.background='#dbeafe'">
            💬 Ayuda
          </button>
          
          ${canDelete ? `
            <button onclick="deleteOrder('${order.orderNumber}')" 
                    style="
                      padding: 4px 8px;
                      background: #fee2e2;
                      border: 1px solid #fca5a5;
                      border-radius: 4px;
                      font-size: 11px;
                      color: #dc2626;
                      cursor: pointer;
                      transition: all 0.2s;
                    " onmouseover="this.style.background='#fecaca'" onmouseout="this.style.background='#fee2e2'">
              🗑️ Eliminar
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function showOrderHistoryModal() {
  const modal = document.createElement('div');
  modal.className = 'order-history-modal-overlay';
  modal.innerHTML = `
    <div class="order-history-modal">
      <button class="order-history-modal-close" onclick="closeOrderHistoryModal()">&times;</button>
      <h2 class="order-history-modal-title">Historial de Órdenes</h2>
      <div id="orderHistoryContent">
        ${displayOrderHistory()}
      </div>
      <div style="text-align: center; margin-top: 16px;">
        <button onclick="clearOrderHistory()" style="
          padding: 8px 16px;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        " onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
          🗑️ Limpiar Historial
        </button>

      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Automatically sync statuses when modal opens
  syncAllOrderStatusesSilently();
  
  // close modal when clicking outside (like cart modal)
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeOrderHistoryModal();
    }
  });
}

function closeOrderHistoryModal() {
  const modal = document.querySelector('.order-history-modal-overlay');
  if (modal) {
    modal.remove();
  }
}

// expose functions globally
window.showOrderHistoryModal = showOrderHistoryModal;
window.closeOrderHistoryModal = closeOrderHistoryModal;
window.addToCart = addToCart;
window.addToCartWithQuantity = addToCartWithQuantity;
window.buyNowWithQuantity = buyNowWithQuantity;
window.toggleAccordion = toggleAccordion;
window.changeQuantity = changeQuantity;
window.showSoldOutMessage = showSoldOutMessage;
window.switchToVariant = switchToVariant;
window.changeImage = changeImage;
window.renderVariantOptions = renderVariantOptions;
window.goToImage = goToImage;
window.navigateToHome = navigateToHome;
window.navigateToProduct = navigateToProduct;
window.navigateToCheckout = navigateToCheckout;
window.deleteOrder = deleteOrder;
window.showDeleteConfirmationPopup = showDeleteConfirmationPopup;
window.closeDeleteConfirmationPopup = closeDeleteConfirmationPopup;
window.confirmDeleteOrder = confirmDeleteOrder;
window.showDeletePopup = showDeletePopup;
window.closeDeletePopup = closeDeletePopup;
window.showClearHistoryConfirmationPopup = showClearHistoryConfirmationPopup;
window.closeClearHistoryConfirmationPopup = closeClearHistoryConfirmationPopup;
window.confirmClearOrderHistory = confirmClearOrderHistory;
window.showUniversalReprocessPage = showUniversalReprocessPage;
window.loadOrderForReprocess = loadOrderForReprocess;
window.previewUniversalPaymentImage = previewUniversalPaymentImage;
window.removeUniversalPaymentImage = removeUniversalPaymentImage;
window.submitUniversalReprocessedPayment = submitUniversalReprocessedPayment;
window.navigateToCategory = navigateToCategory;
window.navigateToCollection = navigateToCollection;
window.openCartModal = openCartModal;
window.closeCartModal = closeCartModal;
window.updateCartItemQty = updateCartItemQty;
window.showReprocessPaymentModal = showReprocessPaymentModal;
window.closeReprocessPaymentModal = closeReprocessPaymentModal;
window.submitReprocessedPayment = submitReprocessedPayment;
window.previewNewPaymentImage = previewNewPaymentImage;
window.removeNewPaymentImage = removeNewPaymentImage;
window.clearOrderHistory = clearOrderHistory;
window.cleanCorruptedOrders = cleanCorruptedOrders;

// payment processing functions
function renderPaymentPage(method, orderNumber) {
  const paymentContent = document.getElementById('paymentContent');
  if (!paymentContent) return;
  
  // Check if this is a pending order (from new flow) or existing order
  const pendingOrderData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
  const isPendingOrder = pendingOrderData.cart && pendingOrderData.cart.length > 0;
  
  let order;
  
  if (isPendingOrder) {
    // Use pending order data
    order = {
      orderNumber: orderNumber,
      totalUSD: pendingOrderData.totalUSD,
      totalBS: pendingOrderData.totalBS,
      items: pendingOrderData.cart.map(item => ({
        product: item.Product,
        quantity: item.quantity,
        priceUSD: item.USD,
        priceBS: item.Bs
      })),
      orderDate: new Date().toISOString(),
      paymentMethod: pendingOrderData.paymentMethod,
      deliveryMethod: pendingOrderData.deliveryMethod,
      deliveryInfo: pendingOrderData.deliveryInfo,
      deliveryType: pendingOrderData.deliveryType
    };
    console.log('Using pending order data for payment page:', order);
    
    // NOTE: Orders are now created ONLY after successful payment confirmation
    // We do NOT create orders proactively to avoid creating orders for failed payments
    
    // Save the initial order to tracker (includes cédula)
    if (window.saveOrderToTracker) {
      console.log('Saving initial order to tracker with cédula:', order.deliveryInfo?.cedula);
      window.saveOrderToTracker(order, function(response) {
        if (response.success) {
          console.log('Initial order saved to tracker successfully');
        } else {
          console.error('Failed to save initial order to tracker:', response.error);
        }
      });
    }
  } else {
    // get order from history
    order = getOrderFromHistory(orderNumber);
    if (!order) {
      paymentContent.innerHTML = '<div class="text-center text-red-500">Orden no encontrada.</div>';
      return;
    }
    console.log('Using existing order from history:', order);
  }
  
  // Clear cart for non-PayPal payment methods since they don't have automatic payment processing
/*  if (method == 'paypal') {
    localStorage.removeItem('cart');
    console.log(`Cart cleared for ${method} payment method`);
    updateCartIconCount(); // Update cart icon count
  }
*/
  if (["paypal", "pago-movil", "debito", "credito", "cashea"].includes(method)) {
    //Allowed methods - does nothing
    console.log(`Cart kept for ${method} payment method`);
  } else {
    //any other payment method - clears cart
    localStorage.removeItem('cart');
    console.log(`Cart cleared for ${method} payment method`);
    updateCartIconCount(); //updates cart icon count
  }

  const methodLabels = {
    'paypal': 'PayPal',
    'zelle': 'Zelle',
    'binance': 'Binance',
    'pago-movil': 'Pago Móvil',
    'debito': 'Debito',
    'credito': 'Credito',
    'cashea': 'Cashea'
  };
  
  const methodLabel = methodLabels[method] || method;
  
  paymentContent.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 class="text-xl font-bold mb-4 text-center">${methodLabel}</h3>
      
      <!-- Order Summary -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
        <div class="text-sm text-gray-600">
          <div><strong>Orden:</strong> ${order.orderNumber || orderNumber}</div>
          <div><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</div>
          <div><strong>Fecha:</strong> ${new Date(order.orderDate).toLocaleDateString('es-ES')}</div>
        </div>
      </div>
      
      <!-- Payment Information -->
      <div class="mb-6 p-4 bg-blue-50 rounded-lg">
        <h4 class="font-semibold mb-3 text-blue-800">💳 Información de Pago</h4>
        ${method === 'pago-movil' ? `
          <div class="space-y-3">
            <p class="text-sm text-gray-700 mb-3">Pague de forma segura con Pago Móvil Mercantil</p>
            <button 
              data-mercantil-type="pago-movil"
              data-order-number="${order.orderNumber || orderNumber}"
              data-total-usd="${order.totalUSD}"
              data-total-bs="${order.totalBS}"
              class="mercantil-payment-button w-full"
            >
              <span class="icon">📱</span>
              <span>Pagar con Pago Móvil Mercantil</span>
            </button>
          </div>
          ` : method === 'cashea' ? `
          <div class="space-y-3 text-sm">
            <div id="cashea-payment-widget" class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div id="cashea-button-container"></div>
            </div>
          </div>
        ` : method === 'debito' ? `
          <div class="space-y-3">
            <p class="text-sm text-gray-700 mb-3">Pague de forma segura con Tarjeta de Débito Mercantil</p>
            <button 
              data-mercantil-type="debito"
              data-order-number="${order.orderNumber || orderNumber}"
              data-total-usd="${order.totalUSD}"
              data-total-bs="${order.totalBS}"
              class="mercantil-payment-button w-full"
            >
              <span class="icon">💳</span>
              <span>Pagar con Tarjeta de Débito</span>
            </button>
          </div>
        ` : method === 'credito' ? `
          <div class="space-y-3">
            <p class="text-sm text-gray-700 mb-3">Pague de forma segura con Tarjeta de Crédito Mercantil</p>
            <button 
              data-mercantil-type="credito"
              data-order-number="${order.orderNumber || orderNumber}"
              data-total-usd="${order.totalUSD}"
              data-total-bs="${order.totalBS}"
              class="mercantil-payment-button w-full"
            >
              <span class="icon">💳</span>
              <span>Pagar con Tarjeta de Crédito</span>
            </button>
          </div>
        ` : method === 'paypal' ? `
          <div class="space-y-3 text-sm">
            <div id="paypal-payment-widget" class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div id="paypal-button-container-payment"></div>
            </div>
            
          </div>
        ` : method === 'binance' ? `
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Binance ID:</span>
              <span class="text-gray-900">381425060</span>
            </div>
            <div class="text-center">
              <a href="https://www.binance.com" target="_blank" 
                 class="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
                <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                Abrir Binance
              </a>
            </div>
          </div>
        ` : method === 'zelle' ? `
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Email:</span>
              <span class="text-gray-900">info@venegroupservices.com</span>
            </div>
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Nombre:</span>
              <span class="text-gray-900">Venegroup Services Inc</span>
            </div>
            <div class="text-center">
              <a href="https://www.zellepay.com" target="_blank" 
                 class="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Abrir Zelle
              </a>
            </div>
          </div>
        ` : method === 'zinli' ? `
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Usuario:</span>
              <span class="text-gray-900">@indigostore</span>
            </div>
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Teléfono:</span>
              <span class="text-gray-900">+58 414-123-4567</span>
            </div>
            <div class="text-center">
              <a href="https://www.zinli.com" target="_blank" 
                 class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Abrir Zinli
              </a>
            </div>
          </div>
        ` : `
          <p class="text-blue-700 text-sm">Información de pago no disponible para este método.</p>
        `}
        <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p class="text-yellow-800 text-sm font-medium">
            ⚠️ Completa el pago y contacta soporte con tu comprobante
          </p>
        </div>
      </div>
      
      <!-- Payment Instructions -->
      <div class="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 class="font-semibold mb-3 text-blue-800">📋 Instrucciones de Pago</h4>
        <div class="space-y-3 text-sm text-blue-700">
          <p>1. Haz clic en el botón de pago correspondiente a tu método</p>
          <p>2. Completa el pago en la plataforma externa</p>
          <p>3. Guarda el comprobante de pago</p>
          <p>4. Contacta a soporte con tu número de orden</p>
        </div>
      </div>
      

      
      <!-- Order Summary for Reference -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-3 text-gray-800">📋 Resumen de tu Orden</h4>
        <div class="text-sm text-gray-600 space-y-2">
          <div><strong>Número de Orden:</strong> ${order.orderNumber || orderNumber}</div>
          <div><strong>Total a Pagar:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</div>
          <div><strong>Método de Pago:</strong> ${methodLabel}</div>
          <div><strong>Estado:</strong> <span class="text-orange-600 font-medium">Pendiente de Pago</span></div>
        </div>
      </div>
      
      <!-- Contact Information -->
      <div class="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <h4 class="font-semibold mb-3 text-yellow-800">📞 Contacto para Confirmación</h4>
        <div class="space-y-2 text-sm text-yellow-700">
          <p><strong>WhatsApp:</strong> <a href="https://wa.me/584128503608" target="_blank" class="text-blue-600 hover:underline">+58 412-850-3608</a></p>
          <p><strong>Menciona tu orden:</strong> ${order.orderNumber}</p>
          <p class="text-xs mt-2">Envía el comprobante de pago por WhatsApp para confirmar tu orden</p>
        </div>
      </div>
    </div>
  `;
  
  // Initialize PayPal button if method is paypal
  if (method === 'paypal') {
    setTimeout(() => {
      initializePayPalButton(order);
    }, 100);
  }

  // Initialize Cashea button if method is cashea
  if (method === 'cashea') {
    setTimeout(() => {
      initializeCasheaButton(order);
    }, 100);
  }
  
  // Initialize Mercantil button event listeners
  if (method === 'pago-movil' || method === 'debito' || method === 'credito') {
    setTimeout(() => {
      initializeMercantilButtons(order);
    }, 100);
  }
}

// Function to initialize Mercantil payment buttons
function initializeMercantilButtons(order) {
  // Find all Mercantil buttons and attach event listeners
  const buttons = document.querySelectorAll('[data-mercantil-type]');
  
  buttons.forEach(button => {
    button.addEventListener('click', function() {
      const type = this.getAttribute('data-mercantil-type');
      const orderNumber = this.getAttribute('data-order-number');
      const totalUSD = parseFloat(this.getAttribute('data-total-usd') || '0');
      const totalBS = parseFloat(this.getAttribute('data-total-bs') || '0');
      
      // Get deliveryInfo from order if available
      const deliveryInfo = order.deliveryInfo || {};
      
      // Prepare order data for modal
      const orderData = {
        orderNumber: orderNumber,
        totalUSD: totalUSD,
        totalBS: totalBS,
        deliveryInfo: deliveryInfo
      };
      
      // Call the appropriate modal function
      try {
        if (type === 'pago-movil' && typeof window.showPagoMovilModal === 'function') {
          window.showPagoMovilModal(orderData);
        } else if (type === 'debito' && typeof window.showDebitCardModal === 'function') {
          window.showDebitCardModal(orderData);
        } else if (type === 'credito' && typeof window.showCreditCardModal === 'function') {
          window.showCreditCardModal(orderData);
        } else {
          console.error('Mercantil modal function not available:', type);
          alert('Error: La función de pago no está disponible. Por favor, recarga la página.');
        }
      } catch (error) {
        console.error('Error opening Mercantil modal:', error);
        alert('Error al abrir el formulario de pago. Por favor, intenta nuevamente.');
      }
    });
  });
  
  console.log('Mercantil buttons initialized:', buttons.length);
}

// Function to initialize PayPal button with order details
async function initializePayPalButton(order) {
  // Load PayPal SDK if not already loaded
  if (!window.paypal) {
    try {
      const response = await fetch('/api/config/paypal');
      if (!response.ok) {
        throw new Error(`PayPal config endpoint returned ${response.status}`);
      }
      const config = await response.json();
      
      if (!config.clientId) {
        console.error('PAYPAL_CLIENT_ID not configured in environment variables');
        alert('PayPal is not configured. Please contact the store administrator.');
        return;
      }
      
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${config.clientId}&currency=USD`;
      script.onload = () => {
        renderPayPalButton(order);
      };
      script.onerror = () => {
        console.error('Failed to load PayPal SDK script');
        alert('Could not load PayPal. Please try again or contact support.');
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to load PayPal config:', error);
      alert('Could not load PayPal payment system. Please try again or contact support.');
    }
  } else {
    renderPayPalButton(order);
  }
}

// Function to render PayPal button
function renderPayPalButton(order) {
  const container = document.getElementById('paypal-button-container-payment');
  if (!container) return;
  
  // Clear any existing buttons
  container.innerHTML = '';
  
  window.paypal.Buttons({

    createOrder: function(data, actions) {
      return fetch('/api/paypal/paypal_create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: order.totalUSD.toFixed(2),
          orderNumber: order.orderNumber,
          orderDetails: {
            items: order.items,
            deliveryMethod: order.deliveryMethod,
            deliveryInfo: order.deliveryInfo
          }
        })
      }).then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            console.error('PayPal create order error response:', errData);
            throw new Error(`PayPal create order failed: ${res.status} ${res.statusText}. ${errData.error || errData.message || ''}`);
          });
        }
        return res.json();
      }).then(orderData => {
        if (!orderData || !orderData.id) {
          console.error('PayPal create order response missing order ID:', orderData);
          throw new Error('PayPal order creation failed: No order ID received');
        }
        return orderData.id;
      }).catch(error => {
        console.error('PayPal create order error:', error);
        throw error;
      });
    },

    onApprove: function(data, actions) {
      return fetch('/api/paypal/paypal_capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderID: data.orderID })
      }).then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            console.error('PayPal capture error response:', errData);
            throw new Error(`PayPal capture failed: ${res.status} ${res.statusText}. ${errData.error || errData.message || ''}`);
          });
        }
        return res.json();
      }).then(details => {
        // Process successful payment
        handleSuccessfulPayPalPayment(details, order);
      }).catch(error => {
        console.error('PayPal capture error:', error);
        alert(`Error al procesar el pago de PayPal: ${error.message || 'Error desconocido'}`);
        throw error;
      });
    },

    onError: function(err) {
      console.error('PayPal Error:', err);
      console.error('PayPal Error Details:', JSON.stringify(err, null, 2));
      
      // Show more detailed error message
      let errorMessage = 'Error en el pago de PayPal. ';
      if (err && err.message) {
        errorMessage += err.message;
      } else if (err && err.name) {
        errorMessage += `Error: ${err.name}`;
      } else {
        errorMessage += 'Por favor, inténtalo de nuevo o contacta al soporte.';
      }
      
      alert(errorMessage);
      
      // Log to console for debugging
      console.error('Full PayPal error object:', err);
    }
  }).render('#paypal-button-container-payment');
}

// ===== Cashea Integration =====
let casheaSdkLoaded = false;
function loadCasheaSdkIfNeeded(callback) {
  if (casheaSdkLoaded) { 
    console.log('Cashea SDK already loaded, calling callback');
    callback(); 
    return; 
  }
  
  const existing = document.querySelector('script[data-cashea-sdk]');
  if (existing) { 
    console.log('Cashea SDK script already exists, marking as loaded');
    casheaSdkLoaded = true; 
    callback(); 
    return; 
  }
  
  console.log('Loading Cashea SDK...');
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/cashea-web-checkout-sdk@latest/dist/webcheckout-sdk.min.js';
  script.async = true;
  script.setAttribute('data-cashea-sdk', '1');
  
  script.onload = () => { 
    console.log('Cashea SDK script loaded successfully');
    casheaSdkLoaded = true; 
    
    // Check if WebCheckoutSDK is available after loading
    if (typeof WebCheckoutSDK !== 'undefined') {
      console.log('WebCheckoutSDK loaded successfully');
      callback(); 
    } else {
      console.error('WebCheckoutSDK is not available after script load');
      alert('Error: SDK de Cashea no se cargó correctamente');
    }
  };
  
  script.onerror = (error) => { 
    console.error('Error loading Cashea SDK script:', error);
    alert('No se pudo cargar el SDK de Cashea. Verifica tu conexión a internet.'); 
  };
  
  document.head.appendChild(script);
}

async function initializeCasheaButton(order) {
  try {
    // Enforce minimum amount for Cashea
    const totalUSD = Number(order && order.totalUSD ? order.totalUSD : 0);
    if (isNaN(totalUSD) || totalUSD < 25) {
      alert('El mínimo para pagar con Cashea es $25 USD.');
      return;
    }

    const cfgRes = await fetch('/api/cashea-handler?action=config');
    
    // Check if response is OK and is JSON
    if (!cfgRes.ok) {
      const errorText = await cfgRes.text();
      console.error('Cashea config API error:', {
        status: cfgRes.status,
        statusText: cfgRes.statusText,
        response: errorText.substring(0, 200)
      });
      alert(`Error obteniendo configuración de Cashea: ${cfgRes.status} ${cfgRes.statusText}`);
      return;
    }
    
    // Check content type before parsing
    const contentType = cfgRes.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await cfgRes.text();
      console.error('Cashea config API returned non-JSON:', {
        contentType: contentType,
        response: responseText.substring(0, 500)
      });
      alert('Error: El servidor no respondió con JSON válido. Verifica la configuración del API.');
      return;
    }
    
    const cfg = await cfgRes.json();
    if (!cfg || !cfg.publicApiKey || !cfg.externalClientId) { 
      alert('Configuración de Cashea incompleta'); 
      return; 
    }

    // Get identification number (cédula) from saved order OR live checkout form
    let idNumber = '';
    if (order && order.deliveryInfo && order.deliveryInfo.cedula) {
      idNumber = String(order.deliveryInfo.cedula || '');
    }
    if (!idNumber) {
      const cedulaInput = document.getElementById('customerCedula');
      if (cedulaInput && cedulaInput.value) {
        idNumber = String(cedulaInput.value);
      }
    }
    idNumber = (idNumber || '').trim();
    if (!idNumber) { alert('Debes proporcionar la cédula en el checkout para usar Cashea.'); return; }
    // Keep only digits
    idNumber = idNumber.replace(/[^0-9]/g, '');

    const products = (order.items || []).map(item => {
      const id = String(item.itemId || item.ItemID || item.product || '');
      let skuVal = String(item.sku || item.SKU || '').trim();
      if (!skuVal) {
        skuVal = id || `SKU-${order.orderNumber}`;
      }
      
      // Ensure description is not empty - use product name as fallback
      let description = String(item.description || '').trim();
      if (!description) {
        description = String(item.product || 'Producto de Indigo Store');
      }
      
      // Ensure imageUrl is not empty - use a default image as fallback
      let imageUrl = String(item.imageUrl || item.Image || '').trim();
      if (!imageUrl) {
        // Try to get the first image from the Image field if available
        const firstImage = getFirstImage(item.Image || '');
        if (firstImage) {
          imageUrl = firstImage;
        } else {
          // Use a default placeholder image
          imageUrl = 'https://via.placeholder.com/300x300/FF69B4/FFFFFF?text=Indigo+Store';
        }
      } else {
        // If we have an imageUrl, make sure it's the first image if it's comma-separated
        imageUrl = getFirstImage(imageUrl);
      }
      
      return {
        id,
        name: String(item.product || item.Product || ''),
        sku: skuVal,
        description: description,
        imageUrl: imageUrl,
        quantity: Number(item.quantity || 1),
        price: Number(item.priceUSD || item.USD || 0),
        tax: 0,
        discount: 0
      };
    });

    // Validate all products have required fields
    const validProducts = products.filter(p => {
      const isValid = p.id && p.name && typeof p.quantity === 'number' && typeof p.price === 'number';
      if (!isValid) {
        console.error('Invalid Cashea product:', p);
      }
      return isValid;
    });
    
    if (validProducts.length === 0) {
      alert('Error: No hay productos válidos para procesar con Cashea.');
      return;
    }
    
    const payload = {
      identificationNumber: String(idNumber),
      externalClientId: String(cfg.externalClientId || ''),
      deliveryMethod: 'IN_STORE',
      merchantName: 'Indigo Store',
      redirectUrl: `${location.origin}/?page=payment_success&idNumber=${order.orderNumber}`,
      invoiceId: String(order.orderNumber || ''),
      deliveryPrice: 0,
      orders: [
        { store: { id: 21977, name: 'Web Indigo Store', enabled: true }, products: validProducts }
      ]
    };
    
    // Validate payload before sending
    console.log('Cashea payload:', JSON.stringify(payload, null, 2));
    
    // Check for any invalid values that might cause doctype errors
    if (!payload.identificationNumber || !payload.externalClientId || !payload.invoiceId) {
      alert('Error: Datos incompletos para Cashea. Por favor, verifica tu información.');
      return;
    }

    loadCasheaSdkIfNeeded(() => {
      const container = document.getElementById('cashea-button-container');
      if (!container) return;
      
      // Ensure container has proper mobile styling
      container.style.width = '100%';
      container.style.maxWidth = '100%';
      container.style.boxSizing = 'border-box';
      
      // Check if WebCheckoutSDK is available
      if (typeof WebCheckoutSDK === 'undefined') {
        console.error('WebCheckoutSDK is not available');
        container.innerHTML = '<div class="text-red-500 text-center p-4">Error: SDK de Cashea no disponible</div>';
        return;
      }
      
      // Avoid duplicating button
      container.innerHTML = '';
      
      try {
        const sdk = new WebCheckoutSDK({ apiKey: cfg.publicApiKey });
        
        console.log('Cashea SDK instance created');
        
        // Check if sdk has the on method
        if (typeof sdk.on !== 'function') {
          console.error('WebCheckoutSDK does not have on method');
          console.log('Available methods:', Object.getOwnPropertyNames(sdk).concat(Object.getOwnPropertyNames(Object.getPrototypeOf(sdk))));
          
          // Try alternative approach - create button without event handlers first
          try {
            sdk.createCheckoutButton({ payload, container });
            console.log('Button created without event handlers');
          } catch (buttonError) {
            console.error('Error creating button:', buttonError);
            container.innerHTML = '<div class="text-red-500 text-center p-4">Error: SDK de Cashea no compatible - ' + buttonError.message + '</div>';
          }
          return;
        }
        
        // Try different event handling approaches
        if (typeof sdk.addEventListener === 'function') {
          // Try addEventListener approach
          sdk.addEventListener('checkout:success', async (data) => {
            console.log('Cashea payment successful (addEventListener):', data);
            await handleSuccessfulCasheaPayment(data, order);
          });
          
          sdk.addEventListener('checkout:error', (error) => {
            console.error('Cashea payment error (addEventListener):', error);
            alert('Error: El pago de Cashea falló. Por favor, intenta nuevamente o contacta soporte.');
            // Payment failed - don't create order
          });
        } else if (typeof sdk.on === 'function') {
          // Try on method approach
          sdk.on('checkout:success', async (data) => {
            console.log('Cashea payment successful (on method):', data);
            await handleSuccessfulCasheaPayment(data, order);
          });
          
          sdk.on('checkout:error', (error) => {
            console.error('Cashea payment error (on method):', error);
            alert('Error: El pago de Cashea falló. Por favor, intenta nuevamente o contacta soporte.');
            // Payment failed - don't create order
          });
        } else {
          console.log('No event handling methods found, creating button without handlers');
        }
        
        // Create button with callbacks if available
        const buttonOptions = { payload, container };
        
        // Try to add callbacks if the SDK supports them
        if (typeof sdk.createCheckoutButton === 'function') {
          try {
            sdk.createCheckoutButton(buttonOptions);
            console.log('Cashea button created successfully');
            
            // Apply mobile styles after button is created
            setTimeout(() => {
              const button = container.querySelector('button');
              if (button) {
                button.style.width = '100%';
                button.style.maxWidth = '100%';
                button.style.boxSizing = 'border-box';
                // Ensure button is responsive on mobile
                if (window.innerWidth <= 640) {
                  button.style.fontSize = '14px';
                  button.style.padding = '12px 16px';
                }
              }
              
              // Also check for any nested elements
              const allButtons = container.querySelectorAll('button, [role="button"], .cashea-button, [class*="cashea"]');
              allButtons.forEach(btn => {
                btn.style.width = '100%';
                btn.style.maxWidth = '100%';
                btn.style.boxSizing = 'border-box';
              });
            }, 100);
          } catch (buttonError) {
            console.error('Error creating Cashea button:', buttonError);
            container.innerHTML = '<div class="text-red-500 text-center p-4">Error creando botón de Cashea: ' + buttonError.message + '</div>';
          }
        } else {
          console.error('createCheckoutButton method not available');
          container.innerHTML = '<div class="text-red-500 text-center p-4">Error: Método createCheckoutButton no disponible</div>';
        }
      } catch (sdkError) {
        console.error('Error creating Cashea SDK:', sdkError);
        container.innerHTML = '<div class="text-red-500 text-center p-4">Error creando SDK de Cashea: ' + sdkError.message + '</div>';
      }
    });
  } catch (e) {
    console.error('Error preparando Cashea:', e);
    console.error('Error stack:', e.stack);
    let errorMessage = 'Error preparando Cashea: ' + e.message;
    if (e.message && (e.message.includes('JSON') || e.message.includes('DOCTYPE'))) {
      errorMessage += '\n\nEl servidor no respondió con JSON válido. Esto puede deberse a:\n';
      errorMessage += '1. La ruta del API no está configurada correctamente\n';
      errorMessage += '2. El servidor está devolviendo una página de error HTML\n';
      errorMessage += '3. Verifica que el endpoint /api/cashea-handler esté funcionando';
    }
    alert(errorMessage);
  }
}

// Function to handle successful PayPal payment
function handleSuccessfulPayPalPayment(paypalDetails, originalOrder) {
  console.log('PayPal payment details received:', paypalDetails);
  
  // Validate payment success - check for required fields
  const transactionId = paypalDetails.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  const paymentStatus = paypalDetails.status || paypalDetails.purchase_units?.[0]?.payments?.captures?.[0]?.status;
  
  if (!transactionId || (paymentStatus && paymentStatus !== 'COMPLETED' && paymentStatus !== 'completed')) {
    console.error('PayPal payment validation failed:', {
      transactionId,
      paymentStatus,
      paypalDetails
    });
    
    // Show error message to user
    alert('Error: El pago de PayPal no se completó correctamente. Por favor, intenta nuevamente o contacta soporte.');
    
    // Clear cart and redirect to home
    localStorage.removeItem('cart');
    if (window.updateCartIconCount) window.updateCartIconCount();
    window.location.href = '/';
    return;
  }
  
  // Extract payment data safely with fallbacks
  const payerName = paypalDetails.payer?.name?.given_name || 'Customer';
  const payerLastName = paypalDetails.payer?.name?.surname || '';
  const fullName = `${payerName} ${payerLastName}`.trim();
  
  // Get payment amount - try multiple possible locations
  let totalUSD = originalOrder.totalUSD || 0;
  if (paypalDetails.purchase_units && paypalDetails.purchase_units[0] && paypalDetails.purchase_units[0].amount) {
    totalUSD = parseFloat(paypalDetails.purchase_units[0].amount.value) || totalUSD;
  }
  
  // Close PayPal popup if it exists
  try {
    // Check if we're in a popup window
    if (window.opener && !window.opener.closed) {
      console.log('Closing PayPal popup window');
      window.close();
    } else if (window.parent && window.parent !== window) {
      // If we're in an iframe, try to close the parent
      console.log('Attempting to close parent window');
      window.parent.close();
    }
  } catch (e) {
    console.log('Could not close popup window:', e);
  }
  
  // Build address information based on delivery type
  let addressInfo = '';
  let cedulaInfo = '';
  
  if (originalOrder.deliveryType === 'delivery-national' && originalOrder.deliveryInfo) {
    // For national shipping: Office + State + Delivery Company
    const { courier, office, state } = originalOrder.deliveryInfo;
    if (courier && office && state) {
      addressInfo = `${office}, ${state}, ${courier}`;
    }
  } else if (originalOrder.deliveryInfo && originalOrder.deliveryInfo.address) {
    // For home delivery: Customer's address
    addressInfo = originalOrder.deliveryInfo.address;
  }
  
  // Cédula goes in NOTAS column (mapped to customerPhone in the script)
  if (originalOrder.deliveryInfo && originalOrder.deliveryInfo.cedula) {
    cedulaInfo = `Cédula: ${originalOrder.deliveryInfo.cedula}`;
  }

  // Prepare payment data for Google Sheets
  const paymentData = {
    action: 'savePayment',
    orderNumber: originalOrder.orderNumber,
    paypalOrderId: paypalDetails.id || '',
    transactionId: paypalDetails.purchase_units?.[0]?.payments?.captures?.[0]?.id || '',
    paymentMethod: 'PayPal',
    totalUSD: totalUSD,
    status: 'completed',
    customerName: addressInfo,     // This goes to column M (DIRECCION)
    customerEmail: paypalDetails.payer?.email_address || '',
    customerAddress: fullName,     // Customer name goes here
    customerPhone: cedulaInfo,     // This goes to column N (NOTAS)
    paymentDate: new Date().toISOString()
  };
  
  // NEW: Save payment completion to tracking system (primary method)
  const trackerPaymentData = {
    orderNumber: originalOrder.orderNumber,
    paypalOrderId: paypalDetails.id || '',
    transactionId: paypalDetails.purchase_units?.[0]?.payments?.captures?.[0]?.id || '',
    totalUSD: totalUSD,
    totalBS: originalOrder.totalBS || 0,
    paymentMethod: 'PayPal',
    customerName: fullName,
    customerEmail: paypalDetails.payer?.email_address || '',
    customerPhone: paypalDetails.payer?.phone?.phone_number?.national_number || '',
    customerCedula: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.cedula : '',
    products: originalOrder.items ? originalOrder.items.map(item => item.product || item.Product).join(', ') : '',
    quantities: originalOrder.items ? originalOrder.items.map(item => item.quantity).join(', ') : '',
    deliveryMethod: originalOrder.deliveryMethod || '',
    deliveryType: originalOrder.deliveryType || '',
    customerAddress: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.address : '',
    deliveryInstructions: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.instructions : '',
    // National shipping specific fields
    courier: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.courier : '',
    state: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.state : '',
    office: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.office : '',
    officeAddress: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.officeAddress : '',
    emailText: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.emailText : '',
    rawPayPalData: paypalDetails,
    // Include supabaseOrderId if available
    supabaseOrderId: originalOrder.supabaseOrderId || localStorage.getItem(`order_${originalOrder.orderNumber}_supabase_id`)
  };
  
  // Create order in Supabase ONLY after successful payment validation
  // Use a flag to prevent duplicate creation
  if (!window.paypalOrdersBeingCreated) {
    window.paypalOrdersBeingCreated = new Set();
  }
  
  const orderNumber = originalOrder.orderNumber;
  if (window.paypalOrdersBeingCreated.has(orderNumber)) {
    console.warn('Order creation already in progress for:', orderNumber);
    return;
  }
  
  window.paypalOrdersBeingCreated.add(orderNumber);
  
  async function createOrderAndSavePayment() {
    try {
      // Check if order already exists first (prevent duplicates)
      let orderId = localStorage.getItem(`order_${orderNumber}_supabase_id`);
      let orderExists = false;
      
      if (orderId && typeof getSupabaseClient !== 'undefined') {
        try {
          const supabase = await getSupabaseClient();
          const { data: existingOrder } = await supabase
            .from('orders')
            .select('id, order_number')
            .eq('order_number', orderNumber)
            .single();
          
          if (existingOrder && existingOrder.id) {
            orderId = existingOrder.id;
            orderExists = true;
            console.log('Order already exists in Supabase, skipping duplicate creation:', orderId);
          }
        } catch (error) {
          console.warn('Could not check for existing order:', error);
        }
      }
      
      // Create order only if it doesn't exist
      if (!orderExists) {
        if (window.saveOrderToSupabase) {
          const orderData = {
            orderNumber: orderNumber,
            orderDate: originalOrder.orderDate || new Date().toISOString(),
            items: originalOrder.items || [],
            totalUSD: totalUSD,
            totalBS: originalOrder.totalBS || 0,
            paymentMethod: 'PayPal',
            status: 'pending',
            deliveryMethod: originalOrder.deliveryMethod || '',
            deliveryType: originalOrder.deliveryType || '',
            deliveryInfo: originalOrder.deliveryInfo || {}
          };
          
          try {
            const newOrder = await window.saveOrderToSupabase(orderData);
            if (newOrder && newOrder.id) {
              orderId = newOrder.id;
              localStorage.setItem(`order_${orderNumber}_supabase_id`, orderId);
              console.log('Order created in Supabase after successful PayPal payment:', orderId);
            } else {
              throw new Error('Order creation returned no ID');
            }
          } catch (orderError) {
            console.error('Failed to create order in Supabase:', orderError);
            window.paypalOrdersBeingCreated.delete(orderNumber);
            alert('Error: No se pudo crear la orden. Por favor, contacta soporte con tu número de orden: ' + orderNumber);
            return;
          }
        } else {
          console.error('saveOrderToSupabase function not available!');
          window.paypalOrdersBeingCreated.delete(orderNumber);
          alert('Error: Sistema no disponible. Por favor, contacta soporte.');
          return;
        }
      }
      
      // Add order ID to payment data
      if (orderId) {
        trackerPaymentData.supabaseOrderId = orderId;
      }
      
      // Save order data to sessionStorage FIRST so success page can render immediately
      if (window.saveOrderToHistory && originalOrder) {
        try {
          const orderWithPayment = {
            ...originalOrder,
            status: 'completed', // Show as completed to customer
            paymentMethod: 'PayPal',
            supabaseOrderId: orderId
          };
          window.saveOrderToHistory(orderWithPayment);
          console.log('Order saved to history for success page');
        } catch (error) {
          console.error('Error saving order to history:', error);
        }
      }
      
      // Store order data in sessionStorage as backup for success page (do this immediately)
      try {
        const orderForSuccess = {
          orderNumber: orderNumber,
          totalUSD: totalUSD,
          totalBS: originalOrder.totalBS || 0,
          items: originalOrder.items || [],
          orderDate: originalOrder.orderDate || new Date().toISOString(),
          paymentMethod: 'PayPal',
          status: 'completed',
          deliveryMethod: originalOrder.deliveryMethod || '',
          deliveryInfo: originalOrder.deliveryInfo || {}
        };
        sessionStorage.setItem('lastSuccessfulOrder', JSON.stringify(orderForSuccess));
        console.log('Order data stored in sessionStorage for success page');
      } catch (error) {
        console.error('Error storing order in sessionStorage:', error);
      }
      
      // Update local order status immediately (for UI display)
      updateLocalOrderStatus(orderNumber, 'pago procesado');
      
      // Clear cart after successful payment
      localStorage.removeItem('cart');
      if (window.updateCartIconCount) window.updateCartIconCount();
      console.log('Cart cleared after successful PayPal payment processing');
      
      // Save payment with order ID - use Promise with timeout to avoid long delays
      if (window.savePaymentCompletion && orderId) {
        console.log('Saving payment with order ID:', orderId);
        const paymentSavePromise = new Promise((resolve) => {
          savePaymentCompletion(trackerPaymentData, function(trackerResponse) {
            if (trackerResponse && trackerResponse.success) {
              console.log('Payment saved to Supabase successfully:', trackerResponse);
            } else {
              console.error('Failed to save payment to Supabase:', trackerResponse);
            }
            resolve(trackerResponse);
          });
        });
        
        // Wait for payment save but with a timeout - don't block redirect too long
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second max wait
        await Promise.race([paymentSavePromise, timeoutPromise]);
      } else {
        console.error('savePaymentCompletion function not available! Check if checkout.js is loaded.');
      }
      
      // Redirect to success page - order data is already in sessionStorage so page can render immediately
      const successUrl = `${window.location.origin}/?page=payment_success&idNumber=${orderNumber}&method=paypal`;
      console.log('Redirecting to PayPal payment success page:', successUrl);
      window.location.href = successUrl;
      
    } catch (error) {
      console.error('Error in createOrderAndSavePayment:', error);
      alert('Error procesando el pago. Por favor, contacta soporte.');
    } finally {
      window.paypalOrdersBeingCreated.delete(orderNumber);
    }
  }
  
  // Call async function to create order and save payment
  createOrderAndSavePayment();
}

// Function to handle successful Cashea payment
async function handleSuccessfulCasheaPayment(casheaDetails, originalOrder) {
  console.log('Cashea payment details received:', casheaDetails);
  
  // Clear any old sessionStorage data to prevent showing wrong order
  sessionStorage.removeItem('lastSuccessfulOrder');
  
  // Validate payment success - check for required fields AND actual payment status
  const casheaOrderId = casheaDetails.orderId || casheaDetails.id;
  const transactionId = casheaDetails.transactionId || casheaDetails.id;
  
  // Check payment status - could be in multiple places
  let paymentStatus = casheaDetails.status || casheaDetails.paymentStatus || casheaDetails.payment?.status;
  
  // Check if there are payments array and get status from there
  if (!paymentStatus && casheaDetails.payments && Array.isArray(casheaDetails.payments) && casheaDetails.payments.length > 0) {
    paymentStatus = casheaDetails.payments[0].status || casheaDetails.payments[0].paymentStatus;
  }
  
  // Validate required fields
  if (!casheaOrderId || !transactionId) {
    console.error('Cashea payment validation failed - missing required fields:', {
      casheaOrderId,
      transactionId,
      paymentStatus,
      casheaDetails
    });
    
    // Show error message to user with a delay before redirect to ensure user sees it
    alert('Error: El pago de Cashea no se completó correctamente. Por favor, intenta nuevamente o contacta soporte.');
    
    // DO NOT create order or save payment - payment failed
    // Wait a bit before redirecting so user can see the error message
    setTimeout(() => {
      localStorage.removeItem('cart');
      if (window.updateCartIconCount) window.updateCartIconCount();
      window.location.href = '/';
    }, 2000); // 2 second delay to ensure user sees the error
    return;
  }
  
  // Validate payment status - must be paid/completed
  // Also verify payment status from Cashea API if possible
  const validStatuses = ['paid', 'Paid', 'PAID', 'completed', 'Completed', 'COMPLETED', 'success', 'Success', 'SUCCESS'];
  let isPaymentSuccessful = validStatuses.includes(paymentStatus);
  
  // If status is not clearly successful, try to verify from Cashea API
  if (!isPaymentSuccessful && casheaOrderId) {
    try {
      console.log('Verifying payment status from Cashea API...');
      const verifyResponse = await fetch(`/api/cashea-handler?action=orders&idNumber=${encodeURIComponent(casheaOrderId)}`);
      const verifyData = await verifyResponse.json().catch(() => ({}));
      
      // Check verified payment status
      const verifiedStatus = verifyData?.status || verifyData?.paymentStatus || 
                            (verifyData?.payments && verifyData.payments[0]?.status);
      
      if (verifiedStatus && validStatuses.includes(verifiedStatus)) {
        isPaymentSuccessful = true;
        paymentStatus = verifiedStatus;
        console.log('Payment verified as successful from Cashea API:', verifiedStatus);
      } else {
        console.error('Payment verification failed - status from API:', verifiedStatus);
      }
    } catch (verifyError) {
      console.warn('Could not verify payment status from API, using local status:', verifyError);
      // Continue with local validation
    }
  }
  
  if (!isPaymentSuccessful) {
    console.error('Cashea payment validation failed - payment not successful:', {
      casheaOrderId,
      transactionId,
      paymentStatus,
      casheaDetails
    });
    
    // Show error message to user with a delay before redirect to ensure user sees it
    const errorMsg = 'Error: El pago de Cashea no fue completado exitosamente. Estado: ' + (paymentStatus || 'desconocido') + '. Por favor, intenta nuevamente o contacta soporte.';
    alert(errorMsg);
    
    // DO NOT create order or save payment - payment failed
    // Wait a bit before redirecting so user can see the error message
    setTimeout(() => {
      localStorage.removeItem('cart');
      if (window.updateCartIconCount) window.updateCartIconCount();
      window.location.href = '/';
    }, 2000); // 2 second delay to ensure user sees the error
    return;
  }
  
  console.log('Cashea payment validated successfully:', {
    casheaOrderId,
    transactionId,
    paymentStatus
  });
  
  // Extract payment data safely with fallbacks
  const customerName = casheaDetails.customer?.name || (originalOrder.deliveryInfo && originalOrder.deliveryInfo.name) || 'Customer';
  const totalUSD = originalOrder.totalUSD || 0;
  
  // Build address information based on delivery type
  let addressInfo = '';
  let cedulaInfo = '';
  
  if (originalOrder.deliveryType === 'delivery-national' && originalOrder.deliveryInfo) {
    // For national shipping: Office + State + Delivery Company
    const { courier, office, state } = originalOrder.deliveryInfo;
    if (courier && office && state) {
      addressInfo = `${office}, ${state}, ${courier}`;
    }
  } else if (originalOrder.deliveryInfo && originalOrder.deliveryInfo.address) {
    // For home delivery: Customer's address
    addressInfo = originalOrder.deliveryInfo.address;
  }
  
  // Cédula goes in NOTAS column (mapped to customerPhone in the script)
  if (originalOrder.deliveryInfo && originalOrder.deliveryInfo.cedula) {
    cedulaInfo = `Cédula: ${originalOrder.deliveryInfo.cedula}`;
  }
  
  // Prepare payment data for Google Sheets
  const paymentData = {
    action: 'savePayment',
    orderNumber: originalOrder.orderNumber,
    casheaOrderId: casheaDetails.orderId || '',
    transactionId: casheaDetails.transactionId || casheaDetails.id || '',
    paymentMethod: 'Cashea',
    totalUSD: totalUSD,
    status: 'completed',
    customerName: addressInfo,     // This goes to column M (DIRECCION)
    customerEmail: casheaDetails.customer?.email || (originalOrder.deliveryInfo && originalOrder.deliveryInfo.email) || '',
    customerAddress: customerName, // Customer name goes here
    customerPhone: cedulaInfo,     // This goes to column N (NOTAS)
    paymentDate: new Date().toISOString()
  };
  
  // NEW: Save payment completion to tracking system (primary method)
  const trackerPaymentData = {
    orderNumber: originalOrder.orderNumber,
    casheaOrderId: casheaDetails.orderId || '',
    transactionId: casheaDetails.transactionId || casheaDetails.id || '',
    totalUSD: totalUSD,
    totalBS: originalOrder.totalBS || 0,
    paymentMethod: 'Cashea',
    customerName: customerName,
    customerEmail: casheaDetails.customer?.email || (originalOrder.deliveryInfo && originalOrder.deliveryInfo.email) || '',
    customerPhone: casheaDetails.customer?.phone || (originalOrder.deliveryInfo && originalOrder.deliveryInfo.phone) || '',
    customerCedula: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.cedula : '',
    products: originalOrder.items ? originalOrder.items.map(item => item.product || item.Product).join(', ') : '',
    quantities: originalOrder.items ? originalOrder.items.map(item => item.quantity).join(', ') : '',
    deliveryMethod: originalOrder.deliveryMethod || '',
    deliveryType: originalOrder.deliveryType || '',
    customerAddress: originalOrder.deliveryInfo ? (originalOrder.deliveryInfo.address || (`${originalOrder.deliveryInfo.office || ''}${originalOrder.deliveryInfo.state ? ', ' + originalOrder.deliveryInfo.state : ''}${originalOrder.deliveryInfo.courier ? ', ' + originalOrder.deliveryInfo.courier : ''}`).trim()) : '',
    deliveryInstructions: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.instructions : '',
    // National shipping specific fields
    courier: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.courier : '',
    state: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.state : '',
    office: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.office : '',
    officeAddress: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.officeAddress : '',
    emailText: originalOrder.deliveryInfo ? originalOrder.deliveryInfo.emailText : '',
    rawCasheaData: casheaDetails,
    // Include supabaseOrderId if available (will be set in ensureOrderAndSavePayment)
    supabaseOrderId: originalOrder.supabaseOrderId || localStorage.getItem(`order_${originalOrder.orderNumber}_supabase_id`)
  };
  
  // Create order in Supabase ONLY after successful payment validation
  // Use a flag to prevent duplicate creation
  if (!window.casheaOrdersBeingCreated) {
    window.casheaOrdersBeingCreated = new Set();
  }
  
  const orderNumber = originalOrder.orderNumber;
  if (window.casheaOrdersBeingCreated.has(orderNumber)) {
    console.warn('Order creation already in progress for:', orderNumber);
    return;
  }
  
  window.casheaOrdersBeingCreated.add(orderNumber);
  
  async function createOrderAndSavePayment() {
    try {
      // Check if order already exists first (prevent duplicates)
      let orderId = localStorage.getItem(`order_${orderNumber}_supabase_id`);
      let orderExists = false;
      
      if (orderId && typeof getSupabaseClient !== 'undefined') {
        try {
          const supabase = await getSupabaseClient();
          const { data: existingOrder } = await supabase
            .from('orders')
            .select('id, order_number')
            .eq('order_number', orderNumber)
            .single();
          
          if (existingOrder && existingOrder.id) {
            orderId = existingOrder.id;
            orderExists = true;
            console.log('Order already exists in Supabase, skipping duplicate creation:', orderId);
          }
        } catch (error) {
          console.warn('Could not check for existing order:', error);
        }
      }
      
      // Create order only if it doesn't exist
      if (!orderExists) {
        if (window.saveOrderToSupabase) {
          const orderData = {
            orderNumber: orderNumber,
            orderDate: originalOrder.orderDate || new Date().toISOString(),
            items: originalOrder.items || [],
            totalUSD: totalUSD,
            totalBS: originalOrder.totalBS || 0,
            paymentMethod: 'Cashea',
            status: 'pending',
            deliveryMethod: originalOrder.deliveryMethod || '',
            deliveryType: originalOrder.deliveryType || '',
            deliveryInfo: originalOrder.deliveryInfo || {}
          };
          
          try {
            const newOrder = await window.saveOrderToSupabase(orderData);
            if (newOrder && newOrder.id) {
              orderId = newOrder.id;
              localStorage.setItem(`order_${orderNumber}_supabase_id`, orderId);
              console.log('Order created in Supabase after successful Cashea payment:', orderId);
            } else {
              throw new Error('Order creation returned no ID');
            }
          } catch (orderError) {
            console.error('Failed to create order in Supabase:', orderError);
            alert('Error: No se pudo crear la orden. Por favor, contacta soporte con tu número de orden: ' + orderNumber);
            window.casheaOrdersBeingCreated.delete(orderNumber);
            return;
          }
        } else {
          console.error('saveOrderToSupabase function not available!');
          alert('Error: Sistema no disponible. Por favor, contacta soporte.');
          window.casheaOrdersBeingCreated.delete(orderNumber);
          return;
        }
      }
      
      // Add order ID to payment data
      if (orderId) {
        trackerPaymentData.supabaseOrderId = orderId;
      }
      
      // Now save payment with status='completed' only if payment is actually successful
      let paymentSaved = false;
      if (!orderId) {
        console.error('Cannot save payment - orderId is missing!');
        alert('Error: No se pudo obtener el ID de la orden. Por favor, contacta soporte.');
        window.casheaOrdersBeingCreated.delete(orderNumber);
        return;
      }
      
      if (window.savePaymentCompletion) {
        console.log('Saving payment with order ID:', orderId);
        // Ensure payment status is 'completed' since we validated it above
        trackerPaymentData.status = 'completed';
        await new Promise((resolve) => {
          savePaymentCompletion(trackerPaymentData, function(trackerResponse) {
            if (trackerResponse && trackerResponse.success) {
              console.log('Payment saved to Supabase successfully!', trackerResponse);
              paymentSaved = true;
            } else {
              console.error('Failed to save payment to Supabase:', trackerResponse);
              // Don't block redirect, but log the error
            }
            resolve(trackerResponse);
          });
        });
        
        if (!paymentSaved) {
          console.warn('Payment save may have failed, but continuing to success page');
        }
      } else {
        console.error('savePaymentCompletion function not available! Check if checkout.js is loaded.');
        alert('Error: Sistema de pago no disponible. Por favor, contacta soporte.');
        window.casheaOrdersBeingCreated.delete(orderNumber);
        return;
      }
      
      // Save order to history for success page display
      if (window.saveOrderToHistory && originalOrder) {
        try {
          const orderWithPayment = {
            ...originalOrder,
            status: 'completed', // Show as completed to customer
            paymentMethod: 'Cashea',
            supabaseOrderId: orderId
          };
          window.saveOrderToHistory(orderWithPayment);
          console.log('Order saved to history for success page');
        } catch (error) {
          console.error('Error saving order to history:', error);
        }
      }
      
      // Clear any old successful order data first to prevent showing wrong order
      sessionStorage.removeItem('lastSuccessfulOrder');
      
      // Store order data in sessionStorage as backup for success page
      try {
        const orderForSuccess = {
          orderNumber: orderNumber,
          totalUSD: totalUSD,
          totalBS: originalOrder.totalBS || 0,
          items: originalOrder.items || [],
          orderDate: originalOrder.orderDate || new Date().toISOString(),
          paymentMethod: 'Cashea',
          status: 'completed',
          deliveryMethod: originalOrder.deliveryMethod || '',
          deliveryInfo: originalOrder.deliveryInfo || {},
          supabaseOrderId: orderId // Include order ID for reference
        };
        sessionStorage.setItem('lastSuccessfulOrder', JSON.stringify(orderForSuccess));
        console.log('Order data stored in sessionStorage for success page:', {
          orderNumber,
          orderId,
          totalUSD
        });
      } catch (error) {
        console.error('Error storing order in sessionStorage:', error);
      }
      
      // Update local order status immediately (for UI display)
      updateLocalOrderStatus(orderNumber, 'pago procesado');
      
      // Clear cart after successful payment
      localStorage.removeItem('cart');
      if (window.updateCartIconCount) window.updateCartIconCount();
      console.log('Cart cleared after successful Cashea payment processing');
      
      // Redirect to success page AFTER order and payment are saved
      const successUrl = `${window.location.origin}/?page=payment_success&idNumber=${orderNumber}&method=cashea`;
      console.log('Redirecting to Cashea payment success page:', successUrl);
      window.location.href = successUrl;
      
    } catch (error) {
      console.error('Error in createOrderAndSavePayment:', error);
      alert('Error procesando el pago. Por favor, contacta soporte.');
    } finally {
      window.casheaOrdersBeingCreated.delete(orderNumber);
    }
  }
  
  // Call async function to create order and save payment - wait for it to complete
  await createOrderAndSavePayment();
  
  // Try to send to old system (optional, don't block on failure - do this in background)
  sendToGoogleSheets(paymentData, function(response) {
    if (response.success) {
      console.log('Payment saved to old system successfully');
    } else {
      console.log('Old system payment save failed (ignored):', response.error);
    }
  });
  
  // DEPRECATED: Try to update order status in old system (but don't depend on it)
  // TODO: Remove once migration is complete
  const orderUpdateData = {
    action: 'updateOrderStatus',
    orderNumber: originalOrder.orderNumber,
    status: 'pago procesado',
    paymentMethod: 'Cashea',
    transactionId: paymentData.transactionId
  };
  
  try {
    sendToGoogleSheets(orderUpdateData, function(updateResponse) {
      if (updateResponse.success) {
        console.log('Order status updated in old system successfully');
      } else {
        console.log('Error updating order status in old system (ignored):', updateResponse.error);
      }
    });
  } catch (error) {
    console.warn('Google Sheets update failed (expected during migration):', error);
  }
  
  // Note: Orders are always kept as "pending" in database for customization
  // Payment status is saved as "completed" but order status remains "pending"
  // The UI can display "completed" to customers based on payment status
  // No need to update order status in Supabase - it stays as "pending"
  
  // Redirect happens inside createOrderAndSavePayment after everything is saved
}

// Function to update local order status
function updateLocalOrderStatus(orderNumber, newStatus) {
  const history = getOrderHistory();
  const orderIndex = history.findIndex(order => order.orderNumber === orderNumber);
  
  if (orderIndex !== -1) {
    history[orderIndex].status = newStatus;
    localStorage.setItem('orderHistory', JSON.stringify(history));
  }
}

// Function to open payment platforms
function openPaymentPlatform(method) {
  const paymentUrls = {
    'paypal': 'https://www.paypal.me/indigostore',
    'zelle': 'https://www.zellepay.com',
    'binance': 'https://www.binance.com',
    'pago-movil': null, // Pago móvil doesn't have a direct URL
    'zinli': 'https://www.zinli.com'
  };
  
  const url = paymentUrls[method];
  
  if (url) {
    // Open payment platform in new tab
    window.open(url, '_blank');
    
    // Show success message
    const notification = document.createElement('div');
    notification.className = 'payment-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
        z-index: 10000;
        max-width: 300px;
        animation: slideInRight 0.5s ease-out;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 40px;
            height: 40px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
          ">
            💳
          </div>
          <div>
            <div style="font-weight: bold; margin-bottom: 4px;">¡Plataforma abierta!</div>
            <div style="font-size: 14px; opacity: 0.9;">Completa tu pago y contacta soporte</div>
          </div>
        </div>
      </div>
    `;
    
    // Add animation styles if not already present
    if (!document.getElementById('payment-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'payment-notification-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  } else if (method === 'pago-movil') {
    // For Pago Móvil, show the payment information
    alert('Para Pago Móvil, usa la información mostrada en la página. Banco: Mercantil, Número: 0412-849-5036, Cédula: 28256608');
  } else {
    alert('Método de pago no reconocido');
  }
}

// Expose function globally
window.openPaymentPlatform = openPaymentPlatform;

function renderApartadoPage(orderNumber) {
  const apartadoContent = document.getElementById('apartadoContent');
  if (!apartadoContent) return;
  
  // Check if this is a pending order (from new flow) or existing order
  const pendingOrderData = JSON.parse(sessionStorage.getItem('pendingOrderData') || '{}');
  const isPendingOrder = pendingOrderData.cart && pendingOrderData.cart.length > 0;
  
  let order, paymentMethod, totalUSD, totalBS;
  
  if (isPendingOrder) {
    // Use pending order data
    order = {
      orderNumber: orderNumber,
      totalUSD: pendingOrderData.totalUSD,
      totalBS: pendingOrderData.totalBS,
      items: pendingOrderData.cart.map(item => ({
        product: item.Product,
        quantity: item.quantity,
        priceUSD: item.USD,
        priceBS: item.Bs
      })),
      orderDate: new Date().toISOString(),
      deliveryMethod: pendingOrderData.deliveryMethod,
      deliveryInfo: pendingOrderData.deliveryInfo,
      deliveryType: pendingOrderData.deliveryType
    };
    paymentMethod = pendingOrderData.paymentMethod;
    totalUSD = pendingOrderData.totalUSD;
    totalBS = pendingOrderData.totalBS;
    
    // Save the initial order to tracker (includes cédula)
    if (window.saveOrderToTracker) {
      console.log('Saving initial apartado order to tracker with cédula:', order.deliveryInfo?.cedula);
      order.paymentMethod = paymentMethod; // Add payment method to order
      window.saveOrderToTracker(order, function(response) {
        if (response.success) {
          console.log('Initial apartado order saved to tracker successfully');
        } else {
          console.error('Failed to save initial apartado order to tracker:', response.error);
        }
      });
    }
  } else {
    // Get order from history
    order = getOrderFromHistory(orderNumber);
    if (!order) {
      apartadoContent.innerHTML = '<div class="text-center text-red-500">Orden no encontrada.</div>';
      return;
    }
    paymentMethod = order.paymentMethod || 'efectivo';
    totalUSD = order.totalUSD;
    totalBS = order.totalBS;
  }
  
  // Determine if this is a manual payment method
  const manualPaymentMethods = ['zelle', 'binance', 'zinli', 'efectivo'];
  const isManualPayment = manualPaymentMethods.includes(paymentMethod);
  
  // Get payment method label
  const methodLabels = {
    'zelle': 'Zelle',
    'binance': 'Binance',
    'zinli': 'Zinli',
    'efectivo': 'Efectivo',
    'paypal': 'PayPal',
    'cashea': 'Cashea',
    'pago-movil': 'Pago Móvil',
    'debito': 'Tarjeta de Débito',
    'credito': 'Tarjeta de Crédito'
  };
  
  const methodLabel = methodLabels[paymentMethod] || paymentMethod;
  
  apartadoContent.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 class="text-xl font-bold mb-4 text-center">${isPendingOrder ? 'Información de Pago' : 'Información de Apartado'}</h3>
      
      <!-- Order Summary -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
        <div class="text-sm text-gray-600">
          <div><strong>Orden:</strong> ${order.orderNumber || orderNumber}</div>
          <div><strong>Total:</strong> $${totalUSD.toFixed(2)} | Bs ${totalBS.toFixed(2)}</div>
          <div><strong>Fecha:</strong> ${new Date(order.orderDate).toLocaleDateString('es-ES')}</div>
          <div><strong>Método de Pago:</strong> ${methodLabel}</div>
          <div><strong>Estado:</strong> <span class="text-orange-600 font-semibold">${isPendingOrder ? 'Pendiente de Confirmación' : 'Apartado'}</span></div>
        </div>
      </div>
      
      <!-- Items List -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Productos</h4>
        <div class="space-y-2">
          ${order.items.map(item => `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
              <div>
                <div class="font-medium">${item.product}</div>
                <div class="text-sm text-gray-600">Cantidad: ${item.quantity}</div>
              </div>
              <div class="text-right">
                <div class="font-medium">$${item.priceUSD} | Bs ${item.priceBS}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      ${isPendingOrder ? `
        <!-- Payment Information for Manual Methods -->
        <div class="mb-6 p-4 bg-blue-50 rounded-lg">
          <h4 class="font-semibold mb-3 text-blue-800">💳 Información de Pago</h4>
          ${getPaymentInformation(paymentMethod)}
        </div>
        
        <!-- Confirm Order Button for Manual Methods -->
        ${isManualPayment ? `
          <div class="mb-6 text-center">
            <button onclick="createOrderForManualPayment()" 
                    class="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-lg">
              ✅ Confirmar Orden
            </button>
            <p class="text-sm text-gray-600 mt-2">Haz clic para crear tu orden y proceder al pago</p>
          </div>
        ` : ''}
      ` : `
        <!-- Address Information for Existing Orders -->
        <div class="mb-6">
          <h4 class="font-semibold mb-2">Dirección para Recoger</h4>
          <div class="p-4 bg-blue-50 rounded-lg">
            <p class="text-blue-800 font-medium">Indigo Store</p>
            <p class="text-blue-700 text-sm">Carrera 19 con Avenida Vargas, CC Capital Plaza, Local 80</p>
            <p class="text-blue-700 text-sm">Horario: 9:00 AM - 5:00 PM, Lunes a Sábado</p>
          </div>
        </div>
        
        <!-- Google Maps Widget -->
        <div class="mb-6">
          <h4 class="font-semibold mb-2">Ubicación</h4>
          <div class="google-maps-widget">
            <iframe 
              src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d448.8496132252689!2d-69.30971028957845!3d10.066832717819146!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e876772ee64127d%3A0xc32c2c566cc7dab7!2sCapital%20Plaza!5e1!3m2!1sen!2sus!4v1754191275022!5m2!1sen!2sus"
              width="100%" 
              height="200" 
              style="border:0; border-radius: 12px;" 
              allowfullscreen="" 
              loading="lazy" 
              referrerpolicy="no-referrer-when-downgrade">
            </iframe>
          </div>
        </div>
      `}
      
      <!-- Instructions -->
      <div class="p-4 bg-yellow-50 rounded-lg">
        <h4 class="font-semibold mb-2 text-yellow-800">Instrucciones</h4>
        <ul class="text-sm text-yellow-700 space-y-1">
          ${isPendingOrder ? `
            <li>• Revisa la información de pago mostrada arriba</li>
            <li>• ${isManualPayment ? 'Haz clic en "Confirmar Orden" para crear tu orden' : 'Usa el botón de pago para procesar tu orden'}</li>
            <li>• Completa el pago según las instrucciones</li>
            <li>• Contacta soporte si tienes alguna duda</li>
          ` : `
            <li>• Tu orden ha sido apartada exitosamente</li>
            <li>• Presenta tu número de orden al recoger</li>
            <li>• Tienes 24 horas para recoger tu pedido</li>
            <li>• Para cualquier consulta, contáctanos por WhatsApp</li>
          `}
        </ul>
      </div>
    </div>
  `;
}

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// DUPLICATE REMOVED - Using the main handler at line 2713

// Helper function to get payment information for different methods
function getPaymentInformation(paymentMethod) {
  const paymentInfo = {
    'zelle': `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="font-medium text-gray-700">Email:</span>
          <span class="text-gray-900">info@venegroupservices.com</span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium text-gray-700">Nombre:</span>
          <span class="text-gray-900">Venegroup Services Inc</span>
        </div>
        <div class="text-center mt-3">
          <a href="https://www.zellepay.com" target="_blank" 
             class="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Abrir Zelle
          </a>
        </div>
      </div>
    `,
    'binance': `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="font-medium text-gray-700">Binance ID:</span>
          <span class="text-gray-900">381425060</span>
        </div>
        <div class="text-center mt-3">
          <a href="https://www.binance.com" target="_blank" 
             class="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
            <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            Abrir Binance
          </a>
        </div>
      </div>
    `,
    'zinli': `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="font-medium text-gray-700">Usuario:</span>
          <span class="text-gray-900">@indigostore</span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium text-gray-700">Teléfono:</span>
          <span class="text-gray-900">+58 414-123-4567</span>
        </div>
        <div class="text-center mt-3">
          <a href="https://www.zinli.com" target="_blank" 
             class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Abrir Zinli
          </a>
        </div>
      </div>
    `,
    'efectivo': `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="font-medium text-gray-700">Método:</span>
          <span class="text-gray-900">Pago en Efectivo</span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium text-gray-700">Ubicación:</span>
          <span class="text-gray-900">Tienda Física</span>
        </div>
        <div class="text-center mt-3">
          <p class="text-gray-600 text-sm">Retira tu pedido en nuestra tienda</p>
        </div>
      </div>
    `
  };
  
  return paymentInfo[paymentMethod] || '<p class="text-gray-600">Información de pago no disponible</p>';
}

// Function to show payment success page
function showPaymentSuccessPage(orderNumber) {
  // Hide all other pages
  document.querySelectorAll('section').forEach(section => {
    section.classList.add('hidden');
  });
  
  // Show payment success page
  const successPage = document.getElementById('payment-success-page');
  if (successPage) {
    successPage.classList.remove('hidden');
    renderPaymentSuccessPage(orderNumber);
  }
}

// Function to show payment pending page
function showPaymentPendingPage(orderNumber) {
  // Hide all other pages
  document.querySelectorAll('section').forEach(section => {
    section.classList.add('hidden');
  });
  
  // Show payment pending page
  const pendingPage = document.getElementById('payment-pending-page');
  if (pendingPage) {
    pendingPage.classList.remove('hidden');
    renderPaymentPendingPage(orderNumber);
  }
}

// Function to render payment success page
function renderPaymentSuccessPage(orderNumber) {
  const successContent = document.getElementById('paymentSuccessContent');
  if (!successContent) return;
  
  console.log('renderPaymentSuccessPage called with orderNumber:', orderNumber);
  
  // Get order from history
  const getOrderFromHistoryFunc = typeof getOrderFromHistory === 'function' ? getOrderFromHistory : (window.getOrderFromHistory || null);
  let order = getOrderFromHistoryFunc ? getOrderFromHistoryFunc(orderNumber) : null;
  
  console.log('Order from history:', order ? 'Found' : 'Not found');
  
  // If order not found in history, try to get from lastSuccessfulOrder or pending order data
  if (!order) {
    try {
      // First try lastSuccessfulOrder (most recent successful payment)
      const lastSuccessfulOrderStr = sessionStorage.getItem('lastSuccessfulOrder');
      if (lastSuccessfulOrderStr) {
        try {
          const lastOrder = JSON.parse(lastSuccessfulOrderStr);
          // ONLY use lastSuccessfulOrder if orderNumber matches exactly - prevent showing wrong order!
          if (lastOrder.orderNumber === orderNumber) {
            order = lastOrder;
            console.log('Using lastSuccessfulOrder for success page (order number matches):', order);
          } else {
            console.log('lastSuccessfulOrder exists but order number does not match:', {
              expected: orderNumber,
              found: lastOrder.orderNumber
            });
            // Clear the mismatched order from sessionStorage to prevent confusion
            sessionStorage.removeItem('lastSuccessfulOrder');
          }
        } catch (e) {
          console.warn('Error parsing lastSuccessfulOrder:', e);
          sessionStorage.removeItem('lastSuccessfulOrder');
        }
      }
      
      // If still not found, try pendingOrderData
      if (!order) {
        const pendingDataStr = sessionStorage.getItem('pendingOrderData');
        console.log('Raw pending data string:', pendingDataStr ? 'Exists' : 'Missing');
        
        if (pendingDataStr) {
          const pendingData = JSON.parse(pendingDataStr);
          console.log('Parsed pending data:', {
            hasCart: !!(pendingData && pendingData.cart),
            cartIsArray: !!(pendingData && Array.isArray(pendingData.cart)),
            cartLength: pendingData?.cart?.length || 0,
            totalUSD: pendingData?.totalUSD,
            totalBS: pendingData?.totalBS,
            paymentMethod: pendingData?.paymentMethod
          });
          
          // Use pendingOrderData regardless of order number match - it's the current order
          if (pendingData && pendingData.cart && Array.isArray(pendingData.cart) && pendingData.cart.length > 0) {
            // Create a temporary order object from pending data
            order = {
              orderNumber: orderNumber, // Use the order number from URL (which Cashea redirects with)
              orderDate: new Date().toISOString(),
              items: pendingData.cart.map(item => ({
                product: item.Product || item.product || item.name || 'Producto',
                quantity: item.quantity || 1,
                priceUSD: parseFloat(item.USD || item.priceUSD || 0),
                priceBS: parseFloat(item.Bs || item.priceBS || item.BS || 0)
              })),
              totalUSD: parseFloat(pendingData.totalUSD || 0),
              totalBS: parseFloat(pendingData.totalBS || 0),
              paymentMethod: pendingData.paymentMethod || 'Cashea',
              status: 'completed',
              deliveryMethod: pendingData.deliveryMethod || '',
              deliveryType: pendingData.deliveryType || '',
              deliveryInfo: pendingData.deliveryInfo || {}
            };
            console.log('Using pending order data for success page:', order);
          } else {
            console.warn('Pending data missing or invalid cart:', {
              hasPendingData: !!pendingData,
              hasCart: !!(pendingData && pendingData.cart),
              cartIsArray: !!(pendingData && Array.isArray(pendingData.cart)),
              cartLength: pendingData?.cart?.length || 0
            });
          }
        } else {
          console.warn('No pendingOrderData found in sessionStorage');
        }
      }
    } catch (e) {
      console.error('Error getting pending order data:', e);
      console.error('Error stack:', e.stack);
    }
  }
  
  // If still no order, show success message anyway with order number
  // The order exists in Supabase, just not in history yet - that's okay
  if (!order) {
    console.warn('Order not found in history or pending data for:', orderNumber);
    console.warn('Order exists in Supabase, but not in local history. Showing generic success.');
    
    // Show generic success message - order was processed successfully
    successContent.innerHTML = `
      <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div class="text-center mb-6">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h3 class="text-2xl font-bold text-green-600 mb-2">¡Pago Exitoso!</h3>
          <p class="text-gray-600">Tu orden ha sido procesada correctamente</p>
        </div>
        
        <!-- Order Summary -->
        <div class="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
          <div class="text-sm text-gray-600">
            <div><strong>Orden:</strong> ${orderNumber}</div>
            <div><strong>Estado:</strong> <span class="text-green-600 font-semibold">Completado</span></div>
          </div>
        </div>
        
        <!-- Success Message -->
        <div class="p-4 bg-green-50 rounded-lg">
          <h4 class="font-semibold mb-2 text-green-800">¡Gracias por tu compra!</h4>
          <ul class="text-sm text-green-700 space-y-1">
            <li>• Tu orden ha sido confirmada y procesada</li>
            <li>• Recibirás un correo de confirmación</li>
            <li>• Te contactaremos pronto para coordinar la entrega</li>
            <li>• Para cualquier consulta, contáctanos por WhatsApp</li>
          </ul>
        </div>
        
        <!-- Action Buttons -->
        <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button onclick="navigateToHome()" class="px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-semibold">
            Continuar Comprando
          </button>
          <button onclick="openWhatsAppForOrder('${orderNumber}')" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center space-x-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
            </svg>
            <span>Ir a WhatsApp</span>
          </button>
        </div>
      </div>
    `;
    return;
  }
  
  // Order found - render success page with order details
  successContent.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h3 class="text-2xl font-bold text-green-600 mb-2">¡Pago Exitoso!</h3>
        <p class="text-gray-600">Tu orden ha sido procesada correctamente</p>
      </div>
      
      <!-- Order Summary -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
        <div class="text-sm text-gray-600">
          <div><strong>Orden:</strong> ${order.orderNumber || orderNumber}</div>
          <div><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</div>
          <div><strong>Fecha:</strong> ${new Date(order.orderDate).toLocaleDateString('es-ES')}</div>
          <div><strong>Estado:</strong> <span class="text-green-600 font-semibold">Completado</span></div>
        </div>
      </div>
      
      <!-- Items List -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Productos</h4>
        <div class="space-y-2">
          ${order.items.map(item => `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
              <div>
                <div class="font-medium">${item.product}</div>
                <div class="text-sm text-gray-600">Cantidad: ${item.quantity}</div>
              </div>
              <div class="text-right">
                <div class="font-medium">$${item.priceUSD} | Bs ${item.priceBS}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Success Message -->
      <div class="p-4 bg-green-50 rounded-lg">
        <h4 class="font-semibold mb-2 text-green-800">¡Gracias por tu compra!</h4>
        <ul class="text-sm text-green-700 space-y-1">
          <li>• Tu orden ha sido confirmada y procesada</li>
          <li>• Recibirás un correo de confirmación</li>
          <li>• Te contactaremos pronto para coordinar la entrega</li>
          <li>• Para cualquier consulta, contáctanos por WhatsApp</li>
        </ul>
      </div>
      
      <!-- Action Buttons -->
      <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <button onclick="navigateToHome()" class="px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-semibold">
          Continuar Comprando
        </button>
        <button onclick="openWhatsAppForOrder('${order.orderNumber || orderNumber}')" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center space-x-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
          </svg>
          <span>Ir a WhatsApp</span>
        </button>
      </div>
    </div>
  `;
}

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// DUPLICATE REMOVED - Using the main handler at line 2713

// Function to render payment pending page
function renderPaymentPendingPage(orderNumber) {
  const pendingContent = document.getElementById('paymentPendingContent');
  if (!pendingContent) return;
  
  // Get order from history
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    pendingContent.innerHTML = '<div class="text-center text-red-500">Orden no encontrada.</div>';
    return;
  }
  
  pendingContent.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h3 class="text-2xl font-bold text-orange-600 mb-2">Orden Pendiente</h3>
        <p class="text-gray-600">Tu orden está esperando confirmación de pago</p>
      </div>
      
      <!-- Order Summary -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
        <div class="text-sm text-gray-600">
          <div><strong>Orden:</strong> ${order.orderNumber || orderNumber}</div>
          <div><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</div>
          <div><strong>Fecha:</strong> ${new Date(order.orderDate).toLocaleDateString('es-ES')}</div>
          <div><strong>Estado:</strong> <span class="text-orange-600 font-semibold">Pendiente de Pago</span></div>
        </div>
      </div>
      
      <!-- Items List -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Productos</h4>
        <div class="space-y-2">
          ${order.items.map(item => `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
              <div>
                <div class="font-medium">${item.product}</div>
                <div class="text-sm text-gray-600">Cantidad: ${item.quantity}</div>
              </div>
              <div class="text-right">
                <div class="font-medium">$${item.priceUSD} | Bs ${item.priceBS}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Payment Instructions -->
      <div class="p-4 bg-orange-50 rounded-lg">
        <h4 class="font-semibold mb-2 text-orange-800">Instrucciones de Pago</h4>
        <ul class="text-sm text-orange-700 space-y-1">
          <li>• Completa el pago según el método seleccionado</li>
          <li>• Envía el comprobante de pago por WhatsApp</li>
          <li>• Menciona tu número de orden: ${order.orderNumber}</li>
          <li>• Te contactaremos para confirmar tu orden</li>
        </ul>
      </div>
      
      <!-- Contact Information -->
      <div class="mt-4 p-4 bg-blue-50 rounded-lg">
        <h4 class="font-semibold mb-2 text-blue-800">Contacto</h4>
        <div class="text-sm text-blue-700">
          <p><strong>WhatsApp:</strong> <a href="https://wa.me/584128503608" target="_blank" class="text-blue-600 hover:underline">+58 412-850-3608</a></p>
          <p class="text-xs mt-2">Envía el comprobante de pago para confirmar tu orden</p>
        </div>
      </div>
    </div>
  `;
}

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// DUPLICATE REMOVED - Using the main handler at line 2713

function getOrderFromHistory(orderNumber) {
  const history = getOrderHistory();
  return history.find(order => order.orderNumber === orderNumber);
}

function loadOrderById() {
  const orderId = document.getElementById('orderIdInput').value.trim();
  if (!orderId) {
    alert('Por favor ingresa un número de orden');
    return;
  }
  
  const order = getOrderFromHistory(orderId);
  if (!order) {
    showStyledNotification('Error', 'Orden no encontrada', 'error');
    return;
  }
  
  // get payment method from order
  const methodMap = {
    'PayPal': 'paypal',
    'Zelle': 'zelle',
    'Binance': 'binance',
    'Pago Móvil': 'pago-movil',
    'Zinli': 'zinli'
  };
  
  const method = methodMap[order.paymentMethod] || 'paypal';
  renderPaymentPage(method, orderId);
}

function loadApartadoOrderById() {
  const orderId = document.getElementById('apartadoOrderIdInput').value.trim();
  if (!orderId) {
    alert('Por favor ingresa un número de orden');
    return;
  }
  
  const order = getOrderFromHistory(orderId);
  if (!order) {
    showStyledNotification('Error', 'Orden no encontrada', 'error');
    return;
  }
  
  renderApartadoPage(orderId);
}

// Image preview functions removed - no longer needed with new payment flow

// submitPayment function removed - no longer needed with new payment flow



function updateOrderStatus(orderNumber, status) {
  const history = getOrderHistory();
  const orderIndex = history.findIndex(order => order.orderNumber === orderNumber);
  
  if (orderIndex !== -1) {
    history[orderIndex].status = status;
    localStorage.setItem('orderHistory', JSON.stringify(history));
  }
  
  // Also update in Supabase
  updateOrderStatusInSupabase(orderNumber, status)
    .then(() => {
      console.log('Order status updated in Supabase:', orderNumber, status);
    })
    .catch(error => {
      console.warn('Failed to update order status in Supabase:', error);
    });
}

// utility function for parsing order numbers (copied from checkout.js)
function parseOrderNumber(orderNumber) {
  // validate order number
  if (!orderNumber || typeof orderNumber !== 'string') {
    console.warn('Invalid order number:', orderNumber);
    return {
      prefix: 'ORD',
      orderDate: new Date(),
      sequential: 0,
      formattedDate: new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
      shortNumber: 'ORD-ERROR'
    };
  }
  
  // parse order number format: ORD-XXXXXX (9 characters)
  const parts = orderNumber.split('-');
  if (parts.length !== 2) {
    console.warn('Invalid order number format:', orderNumber);
    return {
      prefix: 'ORD',
      orderDate: new Date(),
      sequential: 0,
      formattedDate: new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
      shortNumber: orderNumber
    };
  }
  
  const [prefix, sequential] = parts;
  
  // create a default date since we don't store it in the order number anymore
  const orderDate = new Date();
  
  return {
    prefix,
    orderDate,
    sequential: parseInt(sequential) || 0,
    formattedDate: orderDate.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }),
    shortNumber: orderNumber // same as full number for 9-character format
  };
}

// expose functions globally
window.loadOrderById = loadOrderById;
window.loadApartadoOrderById = loadApartadoOrderById;
// Image preview functions no longer exposed - removed with new payment flow
// submitPayment function no longer exposed - removed with new payment flow
window.reprocessPayment = reprocessPayment;
window.showReprocessPaymentModal = showReprocessPaymentModal;
window.closeReprocessPaymentModal = closeReprocessPaymentModal;
window.previewNewPaymentImage = previewNewPaymentImage;
window.removeNewPaymentImage = removeNewPaymentImage;
window.submitReprocessedPayment = submitReprocessedPayment;

// toggleImageUpload function removed - no longer needed with new payment flow
window.renderPaymentPage = renderPaymentPage;
window.renderApartadoPage = renderApartadoPage;
window.showPaymentPage = showPaymentPage;
window.showApartadoPage = showApartadoPage;
window.showPaymentSuccessPage = showPaymentSuccessPage;
window.showPaymentPendingPage = showPaymentPendingPage;
window.renderPaymentSuccessPage = renderPaymentSuccessPage;
window.renderPaymentPendingPage = renderPaymentPendingPage;
window.updateUrl = updateUrl;
window.handleRouting = handleRouting;

// order history action functions
function viewOrderDetails(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    showStyledNotification('Error', 'Orden no encontrada', 'error');
    return;
  }
  
  // close the modal first
  closeOrderHistoryModal();
  
  // show order details page
  showOrderDetailsPage(orderNumber);
}

function contactSupport(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    showStyledNotification('Error', 'Orden no encontrada', 'error');
    return;
  }
  
  const orderInfo = parseOrderNumber(orderNumber);
  const orderDate = new Date(order.orderDate).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const itemsList = order.items.map(item => 
    `• ${item.product} x${item.quantity} - $${item.priceUSD} | Bs ${item.priceBS}`
  ).join('\n');
  
  let message = `¡Hola! Necesito más información sobre mi compra.\n\n`;
  message += `Orden: ${orderInfo.shortNumber}\n`;
  message += `Fecha: ${orderDate}\n`;

  message += `Estado: ${order.status === 'pending' ? 'Pendiente' : order.status === 'apartado' ? 'Apartado' : 'Completado'}\n`;
  message += `Método de pago: ${order.paymentMethod}\n\n`;
  message += `Productos:\n${itemsList}\n\n`;
  message += `Total: $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}\n\n`;
  message += `Por favor, ¿puedes darme más información sobre el estado de mi pedido?`;
  
  // send whatsapp message
  const url = `https://wa.me/584128503608?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

function reprocessPayment(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    showStyledNotification('Error', 'Orden no encontrada', 'error');
    return;
  }
  
  // open normal payment page instead of reprocess modal
  showPaymentPage(order.paymentMethod, orderNumber);
}

function deleteOrder(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    showDeletePopup('Error', 'Orden no encontrada', 'error');
    return;
  }
  
  // check if order can be deleted (only pending orders can be deleted)
  if (order.status !== 'pending') {
    showDeletePopup('Error', `No se puede eliminar una orden con estado: ${order.status}\n\nSolo las órdenes pendientes pueden ser eliminadas.`, 'error');
    return;
  }
  
  // Show custom delete confirmation popup
  showDeleteConfirmationPopup(orderNumber, order);
}

function showDeleteConfirmationPopup(orderNumber, order) {
  const shortOrderNumber = orderNumber.split('-')[0] + '-' + orderNumber.split('-')[2];
  
  const popup = document.createElement('div');
  popup.className = 'delete-confirmation-popup-overlay';
  popup.innerHTML = `
    <div class="delete-confirmation-popup">
      <div class="delete-confirmation-header">
        <h3>🗑️ Confirmar Eliminación</h3>
      </div>
      <div class="delete-confirmation-body">
        <p>¿Estás seguro de que quieres eliminar la orden <strong>${shortOrderNumber}</strong>?</p>
        <p class="warning-text">⚠️ Esta acción no se puede deshacer.</p>
      </div>
      <div class="delete-confirmation-actions">
        <button class="delete-confirmation-cancel" onclick="closeDeleteConfirmationPopup()">Cancelar</button>
        <button class="delete-confirmation-delete" onclick="confirmDeleteOrder('${orderNumber}')">Eliminar</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Close popup when clicking outside
  popup.addEventListener('click', function(e) {
    if (e.target === popup) {
      closeDeleteConfirmationPopup();
    }
  });
}

function closeDeleteConfirmationPopup() {
  const popup = document.querySelector('.delete-confirmation-popup-overlay');
  if (popup) {
    popup.remove();
  }
}

function confirmDeleteOrder(orderNumber) {
  // remove order from history
  const history = getOrderHistory();
  const updatedHistory = history.filter(order => order.orderNumber !== orderNumber);
  localStorage.setItem('orderHistory', JSON.stringify(updatedHistory));
  
  // refresh the modal
  const content = document.getElementById('orderHistoryContent');
  if (content) {
    content.innerHTML = displayOrderHistory();
  }
  
  // Close the confirmation popup
  closeDeleteConfirmationPopup();
  
  // Show success message
  showDeletePopup('Éxito', 'Orden eliminada exitosamente.', 'success');
}

function showDeletePopup(title, message, type = 'info') {
  const popup = document.createElement('div');
  popup.className = 'delete-popup-overlay';
  
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
  
  popup.innerHTML = `
    <div class="delete-popup" style="border-left: 4px solid ${bgColor}">
      <div class="delete-popup-header">
        <span class="delete-popup-icon">${icon}</span>
        <h3>${title}</h3>
      </div>
      <div class="delete-popup-body">
        <p>${message}</p>
      </div>
      <div class="delete-popup-actions">
        <button class="delete-popup-ok" onclick="closeDeletePopup()">OK</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Auto-close after 3 seconds
  setTimeout(() => {
    closeDeletePopup();
  }, 3000);
}

function closeDeletePopup() {
  const popup = document.querySelector('.delete-popup-overlay');
  if (popup) {
    popup.remove();
  }
}

function showOrderDetailsPage(orderNumber) {
  hideAllPages();
  document.getElementById('order-details-page').classList.remove('hidden');
  renderOrderDetails(orderNumber);
}

function renderOrderDetails(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    document.getElementById('orderDetailsContent').innerHTML = '<div class="text-center text-red-500">Orden no encontrada.</div>';
    return;
  }
  
  const orderInfo = parseOrderNumber(orderNumber);
  const orderDate = new Date(order.orderDate).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const statusColors = {
    'pending': { bg: '#fef3c7', color: '#92400e', text: 'Pendiente' },
    'apartado': { bg: '#dbeafe', color: '#1e40af', text: 'Apartado' },
    'processing': { bg: '#fef3c7', color: '#92400e', text: 'Procesando' },
    'completed': { bg: '#d1fae5', color: '#065f46', text: 'Completado' }
  };
  
  const status = statusColors[order.status] || statusColors.pending;
  
  document.getElementById('orderDetailsContent').innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6">
      <!-- Order Header -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold text-gray-800">${orderInfo.shortNumber}</h3>
          <div style="
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            background: ${status.bg};
            color: ${status.color};
          ">
            ${status.text}
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><strong>Fecha:</strong> ${orderDate}</div>
          <div><strong>Método de pago:</strong> ${order.paymentMethod}</div>

          <div><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</div>
        </div>
      </div>
      
      <!-- Products List -->
      <div class="mb-6">
        <h4 class="font-semibold mb-3 text-gray-800">Productos</h4>
        <div class="space-y-3">
          ${order.items.map(item => `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <div class="font-medium">${item.product}</div>
                <div class="text-sm text-gray-600">Cantidad: ${item.quantity}</div>
              </div>
              <div class="text-right">
                <div class="font-medium">$${item.priceUSD} | Bs ${item.priceBS}</div>
                <div class="text-sm text-gray-600">Subtotal: $${(parseFloat(item.priceUSD) * item.quantity).toFixed(2)} | Bs ${(parseFloat(item.priceBS) * item.quantity).toFixed(2)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Delivery Information -->
      ${order.deliveryMethod === 'delivery' ? `
        <div class="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <h4 class="font-semibold mb-3 text-green-800">
            ${order.deliveryType === 'delivery-national' ? '📦 Envío Nacionales' : '🚚 Entrega a Domicilio'}
          </h4>
          <div class="space-y-3">
            ${order.deliveryInfo ? `
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-700">Tipo de envío:</span>
                <span>${order.deliveryInfo.deliveryType || 'Entrega a domicilio'}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-700">Nombre:</span>
                <span>${order.deliveryInfo.name || 'No especificado'}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-700">Teléfono:</span>
                <span>${order.deliveryInfo.phone || 'No especificado'}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-700">Email:</span>
                <span>${order.deliveryInfo.email || 'No especificado'}</span>
              </div>
              <div class="flex items-start gap-2">
                <span class="font-medium text-gray-700">Dirección:</span>
                <span>${order.deliveryInfo.address || 'No especificado'}</span>
              </div>
              ${order.deliveryInfo.instructions ? `
                <div class="flex items-start gap-2">
                  <span class="font-medium text-gray-700">Instrucciones:</span>
                  <span>${order.deliveryInfo.instructions}</span>
                </div>
              ` : ''}
            ` : `
              <div class="text-gray-500 italic">
                Información de entrega no disponible para esta orden.
              </div>
            `}
          </div>
        </div>
      ` : ''}
      
      <!-- Pickup Information for Cash Orders -->
      ${order.paymentMethod === 'Efectivo' ? `
        <div class="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 class="font-semibold mb-3 text-blue-800">📍 Dirección para Recoger</h4>
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-700">Tienda:</span>
              <span>Indigo Store</span>
            </div>
            <div class="flex items-start gap-2">
              <span class="font-medium text-gray-700">Dirección:</span>
              <span>Carrera 19 con Avenida Vargas, CC Capital Plaza, Local 80</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-700">Horario:</span>
              <span>9:00 AM - 5:00 PM, Lunes a Sábado</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-700">Tiempo límite:</span>
              <span class="text-orange-600 font-semibold">3 días para retirar</span>
            </div>
          </div>
          
          <!-- Google Maps Widget -->
          <div class="mt-4">
            <h5 class="font-medium mb-2 text-gray-700">Ubicación:</h5>
            <div class="google-maps-widget">
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d448.8496132252689!2d-69.30971028957845!3d10.066832717819146!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e876772ee64127d%3A0xc32c2c566cc7dab7!2sCapital%20Plaza!5e1!3m2!1sen!2sus!4v1754191275022!5m2!1sen!2sus"
                width="100%" 
                height="200" 
                style="border:0; border-radius: 12px;" 
                allowfullscreen="" 
                loading="lazy" 
                referrerpolicy="no-referrer-when-downgrade">
              </iframe>
            </div>
          </div>
        </div>
      ` : ''}
      
      <!-- Action Buttons -->
      <div class="flex flex-wrap gap-3">
        <button onclick="contactSupport('${orderNumber}')" 
                class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">
          Más información sobre mi compra
        </button>
        
        ${(order.status === 'pending' || order.status === 'apartado') ? `
          <button onclick="reprocessPayment('${orderNumber}')" 
                  class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition">
            No se ha procesado mi pago
          </button>
        ` : ''}
        
        ${order.status === 'pending' ? `
          <button onclick="deleteOrder('${orderNumber}')" 
                  class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">
            Eliminar orden
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// DUPLICATE REMOVED - Using the main handler at line 2713

// expose new functions globally
window.viewOrderDetails = viewOrderDetails;
window.contactSupport = contactSupport;
window.reprocessPayment = reprocessPayment;
window.deleteOrder = deleteOrder;
window.showOrderDetailsPage = showOrderDetailsPage;

// Start periodic update checking
function startUpdateChecker() {
  // Check for updates every 30 seconds
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
  
  // Also check immediately
  checkForUpdates();
}

// Cache status indicator and manual refresh buttons removed
// Updates are now controlled from Google Sheets only

// Expose cache management functions globally for debugging
window.getCacheInfo = getCacheInfo;
window.refreshCache = refreshCache;
window.clearCache = clearCache;
window.triggerCacheRefresh = triggerCacheRefresh;
window.checkForUpdates = checkForUpdates;
window.checkServerVersion = checkServerVersion;
window.isInRefreshCooldown = isInRefreshCooldown;

// Manual force refresh function for testing
window.forceRefresh = function() {
  console.log('Manual force refresh triggered from console');
  clearCache();
  showDataUpdateNotification();
  refreshCache();
};

// Test webhook trigger function
window.testWebhook = async function() {
  try {
    console.log('Testing webhook trigger...');
    const response = await fetch('/api/webhook/cache-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'cache_refresh',
        timestamp: new Date().toISOString(),
        source: 'manual_test'
      })
    });
    
    console.log('Webhook response status:', response.status);
    console.log('Webhook response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Webhook test response:', data);
    
    // If webhook was successful, immediately trigger a cache refresh
    if (data.success && data.force_refresh) {
      console.log('Webhook successful, triggering immediate cache refresh...');
      // Set a flag to force refresh on next version check
      localStorage.setItem('WEBHOOK_TRIGGER_KEY', Date.now().toString());
      // Trigger immediate refresh
      setTimeout(() => {
        console.log('Triggering cache refresh from webhook...');
        forceRefresh();
      }, 1000);
    }
    
    return data;
  } catch (error) {
    console.error('Webhook test failed:', error);
    return { error: error.message };
  }
};

// Check webhook trigger status
window.checkWebhookStatus = async function() {
  try {
    console.log('Checking webhook trigger status...');
    const response = await fetch('/api/cache-version?t=' + Date.now());
    const data = await response.json();
    console.log('Webhook status:', {
      webhook_triggers: data.webhook_triggers,
      recent_triggers: data.recent_triggers,
      force_refresh: data.force_refresh,
      version: data.version
    });
    return data;
  } catch (error) {
    console.error('Failed to check webhook status:', error);
  }
};

// Clear webhook triggers (for testing)
window.clearWebhookTriggers = async function() {
  try {
    console.log('Clearing webhook triggers...');
    const response = await fetch('/api/webhook/cache-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'clear_triggers',
        timestamp: new Date().toISOString(),
        source: 'manual_clear'
      })
    });
    const data = await response.json();
    console.log('Clear triggers response:', data);
    return data;
  } catch (error) {
    console.error('Failed to clear webhook triggers:', error);
  }
};

// Manual cache version check with force refresh
window.forceCheckVersion = async function() {
  try {
    console.log('Manually checking cache version with force refresh...');
    const response = await fetch('/api/cache-version?force_refresh=true&t=' + Date.now());
    const data = await response.json();
    console.log('Force version check response:', data);
    
    if (data.force_refresh) {
      console.log('Force refresh detected, clearing cache...');
      clearCache();
      showDataUpdateNotification();
      refreshCache();
    }
    
    return data;
  } catch (error) {
    console.error('Failed to force check version:', error);
  }
};

// Styled confirmation dialog
function showStyledConfirmation(title, message, onConfirm, onCancel = null) {
  const overlay = document.createElement('div');
  overlay.className = 'styled-confirmation-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
    animation: fadeIn 0.3s ease-out;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    animation: slideInScale 0.3s ease-out;
  `;
  
  dialog.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #dc2626, #ef4444);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
        font-size: 24px;
      ">🗑️</div>
      <h3 style="
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: bold;
        color: #1f2937;
      ">${title}</h3>
      <p style="
        margin: 0;
        color: #6b7280;
        line-height: 1.5;
        white-space: pre-line;
      ">${message}</p>
    </div>
    <div style="
      display: flex;
      gap: 12px;
      justify-content: center;
    ">
      <button class="cancel-btn" style="
        padding: 10px 20px;
        border: 2px solid #e5e7eb;
        background: white;
        color: #6b7280;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 100px;
      ">Cancelar</button>
      <button class="confirm-btn" style="
        padding: 10px 20px;
        background: linear-gradient(135deg, #dc2626, #ef4444);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 100px;
      ">Eliminar</button>
    </div>
  `;
  
  // Add animation styles
  if (!document.getElementById('confirmation-styles')) {
    const style = document.createElement('style');
    style.id = 'confirmation-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideInScale {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(-10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      .cancel-btn:hover {
        background: #f3f4f6 !important;
        border-color: #d1d5db !important;
      }
      .confirm-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
      }
    `;
    document.head.appendChild(style);
  }
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Event handlers
  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');
  
  const closeDialog = () => {
    overlay.style.opacity = '0';
    dialog.style.transform = 'scale(0.95) translateY(-10px)';
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300);
  };
  
  cancelBtn.addEventListener('click', () => {
    closeDialog();
    if (onCancel) onCancel();
  });
  
  confirmBtn.addEventListener('click', () => {
    closeDialog();
    if (onConfirm) onConfirm();
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeDialog();
      if (onCancel) onCancel();
    }
  });
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeDialog();
      if (onCancel) onCancel();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// Expose styled notification function globally
window.showStyledNotification = showStyledNotification;
window.showStyledConfirmation = showStyledConfirmation;

// Function to open WhatsApp for a specific order
window.openWhatsAppForOrder = function(orderNumber) {
  console.log('WhatsApp button clicked for order:', orderNumber);
  
  // Get order from history
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    console.error('Order not found for WhatsApp redirect:', orderNumber);
    alert('Orden no encontrada. Por favor, intenta de nuevo.');
    return;
  }
  
  // Create WhatsApp message
  const orderItemsText = order.items.map(item => {
    const itemPriceUSD = parseFloat(item.priceUSD) || 0;
    const itemPriceBS = parseFloat(item.priceBS) || 0;
    const itemTotalUSD = itemPriceUSD * item.quantity;
    const itemTotalBS = itemPriceBS * item.quantity;
    
    return `🔸 ${item.product} (x${item.quantity})\n   💵 $${itemTotalUSD.toFixed(2)} / Bs ${itemTotalBS.toFixed(2)}`;
  }).join('\n\n');
  
  const message = `🛒 *NUEVA ORDEN - ${orderNumber}*

📦 *Productos:*
${orderItemsText}

━━━━━━━━━━━━━━━━━━
💰 *TOTAL:* $${order.totalUSD.toFixed(2)} / Bs ${order.totalBS.toFixed(2)}
💳 *Pago:* ${order.paymentMethod || 'paypal'}
🚚 *Entrega:* ${order.deliveryMethod || 'store'}

😊 *Indigo Store*`;

  const whatsappNumber = '584128503608';
  
  // Debug: Show original message
  console.log('Original message:', message);
  console.log('Message length:', message.length);
  
  // Encode the message for WhatsApp URL
  const encodedMessage = encodeURIComponent(message);
  const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
  
  console.log('Encoded URL length:', whatsappURL.length);
  
  // Open WhatsApp
  window.open(whatsappURL, '_blank', 'noopener,noreferrer');
};

// Debug function for testing discounts
window.testDiscounts = function() {
  console.log('=== DISCOUNT DEBUG INFO ===');
  console.log('Total products:', window.allProductsWithVariants.length);
  
  // Check all available fields in the first product
  if (window.allProductsWithVariants.length > 0) {
    const firstProduct = window.allProductsWithVariants[0];
    console.log('First product structure:', firstProduct);
    console.log('All available fields:', Object.keys(firstProduct));
    console.log('First product discount calculation:', calculateDiscountedPrices(firstProduct));
  }
  
  // Check for discount-related fields
  const productsWithDiscountField = window.allProductsWithVariants.filter(p => p.Discount !== undefined);
  const productsWithDiscountValue = window.allProductsWithVariants.filter(p => p.Discount && p.Discount > 0);
  
  console.log('Products with discount field (any value):', productsWithDiscountField.length);
  console.log('Products with discount > 0:', productsWithDiscountValue.length);
  
  if (productsWithDiscountValue.length > 0) {
    console.log('Sample product with discount:', productsWithDiscountValue[0]);
    console.log('Sample product discount calculation:', calculateDiscountedPrices(productsWithDiscountValue[0]));
  }
  
  // Check for other possible discount field names
  const allFields = new Set();
  window.allProductsWithVariants.forEach(p => {
    Object.keys(p).forEach(key => allFields.add(key));
  });
  
  console.log('All available fields across all products:', Array.from(allFields).sort());
  
  // Look for fields that might contain discount information
  const possibleDiscountFields = Array.from(allFields).filter(field => 
    field.toLowerCase().includes('discount') || 
    field.toLowerCase().includes('offer') || 
    field.toLowerCase().includes('sale') ||
    field.toLowerCase().includes('promo')
  );
  
  console.log('Possible discount-related fields:', possibleDiscountFields);
  
  console.log('=== END DEBUG INFO ===');
};

// DEPRECATED: Google Scripts config loader - no longer used
// Migration to Supabase in progress
async function loadGoogleScriptsConfig() {
  try {
    const response = await fetch('/api/config/google-scripts');
    if (!response.ok) {
      console.warn('Google Scripts config endpoint not available (migration in progress)');
      return { catalogUrl: '', configured: false };
    }
    const config = await response.json();
    
    if (!config.catalogUrl || !config.configured) {
      console.warn('Google Scripts not configured - using Supabase instead');
      return { catalogUrl: '', configured: false };
    }
    
    API_URL = config.catalogUrl;
    console.log('Google Scripts config loaded successfully');
    return config;
  } catch (error) {
    console.warn('Failed to load Google Scripts config (migration in progress):', error);
    return { catalogUrl: '', configured: false };
  }
}

// Function to load and process products data from Supabase
async function loadProductsData() {
  return new Promise(async (resolve, reject) => {
    console.log('Starting to load products data from Supabase...');
    
    if (isCacheValid()) {
      console.log('Loading from cache...');
      const cachedData = getCachedData();
      if (cachedData && cachedData.length > 0) {
        // Restore icon maps from cache
        try {
          const cachedCategoryIcons = localStorage.getItem('categoryIconsMap');
          if (cachedCategoryIcons) {
            window.categoryIconsMap = JSON.parse(cachedCategoryIcons);
            console.log('Category icons map restored from cache:', Object.keys(window.categoryIconsMap).length, 'categories');
          }
          
          const cachedCollectionIcons = localStorage.getItem('collectionIconsMap');
          if (cachedCollectionIcons) {
            window.collectionIconsMap = JSON.parse(cachedCollectionIcons);
            console.log('Collection icons map restored from cache:', Object.keys(window.collectionIconsMap).length, 'collections');
          }
        } catch (error) {
          console.warn('Error restoring icon maps from cache:', error);
          // Initialize empty maps if restoration fails
          window.categoryIconsMap = window.categoryIconsMap || {};
          window.collectionIconsMap = window.collectionIconsMap || {};
        }
        
        // Check if cached data has BS prices and if they're correctly parsed
        const sampleCached = cachedData[0];
        const hasBsPrices = sampleCached && ('Bs' in sampleCached || 'BS' in sampleCached);
        
        // Check if cached BS prices look incorrect (BS = 1 or 2 when USD is higher)
        let hasIncorrectBS = false;
        if (hasBsPrices && cachedData.length > 0) {
          // Check first 10 products for suspicious BS values
          const suspiciousProducts = cachedData.slice(0, 10).filter(p => {
            const bs = parseFloat(p.Bs || p.BS || 0);
            const usd = parseFloat(p.USD || 0);
            // If BS is very low (1-2) but USD is higher, it's likely incorrectly parsed
            return bs > 0 && bs < 10 && usd > 5;
          });
          
          if (suspiciousProducts.length > 0) {
            hasIncorrectBS = true;
            console.warn(`Found ${suspiciousProducts.length} cached products with suspicious BS prices (likely comma-formatting issue). Clearing cache...`);
          }
        }
        
        console.log('Cache data loaded:', {
          productCount: cachedData.length,
          hasBsPrices: hasBsPrices,
          hasIncorrectBS: hasIncorrectBS,
          hasCategoryIcons: !!(window.categoryIconsMap && Object.keys(window.categoryIconsMap).length > 0),
          hasCollectionIcons: !!(window.collectionIconsMap && Object.keys(window.collectionIconsMap).length > 0),
          sampleProduct: sampleCached ? {
            ItemID: sampleCached.ItemID,
            Product: sampleCached.Product,
            USD: sampleCached.USD,
            Bs: sampleCached.Bs
          } : null
        });
        
        // If cache doesn't have BS prices OR has incorrectly parsed BS prices, reload from Supabase
        if (!hasBsPrices || hasIncorrectBS) {
          if (hasIncorrectBS) {
            console.warn('Cached data has incorrectly parsed BS prices (comma formatting issue). Clearing cache and reloading from Supabase...');
          } else {
            console.warn('Cached data missing BS prices, reloading from Supabase...');
          }
          // Clear cache and continue to Supabase load
          clearCache();
        } else {
          if (window.hideLoadingOverlay) window.hideLoadingOverlay();
          resolve(cachedData);
          return;
        }
      }
    }

    try {
      console.log('Loading from Supabase...');
      
      // Get Supabase client
      if (typeof getSupabaseClient === 'undefined') {
        console.error('getSupabaseClient is not defined! Make sure supabase-config.js is loaded before main.js');
        throw new Error('getSupabaseClient is not available. Check if supabase-config.js is loaded.');
      }
      
      const supabase = await getSupabaseClient();
      
      if (!supabase) {
        console.error('Supabase client is null or undefined!');
        throw new Error('Failed to initialize Supabase client');
      }
      
      console.log('Supabase client initialized successfully');
      
      // Fetch all data in parallel
      const [productsRes, variantsRes, imagesRes, categoriesRes, collectionsRes, productCategoriesRes, productCollectionsRes] = await Promise.all([
        supabase.from('products').select('*').order('id', { ascending: true }),
        supabase.from('product_variants').select('*'),
        supabase.from('product_images').select('*').order('display_order', { ascending: true }),
        supabase.from('categories').select('*').order('name', { ascending: true }),
        supabase.from('collections').select('*').order('name', { ascending: true }),
        supabase.from('product_categories').select('*'),
        supabase.from('product_collections').select('*')
      ]);
      
      // Check for errors - log but don't throw for categories/collections as they're optional
      if (productsRes.error) {
        console.error('Error loading products:', productsRes.error);
        console.error('Product error details:', {
          message: productsRes.error.message,
          code: productsRes.error.code,
          details: productsRes.error.details,
          hint: productsRes.error.hint
        });
        // If it's an RLS error, log helpful message
        if (productsRes.error.code === '42501') {
          console.error('Row Level Security (RLS) error! Make sure migration 017_enable_public_read_frontend_tables.sql has been applied to Supabase.');
        }
        throw productsRes.error;
      }
      if (variantsRes.error) {
        console.error('Error loading variants:', variantsRes.error);
        throw variantsRes.error;
      }
      if (imagesRes.error) {
        console.error('Error loading images:', imagesRes.error);
        throw imagesRes.error;
      }
      // Handle errors - log but continue with empty arrays
      if (categoriesRes.error) {
        console.error('Error loading categories:', categoriesRes.error);
        console.error('Category error details:', {
          message: categoriesRes.error.message,
          code: categoriesRes.error.code,
          details: categoriesRes.error.details
        });
      }
      if (collectionsRes.error) {
        console.error('Error loading collections:', collectionsRes.error);
        console.error('Collection error details:', {
          message: collectionsRes.error.message,
          code: collectionsRes.error.code,
          details: collectionsRes.error.details
        });
      }
      if (productCategoriesRes.error) {
        console.warn('Warning loading product_categories:', productCategoriesRes.error);
      }
      if (productCollectionsRes.error) {
        console.warn('Warning loading product_collections:', productCollectionsRes.error);
      }
      
      const products = productsRes.data || [];
      const variants = variantsRes.data || [];
      const images = imagesRes.data || [];
      const categories = categoriesRes.data || [];
      const collections = collectionsRes.data || [];
      const productCategories = productCategoriesRes.data || [];
      const productCollections = productCollectionsRes.data || [];
      
      console.log('Data loaded from Supabase:', {
        products: products.length,
        categories: categories.length,
        collections: collections.length,
        categoryErrors: categoriesRes.error ? categoriesRes.error.message : null,
        collectionErrors: collectionsRes.error ? collectionsRes.error.message : null
      });
      
      console.log('Supabase queries successful:', {
        products: products.length,
        variants: variants.length,
        images: images.length,
        categories: categories.length,
        collections: collections.length
      });
      
      console.log('Supabase data loaded:', {
        products: products.length,
        variants: variants.length,
        images: images.length,
        categories: categories.length,
        collections: collections.length
      });
      
      // Debug: Check products with suspicious BS values (1, 2, or very low)
      const suspiciousProducts = products.filter(p => {
        const bs = p.bs;
        return (bs === 1 || bs === '1' || bs === 2 || bs === '2' || (typeof bs === 'number' && bs > 0 && bs < 5));
      });
      
      if (suspiciousProducts.length > 0) {
        console.warn(`Found ${suspiciousProducts.length} products with suspicious BS values (1, 2, or < 5):`, 
          suspiciousProducts.map(p => ({
            id: p.id,
            product: p.product,
            usd: p.usd,
            bs: p.bs,
            bs_type: typeof p.bs,
            bs_is_1: p.bs === 1 || p.bs === '1',
            bs_is_2: p.bs === 2 || p.bs === '2',
            all_numeric_fields: Object.keys(p).filter(k => typeof p[k] === 'number')
          }))
        );
      }
      
      // Debug: Check first product's BS field
      if (products.length > 0) {
        const firstProduct = products[0];
        console.log('First product from Supabase (before transform):', {
          id: firstProduct.id,
          product: firstProduct.product,
          usd: firstProduct.usd,
          bs: firstProduct.bs,
          bs_field_exists: 'bs' in firstProduct,
          all_fields: Object.keys(firstProduct),
          sample_bs_values: products.slice(0, 15).map(p => ({ 
            id: p.id, 
            product: p.product,
            usd: p.usd,
            bs: p.bs,
            bs_type: typeof p.bs,
            bs_is_null: p.bs === null,
            bs_is_undefined: p.bs === undefined,
            bs_is_1: p.bs === 1 || p.bs === '1',
            bs_is_2: p.bs === 2 || p.bs === '2',
            bs_is_0: p.bs === 0 || p.bs === '0',
            bs_string: String(p.bs)
          }))
        });
      }
      
      // Create lookup maps
      const variantsByProductId = {};
      variants.forEach(variant => {
        if (!variantsByProductId[variant.product_id]) {
          variantsByProductId[variant.product_id] = [];
        }
        variantsByProductId[variant.product_id].push(variant);
      });
      
      const imagesByProductId = {};
      images.forEach(img => {
        if (!imagesByProductId[img.product_id]) {
          imagesByProductId[img.product_id] = [];
        }
        imagesByProductId[img.product_id].push(img.image_url);
      });
      
      const categoryIdsByProductId = {};
      (productCategories || []).forEach(pc => {
        if (pc && pc.product_id && pc.category_id) {
          if (!categoryIdsByProductId[pc.product_id]) {
            categoryIdsByProductId[pc.product_id] = [];
          }
          categoryIdsByProductId[pc.product_id].push(pc.category_id);
        }
      });
      
      const collectionIdsByProductId = {};
      (productCollections || []).forEach(pc => {
        if (pc && pc.product_id && pc.collection_id) {
          if (!collectionIdsByProductId[pc.product_id]) {
            collectionIdsByProductId[pc.product_id] = [];
          }
          collectionIdsByProductId[pc.product_id].push(pc.collection_id);
        }
      });
      
      const categoryMap = {};
      // Global map to store category icons/images by name
      window.categoryIconsMap = window.categoryIconsMap || {};
      
      if (categories && categories.length > 0) {
        categories.forEach(cat => {
          if (!cat || !cat.name) return;
          
          categoryMap[cat.id] = cat.name;
          // Store icon/image for this category by name (trim name to handle whitespace)
          const catName = cat.name.trim();
          let iconHtml = '♡'; // Default fallback
          
          // Priority: svg_code > image_url (regardless of display_type for now)
          if (cat.svg_code) {
            iconHtml = cat.svg_code;
          } else if (cat.image_url) {
            iconHtml = `<img src="${cat.image_url}" alt="${catName}" class="w-8 h-8 object-contain" />`;
          }
          
          window.categoryIconsMap[catName] = iconHtml;
          console.log(`Category icon loaded: "${catName}"`, { 
            hasIcon: iconHtml !== '♡', 
            hasSvg: !!cat.svg_code,
            hasImage: !!cat.image_url,
            display_type: cat.display_type 
          });
        });
        
        console.log('Category icons map populated:', Object.keys(window.categoryIconsMap).length, 'categories');
        if (Object.keys(window.categoryIconsMap).length > 0) {
          console.log('Category names in map:', Object.keys(window.categoryIconsMap).slice(0, 10));
        }
      } else {
        console.warn('⚠️ No categories loaded from Supabase. Categories array is empty or null.');
      }
      
      const collectionMap = {};
      // Global map to store collection icons/images by name
      window.collectionIconsMap = window.collectionIconsMap || {};
      
      if (collections && collections.length > 0) {
        collections.forEach(col => {
          if (!col || !col.name) return;
          
          collectionMap[col.id] = col.name;
          // Store icon/image for this collection by name (trim name to handle whitespace)
          const colName = col.name.trim();
          let iconHtml = '♡'; // Default fallback
          
          // Priority: svg_code > image_url (regardless of display_type for now)
          if (col.svg_code) {
            iconHtml = col.svg_code;
          } else if (col.image_url) {
            iconHtml = `<img src="${col.image_url}" alt="${colName}" class="w-8 h-8 object-contain" />`;
          }
          
          window.collectionIconsMap[colName] = iconHtml;
          console.log(`📦 Collection icon loaded: "${colName}"`, { 
            hasIcon: iconHtml !== '♡', 
            hasSvg: !!col.svg_code,
            hasImage: !!col.image_url,
            display_type: col.display_type 
          });
        });
        
        console.log('Collection icons map populated:', Object.keys(window.collectionIconsMap).length, 'collections');
        console.log('Collection names in map:', Object.keys(window.collectionIconsMap));
      } else {
        console.warn('⚠️ No collections loaded from Supabase. Collections array is empty or null.');
      }
      
      // Transform products to expected format
      const transformedProducts = [];
      
      // Process each product
      products.forEach((product, index) => {
        // Debug: Log first product to see actual field names from Supabase
        if (index === 0) {
          console.log('First product from Supabase:', {
            id: product.id,
            product_name: product.product,
            availableFields: Object.keys(product),
            bs_field: product.bs,
            bs_alt1: product.BS,
            bs_alt2: product.Bs,
            bs_alt3: product.bolivares,
            bs_alt4: product.price_bs,
            raw_product: product
          });
        }
        
        // Get category and collection names, ensuring they match the keys in our icon maps
        const productCategoryNames = (categoryIdsByProductId[product.id] || [])
          .map(id => categoryMap[id])
          .filter(Boolean)
          .map(name => name.trim()); // Ensure trimmed names match icon map keys
        const productCollectionNames = (collectionIdsByProductId[product.id] || [])
          .map(id => collectionMap[id])
          .filter(Boolean)
          .map(name => name.trim()); // Ensure trimmed names match icon map keys
        
        // Get additional images
        const additionalImages = imagesByProductId[product.id] || [];
        const allImages = [product.image, ...additionalImages].filter(Boolean).join(',');
        
        // Get variants for this product
        const productVariants = variantsByProductId[product.id] || [];
        
        // Try multiple possible field names for BS price (case variations, etc.)
        // Check for null/undefined explicitly, not just falsy values (0 is valid)
        let bsPrice = null;
        if (product.bs !== null && product.bs !== undefined && product.bs !== '') {
          bsPrice = product.bs;
        } else if (product.BS !== null && product.BS !== undefined && product.BS !== '') {
          bsPrice = product.BS;
        } else if (product.Bs !== null && product.Bs !== undefined && product.Bs !== '') {
          bsPrice = product.Bs;
        } else if (product.bolivares !== null && product.bolivares !== undefined && product.bolivares !== '') {
          bsPrice = product.bolivares;
        } else if (product.price_bs !== null && product.price_bs !== undefined && product.price_bs !== '') {
          bsPrice = product.price_bs;
        }
        
        // Parse BS price - handle comma-formatted numbers (e.g., "1,483.12")
        // Remove commas before parsing
        let parsedBS = NaN;
        if (bsPrice !== null) {
          // Convert to string and remove commas (thousands separators)
          const bsPriceStr = String(bsPrice).replace(/,/g, '');
          parsedBS = parseFloat(bsPriceStr);
        }
        
        // Log ALL products with suspicious BS values (1, 2, or very low values)
        const suspiciousBS = parsedBS > 0 && parsedBS <= 10;
        if (suspiciousBS || index < 5) {
          console.log(`Product ${index + 1} BS parsing:`, {
            id: product.id,
            product: product.product,
            usd: product.usd,
            raw_bs: product.bs,
            bs_type: typeof product.bs,
            bs_is_null: product.bs === null,
            bs_is_undefined: product.bs === undefined,
            bs_is_empty: product.bs === '',
            bs_is_1: product.bs === 1 || product.bs === '1',
            bs_is_2: product.bs === 2 || product.bs === '2',
            bsPrice_found: bsPrice,
            parsedBS: parsedBS,
            finalBS_will_be: (!isNaN(parsedBS) && parsedBS >= 0) ? parsedBS : 0,
            all_fields: Object.keys(product),
            raw_product_bs_fields: {
              bs: product.bs,
              BS: product.BS,
              Bs: product.Bs,
              bolivares: product.bolivares,
              price_bs: product.price_bs
            }
          });
        }
        
        if (isNaN(parsedBS) || parsedBS < 0) {
          console.warn(`Product ${product.id} (${product.product}) has invalid BS price:`, {
            bs_field: product.bs,
            BS_field: product.BS,
            Bs_field: product.Bs,
            bsPrice: bsPrice,
            parsed: parsedBS,
            allFields: Object.keys(product),
            raw_product: product
          });
        }
        
        // Warn if BS price is suspiciously low compared to USD
        if (!isNaN(parsedBS) && parsedBS > 0 && parsedBS < 5 && product.usd && product.usd > 5) {
          console.warn(`SUSPICIOUS: Product ${product.id} (${product.product}) has USD ${product.usd} but BS only ${parsedBS}. This seems incorrect!`);
        }
        
        // Only use parsed value if it's valid, otherwise use 0 (don't default to 1!)
        const finalBS = (!isNaN(parsedBS) && parsedBS >= 0) ? parsedBS : 0;
        
        // Base product data
        const baseProductData = {
          Product: product.product,
          Category: productCategoryNames.join(', ') || (product.category ? product.category.trim() : ''),
          Collection: productCollectionNames.join(', ') || (product.collection ? product.collection.trim() : ''),
          Image: allImages || product.image || '',
          USD: parseFloat(product.usd) || 0,
          USD_Real: parseFloat(product.usd_real) || 0,
          Bs: finalBS, // Use validated BS value (0 if invalid, not 1!)
          Discount: product.discount || 0,
          Description: product.description || '',
          SKU: product.sku || ''
        };
        
        if (productVariants.length === 0) {
          // No variants - just add the main product
          transformedProducts.push({
            ItemID: product.id,
            ...baseProductData,
            Stock: product.stock || 0
          });
        } else {
          // Has variants - add main product first (integer ItemID)
          transformedProducts.push({
            ItemID: product.id,
            ...baseProductData,
            Stock: product.stock || 0
          });
          
          // Then add each variant with decimal ItemID (e.g., 1.1, 1.2, 1.3)
          productVariants.forEach((variant, index) => {
            // Use string format first, then parse to ensure correct decimal format
            const variantItemIdStr = `${product.id}.${index + 1}`;
            const variantItemId = parseFloat(variantItemIdStr);
            
            transformedProducts.push({
              ItemID: variantItemId,
              Product: variant.variant_name, // Only variant name, not "PRODUCT - VARIANT"
              Category: baseProductData.Category,
              Collection: baseProductData.Collection,
              Image: variant.image || product.image || '',
              USD: baseProductData.USD,
              USD_Real: baseProductData.USD_Real,
              Bs: baseProductData.Bs, // Use same BS from base product data
              Discount: baseProductData.Discount,
              Stock: variant.stock || 0,
              Description: baseProductData.Description,
              SKU: variant.sku || product.sku || '',
              VariantName: variant.variant_name,
              BaseProductID: product.id
            });
          });
        }
      });
      
      console.log('Products transformed successfully:', {
        productCount: transformedProducts.length,
        timestamp: new Date().toISOString()
      });
      
      // Log summary of icon maps
      console.log('Icon Maps Summary:', {
        categories: {
          count: Object.keys(window.categoryIconsMap || {}).length,
          names: Object.keys(window.categoryIconsMap || {}).slice(0, 5)
        },
        collections: {
          count: Object.keys(window.collectionIconsMap || {}).length,
          names: Object.keys(window.collectionIconsMap || {}).slice(0, 5)
        }
      });
      
      // Debug: Check BS prices in transformed products
      if (transformedProducts.length > 0) {
        const sampleProducts = transformedProducts.slice(0, 3);
        console.log('Sample transformed products (BS prices):', 
          sampleProducts.map(p => ({
            ItemID: p.ItemID,
            Product: p.Product,
            USD: p.USD,
            Bs: p.Bs,
            hasBs: 'Bs' in p,
            allFields: Object.keys(p)
          }))
        );
      }
      
      setCacheData(transformedProducts);
      resolve(transformedProducts);
      
    } catch (error) {
      console.error('Error loading products from Supabase:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      
      // Try to provide more helpful error messages
      if (error.message && error.message.includes('getSupabaseClient')) {
        console.error('getSupabaseClient is not available. Make sure supabase-config.js is loaded before main.js');
      }
      if (error.code === '42501') {
        console.error('Row Level Security (RLS) error. Check that migration 017_enable_public_read_frontend_tables.sql has been applied.');
      }
      
      reject(error);
    }
  });
}

// Hero Carousel functionality
function initializeArrowNavigation(sectionName, gridId, prevId, nextId) {
  const grid = document.getElementById(gridId);
  const prevBtn = document.getElementById(prevId);
  const nextBtn = document.getElementById(nextId);
  
  if (!grid || !prevBtn || !nextBtn) {
    console.log(`Arrow navigation elements not found for ${sectionName}`);
    return;
  }
  
  const items = grid.children;
  if (items.length <= 4) {
    // Show all items if there are 4 or fewer, disable arrows
    Array.from(items).forEach(item => {
      item.style.display = 'block';
    });
    prevBtn.onclick = null;
    nextBtn.onclick = null;
    return;
  }
  
  let currentIndex = 0;
  const itemsPerPage = 4; // Show 4 items at a time
  const totalPages = Math.ceil(items.length / itemsPerPage);
  
  function updateDisplay() {
    // Hide all items
    Array.from(items).forEach(item => {
      item.style.display = 'none';
    });
    
    // Show current page items
    const startIndex = currentIndex * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      if (items[i]) {
        items[i].style.display = 'block';
      }
    }
  }
  
  prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      updateDisplay();
    }
  };
  
  nextBtn.onclick = () => {
    if (currentIndex < totalPages - 1) {
      currentIndex++;
      updateDisplay();
    }
  };
  
  // Initialize display
  updateDisplay();
}

function initializeHeroCarousel(products) {
  const heroCarousel = document.getElementById('heroCarousel');
  const heroCarouselPrev = document.getElementById('heroCarouselPrev');
  const heroCarouselNext = document.getElementById('heroCarouselNext');
  const heroCarouselIndicators = document.getElementById('heroCarouselIndicators');
  
  if (!heroCarousel || !products || products.length === 0) {
    return;
  }
  
  let currentIndex = 0;
  const itemsPerView = 1;
  const totalItems = products.length;
  
  // Create product cards for hero carousel
  function createHeroProductCard(product) {
    const firstImage = product.Image && product.Image.includes(',') 
      ? product.Image.split(',')[0].trim() 
      : product.Image;
    
    return `
      <div class="flex-shrink-0 w-full cursor-pointer hover-lift" onclick="navigateToProduct(${product.ItemID})">
        <div class="bg-white rounded-xl p-4 kawaii-shadow">
          <div class="w-full hero-card-image bg-kawaii-light-pink/30 rounded-lg flex items-center justify-center mb-3">
            <img src="${firstImage}" alt="${product.Product}" class="w-full h-full object-cover rounded-lg">
          </div>
          <h3 class="text-sm font-semibold text-gray-900 mb-2 text-center line-clamp-2">${product.Product}</h3>
          <p class="text-kawaii-pink font-bold text-sm text-center">$${product.USD}</p>
        </div>
      </div>
    `;
  }
  
  // Populate carousel
  heroCarousel.innerHTML = products.map(product => createHeroProductCard(product)).join('');
  
  // Create indicators
  heroCarouselIndicators.innerHTML = products.map((_, index) => 
    `<button class="w-2 h-2 rounded-full transition-all ${index === 0 ? 'bg-white' : 'bg-white/50'}" data-index="${index}"></button>`
  ).join('');
  
  // Update carousel position
  function updateCarousel() {
    const translateX = -currentIndex * 100;
    heroCarousel.style.transform = `translateX(${translateX}%)`;
    
    // Update indicators
    const indicators = heroCarouselIndicators.querySelectorAll('button');
    indicators.forEach((indicator, index) => {
      indicator.className = `w-2 h-2 rounded-full transition-all ${
        index === currentIndex ? 'bg-white' : 'bg-white/50'
      }`;
    });
  }
  
  // Navigation functions
  function goToNext() {
    currentIndex = (currentIndex + 1) % totalItems;
    updateCarousel();
  }
  
  function goToPrev() {
    currentIndex = (currentIndex - 1 + totalItems) % totalItems;
    updateCarousel();
  }
  
  function goToIndex(index) {
    currentIndex = index;
    updateCarousel();
  }
  
  // Event listeners
  if (heroCarouselNext) {
    heroCarouselNext.addEventListener('click', goToNext);
  }
  
  if (heroCarouselPrev) {
    heroCarouselPrev.addEventListener('click', goToPrev);
  }
  
  // Indicator click events
  heroCarouselIndicators.addEventListener('click', (e) => {
    if (e.target.dataset.index) {
      goToIndex(parseInt(e.target.dataset.index));
    }
  });
  
  // Auto-advance carousel every 25 seconds
  setInterval(goToNext, 25000);
}

// Function to handle URL routing
function handleRouting(params = null) {
  // Use provided params or get from URL
  const urlParams = params || getUrlParams();
  
  console.log('handleRouting called with params:', urlParams);
  
  switch (urlParams.page) {
    case 'product':
      if (urlParams.product) {
        showProductPage(urlParams.product);
      } else {
        showHomePage();
      }
      break;
    case 'category':
      if (urlParams.category) {
        showCategoryPage(urlParams.category, 'category');
      } else {
        showHomePage();
      }
      break;
    case 'collection':
      if (urlParams.collection) {
        showCategoryPage(urlParams.collection, 'collection');
      } else {
        showHomePage();
      }
      break;
    case 'new-products':
      showNewProductsPage();
      break;
    case 'ofertas-especiales':
      showOfertasEspecialesPage();
      break;
    case 'checkout':
      showCheckoutPage();
      break;
    case 'pay':
      console.log('Routing to payment page:', urlParams);
      if (urlParams.method && urlParams.order) {
        showPaymentPage(urlParams.method, urlParams.order);
      } else {
        console.error('Missing method or order param');
        navigateToHome();
      }
      break;
    case 'apartado':
      console.log('Routing to apartado page:', urlParams);
      if (urlParams.order) {
        showApartadoPage(urlParams.order);
      } else {
        console.error('Missing order param');
        navigateToHome();
      }
      break;
    case 'payment_success':
      console.log('Routing to payment success page:', urlParams);
      if (urlParams.idNumber) {
        showPaymentSuccessPage(urlParams.idNumber);
      } else {
        console.error('Missing idNumber param');
        navigateToHome();
      }
      break;
    case 'payment_pending':
      console.log('Routing to payment pending page:', urlParams);
      if (urlParams.idNumber) {
        showPaymentPendingPage(urlParams.idNumber);
      } else {
        console.error('Missing idNumber param');
        navigateToHome();
      }
      break;
    default:
      showHomePage();
      break;
  }
}

// Function to initialize and render all products
function initializeProducts(products) {
  console.log('Products loaded successfully:', products.length);
  console.log('Products loaded:', products.length);
  
  // Debug: Log the first few products to see their structure
  if (products.length > 0) {
    console.log('First product structure:', products[0]);
    console.log('Sample product fields:', Object.keys(products[0]));
    
    // Check if any products have discount data
    const productsWithDiscount = products.filter(p => p.Discount && p.Discount > 0);
    console.log('Products with discount data:', productsWithDiscount.length);
    if (productsWithDiscount.length > 0) {
      console.log('Sample product with discount:', productsWithDiscount[0]);
    }
    
    // Check for any field that might contain discount info
    const firstProduct = products[0];
    const allFields = Object.keys(firstProduct);
    console.log('All available fields:', allFields);
    
    // Look for fields that might contain discount information
    const possibleDiscountFields = allFields.filter(field => 
      field.toLowerCase().includes('discount') || 
      field.toLowerCase().includes('offer') || 
      field.toLowerCase().includes('sale') ||
      field.toLowerCase().includes('promo') ||
      field.toLowerCase().includes('k') ||
      field.toLowerCase().includes('column')
    );
    
    console.log('Possible discount-related fields:', possibleDiscountFields);
    
    // Log the values of these fields for the first product
    possibleDiscountFields.forEach(field => {
      console.log(`Field "${field}" value:`, firstProduct[field]);
    });
  }
  
  const valid = products.filter(p => p.ItemID && p.Product);
  console.log('Valid products:', valid.length);
  
  // process variants
  const { mainProducts, allProductsWithVariants } = processProductVariants(valid);
  allProducts = mainProducts;
  window.allProductsWithVariants = allProductsWithVariants;

  // new products - get the 8 most recent MAIN products (no variants, newest first)
  const nuevos = mainProducts.slice(-8).reverse();
  const newBox = document.getElementById("new-products");
  
  if (newBox) {
    newBox.innerHTML = ''; // clear existing content
    nuevos.forEach(p => {
      newBox.appendChild(renderCard(p));
    });
  }

  // Hero carousel - get the 20 most recent MAIN products (no variants, newest first)
  const heroProducts = mainProducts.slice(-20).reverse();
  initializeHeroCarousel(heroProducts);

  // render categories - use categories from Supabase (window.categoryIconsMap) instead of from products
  const cats = window.categoryIconsMap ? Object.keys(window.categoryIconsMap) : uniqueValues(mainProducts, "Category");
  console.log('Categories:', cats);
  renderDropdownLinks("cat-dropdown", cats, "category");
  renderTagButtons("category-buttons", cats, "Category", mainProducts, "category-products", false);

  // render collections - use collections from Supabase (window.collectionIconsMap) instead of from products
  const cols = window.collectionIconsMap ? Object.keys(window.collectionIconsMap) : uniqueValues(mainProducts, "Collection");
  console.log('Collections:', cols);
  renderDropdownLinks("col-dropdown", cols, "collection");
  renderTagButtons("collections-grid", cols, "Collection", mainProducts, "collection-products", true);
  
  // Initialize arrow navigation for categories and collections
  initializeArrowNavigation("categories", "category-buttons", "categories-prev", "categories-next");
  initializeArrowNavigation("collections", "collections-grid", "collections-prev", "collections-next");

  // render promociones dropdown
  const promoDropdown = document.getElementById('promo-dropdown');
  if (promoDropdown) {
    promoDropdown.innerHTML = [
      '<a href="#" onclick="navigateToOfertasEspeciales()" class="block text-sm text-gray-700 hover:text-pink-500 mb-1 px-2 py-1 rounded hover:bg-pink-50">Ofertas Especiales</a>',
    ].join('');
  }

  // Sync mobile menu with desktop menu
  if (window.syncMobileMenus) window.syncMobileMenus();

  setupSearch();
  
  // initial routing
  handleRouting();
  
  // Initialize real-time update system
  startUpdateChecker();
  
  // Hide loading overlay
  if (window.hideLoadingOverlay) window.hideLoadingOverlay();
}

async function checkServerCache() {
  try {
    // Note: Google Scripts config no longer needed - migration to Supabase in progress
    // await loadGoogleScriptsConfig(); // Removed - no longer needed
    
    const res = await fetch('/api/cache-version');
    const data = await res.json(); // { version: '2.7.2' }
    const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY) || '0.0.0';

    if (data.version !== cachedVersion) {
      console.log('Server cache version updated. Refreshing...');
      clearCache();
      // Update the cached version
      localStorage.setItem(CACHE_VERSION_KEY, data.version);
    }

    const products = await loadProductsData();
    initializeProducts(products);
  } catch (error) {
    console.error('Failed to check server cache version:', error);
    const products = await loadProductsData(); // fallback
    initializeProducts(products);
  }
}

// inicializacion
// Migration to Supabase in progress - Google Scripts no longer needed
// loadGoogleScriptsConfig() // Removed - no longer needed
loadProductsData()
  .then(products => {
    initializeProducts(products);
  })
  .catch(err => {
    console.error("Error fetching or processing data:", err);
    
    // ensure loading overlay is hidden on error
    if (window.hideLoadingOverlay) {
      window.hideLoadingOverlay();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4';
    errorDiv.innerHTML = `
      <strong>Error:</strong> No se pudieron cargar los productos. 
      <br>Por favor, verifica tu conexión a internet o intenta más tarde.
    `;
    
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.insertBefore(errorDiv, mainElement.firstChild);
    }

    // populate menus and search  static - FALLBACK
    // nuevos
    const nuevosSubmenu = document.getElementById('nuevos-submenu');
    if (nuevosSubmenu) {
      nuevosSubmenu.innerHTML = [
        '<a href="#" class="mobile-submenu-item">Producto Nuevo 1</a>',
        '<a href="#" class="mobile-submenu-item">Producto Nuevo 2</a>',
        '<a href="#" class="mobile-submenu-item">Producto Nuevo 3</a>'
      ].join('');
    }
    // categorias
    const categoriasSubmenu = document.getElementById('categorias-submenu');
    if (categoriasSubmenu) {
      categoriasSubmenu.innerHTML = [
        '<a href="#" class="mobile-submenu-item">Accesorios</a>',
        '<a href="#" class="mobile-submenu-item">Ropa</a>',
        '<a href="#" class="mobile-submenu-item">Belleza</a>'
      ].join('');
    }
    const catDropdown = document.getElementById('cat-dropdown');
    if (catDropdown) {
      catDropdown.innerHTML = [
        '<a href="#">Accesorios</a>',
        '<a href="#">Ropa</a>',
        '<a href="#">Belleza</a>'
      ].join('');
    }
    // colecciones
    const coleccionesSubmenu = document.getElementById('colecciones-submenu');
    if (coleccionesSubmenu) {
      coleccionesSubmenu.innerHTML = [
        '<a href="#" class="mobile-submenu-item">Colección Primavera</a>',
        '<a href="#" class="mobile-submenu-item">Colección Verano</a>',
        '<a href="#" class="mobile-submenu-item">Edición Especial</a>'
      ].join('');
    }
    const colDropdown = document.getElementById('col-dropdown');
    if (colDropdown) {
      colDropdown.innerHTML = [
        '<a href="#">Colección Primavera</a>',
        '<a href="#">Colección Verano</a>',
        '<a href="#">Edición Especial</a>'
      ].join('');
    }
    // sarch fall back keeps it hidden
    const searchInput = document.getElementById('search');
    const searchMobileInput = document.getElementById('search-mobile');
    if (searchInput) searchInput.placeholder = 'Buscar producto (sin conexión)';
    if (searchMobileInput) searchMobileInput.placeholder = 'Buscar producto (sin conexión)';
    // if error not overloading
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  });

function syncOrderStatusWithSpreadsheet(orderNumber) {
  const data = {
    action: 'getOrderStatus',
    orderNumber: orderNumber
  };
  
  sendToGoogleSheets(data, function(response) {
    if (response.success && response.status) {
      updateOrderStatus(orderNumber, response.status);
      displayOrderHistory();
    }
  });
}

function syncAllOrderStatuses() {
  const history = getOrderHistory();
  if (history.length === 0) return;
  
  const data = {
    action: 'getAllOrderStatuses'
  };
  
  sendToGoogleSheets(data, function(response) {
    if (response.success && response.statuses) {
      let hasChanges = false;
      
      response.statuses.forEach(item => {
        const localOrder = history.find(order => order.orderNumber === item.orderNumber);
        if (localOrder && localOrder.status !== item.status) {
          updateOrderStatus(item.orderNumber, item.status);
          hasChanges = true;
        }
      });
      
      if (hasChanges) {
        // Refresh the order history display
        const contentDiv = document.getElementById('orderHistoryContent');
        if (contentDiv) {
          contentDiv.innerHTML = displayOrderHistory();
        }
        showStyledNotification('¡Éxito!', 'Estados sincronizados exitosamente', 'success');
      } else {
        showStyledNotification('¡Información!', 'Todos los estados están actualizados', 'info');
      }
    }
  });
}

function syncAllOrderStatusesSilently() {
  const history = getOrderHistory();
  if (history.length === 0) return;
  
  const data = {
    action: 'getAllOrderStatuses'
  };
  
  console.log('=== SYNC DEBUG ===');
  console.log('Local history before sync:', history.length, 'orders');
  console.log('Local order numbers:', history.map(o => o.orderNumber));
  
  sendToGoogleSheets(data, function(response) {
    if (response.success && response.statuses) {
      console.log('Spreadsheet statuses received:', response.statuses);
      console.log('Spreadsheet order numbers:', response.statuses.map(s => s.orderNumber));
      
      let hasChanges = false;
      
      response.statuses.forEach(item => {
        const localOrder = history.find(order => order.orderNumber === item.orderNumber);
        if (localOrder) {
          // update status if different
          if (localOrder.status !== item.status) {
            console.log(`Updating status for ${item.orderNumber}: ${localOrder.status} -> ${item.status}`);
            updateOrderStatus(item.orderNumber, item.status);
            hasChanges = true;
          }
          // update order number from spreadsheet (row 1) if available
          if (item.orderNumber && !localOrder.spreadsheetOrderNumber) {
            localOrder.spreadsheetOrderNumber = item.orderNumber;
            hasChanges = true;
          }
        }
      });
      
      if (hasChanges) {
        // Refresh the order history display silently
        const contentDiv = document.getElementById('orderHistoryContent');
        if (contentDiv) {
          contentDiv.innerHTML = displayOrderHistory();
        }
        console.log('Order statuses updated silently');
      } else {
        console.log('No status changes found');
      }
    } else {
      console.log('Sync response:', response);
    }
  });
}

function deleteOrder(orderNumber) {
  const history = getOrderHistory();
  const order = history.find(order => order.orderNumber === orderNumber);
  
  if (!order) {
    showStyledNotification('Error', 'Orden no encontrada', 'error');
    return;
  }
  
  // check if order can be deleted locally
  if (order.status === 'pending') {
    // can delete locally
    showStyledConfirmation(
      'Eliminar Orden',
      '¿Estás seguro de que quieres eliminar esta orden?',
      () => {
        // remove from local storage
        const updatedHistory = history.filter(order => order.orderNumber !== orderNumber);
        localStorage.setItem('orderHistory', JSON.stringify(updatedHistory));
        
        // delete from spreadsheet also
        deleteOrderFromSpreadsheet(orderNumber);
        
        // refresh display
        displayOrderHistory();
        showStyledNotification('¡Orden eliminada!', `Orden ${orderNumber} eliminada exitosamente`, 'delete');
      }
    );
  } else {
    // Status is not 'pending', ask if user wants to force delete
    showStyledConfirmation(
      'Eliminar del Historial',
      `Esta orden tiene estado: ${order.status}\n\n¿Quieres eliminarla del historial local de todas formas?\n(Solo se eliminará localmente, no de la hoja de cálculo)`,
      () => {
        // force delete from local storage only
        const updatedHistory = history.filter(order => order.orderNumber !== orderNumber);
        localStorage.setItem('orderHistory', JSON.stringify(updatedHistory));
        
        // refresh display
        displayOrderHistory();
        showStyledNotification('¡Orden eliminada!', `Orden ${orderNumber} eliminada del historial local`, 'delete');
      }
    );
  }
}

// function to clear all order history
function clearOrderHistory() {
  // Show custom clear history confirmation popup
  showClearHistoryConfirmationPopup();
}

function showClearHistoryConfirmationPopup() {
  const popup = document.createElement('div');
  popup.className = 'delete-confirmation-popup-overlay';
  popup.innerHTML = `
    <div class="delete-confirmation-popup">
      <div class="delete-confirmation-header">
        <h3>🗑️ Limpiar Historial Completo</h3>
      </div>
      <div class="delete-confirmation-body">
        <p>¿Estás seguro de que quieres eliminar <strong>TODO</strong> el historial de órdenes?</p>
        <p class="warning-text">⚠️ Esta acción no se puede deshacer y eliminará todas las órdenes del historial local.</p>
      </div>
      <div class="delete-confirmation-actions">
        <button class="delete-confirmation-cancel" onclick="closeClearHistoryConfirmationPopup()">Cancelar</button>
        <button class="delete-confirmation-delete" onclick="confirmClearOrderHistory()">Limpiar Todo</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Close popup when clicking outside
  popup.addEventListener('click', function(e) {
    if (e.target === popup) {
      closeClearHistoryConfirmationPopup();
    }
  });
}

function closeClearHistoryConfirmationPopup() {
  const popup = document.querySelector('.delete-confirmation-popup-overlay');
  if (popup) {
    popup.remove();
  }
}

function confirmClearOrderHistory() {
  localStorage.removeItem('orderHistory');
  
  // refresh display
  const contentDiv = document.getElementById('orderHistoryContent');
  if (contentDiv) {
    contentDiv.innerHTML = displayOrderHistory();
  }
  
  // Close the confirmation popup
  closeClearHistoryConfirmationPopup();
  
  // Show success message
  showDeletePopup('Éxito', 'Historial de órdenes eliminado completamente!', 'success');
}

// function to clean corrupted orders from history
function cleanCorruptedOrders() {
  const history = getOrderHistory();
  const cleanHistory = history.filter(order => {
    // remove orders with invalid order numbers
    if (!order.orderNumber || order.orderNumber === 'undefined' || order.orderNumber.includes('undefined')) {
      console.log('Removing corrupted order:', order);
      return false;
    }
    return true;
  });
  
  if (cleanHistory.length !== history.length) {
    localStorage.setItem('orderHistory', JSON.stringify(cleanHistory));
    console.log(`Cleaned ${history.length - cleanHistory.length} corrupted orders`);
    
    // refresh display
    const contentDiv = document.getElementById('orderHistoryContent');
    if (contentDiv) {
      contentDiv.innerHTML = displayOrderHistory();
    }
    
    showDeletePopup('Éxito', `Se limpiaron ${history.length - cleanHistory.length} órdenes corruptas del historial.`, 'success');
  } else {
    showDeletePopup('Info', 'No se encontraron órdenes corruptas.', 'info');
  }
}

function deleteOrderFromSpreadsheet(orderNumber) {
  const data = {
    action: 'deleteOrder',
    orderNumber: orderNumber
  };
  
  sendToGoogleSheets(data, function(response) {
    if (response.success) {
      console.log('Order deleted from spreadsheet:', orderNumber);
    } else {
      console.error('Error deleting order from spreadsheet:', response.error);
    }
  });
}

function loadOrderById() {
  const orderNumber = document.getElementById('orderNumberInput').value.trim();
  
  if (!orderNumber) {
    showDeletePopup('Error', 'Por favor ingresa un número de orden', 'error');
    return;
  }
  
  const localOrder = getOrderFromHistory(orderNumber);
  
  if (localOrder) {
    showOrderDetailsPage(orderNumber);
    return;
  }
  
  loadOrderFromSpreadsheet(orderNumber);
}

function loadOrderFromSpreadsheet(orderNumber) {
  const data = {
    action: 'getOrder',
    orderNumber: orderNumber
  };
  
  sendToGoogleSheets(data, function(response) {
    if (response.success && response.order) {
      const localOrder = convertSpreadsheetOrderToLocal(response.order);
      
      const history = getOrderHistory();
      history.push(localOrder);
      localStorage.setItem('orderHistory', JSON.stringify(history));
      
      showOrderDetailsPage(orderNumber);
      showDeletePopup('Éxito', 'Orden cargada exitosamente desde la hoja de cálculo!', 'success');
    } else {
      showDeletePopup('Error', 'Orden no encontrada en la hoja de cálculo', 'error');
    }
  });
}

function convertSpreadsheetOrderToLocal(spreadsheetOrder) {
  return {
    orderNumber: spreadsheetOrder.orderNumber,
    spreadsheetOrderNumber: spreadsheetOrder.orderNumber, // store the spreadsheet order number separately
    orderDate: new Date(spreadsheetOrder.orderDate),
    items: parseOrderItems(spreadsheetOrder.products, spreadsheetOrder.quantities),
    totalUSD: parseFloat(spreadsheetOrder.totalUSD),
    totalBS: parseFloat(spreadsheetOrder.totalBS),
    paymentMethod: spreadsheetOrder.paymentMethod,
    status: spreadsheetOrder.status,
    deliveryMethod: spreadsheetOrder.deliveryMethod,
    deliveryInfo: spreadsheetOrder.deliveryInfo ? JSON.parse(spreadsheetOrder.deliveryInfo) : null,
    imageLink: spreadsheetOrder.imageLink
  };
}

function parseOrderItems(productsStr, quantitiesStr) {
  if (!productsStr || !quantitiesStr) return [];
  
  const products = productsStr.split(', ');
  const quantities = quantitiesStr.split(', ');
  
  return products.map((product, index) => ({
    product: product,
    quantity: parseInt(quantities[index] || 1)
  }));
}

function getPaymentMethodEmoji(method) {
  const emojis = {
    'paypal': '💙',
    'zelle': '💚',
    'binance': '🟡',
    'pago-movil': '💜',
    'efectivo': '💵',
    'zinli': '💚'
  };
  return emojis[method] || '💳';
}

function getPaymentMethodLabel(method) {
  const labels = {
    'paypal': 'PayPal',
    'zelle': 'Zelle',
    'binance': 'Binance',
    'pago-movil': 'Pago Móvil',
    'zinli': 'Zinli'
  };
  return labels[method] || method;
}

function getDeliveryMethodEmoji(method) {
  const emojis = {
    'retirar en tienda': '🏪',
    'entrega a domicilio': '🏠',
    'envío nacionales': '📦',
    'delivery-home': '🏠',
    'delivery-national': '📦'
  };
  return emojis[method] || '📦';
}

function getStatusEmoji(status) {
  const emojis = {
    'pendiente': '⏳',
    'pending': '⏳',
    'processing': '🔄',
    'completed': '✅',
    'cancelled': '❌',
    'Entregada': '📦',
    'ending': '🔄'
  };
  return emojis[status] || '📋';
}

function getStatusDisplayText(status) {
  // normalize status to lowercase for comparison
  const normalizedStatus = (status || '').toLowerCase().trim();
  
  switch (normalizedStatus) {
    case 'pending':
    case 'pendiente':
    case 'p': return ' Pendiente';
    case 'processing':
    case 'procesando':
    case 'proc': return ' Procesando';
    case 'completed':
    case 'completado':
    case 'completo':
    case 'c': return ' Completado';
    case 'cancelled':
    case 'cancelado':
    case 'cancel': return ' Cancelado';
    case 'apartado':
    case 'a': return ' Apartado';
    case 'entregada':
    case 'entregado':
    case 'e': return ' Entregada';
    case 'ending':
    case 'finalizando':
    case 'f': return ' Finalizando';
    case 'paid':
    case 'pagado':
    case 'pago': return ' Pagado';
    case 'pago procesado':
    case 'pagoprocesado':
    case 'procesado': return '✅ Pago Procesado';
    case 'shipped':
    case 'enviado':
    case 'envio': return ' Enviado';
    case 'delivered':
    case 'entregado':
    case 'delivery': return ' Entregado';
    default: 
      console.log('Unknown status:', status, 'normalized:', normalizedStatus);
      return ` ${status || 'Desconocido'}`;
  }
}

function getStatusBackgroundColor(status) {
  // normalize status to lowercase for comparison
  const normalizedStatus = (status || '').toLowerCase().trim();
  
  switch (normalizedStatus) {
    case 'pending':
    case 'pendiente':
    case 'p': return '#fef3c7';
    case 'processing':
    case 'procesando':
    case 'proc': return '#dbeafe';
    case 'completed':
    case 'completado':
    case 'completo':
    case 'c': return '#d1fae5';
    case 'cancelled':
    case 'cancelado':
    case 'cancel': return '#fee2e2';
    case 'apartado':
    case 'a': return '#dbeafe';
    case 'entregada':
    case 'entregado':
    case 'e': return '#d1fae5';
    case 'ending':
    case 'finalizando':
    case 'f': return '#fef3c7';
    case 'paid':
    case 'pagado':
    case 'pago': return '#d1fae5';
    case 'pago procesado':
    case 'pagoprocesado':
    case 'procesado': return '#dcfce7';
    case 'shipped':
    case 'enviado':
    case 'envio': return '#dbeafe';
    case 'delivered':
    case 'entregado':
    case 'delivery': return '#d1fae5';
    default: return '#f3f4f6';
  }
}

function getStatusTextColor(status) {
  // normalize status to lowercase for comparison
  const normalizedStatus = (status || '').toLowerCase().trim();
  
  switch (normalizedStatus) {
    case 'pending':
    case 'pendiente':
    case 'p': return '#92400e';
    case 'processing':
    case 'procesando':
    case 'proc': return '#1e40af';
    case 'completed':
    case 'completado':
    case 'completo':
    case 'c': return '#065f46';
    case 'cancelled':
    case 'cancelado':
    case 'cancel': return '#dc2626';
    case 'apartado':
    case 'a': return '#1e40af';
    case 'entregada':
    case 'entregado':
    case 'e': return '#065f46';
    case 'ending':
    case 'finalizando':
    case 'f': return '#92400e';
    case 'paid':
    case 'pagado':
    case 'pago': return '#065f46';
    case 'pago procesado':
    case 'pagoprocesado':
    case 'procesado': return '#15803d';
    case 'shipped':
    case 'enviado':
    case 'envio': return '#1e40af';
    case 'delivered':
    case 'entregado':
    case 'delivery': return '#065f46';
    default: return '#374151';
  }
}

function showSoldOutMessage() {
  showCartNotification('No hay stock disponible para este producto.');
}

// Enhanced checkout functions with emojis
function showOrderSuccessNotification(orderNumber, isCashPayment = false) {
  const message = isCashPayment 
    ? `¡Apartado exitoso! Orden: ${orderNumber}`
    : `¡Orden creada exitosamente! Orden: ${orderNumber}`;
  
  showCartNotification(message);
}
  
  // Image upload section removed - no longer needed with new payment flow

// submitPayment function removed - no longer needed with new payment flow

// sendImageToGoogleSheets function removed - no longer needed with new payment flow

// sendImageSeparately function removed - no longer needed with new payment flow

// Reprocess Payment Modal Functions
// Universal Payment Reprocessing Functions
function showReprocessPaymentModal(orderNumber, order) {
  // For existing orders, show the order-specific reprocess modal
  if (order) {
    showOrderSpecificReprocessModal(orderNumber, order);
  } else {
    // For new orders or when no order is provided, show the universal reprocess page
    showUniversalReprocessPage();
  }
}

function showOrderSpecificReprocessModal(orderNumber, order) {
  const modal = document.createElement('div');
  modal.className = 'reprocess-payment-modal-overlay';
  modal.innerHTML = `
    <div class="reprocess-payment-modal">
      <div class="modal-header">
        <h3>🔄 Reprocesar Pago</h3>
        <button onclick="closeReprocessPaymentModal()" class="close-btn">&times;</button>
      </div>
      
      <div class="modal-body">
        <!-- Order Summary Section -->
        <div class="order-summary-section">
          <h4>📋 Resumen de la Orden</h4>
          <p><strong>Orden:</strong> ${orderNumber.split('-')[0]}-${orderNumber.split('-')[2]}</p>
          <p><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</p>
          <p><strong>Método anterior:</strong> ${order.paymentMethod}</p>
        </div>
        
        <!-- Payment Method Selection -->
        <div class="payment-method-section">
          <h4>💳 Seleccionar Nuevo Método de Pago</h4>
          <div class="payment-methods-grid">
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="paypal" id="paypal-option">
              <span class="payment-method-label">PayPal</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="zelle" id="zelle-option">
              <span class="payment-method-label">Zelle</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="binance" id="binance-option">
              <span class="payment-method-label">Binance</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="pago-movil" id="pago-movil-option">
              <span class="payment-method-label">Pago Móvil</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="zinli" id="zinli-option">
              <span class="payment-method-label">Zinli</span>
            </label>
          </div>
        </div>
        
        <!-- Image Upload Section -->
        <div class="image-upload-section">
          <h4>📸 Subir Nuevo Comprobante</h4>
          <div class="file-upload-container">
            <input type="file" id="newPaymentImage" accept="image/*" onchange="previewNewPaymentImage(this)" style="display: none;">
            <label for="newPaymentImage" class="file-upload-label">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Haz clic para subir o arrastra y suelta</span>
            </label>
          </div>
          <div id="newImagePreview" class="image-preview" style="display: none;">
            <img id="newPreviewImg" class="max-w-full h-auto rounded-lg border" alt="Preview">
            <button onclick="removeNewPaymentImage()" class="remove-image-btn">×</button>
          </div>
        </div>
      </div>
      
      <!-- Modal Actions -->
      <div class="modal-actions">
        <button onclick="closeReprocessPaymentModal()" class="btn btn-secondary">❌ Cancelar</button>
        <button onclick="submitReprocessedPayment('${orderNumber}')" class="btn btn-primary" id="submitReprocessBtn" disabled>
          🔄 Reprocesar Pago
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReprocessPaymentModal();
    }
  });
  
  // add event listeners for payment method selection
  const paymentMethodInputs = modal.querySelectorAll('input[name="newPaymentMethod"]');
  paymentMethodInputs.forEach(input => {
    input.addEventListener('change', function() {
      const imageFile = document.getElementById('newPaymentImage').files[0];
      const submitBtn = document.getElementById('submitReprocessBtn');
      if (this.checked && imageFile) {
        submitBtn.disabled = false;
      }
    });
  });
}

function showUniversalReprocessPage() {
  const modal = document.createElement('div');
  modal.className = 'reprocess-payment-modal-overlay';
  modal.innerHTML = `
    <div class="reprocess-payment-modal universal-reprocess-modal">
      <div class="modal-header">
        <h3>🔄 Reprocesar Pago - Cargar Orden</h3>
        <button onclick="closeReprocessPaymentModal()" class="close-btn">&times;</button>
      </div>
      
      <div class="modal-body">
        <!-- Order Loading Section -->
        <div class="order-loading-section">
          <h4>📋 Cargar Orden para Reprocesar</h4>
          <p class="section-description">Ingresa el número de orden para cargarla desde la hoja de cálculo y reprocesar el pago.</p>
          
          <div class="order-input-section">
            <label for="reprocessOrderInput" class="input-label">Número de Orden:</label>
            <div class="input-group">
              <input type="text" id="reprocessOrderInput" placeholder="Ej: ORD-2024-001" class="order-input">
              <button onclick="loadOrderForReprocess()" class="load-order-btn">🔍 Cargar</button>
            </div>
          </div>
          
          <div id="reprocessOrderInfo" class="order-info-display" style="display: none;">
            <!-- Order information will be displayed here -->
          </div>
        </div>
        
        <!-- Payment Method Selection (shown after order is loaded) -->
        <div id="reprocessPaymentMethodSection" class="payment-method-section" style="display: none;">
          <h4>💳 Seleccionar Nuevo Método de Pago</h4>
          <div class="payment-methods-grid">
            <label class="payment-method-option">
              <input type="radio" name="universalPaymentMethod" value="paypal" id="universal-paypal-option">
              <span class="payment-method-label">PayPal</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="universalPaymentMethod" value="zelle" id="universal-zelle-option">
              <span class="payment-method-label">Zelle</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="universalPaymentMethod" value="binance" id="universal-binance-option">
              <span class="payment-method-label">Binance</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="universalPaymentMethod" value="pago-movil" id="universal-pago-movil-option">
              <span class="payment-method-label">Pago Móvil</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="universalPaymentMethod" value="zinli" id="universal-zelle-option">
              <span class="payment-method-label">Zinli</span>
            </label>
          </div>
        </div>
        
        <!-- Image Upload Section (shown after order is loaded) -->
        <div id="reprocessImageUploadSection" class="image-upload-section" style="display: none;">
          <h4>📸 Subir Nuevo Comprobante</h4>
          <div class="file-upload-container">
            <input type="file" id="universalPaymentImage" accept="image/*" onchange="previewUniversalPaymentImage(this)" style="display: none;">
            <label for="universalPaymentImage" class="file-upload-label">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Haz clic para subir o arrastra y suelta</span>
            </label>
          </div>
          <div id="universalImagePreview" class="image-preview" style="display: none;">
            <img id="universalPreviewImg" class="max-w-full h-auto rounded-lg border" alt="Preview">
            <button onclick="removeUniversalPaymentImage()" class="remove-image-btn">×</button>
          </div>
        </div>
      </div>
      
      <!-- Modal Actions -->
      <div class="modal-actions">
        <button onclick="closeReprocessPaymentModal()" class="btn btn-secondary">❌ Cancelar</button>
        <button onclick="submitUniversalReprocessedPayment()" class="btn btn-primary" id="universalSubmitReprocessBtn" disabled>
          🔄 Reprocesar Pago
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReprocessPaymentModal();
    }
  });
  
  // add event listeners for payment method selection
  const paymentMethodInputs = modal.querySelectorAll('input[name="universalPaymentMethod"]');
  paymentMethodInputs.forEach(input => {
    input.addEventListener('change', function() {
      const imageFile = document.getElementById('universalPaymentImage').files[0];
      const submitBtn = document.getElementById('universalSubmitReprocessBtn');
      if (this.checked && imageFile) {
        submitBtn.disabled = false;
      }
    });
  });
}

function closeReprocessPaymentModal() {
  const modal = document.querySelector('.reprocess-payment-modal-overlay');
  if (modal) {
    modal.remove();
  }
}

function previewNewPaymentImage(input) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('newPreviewImg').src = e.target.result;
      document.getElementById('newImagePreview').style.display = 'block';
      
      // enable submit button if payment method is selected
      const selectedMethod = document.querySelector('input[name="newPaymentMethod"]:checked');
      const submitBtn = document.getElementById('submitReprocessBtn');
      if (selectedMethod) {
        submitBtn.disabled = false;
      }
    };
    reader.readAsDataURL(file);
  }
}

function removeNewPaymentImage() {
  document.getElementById('newPaymentImage').value = '';
  document.getElementById('newImagePreview').style.display = 'none';
  const submitBtn = document.getElementById('submitReprocessBtn');
  submitBtn.disabled = true;
}

// Universal reprocessing functions
function loadOrderForReprocess() {
  const orderNumber = document.getElementById('reprocessOrderInput').value.trim();
  
  if (!orderNumber) {
    showDeletePopup('Error', 'Por favor ingresa un número de orden', 'error');
    return;
  }
  
  // First check if order exists in local history
  const localOrder = getOrderFromHistory(orderNumber);
  
  if (localOrder) {
    // Order exists locally, show it
    displayReprocessOrderInfo(localOrder, orderNumber);
  } else {
    // Try to load from spreadsheet
    loadOrderFromSpreadsheetForReprocess(orderNumber);
  }
}

function loadOrderFromSpreadsheetForReprocess(orderNumber) {
  const data = {
    action: 'getOrder',
    orderNumber: orderNumber
  };
  
  sendToGoogleSheets(data, function(response) {
    if (response.success && response.order) {
      const localOrder = convertSpreadsheetOrderToLocal(response.order);
      
      // Add to local history if not already there
      const history = getOrderHistory();
      const existingOrder = history.find(o => o.orderNumber === orderNumber);
      if (!existingOrder) {
        history.push(localOrder);
        localStorage.setItem('orderHistory', JSON.stringify(history));
        showDeletePopup('Info', 'Orden cargada desde la hoja de cálculo y agregada al historial local', 'info');
      }
      
      displayReprocessOrderInfo(localOrder, orderNumber);
    } else {
      showDeletePopup('Error', 'Orden no encontrada en la hoja de cálculo', 'error');
    }
  });
}

function displayReprocessOrderInfo(order, orderNumber) {
  const orderInfoDiv = document.getElementById('reprocessOrderInfo');
  const paymentMethodSection = document.getElementById('reprocessPaymentMethodSection');
  const imageUploadSection = document.getElementById('reprocessImageUploadSection');
  
  if (!orderInfoDiv) return;
  
  orderInfoDiv.innerHTML = `
    <div class="loaded-order-info">
      <h5>✅ Orden Cargada</h5>
      <div class="order-details">
        <p><strong>Orden:</strong> ${orderNumber.split('-')[0]}-${orderNumber.split('-')[2]}</p>
        <p><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</p>
        <p><strong>Método anterior:</strong> ${order.paymentMethod}</p>
        <p><strong>Productos:</strong> ${order.items.map(item => `${item.product} (${item.quantity})`).join(', ')}</p>
      </div>
    </div>
  `;
  
  orderInfoDiv.style.display = 'block';
  paymentMethodSection.style.display = 'block';
  imageUploadSection.style.display = 'block';
  
  // Reset form
  document.getElementById('universalPaymentImage').value = '';
  document.getElementById('universalImagePreview').style.display = 'none';
  document.getElementById('universalSubmitReprocessBtn').disabled = true;
  
  // Uncheck all payment methods
  document.querySelectorAll('input[name="universalPaymentMethod"]').forEach(input => {
    input.checked = false;
  });
}

function previewUniversalPaymentImage(input) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('universalPreviewImg').src = e.target.result;
      document.getElementById('universalImagePreview').style.display = 'block';
      
      // enable submit button if payment method is selected
      const selectedMethod = document.querySelector('input[name="universalPaymentMethod"]:checked');
      const submitBtn = document.getElementById('universalSubmitReprocessBtn');
      if (selectedMethod) {
        submitBtn.disabled = false;
      }
    };
    reader.readAsDataURL(file);
  }
}

function removeUniversalPaymentImage() {
  document.getElementById('universalPaymentImage').value = '';
  document.getElementById('universalImagePreview').style.display = 'none';
  const submitBtn = document.getElementById('universalSubmitReprocessBtn');
  submitBtn.disabled = true;
}

function submitUniversalReprocessedPayment() {
  const selectedMethod = document.querySelector('input[name="universalPaymentMethod"]:checked');
  const imageFile = document.getElementById('universalPaymentImage').files[0];
  const orderNumber = document.getElementById('reprocessOrderInput').value.trim();
  
  if (!selectedMethod) {
    showDeletePopup('Error', 'Por favor selecciona un método de pago', 'error');
    return;
  }
  
  if (!imageFile) {
    showDeletePopup('Error', 'Por favor sube una imagen del comprobante de pago', 'error');
    return;
  }
  
  if (!orderNumber) {
    showDeletePopup('Error', 'Por favor ingresa un número de orden', 'error');
    return;
  }
  
  const newPaymentMethod = selectedMethod.value;
  
  // disable submit button
  const submitBtn = document.getElementById('universalSubmitReprocessBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '🔄 Procesando...';
  
  // convert image to base64
  const reader = new FileReader();
  reader.onload = function(e) {
    const imageData = e.target.result;
    const imageType = imageFile.name.split('.').pop().toLowerCase();
    
    // send reprocessed payment data
    const reprocessData = {
      action: 'reprocessPayment',
      orderNumber: orderNumber.split('-')[0] + '-' + orderNumber.split('-')[2],
      newPaymentMethod: newPaymentMethod,
      imageData: imageData,
      imageType: imageType
    };
    
    sendToGoogleSheets(reprocessData, function(response) {
      if (response.success) {
        showDeletePopup('Éxito', '¡Pago reprocesado exitosamente!', 'success');
        closeReprocessPaymentModal();
        
        // update local order status
        updateOrderStatus(orderNumber, 'processing');
        
        // refresh order history if modal is open
        const orderHistoryContent = document.getElementById('orderHistoryContent');
        if (orderHistoryContent) {
          orderHistoryContent.innerHTML = displayOrderHistory();
        }
      } else {
        showDeletePopup('Error', 'Error al reprocesar el pago: ' + (response.error || 'Error desconocido'), 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '🔄 Reprocesar Pago';
      }
    });
  };
  
  reader.readAsDataURL(imageFile);
}

function submitReprocessedPayment(orderNumber) {
  const selectedMethod = document.querySelector('input[name="newPaymentMethod"]:checked');
  const imageFile = document.getElementById('newPaymentImage').files[0];
  
  if (!selectedMethod) {
    alert('Por favor selecciona un método de pago');
    return;
  }
  
  if (!imageFile) {
    alert('Por favor sube una imagen del comprobante de pago');
    return;
  }
  
  const newPaymentMethod = selectedMethod.value;
  
  // disable submit button
  const submitBtn = document.getElementById('submitReprocessBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '🔄 Procesando...';
  
  // convert image to base64
  const reader = new FileReader();
  reader.onload = function(e) {
    const imageData = e.target.result;
    const imageType = imageFile.name.split('.').pop().toLowerCase();
    
    // send reprocessed payment data
    const reprocessData = {
      action: 'reprocessPayment',
      orderNumber: orderNumber.split('-')[0] + '-' + orderNumber.split('-')[2],
      newPaymentMethod: newPaymentMethod,
      imageData: imageData,
      imageType: imageType
    };
    
    sendToGoogleSheets(reprocessData, function(response) {
      if (response.success) {
        showStyledNotification('¡Pago procesado!', 'Pago reprocesado exitosamente', 'success');
        closeReprocessPaymentModal();
        
        // update local order status
        updateOrderStatus(orderNumber, 'processing');
        
        // refresh order history if modal is open
        const orderHistoryContent = document.getElementById('orderHistoryContent');
        if (orderHistoryContent) {
          orderHistoryContent.innerHTML = displayOrderHistory();
        }
      } else {
        showStyledNotification('Error', 'Error al reprocesar el pago: ' + (response.error || 'Error desconocido'), 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '🔄 Reprocesar Pago';
      }
    });
  };
  
  reader.readAsDataURL(imageFile);
}

// Removed hourly cache check - cache now only refreshes via admin panel webhook trigger
// Initial cache check is handled by loadProductsData() on page load
// Automatic refresh detection is handled by checkServerVersion() via startUpdateChecker() every 10 seconds

// Logo scroll behavior
let lastScrollTop = 0;
let isScrolling = false;

function handleLogoScroll() {
  const logo = document.querySelector('.logo-responsive');
  if (!logo) return;
  
  const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
  const scrollThreshold = 50; // Minimum scroll distance to trigger
  
  // Prevent rapid firing during scroll
  if (!isScrolling) {
    window.requestAnimationFrame(() => {
      if (currentScroll > lastScrollTop && currentScroll > scrollThreshold) {
        // Scrolling down - hide logo
        logo.classList.add('hide-on-scroll');
        logo.classList.remove('show-on-scroll');
      } else if (currentScroll < lastScrollTop || currentScroll <= scrollThreshold) {
        // Scrolling up or at top - show logo
        logo.classList.remove('hide-on-scroll');
        logo.classList.add('show-on-scroll');
      }
      
      lastScrollTop = currentScroll <= 0 ? 0 : currentScroll; // For Mobile or negative scrolling
      isScrolling = false;
    });
  }
  
  isScrolling = true;
}

// Throttled scroll event listener
let scrollTimeout;
window.addEventListener('scroll', () => {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  scrollTimeout = setTimeout(handleLogoScroll, 10);
});

// Initialize logo state
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.logo-responsive');
  if (logo) {
    logo.classList.add('show-on-scroll');
  }
});

// Function to show payment page (wrapper for renderPaymentPage)
function showPaymentPage(method, orderNumber) {
  console.log('showPaymentPage called with:', { method, orderNumber });
  
  // Hide all pages and show payment page
  hideAllPages();
  document.getElementById('payment-page').classList.remove('hidden');
  
  // Render the payment page content
  renderPaymentPage(method, orderNumber);
}

// Function to show apartado page (wrapper for renderApartadoPage)
function showApartadoPage(orderNumber) {
  console.log('showApartadoPage called with:', { orderNumber });
  
  // Hide all pages and show apartado page
  hideAllPages();
  document.getElementById('apartado-page').classList.remove('hidden');
  
  // Render the apartado page content
  renderApartadoPage(orderNumber);
}

// Function to show payment success page
function showPaymentSuccessPage(orderNumber) {
  console.log('showPaymentSuccessPage called with:', { orderNumber });
  
  // Hide all pages and show success page
  hideAllPages();
  document.getElementById('payment-success-page').classList.remove('hidden');
  
  // Render the success page content
  renderPaymentSuccessPage(orderNumber);
}

// Function to show payment pending page
function showPaymentPendingPage(orderNumber) {
  console.log('⏳ showPaymentPendingPage called with:', { orderNumber });
  
  // Hide all pages and show pending page
  hideAllPages();
  document.getElementById('payment-pending-page').classList.remove('hidden');
  
  // Render the pending page content
  renderPaymentPendingPage(orderNumber);
}

// Function to render payment success page content
function renderPaymentSuccessPage(orderNumber) {
  const content = document.getElementById('paymentSuccessContent');
  if (!content) return;
  
  // Get order from history - try multiple methods
  const getOrderFromHistoryFunc = typeof getOrderFromHistory === 'function' ? getOrderFromHistory : (window.getOrderFromHistory || null);
  let order = getOrderFromHistoryFunc ? getOrderFromHistoryFunc(orderNumber) : null;
  
  // If order not found in history, try to get from lastSuccessfulOrder or pending order data
  if (!order) {
    try {
      // First try lastSuccessfulOrder (most recent successful payment)
      const lastSuccessfulOrderStr = sessionStorage.getItem('lastSuccessfulOrder');
      if (lastSuccessfulOrderStr) {
        try {
          const lastOrder = JSON.parse(lastSuccessfulOrderStr);
          // ONLY use lastSuccessfulOrder if orderNumber matches exactly - prevent showing wrong order!
          if (lastOrder.orderNumber === orderNumber) {
            order = lastOrder;
            console.log('Using lastSuccessfulOrder for success page (order number matches):', order);
          } else {
            console.log('lastSuccessfulOrder exists but order number does not match:', {
              expected: orderNumber,
              found: lastOrder.orderNumber
            });
            // Clear the mismatched order from sessionStorage to prevent confusion
            sessionStorage.removeItem('lastSuccessfulOrder');
          }
        } catch (e) {
          console.warn('Error parsing lastSuccessfulOrder:', e);
          sessionStorage.removeItem('lastSuccessfulOrder');
        }
      }
      
      // If still not found, try pendingOrderData
      if (!order) {
        const pendingDataStr = sessionStorage.getItem('pendingOrderData');
        if (pendingDataStr) {
          try {
            const pendingData = JSON.parse(pendingDataStr);
            if (pendingData && pendingData.cart && Array.isArray(pendingData.cart) && pendingData.cart.length > 0) {
              // Create a temporary order object from pending data
              order = {
                orderNumber: orderNumber,
                orderDate: new Date().toISOString(),
                items: pendingData.cart.map(item => ({
                  product: item.Product || item.product || item.name || 'Producto',
                  quantity: item.quantity || 1,
                  priceUSD: parseFloat(item.USD || item.priceUSD || 0),
                  priceBS: parseFloat(item.Bs || item.priceBS || item.BS || 0)
                })),
                totalUSD: parseFloat(pendingData.totalUSD || 0),
                totalBS: parseFloat(pendingData.totalBS || 0),
                paymentMethod: pendingData.paymentMethod || 'PayPal',
                status: 'completed',
                deliveryMethod: pendingData.deliveryMethod || '',
                deliveryType: pendingData.deliveryType || '',
                deliveryInfo: pendingData.deliveryInfo || {}
              };
              console.log('Using pending order data for success page:', order);
            }
          } catch (e) {
            console.warn('Error parsing pendingOrderData:', e);
          }
        }
      }
    } catch (e) {
      console.error('Error getting order data:', e);
    }
  }
  
  // If still no order, show generic success message (order exists in Supabase, just not in local history yet)
  if (!order) {
    console.warn('Order not found in history or pending data for:', orderNumber);
    console.warn('Order exists in Supabase, but not in local history. Showing generic success.');
    
    content.innerHTML = `
      <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div class="text-center mb-6">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h3 class="text-2xl font-bold text-green-600 mb-2">¡Pago Exitoso!</h3>
          <p class="text-gray-600">Tu orden ha sido procesada correctamente</p>
        </div>
        
        <div class="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
          <div class="text-sm text-gray-600">
            <div><strong>Orden:</strong> ${orderNumber}</div>
            <div><strong>Estado:</strong> <span class="text-green-600 font-semibold">Completado</span></div>
          </div>
        </div>
        
        <div class="p-4 bg-green-50 rounded-lg">
          <h4 class="font-semibold mb-2 text-green-800">¡Gracias por tu compra!</h4>
          <ul class="text-sm text-green-700 space-y-1">
            <li>• Tu orden ha sido confirmada y procesada</li>
            <li>• Recibirás un correo de confirmación</li>
            <li>• Te contactaremos pronto para coordinar la entrega</li>
            <li>• Para cualquier consulta, contáctanos por WhatsApp</li>
          </ul>
        </div>
        
        <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button onclick="navigateToHome()" class="px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-semibold">
            Continuar Comprando
          </button>
          <button onclick="openWhatsAppForOrder('${orderNumber}')" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center space-x-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
            </svg>
            <span>Ir a WhatsApp</span>
          </button>
        </div>
      </div>
    `;
    return;
  }
  
  content.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h3 class="text-xl font-bold text-green-600 mb-2">¡Pago Completado!</h3>
        <p class="text-gray-600">Tu orden ha sido procesada exitosamente</p>
      </div>
      
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-3 text-gray-800">📋 Detalles de la Orden</h4>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Número de Orden:</span>
            <span class="text-gray-900 font-mono">${order.orderNumber}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Total Pagado:</span>
            <span class="text-gray-900 font-semibold">$${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Método de Pago:</span>
            <span class="text-gray-900">${order.paymentMethod}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Estado:</span>
            <span class="text-green-600 font-semibold">Completado</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Fecha:</span>
            <span class="text-gray-900">${new Date(order.orderDate).toLocaleDateString('es-ES')}</span>
          </div>
        </div>
      </div>
      
      <div class="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 class="font-semibold mb-3 text-blue-800">📦 Productos</h4>
        <div class="space-y-2">
          ${order.items.map(item => `
            <div class="flex justify-between items-center py-2 border-b border-blue-100 last:border-b-0">
              <div>
                <span class="font-medium text-gray-800">${item.product}</span>
                <span class="text-sm text-gray-600 ml-2">x${item.quantity}</span>
              </div>
              <span class="text-sm font-medium text-gray-700">$${(item.priceUSD * item.quantity).toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <button onclick="navigateToHome()" class="px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-semibold">
          Continuar Comprando
        </button>
        <button onclick="openWhatsAppForOrder('${order.orderNumber || orderNumber}')" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center space-x-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
          </svg>
          <span>Ir a WhatsApp</span>
        </button>
      </div>
    </div>
  `;
}

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// DUPLICATE REMOVED - Using the main handler at line 2713

// Function to render payment pending page content
function renderPaymentPendingPage(orderNumber) {
  const content = document.getElementById('paymentPendingContent');
  if (!content) return;
  
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    content.innerHTML = '<div class="text-center text-red-500">Orden no encontrada.</div>';
    return;
  }
  
  content.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h3 class="text-xl font-bold text-yellow-600 mb-2">Orden Pendiente</h3>
        <p class="text-gray-600">Tu orden está esperando confirmación de pago</p>
      </div>
      
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-3 text-gray-800">📋 Detalles de la Orden</h4>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Número de Orden:</span>
            <span class="text-gray-900 font-mono">${order.orderNumber}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Total a Pagar:</span>
            <span class="text-gray-900 font-semibold">$${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Método de Pago:</span>
            <span class="text-gray-900">${order.paymentMethod}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Estado:</span>
            <span class="text-yellow-600 font-semibold">Pendiente</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-gray-700">Fecha:</span>
            <span class="text-gray-900">${new Date(order.orderDate).toLocaleDateString('es-ES')}</span>
          </div>
        </div>
      </div>
      
      <div class="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <h4 class="font-semibold mb-3 text-yellow-800">💳 Instrucciones de Pago</h4>
        <div class="space-y-3 text-sm text-yellow-700">
          <p>1. Completa el pago usando el método seleccionado</p>
          <p>2. Guarda el comprobante de pago</p>
          <p>3. Contacta a soporte con tu número de orden</p>
          <p>4. Envía el comprobante por WhatsApp</p>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <button onclick="navigateToHome()" class="px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-semibold">
          Continuar Comprando
        </button>
        <button onclick="openWhatsAppForOrder('${order.orderNumber || orderNumber}')" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center space-x-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
          </svg>
          <span>Ir a WhatsApp</span>
        </button>
      </div>
    </div>
  `;
}

// Function to get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// DUPLICATE REMOVED - Using the main handler at line 2713

