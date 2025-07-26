// global var
const API_URL = "https://script.google.com/macros/s/AKfycbwaCPJPEUs7mM-QP8QuzFSgVl40nBq6Vpt7iCf1R2t_L9Bk57rBA73HeuRThY1dREhT/exec";
let allProducts = [];
let searchTimeout;

// route function
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    page: params.get('page') || 'home',
    category: params.get('category'),
    collection: params.get('collection'),
    product: params.get('product')
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
      }
    };
    document.body.appendChild(script);
  } else if (window.renderCheckoutSummary) {
    window.renderCheckoutSummary();
    window.setupPaymentMethods();
    window.setupCheckoutButton();
  }
}

// page display functions
function hideAllPages() {
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('category-page').classList.add('hidden');
  document.getElementById('product-page').classList.add('hidden');
  document.getElementById('checkout-page').classList.add('hidden');
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
  const product = allProducts.find(p => p.ItemID == productId);
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
  
  container.innerHTML = `
    <div class="fade-in">
      <img src="${product.Image}" alt="${product.Product}" class="w-full rounded-lg shadow-lg mb-4">
      <div class="grid grid-cols-2 gap-4 mt-4">
        ${product.Image2 ? `<img src="${product.Image2}" alt="${product.Product}" class="w-full rounded shadow">` : ''}
        ${product.Image3 ? `<img src="${product.Image3}" alt="${product.Product}" class="w-full rounded shadow">` : ''}
      </div>
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
      </div>
    </div>
  `;
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
  if (productId.startsWith('card-')) {
    const realId = productId.replace('card-', '');
    product = allProducts.find(p => p.ItemID == realId);
  } else {
    product = allProducts.find(p => p.ItemID == productId);
  }
  if (!product) return;
  const stock = parseInt(product.Stock) || 0;
  const maxQuantity = stock <= 1 ? 1 : stock;
  const newQuantity = Math.max(1, Math.min(maxQuantity, currentQuantity + change));
  quantityDisplay.textContent = newQuantity;
  // update button states
  const minusBtn = quantityDisplay.previousElementSibling;
  const plusBtn = quantityDisplay.nextElementSibling;
  minusBtn.disabled = newQuantity <= 1;
  plusBtn.disabled = newQuantity >= maxQuantity;
  // update button styles
  if (minusBtn.disabled) {
    minusBtn.classList.add('disabled');
  } else {
    minusBtn.classList.remove('disabled');
  }
  if (plusBtn.disabled) {
    plusBtn.classList.add('disabled');
  } else {
    plusBtn.classList.remove('disabled');
  }
}

function addToCartWithQuantity(productId) {
  let product, quantityDisplay;
  if (productId.startsWith('card-')) {
    const realId = productId.replace('card-', '');
    product = allProducts.find(p => p.ItemID == realId);
    quantityDisplay = document.getElementById(`quantity-card-${realId}`);
  } else {
    product = allProducts.find(p => p.ItemID == productId);
    quantityDisplay = document.getElementById(`quantity-${productId}`);
  }
  if (!product || !quantityDisplay) return;
  const quantity = parseInt(quantityDisplay.textContent) || 1;
  const cart = getCart();
  const existing = cart.find(p => p.ItemID === product.ItemID);
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
  const existing = cart.find(p => p.ItemID === product.ItemID);
  
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
          <button class="cart-item-qty-btn" onclick="updateCartItemQty('${item.ItemID}', -1)">-</button>
          <span class="cart-item-qty">${item.quantity}</span>
          <button class="cart-item-qty-btn" onclick="updateCartItemQty('${item.ItemID}', 1)">+</button>
        </div>
      </div>
    `;
  }).join('');
  cartSummaryContainer.innerHTML = `
    <div class="cart-summary-row"><span>Items:</span><span>${totalCount}</span></div>
    <div class="cart-summary-row"><span>Total USD:</span><span>$${totalUSD.toFixed(2)}</span></div>
    <div class="cart-summary-row"><span>Total Bs:</span><span>Bs ${totalBS.toFixed(2)}</span></div>
    <div class="cart-summary-total"><span>Total:</span><span>$${totalUSD.toFixed(2)} | Bs ${totalBS.toFixed(2)}</span></div>
    <button class="cart-modal-checkout" style="width:100%;margin-top:1.5rem;" onclick="closeCartModal();navigateToCheckout();">Finalizar compra</button>
  `;
  updateCartIconCount();
}

function updateCartItemQty(itemId, change) {
  const cart = getCart();
  const item = cart.find(p => p.ItemID == itemId);
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
    const idx = cart.findIndex(p => p.ItemID == itemId);
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
  const cardId = `card-${product.ItemID}`;

  const div = document.createElement("div");
  div.className = "product-card-kawaii fade-in";
  div.innerHTML = `
    <div class="cursor-pointer" onclick="navigateToProduct(${product.ItemID})">
      <img src="${product.Image}" alt="${product.Product}" class="w-full h-48 object-cover">
      <h3 class="product-title">${product.Product}</h3>
      <p class="product-price">
        <span class="price-usd">$${product.USD}</span>
        <span class="price-separator">|</span>
        <span class="price-bs">Bs ${product.Bs}</span>
      </p>
    </div>
    
    <!-- Quantity controls + Stock message at the top -->
    <div class="quantity-controls mb-2 mt-2">
      <button class="quantity-btn minus-btn" onclick="changeQuantity('card-${product.ItemID}', -1)" ${isLowStock ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <span class="quantity-display" id="quantity-card-${product.ItemID}">1</span>
      <button class="quantity-btn plus-btn" onclick="changeQuantity('card-${product.ItemID}', 1)" ${isLowStock ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      ${isLowStock ? '<p class="stock-warning mt-1">Stock limitado</p>' : ''}
    </div>

    <!-- Add to cart button at the bottom -->
    <button class="add-to-cart-small cart-icon w-full" onclick="addToCartWithQuantity('card-${product.ItemID}')">
      Agregar al carrito
    </button>
  `;
  return div;
}

function renderProductMini(product) {
  return `
    <div class="block hover:bg-gray-100 p-3 rounded-lg cursor-pointer transition-colors" onclick="navigateToProduct(${product.ItemID})">
      <div class="flex gap-3 items-center">
        <img src="${product.Image}" class="w-12 h-12 object-cover rounded-lg">
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
    
    allProducts = valid;

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