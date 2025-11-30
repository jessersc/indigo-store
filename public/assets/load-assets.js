// Load assets (favicon, logo, header, social icons) from Supabase
async function loadAssetsFromSupabase() {
  try {
    const supabase = await getSupabaseClient();
    
    // Fetch all assets (favicon, logo, header, social icons, shipping messages)
    const { data: assets, error } = await supabase
      .from('assets')
      .select('*')
      .in('asset_type', ['favicon', 'logotipo', 'header', 'social_icon', 'shipping_price_message', 'shipping_charges_message'])
      .order('asset_type', { ascending: true });
    
    if (error) {
      console.warn('Error loading assets from Supabase:', error);
      return;
    }
    
    if (!assets || assets.length === 0) {
      console.log('ℹNo assets found in Supabase - using defaults');
      // Set default shipping messages
      window.shippingPriceMessage = 'Precio de envio varia segun localidad';
      window.shippingChargesMessage = 'Posibles cargos de envio: $4.00 - $8.00';
      // Show defaults immediately if no Supabase assets
      setTimeout(() => {
        document.querySelectorAll('.assets-loading').forEach(el => {
          el.classList.remove('assets-loading');
          el.classList.add('assets-loaded');
        });
        // Update shipping messages if they exist
        const shippingPriceElement = document.getElementById('shipping-price-message');
        if (shippingPriceElement) {
          shippingPriceElement.textContent = window.shippingPriceMessage;
          shippingPriceElement.classList.remove('assets-loading');
          shippingPriceElement.classList.add('assets-loaded');
        }
        const shippingChargesElement = document.getElementById('shipping-charges-message');
        if (shippingChargesElement) {
          shippingChargesElement.textContent = window.shippingChargesMessage;
          shippingChargesElement.classList.remove('assets-loading');
          shippingChargesElement.classList.add('assets-loaded');
        }
      }, 100);
      return;
    }
    
    console.log('Assets loaded from Supabase:', assets.length);
    
    // Separate assets by type for better processing
    const faviconAssets = assets.filter(a => a.asset_type === 'favicon');
    const logoAssets = assets.filter(a => a.asset_type === 'logotipo');
    const headerAssets = assets.filter(a => a.asset_type === 'header');
    const socialIconAssets = assets.filter(a => a.asset_type === 'social_icon');
    const shippingPriceMessageAssets = assets.filter(a => a.asset_type === 'shipping_price_message');
    const shippingChargesMessageAssets = assets.filter(a => a.asset_type === 'shipping_charges_message');
    
    // Process favicon (should only be one)
    if (faviconAssets.length > 0) {
      const asset = faviconAssets[0];
      try {
        // Remove placeholder favicon if it exists
        const placeholder = document.getElementById('favicon-placeholder');
        if (placeholder) placeholder.remove();
        
        let faviconLink = document.querySelector('link[rel="icon"]') || 
                        document.querySelector('link[rel="shortcut icon"]') ||
                        document.createElement('link');
        
        document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(link => {
          if (link !== faviconLink) link.remove();
        });
        
        faviconLink.rel = 'icon';
        
        let finalUrl = null;
        if (asset.display_type === 'image' && asset.url) {
          finalUrl = asset.url;
          faviconLink.type = asset.type || 'image/png';
        } else if (asset.display_type === 'svg' && asset.svg_code) {
          finalUrl = `data:image/svg+xml,${encodeURIComponent(asset.svg_code)}`;
          faviconLink.type = 'image/svg+xml';
        } else if (asset.url) {
          finalUrl = asset.url;
          faviconLink.type = asset.type || 'image/png';
        } else if (asset.svg_code) {
          finalUrl = `data:image/svg+xml,${encodeURIComponent(asset.svg_code)}`;
          faviconLink.type = 'image/svg+xml';
        }
        
        if (finalUrl) {
          faviconLink.href = finalUrl;
          if (!document.head.contains(faviconLink)) {
            document.head.appendChild(faviconLink);
          }
          console.log('Favicon updated from Supabase');
        }
      } catch (error) {
        console.error('Error processing favicon:', error);
      }
    }
    
    // Process logo (should only be one)
    if (logoAssets.length > 0) {
      const asset = logoAssets[0];
      try {
        const logoSelectors = [
          'img.logo-responsive',
          'img[src*="logotipo"]',
          'img[alt*="Logo"]'
        ];
        
        let logoImages = [];
        logoSelectors.forEach(selector => {
          try {
            const found = document.querySelectorAll(selector);
            if (found.length > 0) {
              logoImages.push(...Array.from(found));
            }
          } catch (e) {
            // Invalid selector, skip
          }
        });
        
        logoImages = [...new Set(logoImages)];
        
        if (logoImages.length > 0) {
          let finalUrl = null;
          if (asset.display_type === 'image' && asset.url) {
            finalUrl = asset.url;
          } else if (asset.display_type === 'svg' && asset.svg_code) {
            finalUrl = `data:image/svg+xml,${encodeURIComponent(asset.svg_code)}`;
          } else if (asset.url) {
            finalUrl = asset.url;
          } else if (asset.svg_code) {
            finalUrl = `data:image/svg+xml,${encodeURIComponent(asset.svg_code)}`;
          }
          
          if (finalUrl) {
            logoImages.forEach(img => {
              img.src = finalUrl;
              img.alt = asset.name || 'Indigo Store Logo';
              // Remove loading class and add loaded class
              img.classList.remove('assets-loading');
              img.classList.add('assets-loaded');
            });
            console.log(`Logo updated from Supabase (${logoImages.length} instance(s))`);
          }
        }
      } catch (error) {
        console.error('Error processing logo:', error);
      }
    }
    
    // Process header (should only be one)
    if (headerAssets.length > 0) {
      const asset = headerAssets[0];
      try {
        const headerBanner = document.querySelector('.bg-kawaii-pink.text-white.text-center') || 
                            document.getElementById('header-banner');
        if (headerBanner) {
          if (asset.is_active && asset.html_content) {
            headerBanner.innerHTML = asset.html_content;
            headerBanner.style.display = '';
            // Remove loading class and add loaded class
            headerBanner.classList.remove('assets-loading');
            headerBanner.classList.add('assets-loaded');
            console.log('Header banner updated from Supabase (active)');
          } else {
            headerBanner.style.display = 'none';
            console.log('ℹHeader banner hidden (inactive in Supabase)');
          }
        }
      } catch (error) {
        console.error('Error processing header:', error);
      }
    }
    
    // Process social icons - process each platform separately to avoid conflicts
    if (socialIconAssets.length > 0) {
      // Process each social icon platform individually
      socialIconAssets.forEach(asset => {
        try {
          const platform = asset.social_platform;
          if (!platform) {
            console.warn('Social icon missing platform:', asset);
            return;
          }
          
          // Platform-specific selectors - very specific to avoid cross-matching
          const platformConfig = {
            'instagram': {
              selectors: [
                'img.social-icon[src="assets/ig.png"]',
                'img[src="assets/ig.png"]',
                'img[src*="/ig.png"]'
              ],
              verify: (src, alt) => src.includes('ig.png') || alt.includes('Instagram')
            },
            'tiktok': {
              selectors: [
                'img.social-icon[src="assets/tt.png"]',
                'img[src="assets/tt.png"]',
                'img[src*="/tt.png"]'
              ],
              verify: (src, alt) => src.includes('tt.png') || alt.includes('TikTok')
            },
            'whatsapp': {
              selectors: [
                'img.social-icon[src="assets/wa.png"]',
                'img[src="assets/wa.png"]',
                'img[src*="/wa.png"]'
              ],
              verify: (src, alt) => src.includes('wa.png') || alt.includes('WhatsApp')
            },
            'google_maps': {
              selectors: [
                'img.social-icon[src="assets/pin.png"]',
                'img[src="assets/pin.png"]',
                'img[src*="/pin.png"]'
              ],
              verify: (src, alt) => src.includes('pin.png') || alt.includes('Pin') || alt.includes('Dirección')
            }
          };
          
          const config = platformConfig[platform];
          if (!config) {
            console.warn(`Unknown platform: ${platform}`);
            return;
          }
          
          let icons = [];
          
          // Try each selector for this platform
          for (const selector of config.selectors) {
            try {
              const found = document.querySelectorAll(selector);
              if (found.length > 0) {
                Array.from(found).forEach(icon => {
                  const currentSrc = icon.getAttribute('src') || '';
                  const currentAlt = icon.getAttribute('alt') || '';
                  
                  // Double-check this icon belongs to this platform
                  if (config.verify(currentSrc, currentAlt) && !icons.includes(icon)) {
                    icons.push(icon);
                  }
                });
                
                // If we found icons, stop trying other selectors
                if (icons.length > 0) {
                  break;
                }
              }
            } catch (e) {
              console.warn(`Invalid selector for ${platform}:`, selector);
            }
          }
          
          // Remove duplicates
          icons = [...new Set(icons)];
          
          if (icons.length > 0) {
            // Determine URL to use
            let finalUrl = null;
            if (asset.display_type === 'image' && asset.url) {
              finalUrl = asset.url;
            } else if (asset.display_type === 'svg' && asset.svg_code) {
              finalUrl = `data:image/svg+xml,${encodeURIComponent(asset.svg_code)}`;
            } else if (asset.url) {
              finalUrl = asset.url;
            } else if (asset.svg_code) {
              finalUrl = `data:image/svg+xml,${encodeURIComponent(asset.svg_code)}`;
            }
            
            if (finalUrl) {
              icons.forEach(icon => {
                icon.src = finalUrl;
                icon.alt = asset.name || `${platform} icon`;
                // Remove loading class and add loaded class
                icon.classList.remove('assets-loading');
                icon.classList.add('assets-loaded');
              });
              console.log(`${platform} icon updated (${icons.length} instance(s))`, {
                platform: platform,
                urlPreview: finalUrl.substring(0, 60) + '...'
              });
            } else {
              console.warn(`${platform} icon has no URL or SVG code`);
            }
          } else {
            console.warn(`No ${platform} icons found in HTML to update`);
          }
        } catch (error) {
          console.error(`Error processing ${asset.social_platform} icon:`, error);
        }
      });
    }
    
    // Process shipping price message (should only be one)
    if (shippingPriceMessageAssets.length > 0) {
      const asset = shippingPriceMessageAssets[0];
      try {
        // Only set message if asset is active (like header)
        if (asset.is_active !== false) {
          window.shippingPriceMessage = asset.html_content || asset.url || 'Precio de envio varia segun localidad';
          console.log('Shipping price message loaded from Supabase (active):', window.shippingPriceMessage);
        } else {
          window.shippingPriceMessage = null;
          console.log('ℹShipping price message hidden (inactive in Supabase)');
        }
      } catch (error) {
        console.error('Error processing shipping price message:', error);
        window.shippingPriceMessage = 'Precio de envio varia segun localidad';
      }
    } else {
      // Default message
      window.shippingPriceMessage = 'Precio de envio varia segun localidad';
    }
    
    // Process shipping charges message (should only be one)
    if (shippingChargesMessageAssets.length > 0) {
      const asset = shippingChargesMessageAssets[0];
      try {
        // Only set message if asset is active (like header)
        if (asset.is_active !== false) {
          window.shippingChargesMessage = asset.html_content || asset.url || 'Posibles cargos de envio: $4.00 - $8.00';
          console.log('Shipping charges message loaded from Supabase (active):', window.shippingChargesMessage);
        } else {
          window.shippingChargesMessage = null;
          console.log('ℹShipping charges message hidden (inactive in Supabase)');
        }
      } catch (error) {
        console.error('Error processing shipping charges message:', error);
        window.shippingChargesMessage = 'Posibles cargos de envio: $4.00 - $8.00';
      }
    } else {
      // Default message
      window.shippingChargesMessage = 'Posibles cargos de envio: $4.00 - $8.00';
    }
    
    // Update shipping messages in the DOM if they exist
    try {
      const shippingPriceElement = document.getElementById('shipping-price-message');
      if (shippingPriceElement) {
        if (window.shippingPriceMessage) {
          shippingPriceElement.textContent = window.shippingPriceMessage;
          shippingPriceElement.classList.remove('assets-loading');
          shippingPriceElement.classList.add('assets-loaded');
          console.log('Shipping price message updated in DOM');
        } else {
          // Hide if inactive
          shippingPriceElement.style.display = 'none';
          shippingPriceElement.classList.remove('assets-loading');
        }
      }
      
      const shippingChargesElement = document.getElementById('shipping-charges-message');
      if (shippingChargesElement) {
        if (window.shippingChargesMessage) {
          shippingChargesElement.textContent = window.shippingChargesMessage;
          shippingChargesElement.classList.remove('assets-loading');
          shippingChargesElement.classList.add('assets-loaded');
          console.log('Shipping charges message updated in DOM');
        } else {
          // Hide if inactive
          shippingChargesElement.style.display = 'none';
          shippingChargesElement.classList.remove('assets-loading');
        }
      }
    } catch (error) {
      console.warn('Error updating shipping messages in DOM:', error);
    }
    
    // Show all assets after processing (either from Supabase or defaults)
    // Give a small delay to ensure all updates are complete
    setTimeout(() => {
      document.querySelectorAll('.assets-loading').forEach(el => {
        el.classList.remove('assets-loading');
        el.classList.add('assets-loaded');
      });
      
      // Update shipping messages again after DOM is fully ready
      const shippingPriceElement = document.getElementById('shipping-price-message');
      if (shippingPriceElement) {
        if (window.shippingPriceMessage) {
          shippingPriceElement.textContent = window.shippingPriceMessage;
          shippingPriceElement.classList.remove('assets-loading');
          shippingPriceElement.classList.add('assets-loaded');
        } else {
          shippingPriceElement.style.display = 'none';
          shippingPriceElement.classList.remove('assets-loading');
        }
      }
      
      const shippingChargesElement = document.getElementById('shipping-charges-message');
      if (shippingChargesElement) {
        if (window.shippingChargesMessage) {
          shippingChargesElement.textContent = window.shippingChargesMessage;
          shippingChargesElement.classList.remove('assets-loading');
          shippingChargesElement.classList.add('assets-loaded');
        } else {
          shippingChargesElement.style.display = 'none';
          shippingChargesElement.classList.remove('assets-loading');
        }
      }
    }, 200);
    
    console.log('All assets applied successfully');
  } catch (error) {
    console.error('Error loading assets from Supabase:', error);
  }
}

// Load assets when DOM and Supabase are ready
async function initializeAssets() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Wait for Supabase client to be available
      waitForSupabaseClient();
    });
  } else {
    // DOM already ready
    waitForSupabaseClient();
  }
}

async function waitForSupabaseClient(retries = 10) {
  if (typeof getSupabaseClient === 'undefined') {
    if (retries > 0) {
      console.log('⏳ Waiting for Supabase client to load...');
      setTimeout(() => waitForSupabaseClient(retries - 1), 500);
      return;
    } else {
      console.error('Supabase client not available after waiting');
      return;
    }
  }
  
  // Supabase client is available, load assets
  console.log('Supabase client ready, loading assets...');
  await loadAssetsFromSupabase();
}

// Initialize assets
initializeAssets();
