document.addEventListener('DOMContentLoaded', function() {
  // Animate timeline items on scroll
  const timelineItems = document.querySelectorAll('.timeline-item');
  
  // Function to check if element is in viewport
  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  // Function to handle scroll events
  function handleScroll() {
    timelineItems.forEach((item, index) => {
      if (isInViewport(item)) {
        // Add a delay based on the item's position
        setTimeout(() => {
          item.classList.add('animate');
        }, 150 * index);
      }
    });
  }

  // Initial check on page load
  handleScroll();

  // Add scroll event listener
  window.addEventListener('scroll', handleScroll);

  // Add animation classes to items already in view on page load
  timelineItems.forEach((item, index) => {
    if (isInViewport(item)) {
      setTimeout(() => {
        item.classList.add('animate');
      }, 150 * index);
    }
  });
});
