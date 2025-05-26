document.addEventListener('DOMContentLoaded', function() {
  // Configuration
  const ROTATION_INTERVAL = 7000; // 7 seconds per product
  const TRANSITION_DURATION = 500; // ms for fade/transform animations
  
  // Elements
  const tabButtons = document.querySelectorAll('.product-tab');
  const tabContents = document.querySelectorAll('.product-content');
  const tabsContainer = document.querySelector('.tabs-container');
  
  // State
  let rotationTimer;
  let isHovering = false;
  let isAnimating = false;
  
  // Initialize the first tab as active
  if (tabButtons.length > 0) {
    tabButtons[0].classList.add('active');
    tabContents[0].classList.add('active');
  }
  
  // Tab click handler
  function handleTabClick(index, isAutoRotate = false) {
    if (isAnimating) return; // Prevent rapid clicks during animation
    isAnimating = true;
    
    // Add transition for smooth fade
    tabContents.forEach(content => {
      content.style.transition = `opacity ${TRANSITION_DURATION}ms ease, transform ${TRANSITION_DURATION}ms ease`;
      content.style.opacity = '0';
      content.style.transform = 'translateY(10px)';
    });
    
    // Update active states
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabButtons[index].classList.add('active');
    
    // Fade in the new active content
    setTimeout(() => {
      tabContents.forEach(content => content.classList.remove('active'));
      tabContents[index].classList.add('active');
      
      // Force reflow
      void tabContents[index].offsetWidth;
      
      // Animate in
      tabContents[index].style.opacity = '1';
      tabContents[index].style.transform = 'translateY(0)';
      
      // Update tab indicator
      updateTabIndicator();
      
      // Reset animation state
      setTimeout(() => {
        isAnimating = false;
        tabContents[index].style.transition = '';
      }, TRANSITION_DURATION);
      
    }, 50);
    
    // Reset auto-rotation if not auto-rotating
    if (!isAutoRotate && !isHovering) {
      resetAutoRotate();
    }
  }
  
  // Auto-rotate tabs
  function startAutoRotate() {
    // Clear any existing interval
    if (rotationTimer) {
      clearInterval(rotationTimer);
    }
    
    // Set new interval
    rotationTimer = setInterval(() => {
      // Don't rotate if user is interacting, tab is hidden, or animation is in progress
      if (isHovering || document.hidden || isAnimating) return;
      
      const activeIndex = [...tabButtons].findIndex(btn => btn.classList.contains('active'));
      const nextIndex = (activeIndex + 1) % tabButtons.length;
      
      // Trigger tab change with auto-rotate flag
      handleTabClick(nextIndex, true);
    }, ROTATION_INTERVAL);
  }
  
  // Reset auto-rotation timer
  function resetAutoRotate() {
    if (rotationTimer) {
      clearInterval(rotationTimer);
    }
    startAutoRotate();
  }
  
  // Initialize tab interactions
  function initTabInteractions() {
    if (!tabsContainer) return;
    
    // Pause on hover
    tabsContainer.addEventListener('mouseenter', () => {
      isHovering = true;
      if (rotationTimer) {
        clearInterval(rotationTimer);
      }
    });
    
    // Resume on mouse leave
    tabsContainer.addEventListener('mouseleave', () => {
      isHovering = false;
      if (!isAnimating) {
        startAutoRotate();
      }
    });
    
    // Pause when window loses focus
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (rotationTimer) {
          clearInterval(rotationTimer);
        }
      } else if (!isHovering && !isAnimating) {
        startAutoRotate();
      }
    });
    
    // Handle tab clicks
    tabButtons.forEach((button, index) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isAnimating) {
          handleTabClick(index);
        }
      });
    });
  }
  
  // Add click event listeners to tabs
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      handleTabClick(index);
    });
    
    // Add keyboard navigation
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTabClick(index);
      }
    });
  });
  
  // Add animation for tab indicators
  const updateTabIndicator = () => {
    const activeTab = document.querySelector('.product-tab.active');
    const indicator = document.querySelector('.tab-indicator');
    
    if (activeTab && indicator) {
      const tabRect = activeTab.getBoundingClientRect();
      const containerRect = activeTab.parentElement.getBoundingClientRect();
      
      indicator.style.width = `${tabRect.width}px`;
      indicator.style.transform = `translateX(${tabRect.left - containerRect.left}px)`;
    }
  };
  
  // Update indicator on load and resize
  window.addEventListener('resize', updateTabIndicator);
  
  // Recalculate indicator position when tabs change
  const observer = new MutationObserver(updateTabIndicator);
  const config = { attributes: true, childList: true, subtree: true };
  tabButtons.forEach(button => {
    observer.observe(button, config);
  });
  
  // Initial setup
  updateTabIndicator();
  
  // Start auto-rotation
  startAutoRotate();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (autoRotateInterval) {
      clearInterval(autoRotateInterval);
    }
    observer.disconnect();
  });
  
  // Add click event listeners to each tab
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const product = this.getAttribute('data-product');
      
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      this.classList.add('active');
      document.getElementById(`${product}-content`).classList.add('active');
      
      // Add animation class for smooth transition
      const activeContent = document.getElementById(`${product}-content`);
      activeContent.style.animation = 'none';
      void activeContent.offsetWidth; // Trigger reflow
      activeContent.style.animation = 'fadeIn 0.5s ease-out';
    });
  });
  
  // Auto-rotate tabs every 12 seconds if user is not interacting
  let rotationInterval;
  let isUserInteracting = false;
  
  function startRotation() {
    if (!isUserInteracting) {
      rotationInterval = setInterval(() => {
        const activeTab = document.querySelector('.product-tab.active');
        let nextTab = activeTab.nextElementSibling;
        
        // If it's the last tab, go back to the first one
        if (!nextTab || !nextTab.classList.contains('product-tab')) {
          nextTab = document.querySelector('.product-tab');
        }
        
        // Add smooth transition class
        document.querySelectorAll('.product-content').forEach(content => {
          content.style.transition = 'opacity 0.8s ease-in-out, transform 0.8s ease-in-out';
        });
        
        // Trigger click on the next tab
        if (nextTab) nextTab.click();
      }, 12000); // Increased from 8000ms to 12000ms
    }
  }
  
  // Start rotation
  startRotation();
  
  // Pause rotation when user interacts with tabs
  tabs.forEach(tab => {
    tab.addEventListener('mouseenter', () => {
      isUserInteracting = true;
      clearInterval(rotationInterval);
    });
    
    tab.addEventListener('mouseleave', () => {
      isUserInteracting = false;
      clearInterval(rotationInterval);
      startRotation();
    });
    
    tab.addEventListener('touchstart', () => {
      isUserInteracting = true;
      clearInterval(rotationInterval);
    });
    
    tab.addEventListener('touchend', () => {
      isUserInteracting = false;
      clearInterval(rotationInterval);
      startRotation();
    });
  });
  
  // Pause rotation when window loses focus
  window.addEventListener('blur', () => {
    clearInterval(rotationInterval);
  });
  
  window.addEventListener('focus', () => {
    if (!isUserInteracting) {
      startRotation();
    }
  });
});
