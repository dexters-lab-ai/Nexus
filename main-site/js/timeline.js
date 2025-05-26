// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get timeline elements
    const timelineItems = document.querySelectorAll('.timeline-item');
    const timelineDots = document.querySelectorAll('.timeline-dot');
    const timelineLine = document.querySelector('.timeline-line');
    
    // Check if timeline elements exist
    if (!timelineItems.length || !timelineDots.length || !timelineLine) {
        console.warn('Timeline elements not found. The timeline will not be initialized.');
        return; // Exit if required elements don't exist
    }
    
    // Initial setup - activate first item by default
    if (timelineItems.length > 0) {
        timelineItems[0].classList.add('active');
        timelineDots[0].classList.add('active');
    }
    
    // Set up Intersection Observer for scroll-based activation
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove active class from all items
                timelineItems.forEach(item => item.classList.remove('active'));
                
                // Add active class to the item in view
                entry.target.classList.add('active');
            }
        });
    }, {
        root: null,
        rootMargin: '0px',
        threshold: 0.6
    });
    
    // Observe all timeline items
    timelineItems.forEach(item => {
        observer.observe(item);
    });
    
    // Initialize AOS for timeline items if available
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            once: true,
            offset: 100
        });
    }
    
    // Update timeline line height based on active item position
    function updateTimelineLine() {
        const activeDot = document.querySelector('.timeline-dot.active');
        if (activeDot && timelineLine) {
            // Calculate the position of the active dot
            const dotRect = activeDot.getBoundingClientRect();
            const timelineRect = document.querySelector('.timeline').getBoundingClientRect();
            const firstDot = document.querySelector('.timeline-dot');
            const firstDotRect = firstDot.getBoundingClientRect();
            
            // Calculate the height from the first dot to the active dot
            const height = dotRect.top + (dotRect.height / 2) - firstDotRect.top;
            
            // Update the line height
            timelineLine.style.height = `${height}px`;
            
            // Add a class to the timeline for animation
            timelineLine.classList.add('animating');
            
            // Remove the animation class after the transition
            setTimeout(() => {
                timelineLine.classList.remove('animating');
            }, 500);
        }
    }
    
    // Update on window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            updateTimelineLine();
        }, 250);
    });
});
