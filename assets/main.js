// global var
const API_URL = "https://script.google.com/macros/s/AKfycbwaCPJPEUs7mM-QP8QuzFSgVl40nBq6Vpt7iCf1R2t_L9Bk57rBA73HeuRThY1dREhT/exec";
let allProducts = [];
let allProductsWithVariants = []; // includes all products including variants (models)
let searchTimeout;

// route function
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
  // Close mobile menu if on mobile
  if (window.innerWidth <= 768 && window.closeMobileMenu) {
    window.closeMobileMenu();
  }
  updateUrl({ page: 'product', product: productId });
  showProductPage(productId);
}

function navigateToHome() {
  updateUrl({ page: 'home', category: null, collection: null, product: null });
  showHomePage();
}

function navigateToCheckout() {
  updateUrl({ page: 'checkout' });
  showCheckoutPage();
}

function showCheckoutPage() {
  hideAllPages();
  document.getElementById('checkout-page').classList.remove('hidden');
  
  // Check if cart is empty and hide button immediately
  const cart = getCart();
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn && cart.length === 0) {
    checkoutBtn.style.display = 'none';
  }
  
  // Dynamically load checkout.js if not already loaded
  if (!window.checkoutLoaded) {
    const script = document.createElement('script');
    script.src = 'assets/checkout.js';
    script.onload = function() { 
      window.checkoutLoaded = true;
      // Initialize after script loads
      if (window.renderCheckoutSummary) {
        window.renderCheckoutSummary();
        window.setupPaymentMethods();
        window.setupCheckoutButton();
        window.setupDeliveryOptions();
      }
    };
    document.body.appendChild(script);
  } else if (window.renderCheckoutSummary) {
    window.renderCheckoutSummary();
    window.setupPaymentMethods();
    window.setupCheckoutButton();
    window.setupDeliveryOptions();
  }
}

function showPaymentPage(method, orderNumber) {
  hideAllPages();
  document.getElementById('payment-page').classList.remove('hidden');
  renderPaymentPage(method, orderNumber);
  // set the order ID in the input
  document.getElementById('orderIdInput').value = orderNumber;
}

function showApartadoPage(orderNumber) {
  hideAllPages();
  document.getElementById('apartado-page').classList.remove('hidden');
  renderApartadoPage(orderNumber);
  // set the order ID in the input
  document.getElementById('apartadoOrderIdInput').value = orderNumber;
}

// page display functions
function hideAllPages() {
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('category-page').classList.add('hidden');
  document.getElementById('product-page').classList.add('hidden');
  document.getElementById('checkout-page').classList.add('hidden');
  document.getElementById('payment-page').classList.add('hidden');
  document.getElementById('apartado-page').classList.add('hidden');
  document.getElementById('order-details-page').classList.add('hidden');
  document.getElementById('breadcrumb').classList.add('hidden');
}

function showHomePage() {
  hideAllPages();
  document.getElementById('main-content').classList.remove('hidden');
  // Clear search
  document.getElementById('search').value = '';
}

function showCategoryPage(name, type) {
  hideAllPages();
  document.getElementById('category-page').classList.remove('hidden');
  
  // update titles
  const title = document.getElementById('category-title');
  title.textContent = name;
  
  // breadcrumbs
  const breadcrumb = document.getElementById('breadcrumb');
  const typeText = type === 'category' ? 'Categoría' : 'Colección';
  breadcrumb.innerHTML = `
    <a href="#" onclick="navigateToHome()">Inicio</a> / 
    <span>${typeText}</span> / 
    <strong>${name}</strong>
  `;
  breadcrumb.classList.remove('hidden');
  
  // filtred produtcs
  const field = type === 'category' ? 'Category' : 'Collection';
  const filtered = allProducts.filter(product => {
    const values = (product[field] || '').split(',').map(v => v.trim().toLowerCase());
    return values.includes(name.toLowerCase());
  });
  
  // stock count update
  document.getElementById('product-count').textContent = `${filtered.length} productos encontrados`;
  
  // product render
  renderCategoryProducts(filtered);
  
  // s
  setupSorting(filtered);
}

