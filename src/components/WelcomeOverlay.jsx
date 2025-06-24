import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { eventBus } from '../utils/events.js';
import { motion, AnimatePresence } from 'framer-motion';

const WelcomeOverlay = ({ onClose }) => {
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
              Your AI-powered Browser & Computer Automation Assistant
              <span className="coming-soon">Coming soon to Android & iOS</span>
            </p>
            
            <div className="welcome-features">
              <div className="feature">
                <div className="feature-icon">🤖</div>
                <h3>AI-Powered Automation</h3>
                <p>Automate repetitive tasks with natural language instructions</p>
              </div>
              
              <div className="feature">
                <div className="feature-icon">🌐</div>
                <h3>Web & Desktop</h3>
                <p>Control both web browsers and desktop applications</p>
              </div>
              
              <div className="feature">
                <div className="feature-icon">⚡</div>
                <h3>Smart Workflows</h3>
                <p>Create complex workflows with simple commands</p>
              </div>
            </div>
            
            <div className="welcome-actions">
              <button 
                className="primary-button"
                onClick={() => {
                  eventBus.emit('command', { type: 'help' });
                  onClose();
                }}
              >
                Get Started
              </button>
              <button 
                className="secondary-button"
                onClick={onClose}
              >
                Explore on My Own
              </button>
            </div>
            
            <div className="welcome-tip">
              <span>💡</span>
              <p>Try saying: "Open the BTC chart on coingecko, zoom out chart to 1Y, switch to candlestick chart view, predict price in 3 months" or "Show me what you can do"</p>
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
