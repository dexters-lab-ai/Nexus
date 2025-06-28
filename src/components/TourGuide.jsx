import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getGuideOverlay } from './GuideOverlay';

// Keyboard navigation hook
const useKeyboardNavigation = (onNext, onPrev, onClose) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        onNext();
      } else if (e.key === 'ArrowLeft') {
        onPrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrev, onClose]);
};

const TourGuide = ({ isOpen, onClose, steps = [] }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [dimensions, setDimensions] = useState({});
  const [isPositioned, setIsPositioned] = useState(false);
  const overlayRef = useRef(null);
  const currentElement = useRef(null);
  const tooltipRef = useRef(null);
  const [tooltipPlacement, setTooltipPlacement] = useState('bottom');
  
  // Calculate progress percentage
  const progress = useMemo(() => {
    return ((currentStep + 1) / steps.length) * 100;
  }, [currentStep, steps.length]);

  useEffect(() => {
    if (isOpen && steps.length > 0) {
      updateHighlight(steps[0].target);
    }
    return () => {
      cleanupHighlight();
    };
  }, [isOpen, steps]);

  const updateHighlight = useCallback((selector) => {
    cleanupHighlight();
    
    const element = document.querySelector(selector);
    if (!element) return;
    
    currentElement.current = element;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Determine best placement for tooltip (top or bottom)
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement = spaceBelow > spaceAbove ? 'bottom' : 'top';
    setTooltipPlacement(placement);
    
    // Add class for fixed elements
    const isFixed = window.getComputedStyle(element).position === 'fixed';
    if (isFixed) {
      element.classList.add('tour-highlight-fixed');
    }
    
    // Calculate tooltip position
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    
    setDimensions({
      width: rect.width,
      height: rect.height,
      top: rect.top + scrollY,
      left: rect.left + scrollX,
      right: viewportWidth - (rect.right + scrollX),
      bottom: viewportHeight - (rect.bottom + scrollY),
      element: element,
      isFixed
    });
    
    element.classList.add('tour-highlighted');
    
    // Scroll element into view if needed
    const scrollOptions = {
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    };
    
    element.scrollIntoView(scrollOptions);
    setIsPositioned(true);
  }, []);

  const cleanupHighlight = useCallback(() => {
    if (currentElement.current) {
      currentElement.current.classList.remove('tour-highlighted', 'tour-highlight-fixed');
      currentElement.current = null;
    }
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setIsPositioned(false);
      setCurrentStep(currentStep + 1);
      setTimeout(() => {
        updateHighlight(steps[currentStep + 1].target);
      }, 10);
    } else {
      onClose();
    }
  }, [currentStep, steps, updateHighlight, onClose]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setIsPositioned(false);
      setCurrentStep(currentStep - 1);
      setTimeout(() => {
        updateHighlight(steps[currentStep - 1].target);
      }, 10);
    }
  }, [currentStep, steps, updateHighlight]);
  
  // Initialize keyboard navigation
  useKeyboardNavigation(nextStep, prevStep, onClose);

  const openGuide = () => {
    onClose();
    setTimeout(() => {
      getGuideOverlay().show();
    }, 300);
  };

  // Update highlight when steps or currentStep changes
  useEffect(() => {
    if (isOpen && steps.length > 0) {
      updateHighlight(steps[currentStep].target);
    }
  }, [isOpen, steps, currentStep, updateHighlight]);

  if (!isOpen || steps.length === 0) return null;

  const currentGuide = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Calculate tooltip position based on element position
  const getTooltipPosition = useCallback(() => {
    if (!dimensions || !tooltipRef.current) return {};
    
    const tooltipHeight = tooltipRef.current?.offsetHeight || 200;
    const tooltipWidth = 320; // Match CSS width
    const padding = 20;
    
    let top, left;
    const isFixed = dimensions.isFixed;
    const baseTop = isFixed ? dimensions.top : dimensions.top - window.scrollY;
    const baseLeft = isFixed ? dimensions.left : dimensions.left - window.scrollX;
    
    // Position tooltip below or above based on available space
    if (tooltipPlacement === 'bottom') {
      top = baseTop + dimensions.height + 10;
    } else {
      top = baseTop - tooltipHeight - 10;
    }
    
    // Center tooltip horizontally relative to element
    left = Math.max(
      padding,
      Math.min(
        baseLeft + (dimensions.width / 2) - (tooltipWidth / 2),
        window.innerWidth - tooltipWidth - padding
      )
    );
    
    return {
      top: `${Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding))}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      position: isFixed ? 'fixed' : 'absolute'
    };
  }, [dimensions, tooltipPlacement]);

  return createPortal(
    <AnimatePresence>
      {isOpen && isPositioned && steps[currentStep] && (
        <div className="tour-overlay" ref={overlayRef}>
          <div 
            className="tour-highlight"
            style={{
              width: dimensions.width,
              height: dimensions.height,
              top: dimensions.top,
              left: dimensions.left,
              position: dimensions.isFixed ? 'fixed' : 'absolute'
            }}
          />
          
          <motion.div
            ref={tooltipRef}
            className="tour-tooltip"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={getTooltipPosition()}
            data-popper-placement={tooltipPlacement}
          >
            <div className="tour-progress">
              <div 
                className="tour-progress-inner" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <h3 className="tour-title">{steps[currentStep].title}</h3>
            <p className="tour-description">{steps[currentStep].content}</p>
            <div className="tour-actions">
              <div className="tour-buttons">
                {currentStep > 0 ? (
                  <button 
                    className="tour-button tour-button-secondary"
                    onClick={prevStep}
                    aria-label="Previous step"
                  >
                    Back
                  </button>
                ) : (
                  <button 
                    className="tour-button tour-button-secondary"
                    onClick={onClose}
                    aria-label="Skip tour"
                  >
                    Skip
                  </button>
                )}
                <button 
                  className="tour-button tour-button-primary"
                  onClick={isLastStep ? onClose : nextStep}
                  autoFocus
                  aria-label={isLastStep ? 'Finish tour' : 'Next step'}
                >
                  {isLastStep ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default TourGuide;