function showProductPage(productId) {
  hideAllPages();
  
  // check if there's a specific variant in the URL
  const params = getUrlParams();
  const variantId = params.variant;
  
  let product;
  if (variantId && variantId.toString().startsWith(productId.toString().split('.')[0])) {
    // show specific variant only if it belongs to the requested product family
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === variantId);
  } else {
    // show main product and clear any unrelated variant from URL
    product = allProducts.find(p => p.ItemID.toString() === productId.toString());
    
    // clear variant parameter if it doesn't belong to this product
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
  
  // above
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
  const stock = parseInt(product.Stock) || 0;
  const maxQuantity = stock <= 1 ? 1 : stock;
  const isLowStock = stock <= 1;
  const isSoldOut = stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '';
  
  // debug log to see stock values
  console.log('Product:', product.Product, 'Stock:', product.Stock, 'Parsed stock:', stock, 'Is sold out:', isSoldOut);
  
  // collect all available images from the spreadsheet - handle comma separated urls
  let images = [];
  if (product.Image) {
    // split by comma and trim whitespace to handle multiple urls in one cell
    const imageUrls = product.Image.split(',').map(url => url.trim());
    images = imageUrls.filter(url => url && url.length > 0); // remove empty urls
  }
  // fallback to old method if no comma separated urls found
  if (images.length === 0 && product.Image) {
    images = [product.Image];
    if (product.Image2) images.push(product.Image2);
    if (product.Image3) images.push(product.Image3);
  }
  
  // create image carousel if multiple images exist, otherwise just show single image
  const imageCarousel = images.length > 1 ? `
    <div class="image-carousel-container relative">
      <button class="carousel-arrow carousel-arrow-left" onclick="changeImage('${product.ItemID}', -1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15,18 9,12 15,6"></polyline>
        </svg>
      </button>
        <div class="image-carousel" id="imageCarousel-${product.ItemID}">
          ${images.map((img, index) => `
            <img src="${img}" alt="${product.Product}" class="carousel-image ${index === 0 ? 'active' : ''}" data-index="${index}">
         `).join('')}
        </div>
      <button class="carousel-arrow carousel-arrow-right" onclick="changeImage('${product.ItemID}', 1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9,18 15,12 9,6"></polyline>
        </svg>
      </button>
      <div class="carousel-dots">
        ${images.map((_, index) => `
          <button class="carousel-dot ${index === 0 ? 'active' : ''}" onclick="goToImage('${product.ItemID}', ${index})"></button>
        `).join('')}
      </div>
    </div>
  ` : `
    <img src="${product.Image}" alt="${product.Product}" class="w-full rounded-lg shadow-lg">
  `;
  
  // check if this product has variants
  const variants = getVariantThumbnails(product.ItemID);
  const hasVariants = variants.length > 0;
  
  container.innerHTML = `
    <div class="fade-in">
      ${imageCarousel}
      ${hasVariants ? `
        <div class="variant-thumbnails">
          <h4>Modelos disponibles:</h4>
          <div class="flex gap-2 justify-center">
            ${variants.map(variant => {
              // get first image from comma separated urls for thumbnail
              let firstImage = variant.Image;
              if (variant.Image && variant.Image.includes(',')) {
                firstImage = variant.Image.split(',')[0].trim();
              }
              
              const isActive = variant.ItemID.toString() === product.ItemID.toString();
              const isMainVariant = variant.ItemID.toString() === product.ItemID.toString().split('.')[0];
              
              return `
                <div class="variant-thumbnail ${isActive ? 'active' : ''}" data-variant-id="${variant.ItemID}" onclick="switchToVariant('${variant.ItemID}')">
                  <img src="${firstImage}" alt="${variant.Product}">
                  ${!isMainVariant ? `<p>${variant.Product}</p>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
    <div class="fade-in">
      <!-- Product Info Card: Title, Price, Description, Payment Methods, Add to Cart -->
      <div class="product-info-card">
        <h1 class="product-detail-title">${product.Product}</h1>
        <div class="product-detail-price">
          <span class="price-usd">$${product.USD}</span>
          <span class="price-separator">|</span>
          <span class="price-bs">Bs ${product.Bs}</span>
        </div>
        
        <div class="product-description">
          <h3>  Descripción:</h3>
          <p>${product.Description || 'Sin descripción disponible'}</p>
        </div>
        
        <div class="payment-methods-section">
          <h3>Métodos de pago disponibles:</h3>
          <div class="payment-methods-grid">
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
          </div>
        </div>
        
        ${!isSoldOut ? `
        <!-- Quantity and Add to Cart Section -->
        <div class="quantity-cart-section">
          <div class="quantity-controls">
            <button class="quantity-btn minus-btn" onclick="changeQuantity('${product.ItemID}', -1)" ${isLowStock ? 'disabled' : ''}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <span class="quantity-display" id="quantity-${product.ItemID}">1</span>
            <button class="quantity-btn plus-btn" onclick="changeQuantity('${product.ItemID}', 1)" ${isLowStock ? 'disabled' : ''}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
          <button onclick="addToCartWithQuantity('${product.ItemID}')" 
                  class="add-to-cart-large cart-icon">
            Agregar al carrito
          </button>
        </div>
        
        ${isLowStock ? '<p class="stock-warning">Stock limitado</p>' : ''}
        ` : `
        <!-- Sold Out Section -->
        <div class="quantity-cart-section">
          <button class="sold-out-button-large" onclick="showSoldOutMessage()">
            SOLD OUT
          </button>
        </div>
        `}
      </div>
    </div>
  `;
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

function switchToVariant(variantId) {
  const variant = window.allProductsWithVariants.find(p => p.ItemID.toString() === variantId.toString());
  if (variant) {
    // update product details without re-rendering the entire page
    const productDetail = document.getElementById('product-detail');
    if (productDetail) {
      // update product name
      const productName = productDetail.querySelector('.product-detail-title');
      if (productName) {
        productName.textContent = variant.Product;
      }
      
      // update product description
      const productDescription = productDetail.querySelector('.product-description p');
      if (productDescription) {
        productDescription.textContent = variant.Description || 'Sin descripción disponible';
      }
      
      // update price
      const priceUsd = productDetail.querySelector('.price-usd');
      const priceBs = productDetail.querySelector('.price-bs');
      if (priceUsd) {
        priceUsd.textContent = `$${variant.USD}`;
      }
      if (priceBs) {
        priceBs.textContent = `Bs ${variant.Bs}`;
      }
      
      // update stock (we'll handle this with the add to cart button)
      const stock = parseInt(variant.Stock) || 0;
      const isLowStock = stock <= 1;
      const isSoldOut = stock <= 0 || variant.Stock === null || variant.Stock === undefined || variant.Stock === '';
      
      // debug log to see stock values when switching variants
      console.log('Variant:', variant.Product, 'Stock:', variant.Stock, 'Parsed stock:', stock, 'Is sold out:', isSoldOut);
      
      // completely re-render the quantity-cart-section based on stock status
      const quantityCartSection = productDetail.querySelector('.quantity-cart-section');
      if (quantityCartSection) {
        if (!isSoldOut) {
          // render quantity controls and add to cart button
          quantityCartSection.innerHTML = `
            <div class="quantity-controls">
              <button class="quantity-btn minus-btn" onclick="changeQuantity('${variant.ItemID.toString()}', -1)" ${isLowStock ? 'disabled' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <span class="quantity-display" id="quantity-${variant.ItemID.toString()}">1</span>
              <button class="quantity-btn plus-btn" onclick="changeQuantity('${variant.ItemID.toString()}', 1)" ${isLowStock ? 'disabled' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
            <button onclick="addToCartWithQuantity('${variant.ItemID.toString()}')" 
                    class="add-to-cart-large cart-icon">
              Agregar al carrito
            </button>
          `;
        } else {
          // render sold out button
          quantityCartSection.innerHTML = `
            <button class="sold-out-button-large" onclick="showSoldOutMessage()">
              SOLD OUT
            </button>
          `;
        }
      }
      
      // update stock warning if it exists
      const stockWarning = productDetail.querySelector('.stock-warning');
      if (stockWarning) {
        if (isLowStock && !isSoldOut) {
          stockWarning.style.display = 'block';
        } else {
          stockWarning.style.display = 'none';
        }
      }
      
      // update main image carousel
      const imageCarousel = productDetail.querySelector('.image-carousel');
      if (imageCarousel) {
        // parse images from variant
        let images = [];
        if (variant.Image && variant.Image.includes(',')) {
          images = variant.Image.split(',').map(url => url.trim()).filter(url => url);
        } else if (variant.Image) {
          images = [variant.Image];
        } else if (variant.Image2) {
          images = [variant.Image2];
        } else if (variant.Image3) {
          images = [variant.Image3];
        }
        
        if (images.length > 0) {
          // update carousel images
          const carouselImages = imageCarousel.querySelectorAll('.carousel-image');
          carouselImages.forEach((img, index) => {
            if (index < images.length) {
              img.src = images[index];
              img.alt = variant.Product;
              img.style.display = index === 0 ? 'block' : 'none';
            } else {
              img.style.display = 'none';
            }
          });
          
          // update carousel dots
          const dotsContainer = productDetail.querySelector('.carousel-dots');
          if (dotsContainer && images.length > 1) {
            dotsContainer.innerHTML = images.map((_, index) => 
              `<button class="carousel-dot ${index === 0 ? 'active' : ''}" onclick="goToImage('${variant.ItemID.toString()}', ${index})"></button>`
            ).join('');
          }
          
          // update carousel arrows
          const leftArrow = productDetail.querySelector('.carousel-arrow-left');
          const rightArrow = productDetail.querySelector('.carousel-arrow-right');
          if (leftArrow) {
            leftArrow.onclick = () => changeImage(variant.ItemID.toString(), -1);
          }
          if (rightArrow) {
            rightArrow.onclick = () => changeImage(variant.ItemID.toString(), 1);
          }
        }
      }
      
      // also update single image if no carousel
      const singleImage = productDetail.querySelector('img:not(.carousel-image)');
      if (singleImage && !imageCarousel) {
        let imageUrl = variant.Image;
        if (variant.Image && variant.Image.includes(',')) {
          imageUrl = variant.Image.split(',')[0].trim();
        }
        if (imageUrl) {
          singleImage.src = imageUrl;
          singleImage.alt = variant.Product;
        }
      }
      
      // update variant thumbnails to show current variant as active
      const variantThumbnails = productDetail.querySelectorAll('.variant-thumbnail');
      variantThumbnails.forEach(thumb => {
        thumb.classList.remove('active');
        if (thumb.getAttribute('data-variant-id') === variantId.toString()) {
          thumb.classList.add('active');
        }
      });
    }
    
    // update URL to reflect the current variant
    const currentUrl = new URL(window.location);
    currentUrl.searchParams.set('variant', variantId);
    window.history.pushState({}, '', currentUrl.toString());
    
    // update breadcrumb to show current variant name
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) {
      breadcrumb.innerHTML = `
        <a href="#" onclick="navigateToHome()">Inicio</a> / 
        <a href="#" onclick="history.back()">Productos</a> / 
        <strong>${variant.Product}</strong>
      `;
    }
  }
}

// image carousel functions - for when products have multiple images
function changeImage(productId, direction) {
  const carousel = document.getElementById(`imageCarousel-${productId}`);
  if (!carousel) return;
  
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
  if (!carousel) return;
  
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

function handleRouting() {
  const params = getUrlParams();
  
  switch (params.page) {
    case 'category':
      if (params.category) {
        showCategoryPage(params.category, 'category');
      } else {
        navigateToHome();
      }
      break;
    case 'collection':
      if (params.collection) {
        showCategoryPage(params.collection, 'collection');
      } else {
        navigateToHome();
      }
      break;
    case 'product':
      if (params.product) {
        showProductPage(params.product);
      } else {
        navigateToHome();
      }
      break;
    case 'checkout':
      showCheckoutPage();
      break;
    case 'pay':
      if (params.method && params.order) {
        showPaymentPage(params.method, params.order);
      } else {
        navigateToHome();
      }
      break;
    case 'apartado':
      if (params.order) {
        showApartadoPage(params.order);
      } else {
        navigateToHome();
      }
      break;
    default:
      showHomePage();
  }
}

// this is the cart code alledgely (no se como se escribe)
function getCart() {
  return JSON.parse(localStorage.getItem("cart") || "[]");
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

// quantity control functions
function changeQuantity(productId, change) {
  let quantityDisplay = document.getElementById(`quantity-${productId}`);
  if (!quantityDisplay) return;
  
  const currentQuantity = parseInt(quantityDisplay.textContent) || 1;
  let product;
  
  // handle both card- prefixed IDs and regular IDs
  if (productId.startsWith('card-')) {
    const realId = productId.replace('card-', '');
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === realId.toString());
  } else {
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === productId.toString());
  }
  
  if (!product) return;
  
  const stock = parseInt(product.Stock) || 0;
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
  let product, quantityDisplay;
  
  // handle both card- prefixed IDs and regular IDs
  if (productId.startsWith('card-')) {
    const realId = productId.replace('card-', '');
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === realId.toString());
    quantityDisplay = document.getElementById(`quantity-card-${realId}`);
  } else {
    product = window.allProductsWithVariants.find(p => p.ItemID.toString() === productId.toString());
    quantityDisplay = document.getElementById(`quantity-${productId}`);
  }
  
  if (!product || !quantityDisplay) {
    console.error('Product or quantity display not found:', productId);
    return;
  }
  
  const quantity = parseInt(quantityDisplay.textContent) || 1;
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
  const cart = getCart();
  const existing = cart.find(p => p.ItemID.toString() === product.ItemID.toString());
  
  if (existing) {
    const stock = parseInt(product.Stock) || 0;
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

// cart notification function
function showCartNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'cart-notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // show notification
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  // hide and remove notification
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
}

// sold out message function
function showSoldOutMessage() {
  showCartNotification('No hay stock disponible para este producto.');
}

// Cart modal logic
function openCartModal() {
  renderCartModal();
  document.getElementById('cartModal').style.display = 'flex';
}
function closeCartModal() {
  document.getElementById('cartModal').style.display = 'none';
}

// Attach openCartModal to cart icons
if (document.getElementById('cartIconBtn')) {
  document.getElementById('cartIconBtn').onclick = openCartModal;
}
if (document.getElementById('cartIconBtnMobile')) {
  document.getElementById('cartIconBtnMobile').onclick = openCartModal;
}

// Attach navigateToCheckout to the cart modal checkout button
const cartCheckoutBtn = document.querySelector('.cart-modal-checkout');
if (cartCheckoutBtn) {
  cartCheckoutBtn.onclick = function() {
    closeCartModal();
    navigateToCheckout();
  };
}

// Add event listener to close cart modal when clicking outside the modal box
const cartModalOverlay = document.getElementById('cartModal');
if (cartModalOverlay) {
  cartModalOverlay.addEventListener('click', function(e) {
    if (e.target === cartModalOverlay) {
      closeCartModal();
    }
  });
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
    totalUSD += (parseFloat(item.USD) || 0) * item.quantity;
    totalBS += (parseFloat(item.Bs) || 0) * item.quantity;
    totalCount += item.quantity;
    return `
      <div class="cart-item-row">
        <img src="${item.Image}" class="cart-item-img" alt="${item.Product}">
        <div class="cart-item-info">
          <div class="cart-item-title">${item.Product}</div>
          <div class="cart-item-price">$${item.USD} | Bs ${item.Bs}</div>
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
  const mobileSearchBar = document.getElementById('mobile-search-bar');

  function clearSearch() {
    if (searchInput) searchInput.value = "";
    if (searchMobileInput) searchMobileInput.value = "";
    searchResults.classList.add("hidden");
    if (mobileSearchResults) mobileSearchResults.innerHTML = "";
    handleRouting(); // return - volver
    searchProducts.innerHTML = "";
    noResults.classList.add("hidden");
  }

  function renderSearchResults(products, isMobile) {
    if (isMobile && mobileSearchResults) {
      mobileSearchResults.innerHTML = "";
      if (!products.length) {
        mobileSearchResults.innerHTML = '<p class="text-center text-gray-500 mt-8 text-lg">No se encontraron productos.</p>';
        return;
      }
      products.forEach(product => {
        if (product.Product && product.Image) {
          mobileSearchResults.appendChild(renderCard(product));
        }
      });
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
          searchProducts.appendChild(renderCard(product));
        }
      });
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      const term = e.target.value.trim().toLowerCase();
      if (!term) {
        clearSearch();
        return;
      }
      searchLoading.classList.remove("hidden");
      searchTimeout = setTimeout(() => {
        const filtered = allProducts.filter(product => {
          const matches = [product.Product, product.Description, product.Category, product.Collection].some(field =>
            (field || "").toLowerCase().includes(term)
          );
          return matches;
        });
        hideAllPages();
        searchResults.classList.remove("hidden");
        renderSearchResults(filtered, false);
        searchLoading.classList.add("hidden");
      }, 300);
    });
  }

  if (searchMobileInput) {
    searchMobileInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      const term = e.target.value.trim().toLowerCase();
      // Hide main search results when overlay is open
      if (searchResults) searchResults.classList.add("hidden");
      // HIDE MAIN CONTENT ON MOBILE SEARCH
      if (mainContent) mainContent.classList.add("hidden");
      if (!term) {
        if (mobileSearchResults) mobileSearchResults.innerHTML = "";
        // SHOW MAIN CONTENT AGAIN IF SEARCH IS CLEARED
        if (mainContent) mainContent.classList.remove("hidden");
        mobileSearchBar.style.display = 'none';
        return;
      }
      if (mobileSearchResults) mobileSearchResults.innerHTML = '<div class="w-full text-center py-4 text-pink-400">Buscando...</div>';
      searchTimeout = setTimeout(() => {
        const filtered = allProducts.filter(product => {
          const matches = [product.Product, product.Description, product.Category, product.Collection].some(field =>
            (field || "").toLowerCase().includes(term)
          );
          return matches;
        });
        renderSearchResults(filtered, true);
      }, 300);
    });
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
function renderCard(product) {
  const stock = parseInt(product.Stock) || 0;
  const maxQuantity = stock <= 1 ? 1 : stock;
  const isLowStock = stock <= 1;
  const isSoldOut = stock <= 0 || product.Stock === null || product.Stock === undefined || product.Stock === '';
  const cardId = `card-${product.ItemID}`;

  const div = document.createElement("div");
  div.className = "product-card-kawaii fade-in";
  // get first image from comma separated urls for the card
  let firstImage = product.Image;
  if (product.Image && product.Image.includes(',')) {
    firstImage = product.Image.split(',')[0].trim();
  }
  
  div.innerHTML = `
    <div class="cursor-pointer" onclick="navigateToProduct(${product.ItemID})">
      <img src="${firstImage}" alt="${product.Product}" class="w-full h-48 object-cover">
      <h3 class="product-title">${product.Product}</h3>
      <p class="product-price">
        <span class="price-usd">$${product.USD}</span>
        <span class="price-separator">|</span>
        <span class="price-bs">Bs ${product.Bs}</span>
      </p>
    </div>
    
    <!-- stock warning at the top - only show for low stock, not sold out -->
    ${isLowStock && !isSoldOut ? '<p class="stock-warning mt-2 mb-2">Stock limitado</p>' : ''}

    <!-- spacer to push controls to bottom -->
    <div style="flex-grow: 1;"></div>

    <!-- quantity controls buttons centered at bottom - always visible -->
    <div class="quantity-controls mb-2" style="justify-content: center; padding: 8px 16px;">
      <button class="quantity-btn minus-btn" onclick="changeQuantity('card-${product.ItemID}', -1)" ${isSoldOut || isLowStock ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <span class="quantity-display" id="quantity-card-${product.ItemID}">${isSoldOut ? '0' : '1'}</span>
      <button class="quantity-btn plus-btn" onclick="changeQuantity('card-${product.ItemID}', 1)" ${isSoldOut || isLowStock ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>

    <!-- add to cart button or sold out-->
    ${isSoldOut ? 
      `<button class="sold-out-button w-full" onclick="showSoldOutMessage()">
        SOLD OUT
      </button>` : 
      `<button class="add-to-cart-small cart-icon w-full" onclick="addToCartWithQuantity('card-${product.ItemID}')">
        Agregar al carrito
      </button>`
    }
  `;
  return div;
}

function renderProductMini(product) {
  // get first image from comma separated urls for the mini card
  let firstImage = product.Image;
  if (product.Image && product.Image.includes(',')) {
    firstImage = product.Image.split(',')[0].trim();
  }
  
  return `
    <div class="block hover:bg-gray-100 p-3 rounded-lg cursor-pointer transition-colors" onclick="navigateToProduct(${product.ItemID})">
      <div class="flex gap-3 items-center">
        <img src="${firstImage}" class="w-12 h-12 object-cover rounded-lg">
        <div class="flex-1">
          <p class="text-sm font-semibold text-gray-800 mb-1 leading-tight">${product.Product}</p>
          <p class="text-xs font-medium" style="background: linear-gradient(135deg, #ff6b9d, #ff8fab); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
            $${product.USD} | Bs ${product.Bs}
          </p>
        </div>
      </div>
    </div>
  `;
}

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
  
  box.innerHTML = "";
  output.innerHTML = "";

  values.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "bg-pink-200 hover:bg-pink-300 text-sm px-3 py-1 rounded mr-2 mb-2 transition-colors";
    btn.textContent = name;
    btn.onclick = () => {
      if (isCollection) {
        navigateToCollection(name);
      } else {
        navigateToCategory(name);
      }
    };
    box.appendChild(btn);
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
    
    // determine if order can be reprocessed (pending or apartado status)
    const canReprocess = order.status === 'pending' || order.status === 'apartado';
    
    // determines if order can be deleted (only pending)
    const canDelete = order.status === 'pending';
    
    return `
      <div class="order-history-item" style="
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-weight: bold; color: #ff6b9d;">${order.orderNumber.split('-')[0]}-${order.orderNumber.split('-')[2]}</div>
          <div style="
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            background: ${order.status === 'pending' ? '#fef3c7' : order.status === 'apartado' ? '#dbeafe' : '#d1fae5'};
            color: ${order.status === 'pending' ? '#92400e' : order.status === 'apartado' ? '#1e40af' : '#065f46'};
          ">
            ${order.status === 'pending' ? ' Pendiente' : order.status === 'apartado' ? ' Apartado' : ' Completado'}
          </div>
        </div>
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">${orderDate}</div>
        <div style="margin-bottom: 8px;">
          ${itemsList}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-weight: bold; color: #374151;">
            $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}
          </div>
          <div style="font-size: 12px; color: #6b7280;">${order.paymentMethod}</div>
        </div>
        
        <!-- Action Buttons -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="viewOrderDetails('${order.orderNumber}')" 
                  style="
                    padding: 6px 12px;
                    background: #f3f4f6;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 12px;
                    color: #374151;
                    cursor: pointer;
                    transition: all 0.2s;
                  " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
            Ver detalles
          </button>
          
          <button onclick="contactSupport('${order.orderNumber}')" 
                  style="
                    padding: 6px 12px;
                    background: #dbeafe;
                    border: 1px solid #93c5fd;
                    border-radius: 6px;
                    font-size: 12px;
                    color: #1e40af;
                    cursor: pointer;
                    transition: all 0.2s;
                  " onmouseover="this.style.background='#bfdbfe'" onmouseout="this.style.background='#dbeafe'">
            Más información
          </button>
          
          ${canReprocess ? `
            <button onclick="reprocessPayment('${order.orderNumber}')" 
                    style="
                      padding: 6px 12px;
                      background: #fef3c7;
                      border: 1px solid #fbbf24;
                      border-radius: 6px;
                      font-size: 12px;
                      color: #92400e;
                      cursor: pointer;
                      transition: all 0.2s;
                    " onmouseover="this.style.background='#fde68a'" onmouseout="this.style.background='#fef3c7'">
              Reprocesar pago
            </button>
          ` : ''}
          
          ${canDelete ? `
            <button onclick="deleteOrder('${order.orderNumber}')" 
                    style="
                      padding: 6px 12px;
                      background: #fee2e2;
                      border: 1px solid #fca5a5;
                      border-radius: 6px;
                      font-size: 12px;
                      color: #dc2626;
                      cursor: pointer;
                      transition: all 0.2s;
                    " onmouseover="this.style.background='#fecaca'" onmouseout="this.style.background='#fee2e2'">
              Eliminar
            </button>
          ` : ''}
        </div>
        
        <div style="margin-top: 8px; font-size: 11px; color: #9ca3af; font-family: monospace;">
          ${order.orderNumber}
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
    </div>
  `;
  
  document.body.appendChild(modal);
  
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

// payment processing functions
function renderPaymentPage(method, orderNumber) {
  const paymentContent = document.getElementById('paymentContent');
  if (!paymentContent) return;
  
  // get order from history
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    paymentContent.innerHTML = '<div class="text-center text-red-500">Orden no encontrada.</div>';
    return;
  }
  
  const methodLabels = {
    'paypal': 'PayPal',
    'zelle': 'Zelle',
    'binance': 'Binance',
    'pago-movil': 'Pago Móvil'
  };
  
  const methodLabel = methodLabels[method] || method;
  
  paymentContent.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 class="text-xl font-bold mb-4 text-center">${methodLabel}</h3>
      
      <!-- Order Summary -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
        <div class="text-sm text-gray-600">
          <div><strong>Orden:</strong> ${order.orderNumber.split('-')[0]}-${order.orderNumber.split('-')[2]}</div>
          <div><strong>Transacción:</strong> ${order.orderNumber}</div>
          <div><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</div>
          <div><strong>Fecha:</strong> ${new Date(order.orderDate).toLocaleDateString('es-ES')}</div>
        </div>
      </div>
      
      <!-- Payment Information -->
      <div class="mb-6 p-4 bg-blue-50 rounded-lg">
        <h4 class="font-semibold mb-3 text-blue-800">💳 Información de Pago</h4>
        ${method === 'pago-movil' ? `
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Banco:</span>
              <span class="text-gray-900">Mercantil</span>
            </div>
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Número:</span>
              <span class="text-gray-900">0412-849-5036</span>
            </div>
            <div class="flex justify-between">
              <span class="font-medium text-gray-700">Cédula:</span>
              <span class="text-gray-900">28256608</span>
            </div>
          </div>
        ` : method === 'paypal' ? `
          <div class="space-y-3 text-sm">
            <div class="text-center">
              <span class="font-medium text-gray-700">PayPal Me:</span>
            </div>
            <div class="text-center">
              <a href="https://www.paypal.me/indigostore" target="_blank" class="text-blue-600 hover:text-blue-800 underline break-all">
                https://www.paypal.me/indigostore
              </a>
            </div>
            <div class="text-center">
              <a href="https://www.paypal.me/indigostore" target="_blank" 
                 class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <svg class="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.067 8.478c.492.315.844.825.844 1.478 0 .653-.352 1.163-.844 1.478-.492.315-1.163.478-1.844.478H4.777c-.681 0-1.352-.163-1.844-.478C2.441 11.816 2.089 11.306 2.089 10.653c0-.653.352-1.163.844-1.478.492-.315 1.163-.478 1.844-.478h13.446c.681 0 1.352.163 1.844.478z"/>
                </svg>
                Abrir PayPal
              </a>
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
        ` : `
          <p class="text-blue-700 text-sm">Información de pago no disponible para este método.</p>
        `}
        <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p class="text-yellow-800 text-sm font-medium">
            ⚠️ Realiza el pago antes de subir el comprobante
          </p>
        </div>
      </div>
      
      <!-- Payment Confirmation -->
      <div class="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
        <h4 class="font-semibold mb-3 text-green-800">✅ Confirmar Pago</h4>
        <div class="flex items-center mb-3">
          <input type="checkbox" id="paymentConfirmed" class="mr-3 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded">
          <label for="paymentConfirmed" class="text-sm text-gray-700">
            Confirmo que he realizado el pago según la información proporcionada
          </label>
        </div>
        <p class="text-xs text-green-700">
          Solo podrás subir el comprobante después de confirmar que has realizado el pago.
        </p>
      </div>
      
      <!-- Image Upload -->
      <div class="mb-6" id="imageUploadSection">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Subir Comprobante de Pago (Screenshot)
        </label>
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center opacity-50 pointer-events-none" id="uploadArea">
          <input type="file" id="paymentImage" accept="image/*" class="hidden" onchange="previewPaymentImage(this)" disabled>
          <label for="paymentImage" class="cursor-not-allowed">
            <div class="text-gray-400 mb-2">
              <svg class="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div class="text-sm text-gray-600">
              <span class="font-medium text-gray-400">Confirma el pago primero</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">PNG, JPG, GIF hasta 10MB</p>
          </label>
        </div>
        <div id="imagePreview" class="mt-4 hidden">
          <img id="previewImg" class="max-w-full h-auto rounded-lg border" alt="Preview">
          <button onclick="removePaymentImage()" class="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600">
            Remover imagen
          </button>
        </div>
      </div>
      
      <!-- Transaction ID Input -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          ID de Transacción (opcional)
        </label>
        <input type="text" id="transactionId" placeholder="Ingresa el ID de transacción si lo tienes" 
               class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent">
      </div>
      
      <!-- Submit Button -->
      <button id="submitPaymentBtn" onclick="submitPayment('${method}', '${orderNumber}')" 
              class="w-full bg-gray-400 text-white py-3 px-6 rounded-lg transition font-semibold cursor-not-allowed" disabled>
        Finalizar compra
      </button>
    </div>
  `;
  
  // Add event listener for payment confirmation
  setTimeout(() => {
    const paymentConfirmed = document.getElementById('paymentConfirmed');
    const uploadArea = document.getElementById('uploadArea');
    const paymentImage = document.getElementById('paymentImage');
    
    if (paymentConfirmed && uploadArea && paymentImage) {
      paymentConfirmed.addEventListener('change', function() {
        if (this.checked) {
          uploadArea.classList.remove('opacity-50', 'pointer-events-none');
          uploadArea.classList.add('opacity-100');
          paymentImage.disabled = false;
          uploadArea.querySelector('label').classList.remove('cursor-not-allowed');
          uploadArea.querySelector('label').classList.add('cursor-pointer');
          uploadArea.querySelector('.text-gray-400').classList.remove('text-gray-400');
          uploadArea.querySelector('.text-gray-400').classList.add('text-pink-600', 'hover:text-pink-500');
          uploadArea.querySelector('.text-pink-600').textContent = 'Haz clic para subir o arrastra y suelta';
        } else {
          uploadArea.classList.add('opacity-50', 'pointer-events-none');
          uploadArea.classList.remove('opacity-100');
          paymentImage.disabled = true;
          uploadArea.querySelector('label').classList.add('cursor-not-allowed');
          uploadArea.querySelector('label').classList.remove('cursor-pointer');
          uploadArea.querySelector('.text-pink-600').classList.remove('text-pink-600', 'hover:text-pink-500');
          uploadArea.querySelector('.text-pink-600').classList.add('text-gray-400');
          uploadArea.querySelector('.text-gray-400').textContent = 'Confirma el pago primero';
        }
      });
    }
  }, 100);
}

function renderApartadoPage(orderNumber) {
  const apartadoContent = document.getElementById('apartadoContent');
  if (!apartadoContent) return;
  
  // get order from history
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    apartadoContent.innerHTML = '<div class="text-center text-red-500">Orden no encontrada.</div>';
    return;
  }
  
  apartadoContent.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 class="text-xl font-bold mb-4 text-center">Información de Apartado</h3>
      
      <!-- Order Summary -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 class="font-semibold mb-2">Resumen de la Orden</h4>
        <div class="text-sm text-gray-600">
          <div><strong>Orden:</strong> ${order.orderNumber.split('-')[0]}-${order.orderNumber.split('-')[2]}</div>
          <div><strong>Transacción:</strong> ${order.orderNumber}</div>
          <div><strong>Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</div>
          <div><strong>Fecha:</strong> ${new Date(order.orderDate).toLocaleDateString('es-ES')}</div>
          <div><strong>Estado:</strong> <span class="text-blue-600 font-semibold">Apartado</span></div>
        </div>
      </div>
      
      <!-- Items List -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Productos Apartados</h4>
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
      
      <!-- Address Information -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Dirección para Recoger</h4>
        <div class="p-4 bg-blue-50 rounded-lg">
          <p class="text-blue-800 font-medium">Indigo Store</p>
          <p class="text-blue-700 text-sm">Dirección: [Dirección se mostrará aquí]</p>
          <p class="text-blue-700 text-sm">Horario: [Horario se mostrará aquí]</p>
        </div>
      </div>
      
      <!-- Google Maps Widget -->
      <div class="mb-6">
        <h4 class="font-semibold mb-2">Ubicación</h4>
        <div class="bg-gray-200 rounded-lg p-4 text-center">
          <p class="text-gray-600">Widget de Google Maps se mostrará aquí</p>
          <p class="text-sm text-gray-500 mt-2">Dirección: https://maps.app.goo.gl/MQ2BxeCVe8wEMx1B7</p>
        </div>
      </div>
      
      <!-- Instructions -->
      <div class="p-4 bg-yellow-50 rounded-lg">
        <h4 class="font-semibold mb-2 text-yellow-800">Instrucciones</h4>
        <ul class="text-sm text-yellow-700 space-y-1">
          <li>• Tu orden ha sido apartada exitosamente</li>
          <li>• Presenta tu número de orden al recoger</li>
          <li>• Tienes 24 horas para recoger tu pedido</li>
          <li>• Para cualquier consulta, contáctanos por WhatsApp</li>
        </ul>
      </div>
    </div>
  `;
}

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
    alert('Orden no encontrada');
    return;
  }
  
  // get payment method from order
  const methodMap = {
    'PayPal': 'paypal',
    'Zelle': 'zelle',
    'Binance': 'binance',
    'Pago Móvil': 'pago-movil'
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
    alert('Orden no encontrada');
    return;
  }
  
  renderApartadoPage(orderId);
}

