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
  updateUrl({ page: 'product', product: productId });
  showProductPage(productId);
}

function navigateToHome() {
  updateUrl({ page: 'home', category: null, collection: null, product: null });
  showHomePage();
}

// Page display functions
function hideAllPages() {
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('category-page').classList.add('hidden');
  document.getElementById('product-page').classList.add('hidden');
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
      <div class="product-info-grid grid grid-cols-2 gap-4 text-sm mb-6">
        <div>
          <strong>Categoría:</strong><br>
          ${product.Category || 'Sin categoría'}
        </div>
        <div>
          <strong>Colección:</strong><br>
          ${product.Collection || 'Sin colección'}
        </div>
      </div>
      <button onclick="addToCart(${JSON.stringify(product).replace(/"/g, '&quot;')})" 
              class="add-to-cart-large cart-icon">
        Agregar al carrito
      </button>
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

function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(p => p.ItemID === product.ItemID);
  if (existing) {
    existing.quantity += 1;
  } else {
    product.quantity = 1;
    cart.push(product);
  }
  saveCart(cart);
  alert("Agregado al carrito");
}

// mi bb
function setupSearch() {
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  const mainContent = document.getElementById("main-content");
  const searchProducts = document.getElementById("search-products");
  const noResults = document.getElementById("no-results");
  const clearSearchBtn = document.getElementById("clear-search");
  const searchLoading = document.getElementById("search-loading");

  function clearSearch() {
    searchInput.value = "";
    searchResults.classList.add("hidden");
    handleRouting(); // return - volver
    searchProducts.innerHTML = "";
    noResults.classList.add("hidden");
  }

  function renderSearchResults(products) {
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
      
      renderSearchResults(filtered);
      searchLoading.classList.add("hidden");
    }, 300);
  });

  clearSearchBtn.addEventListener("click", clearSearch);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !searchResults.classList.contains("hidden")) {
      clearSearch();
    }
  });
}

// prduct card render
function renderCard(product) {
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
    <button class="add-to-cart-small cart-icon" onclick="addToCart(${JSON.stringify(product).replace(/"/g, '&quot;')})">
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

    setupSearch();
    
    // initial routing
    handleRouting();
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
  });