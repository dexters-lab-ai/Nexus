document.addEventListener('DOMContentLoaded', function() {
    // Product switching functionality
    const productTabs = document.querySelectorAll('.product-tab');
    const productContents = document.querySelectorAll('.product-content');
    
    // Set initial active product from URL hash or default to 'operator'
    const initialProduct = window.location.hash.substring(1) || 'operator';
    activateProduct(initialProduct);
    
    // Add click event listeners to all product tabs
    productTabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            const product = this.getAttribute('data-product');
            activateProduct(product);
            
            // Update URL hash without page jump
            history.pushState(null, null, `#${product}`);
        });
    });
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', function() {
        const product = window.location.hash.substring(1) || 'operator';
        activateProduct(product);
    });
    
    // Function to activate a product and deactivate others
    function activateProduct(product) {
        // Deactivate all tabs and contents
        productTabs.forEach(tab => {
            tab.classList.remove('active');
            tab.classList.remove('nav-link-active');
        });
        
        productContents.forEach(content => {
            content.classList.remove('active');
        });
        
        // Activate selected tab and content
        const activeTab = document.querySelector(`.product-tab[data-product="${product}"]`);
        const activeContent = document.getElementById(`${product}-content`);
        
        if (activeTab && activeContent) {
            activeTab.classList.add('active');
            activeTab.classList.add('nav-link-active');
            activeContent.classList.add('active');
            
            // Update page title
            document.title = `${product.charAt(0).toUpperCase() + product.slice(1)} | D.A.I.L`;
            
            // Trigger animation
            activeContent.style.animation = 'none';
            activeContent.offsetHeight; // Trigger reflow
            activeContent.style.animation = 'fadeIn 0.5s ease-out';
        }
    }
    
    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileMenuToggle && navLinks) {
        mobileMenuToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            this.setAttribute('aria-expanded', 
                this.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'
            );
        });
    }
    
    // Close mobile menu when clicking on a nav link
    const navLinksList = document.querySelectorAll('.nav-links a');
    navLinksList.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                navLinks.classList.remove('active');
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    });
});