function previewPaymentImage(input) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('previewImg').src = e.target.result;
      document.getElementById('imagePreview').classList.remove('hidden');
      
      // enable the submit button
      const submitBtn = document.getElementById('submitPaymentBtn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
        submitBtn.classList.add('bg-pink-500', 'hover:bg-pink-600');
      }
    };
    reader.readAsDataURL(file);
  }
}

function removePaymentImage() {
  document.getElementById('paymentImage').value = '';
  document.getElementById('imagePreview').classList.add('hidden');
  
  // disable the submit button
  const submitBtn = document.getElementById('submitPaymentBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.remove('bg-pink-500', 'hover:bg-pink-600');
    submitBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
  }
}

function submitPayment(method, orderNumber) {
  const transactionId = document.getElementById('transactionId').value.trim();
  const imageFile = document.getElementById('paymentImage').files[0];
  
  if (!imageFile) {
    alert('Por favor sube una imagen del comprobante de pago');
    return;
  }
  
  // get order from history
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    alert('Orden no encontrada');
    return;
  }
  
  // Disable submit button to prevent double submission
  const submitBtn = document.getElementById('submitPaymentBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Procesando...';
  
  // Convert image to base64
  const reader = new FileReader();
  reader.onload = function(e) {
    const imageData = e.target.result;
    const imageType = imageFile.name.split('.').pop().toLowerCase();
    
    // Send image to Google Apps Script
    sendImageToGoogleSheets(imageData, orderNumber, imageType, transactionId, method, order);
  };
  
  reader.readAsDataURL(imageFile);
}

