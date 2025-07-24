// ALWAYS LOAD AFTER MAIN.JS
function initializeMobileEnhancements() {
  // Create mobile menu toggle button
  const headerContainer = document.querySelector('.header-kawaii > div');
  
  // check if toggle exsist
  if (!document.querySelector('.mobile-menu-toggle')) {
    const mobileToggle = document.createElement('button');
    mobileToggle.className = 'mobile-menu-toggle';
    mobileToggle.setAttribute('aria-label', 'Toggle mobile menu');
    mobileToggle.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
    `;
    
    // add toggle to header
    headerContainer.appendChild(mobileToggle);
    
    // creates overlay menu
    const overlay = document.createElement('div');
    overlay.className = 'mobile-menu-overlay';
    document.body.appendChild(overlay);
    
    setupMobileMenu(mobileToggle, overlay);
  }
  
  initializeScrollBehavior();
}

function setupMobileMenu(mobileToggle, overlay) {
  const navMenu = document.querySelector('.nav-menu');
  const body = document.body;
  const dropdowns = document.querySelectorAll('.dropdown');
  
  mobileToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const isActive = navMenu.classList.contains('mobile-active');
    if (isActive) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });
  
  // click to lose menu
  overlay.addEventListener('click', function() {
    closeMobileMenu();
  });
  
  // presses on mobile
  dropdowns.forEach(dropdown => {
    const toggle = dropdown.querySelector('.dropdown-toggle');
    if (toggle) {
      toggle.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          e.stopPropagation();
          
          // closee demas dropdowns
          dropdowns.forEach(otherDropdown => {
            if (otherDropdown !== dropdown) {
              otherDropdown.classList.remove('mobile-active');
            }
          });
          
          // togglea current dropdown
          dropdown.classList.toggle('mobile-active');
        }
      });
    }
  });
  
  // closes mobile menu when on full screen
  window.addEventListener('resize', function() {
    if (window.innerWidth > 768 && navMenu.classList.contains('mobile-active')) {
      closeMobileMenu();
    }
    
    // resets when on full screen
    if (window.innerWidth > 768) {
      dropdowns.forEach(dropdown => {
        dropdown.classList.remove('mobile-active');
      });
    }
  });
  
  // close menu while not on it
  const navLinks = document.querySelectorAll('.nav-menu a, .dropdown-content a');
  navLinks.forEach(link => {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 768) {
        setTimeout(closeMobileMenu, 100); // Small delay for better UX
      }
    });
  });
  
  // navigation thngys
  enhanceNavigationForMobile();
  
  function openMobileMenu() {
    navMenu.classList.add('mobile-active');
    mobileToggle.classList.add('active');
    overlay.style.display = 'block';
    body.classList.add('mobile-menu-open');
    
    // overlay for animation
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });
    
    // trap money
    trapFocus(navMenu);
  }
  
  function closeMobileMenu() {
    navMenu.classList.remove('mobile-active');
    mobileToggle.classList.remove('active');
    overlay.classList.remove('active');
    body.classList.remove('mobile-menu-open');
    
    // closees all the dropdowns on mobile
    dropdowns.forEach(dropdown => {
      dropdown.classList.remove('mobile-active');
    });
    
    
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
    
    removeFocusTrap();
  }
  
  // expose functions globally
  window.openMobileMenu = openMobileMenu;
  window.closeMobileMenu = closeMobileMenu;
}

// updated functions
function enhanceNavigationForMobile() {
  // Store original navigation functions
  const originalNavigateToHome = window.navigateToHome;
  const originalNavigateToCategory = window.navigateToCategory;
  const originalNavigateToCollection = window.navigateToCollection;
  const originalNavigateToProduct = window.navigateToProduct;
  
  // override functions
  if (originalNavigateToHome) {
    window.navigateToHome = function() {
      if (window.innerWidth <= 768 && window.closeMobileMenu) {
        window.closeMobileMenu();
      }
      return originalNavigateToHome.apply(this, arguments);
    };
  }
  
  if (originalNavigateToCategory) {
    window.navigateToCategory = function() {
      if (window.innerWidth <= 768 && window.closeMobileMenu) {
        window.closeMobileMenu();
      }
      return originalNavigateToCategory.apply(this, arguments);
    };
  }
  
  if (originalNavigateToCollection) {
    window.navigateToCollection = function() {
      if (window.innerWidth <= 768 && window.closeMobileMenu) {
        window.closeMobileMenu();
      }
      return originalNavigateToCollection.apply(this, arguments);
    };
  }
  
  if (originalNavigateToProduct) {
    window.navigateToProduct = function() {
      if (window.innerWidth <= 768 && window.closeMobileMenu) {
        window.closeMobileMenu();
      }
      return originalNavigateToProduct.apply(this, arguments);
    };
  }
}

// scroll for full view inicializacion
function initializeScrollBehavior() {
  const header = document.querySelector('.header-kawaii');
  let lastScrollY = window.scrollY;
  let ticking = false;
  
  function updateHeader() {
    const scrollY = window.scrollY;
    
    if (window.innerWidth > 768) {
      if (scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    } else {
      // remove sroll on mobile
      header.classList.remove('scrolled');
    }
    
    lastScrollY = scrollY;
    ticking = false;
  }
  
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateHeader);
      ticking = true;
    }
  }
  

  window.addEventListener('scroll', onScroll, { passive: true });
  
  // checks for resize
  window.addEventListener('resize', updateHeader);
}

// focus for mobile menu
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
  );
  const firstFocusableElement = focusableElements[0];
  const lastFocusableElement = focusableElements[focusableElements.length - 1];
  
  function handleTabKey(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusableElement) {
          lastFocusableElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusableElement) {
          firstFocusableElement.focus();
          e.preventDefault();
        }
      }
    }
    
    if (e.key === 'Escape') {
      if (window.closeMobileMenu) {
        window.closeMobileMenu();
      }
    }
  }
  
  element.addEventListener('keydown', handleTabKey);
  window.currentFocusTrap = handleTabKey;
  
  if (firstFocusableElement) {
    firstFocusableElement.focus();
  }
}

function removeFocusTrap() {
  if (window.currentFocusTrap) {
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
      navMenu.removeEventListener('keydown', window.currentFocusTrap);
    }
    window.currentFocusTrap = null;
  }
}

function enhanceSearchForMobile() {
  const searchInput = document.getElementById('search');
  const searchResults = document.getElementById('search-results');
  
  if (searchInput && searchResults) {
    searchInput.addEventListener('focus', function() {
      if (window.innerWidth <= 768 && window.closeMobileMenu) {
        window.closeMobileMenu();
      }
    });
    
    searchResults.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
}

function initializeTouchGestures() {
  let touchStartX = 0;
  let touchEndX = 0;
  let touchStartY = 0;
  let touchEndY = 0;
  
  function handleSwipe() {
    const swipeThreshold = 100;
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = Math.abs(touchEndY - touchStartY);
    
    if (Math.abs(swipeDistanceX) > swipeThreshold && Math.abs(swipeDistanceX) > swipeDistanceY) {
      if (swipeDistanceX < 0 && touchStartX > window.innerWidth - 50) {
        // Swipe left from right edge - open menu
        if (window.openMobileMenu && window.innerWidth <= 768) {
          window.openMobileMenu();
        }
      } else if (swipeDistanceX > 0) {
        if (window.closeMobileMenu && window.innerWidth <= 768) {
          window.closeMobileMenu();
        }
      }
    }
  }
  
  document.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  
  document.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  }, { passive: true });
}

function initializeAll() {
  initializeMobileEnhancements();
  enhanceSearchForMobile();
  initializeTouchGestures();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeAll, 100);
  });
} else {
  setTimeout(initializeAll, 100);
}

window.addEventListener('load', function() {
  setTimeout(initializeAll, 100);
});

window.toggleMobileMenu = function() {
  // this should work right? check scrapped5.html
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  const hamburger = document.getElementById('hamburger');
  menu.classList.toggle('active');
  overlay.classList.toggle('active');
  hamburger.classList.toggle('active');
};
window.closeMobileMenu = function() {
  const menu = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  const hamburger = document.getElementById('hamburger');
  menu.classList.remove('active');
  overlay.classList.remove('active');
  hamburger.classList.remove('active');
};
window.toggleMobileSearch = function() {
  const searchBar = document.getElementById('mobile-search-bar');
  searchBar.classList.toggle('hidden');
  if (!searchBar.classList.contains('hidden')) {
    document.getElementById('search-mobile').focus();
  }
};
window.toggleSubmenu = function(submenuId) {
  const submenu = document.getElementById(submenuId);
  submenu.classList.toggle('active');
}; 