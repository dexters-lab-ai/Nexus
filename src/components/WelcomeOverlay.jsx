import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import { eventBus } from '../utils/events';
import { FiX, FiHelpCircle, FiPlay, FiCompass } from 'react-icons/fi';
import '../styles/components/welcome-overlay.css';
import TourGuide from './TourGuide';
import { getGuideOverlay } from './GuideOverlay';
import '../styles/components/tour-guide.css';



const WelcomeOverlay = ({ onClose }) => {
  const [showAppTour, setShowAppTour] = useState(false);
  
  // Initialize the app tour when showAppTour changes
  useEffect(() => {
    if (showAppTour) {
      // Close the welcome overlay
      onClose();
      
      // Small delay to ensure the overlay is fully closed
      setTimeout(() => {
        // Emit event to start the tour
        eventBus.emit('startAppTour');
      }, 300);
    }
  }, [showAppTour, onClose]);
  
  const handleOpenGuide = () => {
    onClose();
    setTimeout(() => {
      const guide = getGuideOverlay();
      if (guide && typeof guide.show === 'function') {
        guide.show();
      }
    }, 300);
  };
  
  const handleStartAppTour = () => {
    setShowAppTour(true);
  };
  
  return (
    <AnimatePresence>
      <div className="welcome-overlay">
        <motion.div 
          className="welcome-content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="welcome-header">
            <h2>🚀 Welcome to O.P.E.R.A.T.O.R</h2>
            <button className="close-button" onClick={onClose}>&times;</button>
          </div>
          
          <div className="welcome-body">
            <p className="welcome-intro">
              Your AI-powered Automation Assistant for Web, Desktop & Android
            </p>
            
            <div className="welcome-features">
              <div className="feature">
                <div className="feature-icon">🤖</div>
                <h3>AI-Powered Automation</h3>
                <p>Automate repetitive tasks with natural language instructions</p>
              </div>
              
              <div className="feature">
                <div className="feature-icon">📱</div>
                <h3>Android Device Control</h3>
                <p>Automate and control Android devices via USB or network</p>
              </div>
              
              <div className="feature">
                <div className="feature-icon">🌐</div>
                <h3>Web & Desktop</h3>
                <p>Control both web browsers and desktop applications</p>
              </div>
              
              <div className="feature">
                <div className="feature-icon">⚡</div>
                <h3>Smart Workflows</h3>
                <p>Create complex cross-device workflows with simple commands</p>
              </div>
            </div>
            
            <div className="welcome-actions">
              <button 
                className="tour-button"
                onClick={handleStartAppTour}
              >
                <span>🚀</span> Take a Tour
              </button>
              <button 
                className="guide-button"
                onClick={handleOpenGuide}
              >
                <span>📚</span> Open Guide
              </button>
              <button 
                className="explore-button"
                onClick={onClose}
              >
                <span>🔍</span> Explore Myself
              </button>
            </div>
            
            <div className="welcome-tip">
              <span>💡</span>
              <div>
                <p><strong>Try saying:</strong></p>
                <ul className="example-commands">
                  <li>"Open the BTC chart on coingecko, zoom out to 1Y, switch to candlestick view"</li>
                  <li>"Connect to my Android device and take a screenshot"</li>
                  <li>"Show me what you can do with Android automation"</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Function to show the welcome overlay
export function showWelcomeOverlay() {
  // Create container if it doesn't exist
  let container = document.getElementById('welcome-overlay-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'welcome-overlay-root';
    document.body.appendChild(container);
  }
  
  // Create root and render the overlay
  const root = createRoot(container);
  
  const handleClose = () => {
    // Animate out before unmounting
    const content = container.querySelector('.welcome-content');
    if (content) {
      content.style.animation = 'fadeOut 0.3s forwards';
    }
    
    setTimeout(() => {
      root.unmount();
      container.remove();
    }, 300);
  };
  
  root.render(<WelcomeOverlay onClose={handleClose} />);
  
  // Mark as shown in localStorage (uncomment when ready)
  // localStorage.setItem('operator_welcome_shown', 'true');
  
  return handleClose;
}

// Check if welcome should be shown
export function shouldShowWelcome() {
  // For testing, always return true
  // In production: return localStorage.getItem('operator_welcome_shown') !== 'true';
  return true;
}

// Export the component and its functions
export default WelcomeOverlay;