function sendImageToGoogleSheets(imageData, orderNumber, imageType, transactionId, method, order) {
  // Google Apps Script web app URL
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby_X6j5zz4J1vi2cTcudshKXtZkYuMkxa543CK_bBCDjLeBgyUrmJl-B-Qw3hcXa7yC/exec';
  
  const orderData = {
    orderNumber: orderNumber,
    orderDate: new Date(order.orderDate).toLocaleString('es-ES'),
    paymentMethod: method,
    products: order.items.map(item => item.product).join(', '),
    quantities: order.items.map(item => item.quantity).join(', '),
    totalBS: order.totalBS.toFixed(2),
    totalUSD: order.totalUSD.toFixed(2),
    transactionId: transactionId,
    status: 'processing',
    imageData: imageData,
    imageType: imageType,
    deliveryMethod: order.deliveryMethod || '',
    deliveryInfo: order.deliveryInfo || null,
    customerName: order.deliveryInfo ? order.deliveryInfo.name : '',
    customerPhone: order.deliveryInfo ? order.deliveryInfo.phone : '',
    customerEmail: order.deliveryInfo ? order.deliveryInfo.email : '',
    customerAddress: order.deliveryInfo ? order.deliveryInfo.address : '',
    deliveryInstructions: order.deliveryInfo ? order.deliveryInfo.instructions : ''
  };
  
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // create whatsapp message
      const methodLabels = {
        'paypal': 'PayPal',
        'zelle': 'Zelle',
        'binance': 'Binance',
        'pago-movil': 'Pago Móvil'
      };
      
      const methodLabel = methodLabels[method] || method;
      const orderInfo = parseOrderNumber(orderNumber);
      
      let message = `¡Hola! He completado mi pago.\n\n`;
      message += `Orden: ${orderInfo.shortNumber}\n`;
      message += `Fecha: ${orderInfo.formattedDate}\n`;
      message += `Transacción: ${orderNumber}\n`;
      message += `Método de pago: ${methodLabel}\n`;
      
      if (transactionId) {
        message += `ID de transacción: ${transactionId}\n`;
      }
      
      message += `\nTotal: $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}`;
      message += `\n\nHe subido el comprobante de pago. Por favor confirma mi orden.`;
      
      // update order status to 'processing'
      updateOrderStatus(orderNumber, 'processing');
      
      // show success message
      alert('¡Comprobante enviado exitosamente! Redirigiendo a WhatsApp...');
      
      // send whatsapp message
      const url = `https://wa.me/584128503608?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      
      // redirect to home after a short delay
      setTimeout(() => {
        navigateToHome();
      }, 2000);
    } else {
      alert('Error al enviar el comprobante: ' + (data.error || 'Error desconocido'));
      // Re-enable button
      const submitBtn = document.getElementById('submitPaymentBtn');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Finalizar compra';
    }
  })
  .catch(error => {
    console.error('Error sending payment:', error);
    alert('Error al enviar el comprobante. Por favor intenta de nuevo.');
    // Re-enable button
    const submitBtn = document.getElementById('submitPaymentBtn');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Finalizar compra';
  });
}

function updateOrderStatus(orderNumber, status) {
  const history = getOrderHistory();
  const orderIndex = history.findIndex(order => order.orderNumber === orderNumber);
  
  if (orderIndex !== -1) {
    history[orderIndex].status = status;
    localStorage.setItem('orderHistory', JSON.stringify(history));
  }
}

// utility function for parsing order numbers (copied from checkout.js)
function parseOrderNumber(orderNumber) {
  // parse order number format: ORD-YYYYMMDD-HHMMSS-SEQUENTIAL-SESSION-RANDOM
  const parts = orderNumber.split('-');
  if (parts.length !== 6) return null;
  
  const [prefix, dateTime, sequential, session, random] = parts;
  
  // parse date and time
  const year = dateTime.substring(0, 4);
  const month = dateTime.substring(4, 6);
  const day = dateTime.substring(6, 8);
  const hour = dateTime.substring(9, 11);
  const minute = dateTime.substring(11, 13);
  const second = dateTime.substring(13, 15);
  
  const orderDate = new Date(year, month - 1, day, hour, minute, second);
  
  return {
    prefix,
    orderDate,
    sequential: parseInt(sequential),
    session,
    random: parseInt(random),
    formattedDate: orderDate.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }),
    shortNumber: `${prefix}-${sequential}` // shorter version for display
  };
}

// expose functions globally
window.loadOrderById = loadOrderById;
window.loadApartadoOrderById = loadApartadoOrderById;
window.previewPaymentImage = previewPaymentImage;
window.removePaymentImage = removePaymentImage;
window.submitPayment = submitPayment;

// Add missing toggleImageUpload function
function toggleImageUpload() {
  const checkbox = document.getElementById('paymentConfirmed');
  const imageSection = document.getElementById('imageUploadSection');
  const fileInput = document.getElementById('paymentImage');
  const submitBtn = document.getElementById('submitPaymentBtn');
  
  if (checkbox && checkbox.checked) {
    imageSection.classList.remove('opacity-50', 'pointer-events-none');
    if (fileInput) fileInput.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
  } else {
    imageSection.classList.add('opacity-50', 'pointer-events-none');
    if (fileInput) fileInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
  }
}

window.toggleImageUpload = toggleImageUpload;
window.renderPaymentPage = renderPaymentPage;
window.renderApartadoPage = renderApartadoPage;
window.showPaymentPage = showPaymentPage;
window.showApartadoPage = showApartadoPage;
window.updateUrl = updateUrl;
window.handleRouting = handleRouting;

// order history action functions
function viewOrderDetails(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    alert('Orden no encontrada');
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
    alert('Orden no encontrada');
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
  message += `Transacción: ${orderNumber}\n`;
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
    alert('Orden no encontrada');
    return;
  }
  
  // determine payment method from order
  const methodMap = {
    'PayPal': 'paypal',
    'Zelle': 'zelle',
    'Binance': 'binance',
    'Pago Móvil': 'pago-movil'
  };
  
  const method = methodMap[order.paymentMethod] || 'paypal';
  
  // close the modal first
  closeOrderHistoryModal();
  
  // redirect to payment page
  updateUrl({ page: 'pay', method: method, order: orderNumber });
  if (window.showPaymentPage) {
    window.showPaymentPage(method, orderNumber);
  }
}

function deleteOrder(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    alert('Orden no encontrada');
    return;
  }
  
  // check if order can be deleted (only pending orders can be deleted)
  if (order.status !== 'pending') {
    alert(`No se puede eliminar una orden con estado: ${order.status}\n\nSolo las órdenes pendientes pueden ser eliminadas.`);
    return;
  }
  
  const confirmDelete = confirm(`¿Estás seguro de que quieres eliminar la orden ${orderNumber.split('-')[0]}-${orderNumber.split('-')[2]}?\n\nEsta acción no se puede deshacer.`);
  
  if (confirmDelete) {
    // remove order from history
    const history = getOrderHistory();
    const updatedHistory = history.filter(order => order.orderNumber !== orderNumber);
    localStorage.setItem('orderHistory', JSON.stringify(updatedHistory));
    
    // refresh the modal
    const content = document.getElementById('orderHistoryContent');
    if (content) {
      content.innerHTML = displayOrderHistory();
    }
    
    alert('Orden eliminada exitosamente.');
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
          <div><strong>Transacción:</strong> ${orderNumber}</div>
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
          <h4 class="font-semibold mb-3 text-green-800">🚚 Información de Entrega</h4>
          <div class="space-y-3">
            ${order.deliveryInfo ? `
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

// expose new functions globally
window.viewOrderDetails = viewOrderDetails;
window.contactSupport = contactSupport;
window.reprocessPayment = reprocessPayment;
window.deleteOrder = deleteOrder;
window.showOrderDetailsPage = showOrderDetailsPage;

// inicializacion
fetch(API_URL)
  .then(res => {
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return res.json();
  })
  .then(products => {
    console.log('Products loaded:', products.length);
    const valid = products.filter(p => p.ItemID && p.Product);
    console.log('Valid products:', valid.length);
    
    // process variants and separate main products from variants
    const { mainProducts, allProductsWithVariants } = processProductVariants(valid);
    
    allProducts = mainProducts; // only main products for search/indexes
    window.allProductsWithVariants = allProductsWithVariants; // all products including variants for detail view

    // new products
    const nuevos = valid.slice(-8);
    const newBox = document.getElementById("new-products");
    const newDrop = document.getElementById("new-dropdown");
    
    if (newBox) {
      nuevos.forEach(p => {
        newBox.appendChild(renderCard(p));
      });
    }
    
    if (newDrop) {
      newDrop.innerHTML = nuevos.map(p => renderProductMini(p)).join('');
    }
    // Also render for mobile menu with data-id
    const nuevosSubmenuMobile = document.getElementById('nuevos-submenu-mobile');
    if (nuevosSubmenuMobile) {
      nuevosSubmenuMobile.innerHTML = nuevos.map(p =>
        `<a href="#" class="mobile-submenu-item" data-id="${p.ItemID}">${p.Product}</a>`
      ).join('');
    }

    // render categores
    const cats = uniqueValues(valid, "Category");
    console.log('Categories:', cats);
    renderDropdownLinks("cat-dropdown", cats, "category");
    renderTagButtons("category-buttons", cats, "Category", valid, "category-products", false);

    // render collections
    const cols = uniqueValues(valid, "Collection");
    console.log('Collections:', cols);
    renderDropdownLinks("col-dropdown", cols, "collection");
    renderTagButtons("collection-buttons", cols, "Collection", valid, "collection-products", true);

    // Sync mobile menu with desktop menu
    if (window.syncMobileMenus) window.syncMobileMenus();

    setupSearch();
    
    // initial routing
    handleRouting();
    // Hide loading overlay
    if (window.hideLoadingOverlay) window.hideLoadingOverlay();
  })
  .catch(err => {
    console.error("Error fetching or processing data:", err);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4';
    errorDiv.innerHTML = `
      <strong>Error:</strong> No se pudieron cargar los productos. 
      <br>Por favor, verifica tu conexión a internet o intenta más tarde.
    `;
    document.querySelector('main').insertBefore(errorDiv, document.querySelector('main').firstChild);

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
    const newDrop = document.getElementById('new-dropdown');
    if (newDrop) {
      newDrop.innerHTML = [
        '<div class="block hover:bg-gray-100 p-3 rounded-lg cursor-pointer transition-colors"><div class="flex gap-3 items-center"><div class="w-12 h-12 bg-gray-200 rounded-lg"></div><div class="flex-1"><p class="text-sm font-semibold text-gray-800 mb-1 leading-tight">Producto Nuevo 1</p></div></div></div>',
        '<div class="block hover:bg-gray-100 p-3 rounded-lg cursor-pointer transition-colors"><div class="flex gap-3 items-center"><div class="w-12 h-12 bg-gray-200 rounded-lg"></div><div class="flex-1"><p class="text-sm font-semibold text-gray-800 mb-1 leading-tight">Producto Nuevo 2</p></div></div></div>',
        '<div class="block hover:bg-gray-100 p-3 rounded-lg cursor-pointer transition-colors"><div class="flex gap-3 items-center"><div class="w-12 h-12 bg-gray-200 rounded-lg"></div><div class="flex-1"><p class="text-sm font-semibold text-gray-800 mb-1 leading-tight">Producto Nuevo 3</p></div></div></div>'
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
  // use the new google script function from google_script.js
  window.getOrderStatus(orderNumber, function(data) {
    if (data.success && data.status) {
      updateOrderStatus(orderNumber, data.status);
      displayOrderHistory();
    }
  });
}

function syncAllOrderStatuses() {
  const history = getOrderHistory();
  if (history.length === 0) return;
  
  // use the new google script function from google_script.js
  window.getAllOrderStatuses(function(data) {
    if (data.success && data.statuses) {
      let hasChanges = false;
      
      data.statuses.forEach(item => {
        const localOrder = history.find(order => order.orderNumber === item.orderNumber);
        if (localOrder && localOrder.status !== item.status) {
          updateOrderStatus(item.orderNumber, item.status);
          hasChanges = true;
        }
      });
      
      if (hasChanges) {
        displayOrderHistory();
      }
    }
  });
}

function deleteOrder(orderNumber) {
  const history = getOrderHistory();
  const order = history.find(order => order.orderNumber === orderNumber);
  
  if (!order) {
    alert('Orden no encontrada');
    return;
  }
  
  // check if order can be deleted locally
  if (order.status === 'pending') {
    // can delete locally
    const confirmed = confirm('¿Estás seguro de que quieres eliminar esta orden?');
    if (confirmed) {
      // remove from local storage
      const updatedHistory = history.filter(order => order.orderNumber !== orderNumber);
      localStorage.setItem('orderHistory', JSON.stringify(updatedHistory));
      
      // delete from spreadsheet also
      deleteOrderFromSpreadsheet(orderNumber);
      
      // refresh display
      displayOrderHistory();
      alert('Orden eliminada exitosamente!');
    }
  } else {
    // Status is not 'pending', can only be deleted from spreadsheet
    alert(`Esta orden no puede ser eliminada localmente. El estado actual es: ${order.status}\n\nSolo puede ser eliminada desde la hoja de cálculo.`);
  }
}

function deleteOrderFromSpreadsheet(orderNumber) {
  // use the new google script function from google_script.js
  window.deleteOrderFromGoogleSheets(orderNumber, function(data) {
    if (data.success) {
      console.log('Order deleted from spreadsheet:', orderNumber);
    } else {
      console.error('Error deleting order from spreadsheet:', data.error);
    }
  });
}

function loadOrderById() {
  const orderNumber = document.getElementById('orderNumberInput').value.trim();
  
  if (!orderNumber) {
    alert('Por favor ingresa un número de orden');
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
  // use the new google script function from google_script.js
  window.getOrderFromGoogleSheets(orderNumber, function(data) {
    if (data.success && data.order) {
      const localOrder = convertSpreadsheetOrderToLocal(data.order);
      
      const history = getOrderHistory();
      history.push(localOrder);
      localStorage.setItem('orderHistory', JSON.stringify(history));
      
      showOrderDetailsPage(orderNumber);
      alert('Orden cargada exitosamente desde la hoja de cálculo!');
    } else {
      alert('Orden no encontrada en la hoja de cálculo');
    }
  });
}

function convertSpreadsheetOrderToLocal(spreadsheetOrder) {
  return {
    orderNumber: spreadsheetOrder.orderNumber,
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
    'efectivo': '💵'
  };
  return emojis[method] || '💳';
}

function getDeliveryMethodEmoji(method) {
  const emojis = {
    'retirar en tienda': '🏪',
    'entrega a domicilio': '🏠'
  };
  return emojis[method] || '📦';
}

function getStatusEmoji(status) {
  const emojis = {
    'pendiente': '⏳',
    'processing': '🔄',
    'completed': '✅',
    'cancelled': '❌'
  };
  return emojis[status.toLowerCase()] || '📋';
}

function reprocessPayment(orderNumber) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    alert('Orden no encontrada');
    return;
  }
  
  showReprocessPaymentModal(orderNumber, order);
}

function showReprocessPaymentModal(orderNumber, order) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content reprocess-payment-modal">
      <div class="modal-header">
        <h3>🔄 Reprocesar Pago - Orden ${parseOrderNumber(orderNumber).shortNumber} (◕‿◕)</h3>
        <button onclick="closeReprocessPaymentModal()" class="close-btn">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="order-summary-section">
          <h4>📋 Resumen de la Orden</h4>
          <p><strong>💰 Total:</strong> $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}</p>
          <p><strong>💳 Método anterior:</strong> ${getPaymentMethodEmoji(order.paymentMethod)} ${getPaymentMethodLabel(order.paymentMethod)}</p>
        </div>
        
        <div class="payment-method-section">
          <h4>💳 Nuevo Método de Pago</h4>
          <div class="payment-methods-grid">
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="paypal" ${order.paymentMethod === 'paypal' ? 'checked' : ''}>
              <span class="payment-method-label">💙 PayPal</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="zelle" ${order.paymentMethod === 'zelle' ? 'checked' : ''}>
              <span class="payment-method-label">💚 Zelle</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="binance" ${order.paymentMethod === 'binance' ? 'checked' : ''}>
              <span class="payment-method-label">🟡 Binance</span>
            </label>
            <label class="payment-method-option">
              <input type="radio" name="newPaymentMethod" value="pago-movil" ${order.paymentMethod === 'pago-movil' ? 'checked' : ''}>
              <span class="payment-method-label">💜 Pago Móvil</span>
            </label>
          </div>
        </div>
        
        <div class="payment-info-section" id="newPaymentInfo">
          <!-- Payment info will be populated based on selected method -->
        </div>
        
        <div class="image-upload-section">
          <h4>📸 Nuevo Comprobante de Pago</h4>
          <div class="file-upload-container">
            <input type="file" id="newPaymentImage" accept="image/*" onchange="previewNewPaymentImage(this)">
            <label for="newPaymentImage" class="file-upload-label">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              📁 Seleccionar imagen
            </label>
          </div>
          <div id="newImagePreview" class="image-preview" style="display: none;">
            <img id="newPreviewImg" src="" alt="Preview">
            <button onclick="removeNewPaymentImage()" class="remove-image-btn">×</button>
          </div>
        </div>
        
        <div class="transaction-id-section">
          <label for="newTransactionId">🆔 ID de Transacción (opcional):</label>
          <input type="text" id="newTransactionId" placeholder="Ingresa el ID de transacción si lo tienes">
        </div>
        
        <div class="modal-actions">
          <button onclick="closeReprocessPaymentModal()" class="btn btn-secondary">❌ Cancelar</button>
          <button onclick="submitReprocessedPayment('${orderNumber}')" class="btn btn-primary" id="submitReprocessBtn" disabled>
            ✅ Actualizar Pago
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const currentMethod = document.querySelector('input[name="newPaymentMethod"]:checked').value;
  showNewPaymentInfo(currentMethod);
  
  document.querySelectorAll('input[name="newPaymentMethod"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      showNewPaymentInfo(e.target.value);
    });
  });
  
  document.getElementById('newPaymentImage').addEventListener('change', function() {
    const submitBtn = document.getElementById('submitReprocessBtn');
    if (this.files[0]) {
      submitBtn.disabled = false;
    } else {
      submitBtn.disabled = true;
    }
  });
}

