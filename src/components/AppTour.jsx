import React from 'react';
import { createRoot } from 'react-dom/client';
import TourGuide from './TourGuide';

// Tour steps configuration
export const appTourSteps = [
  {
    target: '.filter-buttons-container',
    title: 'Filter Controls',
    content: 'Use these buttons to filter and sort your content.'
  },
  {
    target: '#command-center',
    title: 'Command Center',
    content: 'Type natural language commands here to run automated tasks, choose LLM/VLM, connect services.'
  },
  {
    target: '#task-bar',
    title: 'Task Bar',
    content: 'Monitor server connections, running tasks, completed tasks.'
  },
  {
    target: '#main-sidebar',
    title: 'Sidebar',
    content: 'Discover and manage reusable automation templates or maps in YAML format.'
  },
  {
    target: '.nav-tools',
    title: 'Navigation Tools',
    content: 'Quick access to essential tools and settings.'
  }
];

// Initialize the app tour
export const initializeTour = () => {
  try {
    console.log('Initializing app tour...');
    
    // Create and mount the tour component
    const tourContainer = document.createElement('div');
    document.body.appendChild(tourContainer);
    const root = createRoot(tourContainer);
    
    const onClose = () => {
      root.unmount();
      document.body.removeChild(tourContainer);
    };
    
    root.render(
      <TourGuide 
        isOpen={true}
        onClose={onClose}
        steps={appTourSteps}
      />
    );
    
    return onClose; // Return cleanup function
  } catch (error) {
    console.error('Error initializing tour:', error);
    return () => {}; // Return noop function if initialization fails
  }
};
