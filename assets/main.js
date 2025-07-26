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
      <h1 class="product-detail-title">${product.Product}</h1>
      <div class="product-detail-price">
        <span class="price-usd">$${product.USD}</span>
        <span class="price-separator">|</span>
        <span class="price-bs">Bs ${product.Bs}</span>
      </div>
      <div class="product-description">
        <h3>Descripción:</h3>
        <p>${product.Description || 'Sin descripción disponible'}</p>
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