function showNewPaymentInfo(method) {
  const infoContainer = document.getElementById('newPaymentInfo');
  
  const paymentInfo = {
    'paypal': {
      title: '💙 PayPal',
      info: 'https://www.paypal.me/indigostore',
      button: true,
      buttonText: '🌐 Ir a PayPal',
      buttonUrl: 'https://www.paypal.me/indigostore'
    },
    'zelle': {
      title: '💚 Zelle',
      info: '📧 info@venegroupservices.com<br>🏢 Venegroup Services Inc',
      button: false
    },
    'binance': {
      title: '🟡 Binance',
      info: '🆔 Binance ID: 381425060',
      button: true,
      buttonText: '📱 Abrir Binance',
      buttonUrl: 'https://www.binance.com'
    },
    'pago-movil': {
      title: '💜 Pago Móvil',
      info: '🏦 Banco: Mercantil<br>📱 Número: 0412-849-5036<br>🆔 Cédula: 28256608',
      button: false
    }
  };
  
  const info = paymentInfo[method];
  
  infoContainer.innerHTML = `
    <h4>${info.title}</h4>
    <div class="payment-details">
      <p>${info.info}</p>
      ${info.button ? `<button onclick="window.open('${info.buttonUrl}', '_blank')" class="btn btn-outline">${info.buttonText}</button>` : ''}
    </div>
  `;
}

function submitReprocessedPayment(orderNumber) {
  const newPaymentMethod = document.querySelector('input[name="newPaymentMethod"]:checked').value;
  const newImageFile = document.getElementById('newPaymentImage').files[0];
  const newTransactionId = document.getElementById('newTransactionId').value.trim();
  
  if (!newImageFile) {
    alert('Por favor sube una imagen del nuevo comprobante de pago');
    return;
  }
  
  const submitBtn = document.getElementById('submitReprocessBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '🔄 Procesando...';
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const imageData = e.target.result;
    const imageType = newImageFile.name.split('.').pop().toLowerCase();
    
    sendReprocessedPaymentToGoogleSheets(imageData, orderNumber, imageType, newTransactionId, newPaymentMethod);
  };
  
  reader.readAsDataURL(newImageFile);
}

function sendReprocessedPaymentToGoogleSheets(imageData, orderNumber, imageType, transactionId, newPaymentMethod) {
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    alert('❌ Orden no encontrada (｡•́︿•̀｡)');
    return;
  }
  
  // use the new google script function from google_script.js
  window.sendReprocessedPaymentToGoogleSheets(imageData, orderNumber, imageType, transactionId, newPaymentMethod, function(data) {
    if (data.success) {
      // update local order
      updateLocalOrderPayment(orderNumber, newPaymentMethod, transactionId);
      
      closeReprocessPaymentModal();
      
      alert('¡Pago reprocesado exitosamente! La información ha sido actualizada.');
      
      displayOrderHistory();
      
      const methodLabels = {
        'paypal': 'PayPal',
        'zelle': 'Zelle',
        'binance': 'Binance',
        'pago-movil': 'Pago Móvil'
      };
      
      const methodLabel = methodLabels[newPaymentMethod] || newPaymentMethod;
      const orderInfo = parseOrderNumber(orderNumber);
      
      let message = `🔄 ¡Hola! He reprocesado mi pago.\n\n`;
      message += `🛒 Orden: ${orderInfo.shortNumber}\n`;
      message += `📅 Fecha: ${orderInfo.formattedDate}\n`;
      message += `🆔 Transacción: ${orderNumber}\n`;
      message += `💳 Nuevo método de pago: ${methodLabel}\n`;
      
      if (transactionId) {
        message += `🆔 Nuevo ID de transacción: ${transactionId}\n`;
      }
      
      message += `\n💰 Total: $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}`;
      message += `\n\n📸 He subido el nuevo comprobante de pago. Por favor confirma mi orden.`;
      
      const url = `https://wa.me/584128503608?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      
    } else {
      alert('Error al reprocesar el pago: ' + (data.error || 'Error desconocido'));
      const submitBtn = document.getElementById('submitReprocessBtn');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Actualizar Pago';
    }
  });
}

function updateLocalOrderPayment(orderNumber, newPaymentMethod, newTransactionId) {
  const history = getOrderHistory();
  const orderIndex = history.findIndex(order => order.orderNumber === orderNumber);
  
  if (orderIndex !== -1) {
    history[orderIndex].paymentMethod = newPaymentMethod;
    if (newTransactionId) {
      history[orderIndex].transactionId = newTransactionId;
    }
    history[orderIndex].status = 'processing';
    localStorage.setItem('orderHistory', JSON.stringify(history));
  }
}

function previewNewPaymentImage(input) {
  const preview = document.getElementById('newImagePreview');
  const previewImg = document.getElementById('newPreviewImg');
  
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function removeNewPaymentImage() {
  const input = document.getElementById('newPaymentImage');
  const preview = document.getElementById('newImagePreview');
  
  input.value = '';
  preview.style.display = 'none';
  
  document.getElementById('submitReprocessBtn').disabled = true;
}

function closeReprocessPaymentModal() {
  const modal = document.querySelector('.reprocess-payment-modal').parentElement;
  if (modal) {
    modal.remove();
  }
}

function syncAllOrderStatuses() {
  const history = getOrderHistory();
  if (history.length === 0) return;
  
  // use the new google script function from google_script.js
  window.getAllOrderStatuses(function(data) {
    if (data.success && data.statuses) {
      let hasChanges = false;
      
      // update local statuses
      data.statuses.forEach(item => {
        const localOrder = history.find(order => order.orderNumber === item.orderNumber);
        if (localOrder && localOrder.status !== item.status) {
          updateOrderStatus(item.orderNumber, item.status);
          hasChanges = true;
        }
      });
      
      // refresh display if there were changes
      if (hasChanges) {
        displayOrderHistory();
        alert('Estados sincronizados exitosamente!');
      } else {
        alert('Todos los estados están actualizados!');
      }
    }
  });
}

function showCartNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'cart-notification';
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">🛒</span>
      <span class="notification-text">${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // remove notification after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

function showSoldOutMessage() {
  showCartNotification('❌ Producto agotado (｡•́︿•̀｡)');
}

// Enhanced checkout functions with emojis
function showOrderSuccessNotification(orderNumber, isCashPayment = false) {
  const message = isCashPayment 
    ? `✅ ¡Apartado exitoso! Orden: ${orderNumber} (◕‿◕)`
    : `✅ ¡Orden creada exitosamente! Orden: ${orderNumber} (◕‿◕)`;
  
  showCartNotification(message);
}
  
  // iniatial disabled upload image
  const imageSection = document.getElementById('imageUploadSection');
  if (imageSection) {
    imageSection.classList.add('opacity-50', 'pointer-events-none');
  }

function submitPayment(method, orderNumber) {
  const transactionId = document.getElementById('transactionId').value.trim();
  const imageFile = document.getElementById('paymentImage').files[0];
  
  if (!imageFile) {
    alert('Por favor sube una imagen del comprobante de pago');
    return;
  }
  
  // get order from history
  const order = getOrderFromHistory(orderNumber);
  if (!order) {
    alert('Orden no encontrada');
    return;
  }
  
  // orevents double submission
  const submitBtn = document.getElementById('submitPaymentBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '🔄 Procesando...';
  
  // convert image to base64
  const reader = new FileReader();
  reader.onload = function(e) {
    const imageData = e.target.result;
    const imageType = imageFile.name.split('.').pop().toLowerCase();
    
    // image - app script
    sendImageToGoogleSheets(imageData, orderNumber, imageType, transactionId, method, order);
  };
  
  reader.readAsDataURL(imageFile);
}

// sends to googlesheets
function sendImageToGoogleSheets(imageData, orderNumber, imageType, transactionId, method, order) {
  // new function from google_script.js
  window.sendImageToGoogleSheets(imageData, orderNumber, imageType, transactionId, method, order, function(data) {
    if (data.success) {
      // create whatsapp message
      const methodLabels = {
        'paypal': '💙 PayPal',
        'zelle': '💚 Zelle',
        'binance': '🟡 Binance',
        'pago-movil': '💜 Pago Móvil'
      };
      
      const methodLabel = methodLabels[method] || method;
      const orderInfo = parseOrderNumber(orderNumber);
      
      let message = `🔄 ¡Hola! He completado mi pago.\n\n`;
      message += `🛒 Orden: ${orderInfo.shortNumber}\n`;
      message += `📅 Fecha: ${orderInfo.formattedDate}\n`;
      message += `🆔 Transacción: ${orderNumber}\n`;
      message += `💳 Método de pago: ${methodLabel}\n`;
      
      if (transactionId) {
        message += `🆔 ID de transacción: ${transactionId}\n`;
      }
      
      message += `\n💰 Total: $${order.totalUSD.toFixed(2)} | Bs ${order.totalBS.toFixed(2)}`;
      message += `\n\n📸 He subido el comprobante de pago. Por favor confirma mi orden.`;
      
      // update order status to 'processing'
      updateOrderStatus(orderNumber, 'processing');
      
      // show success message
      alert('¡Comprobante enviado exitosamente! Redirigiendo a WhatsApp...');
      
      // send whatsapp message
      const url = `https://wa.me/584128503608?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      
      // redirects to home after delay
      setTimeout(() => {
        navigateToHome();
      }, 2000);
    } else {
      alert('Error al enviar el comprobante: ' + (data.error || 'Error desconocido'));
      // reenable button
      const submitBtn = document.getElementById('submitPaymentBtn');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Finalizar compra';
    }
  });
}