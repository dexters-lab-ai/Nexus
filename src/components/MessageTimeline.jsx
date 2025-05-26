/**
 * Message Timeline Component
 * Displays a unified timeline of chat messages and command results
 */

import { eventBus, addEvent } from '../utils/events.js';
import { messagesStore } from '../store/index.js';
import { getMessageHistory } from '../api/messages.js';

/**
 * Formats URLs in text content with clean, clickable gradient links
 * @param {string} content - The content to process for URLs
 * @returns {string} Content with formatted URLs
 */
/**
 * Escapes special characters in a string for use in a regular expression
 * @param {string} string - The string to escape
 * @returns {string} The escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats URLs in text content with clean, clickable gradient links
 * @param {string} content - The content to process for URLs
 * @returns {string} Content with formatted URLs
 */
function formatUrls(content) {
  if (!content) return '';
  
  // First sanitize any HTML in the content if it's a string
  const sanitizedContent = typeof content === 'string' 
    ? content.replace(/</g, "&lt;").replace(/>/g, "&gt;") 
    : '';
  
  // Enhanced URL regex that properly handles URLs with query params, anchors, and paths
  const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/g;
  
  return sanitizedContent.replace(urlRegex, (url) => {
    // Extract domain for display text
    let displayText = 'link';
    try {
      // Handle URL parameters and hash fragments
      let cleanUrl = url;
      // If the URL contains special characters that might break parsing
      if (url.includes('&amp;')) {
        cleanUrl = url.replace(/&amp;/g, '&');
      }
      
      const urlObj = new URL(cleanUrl);
      displayText = urlObj.hostname.replace('www.', '');
      
      // Add path info if it's not just the root
      if (urlObj.pathname && urlObj.pathname !== '/') {
        const pathParts = urlObj.pathname.split('/');
        // Add the first path segment for context
        if (pathParts.length > 1 && pathParts[1]) {
          displayText += '/' + pathParts[1] + (pathParts.length > 2 ? '/...' : '');
        }
      }
    } catch (e) {
      console.log('Error parsing URL:', e);
    }
    
    // Return properly formatted link with gradient styling that will be styled via CSS
    return `<a href="javascript:void(0)" onclick="window.open('${url}', '_blank')" class="gradient-link">${displayText}</a>`;
  });
}

// Message type constants
export const MESSAGE_TYPES = {
  CHAT: 'chat',
  COMMAND: 'command',
  SYSTEM: 'system',
  ERROR: 'error',
  THOUGHT: 'thought'
};

// Message role constants
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system'
};

/**
 * Create a message timeline component
 * @param {Object} props - Component properties
 * @returns {HTMLElement} Timeline container element
 */
export function MessageTimeline(props = {}) {
  const {
    containerId = 'message-timeline',
    initialFilter = 'all'
  } = props;

  // Create component container
  const container = document.createElement('div');
  container.id = containerId;
  container.className = 'message-timeline';

  // Add styles for the filter bar and refresh button (sci-fi style)
  const style = document.createElement('style');
  style.textContent = `
    .message-timeline-filter {
      display: flex;
      align-items: center;
      background: linear-gradient(to right, rgba(16, 22, 45, 0.8), rgba(32, 42, 80, 0.9));
      border-radius: 8px;
      padding: 4px;
      margin-bottom: 10px;
      box-shadow: 0 0 15px rgba(74, 123, 240, 0.1), inset 0 0 3px rgba(123, 90, 250, 0.3);
      position: relative;
      z-index: 2;
      backdrop-filter: blur(4px);
    }
    
    /* Smooth animations for message additions and removals */
    .fade-in-message {
      animation: fadeIn 0.3s ease-in-out forwards;
      opacity: 0;
      transform: translateY(10px);
    }
    
    .fade-out-message {
      animation: fadeOut 0.3s ease-in-out forwards;
      opacity: 1;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-10px); }
    }
    
    /* Minimalist task result styling */
    .task-result-container {
      border-radius: 6px;
      padding: 5px 8px;
      margin: 4px 0 6px 0;
    }
    
    .task-header {
      font-weight: 400;
      margin-bottom: 6px;
      border-left: 2px solid rgba(77, 171, 247, 0.3);
      padding-left: 6px;
      font-size: 0.9em;
    }
    
    .task-completion-status {
      background: rgba(59, 130, 246, 0.1);
      padding: 6px 8px;
      border-radius: 4px;
      margin: 6px 0;
      font-weight: 500;
      font-size: 0.9em;
    }
    
    .report-section-header {
      font-weight: 500;
      margin: 3px 0 4px 0;
      color: var(--accent);
      font-size: 0.9em;
    }
    
    .report-section {
      margin: 4px 0;
      padding: 0;
    }
    
    .report-section a {
      display: inline-flex;
      align-items: center;
      font-size: 0.85em;
      text-decoration: none;
      color: var(--info);
      padding: 3px 8px;
      border-radius: 3px;
      background: rgba(77, 171, 247, 0.08);
      transition: all 0.2s ease;
    }
    
    .report-section a:hover {
      background: rgba(77, 171, 247, 0.15);
      transform: translateY(-1px);
    }
    
    .report-section a i {
      margin-right: 4px;
    }
    
    .data-point {
      font-weight: 500;
      color: #3182ce;
      background: rgba(49, 130, 206, 0.08);
      padding: 1px 4px;
      border-radius: 3px;
      display: inline-block;
      font-size: 0.9em;
    }
    
    .sentiment-data {
      font-weight: 500;
      color: #dd6b20;
      font-size: 0.9em;
    }
    
    /* Status link styling for URLs in task completion status */
    .status-link {
      color: #3182ce;
      text-decoration: none;
      background: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 500;
      letter-spacing: 0.02em;
      transition: all 0.2s ease;
      border: 1px solid rgba(49, 130, 206, 0.2);
    }
    
    .status-link:hover {
      background: rgba(255, 255, 255, 0.9);
      transform: translateY(-1px);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      text-decoration: none;
    }
    
    /* Report links styling */
    .report-links-container {
      margin-top: 12px;
      border-top: 1px solid rgba(123, 90, 250, 0.3);
      padding-top: 8px;
    }
    
    .report-links-header {
      font-size: 0.9em;
      margin-bottom: 6px;
      color: rgba(255, 255, 255, 0.7);
    }
    
    .report-links-inline {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .inline-report-link {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(74, 123, 240, 0.1);
      border-radius: 6px;
      padding: 6px 10px;
      transition: all 0.2s ease;
    }
    
    .inline-report-link:hover {
      background: rgba(74, 123, 240, 0.2);
      transform: translateY(-1px);
    }
    
    .report-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .report-label {
      font-size: 0.9em;
    }
    
    .report-separator {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: rgba(123, 90, 250, 0.5);
    }
    
    .timeline-filters {
      display: flex;
      flex: 1;
      gap: 2px;
    }
    
    .timeline-filter-btn {
      background: rgba(74, 123, 240, 0.1);
      color: rgba(255, 255, 255, 0.7);
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }
    
    .timeline-filter-btn:before {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, var(--info), var(--cyberpunk-purple));
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 0.3s ease;
    }
    
    .timeline-filter-btn:hover {
      background: rgba(74, 123, 240, 0.2);
      color: rgba(255, 255, 255, 0.9);
    }
    
    .timeline-filter-btn.active {
      background: rgba(74, 123, 240, 0.25);
      color: #ffffff;
      box-shadow: 0 0 10px rgba(123, 90, 250, 0.2);
    }
    
    .timeline-filter-btn.active:before {
      transform: scaleX(1);
    }
    
    @keyframes rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(123, 90, 250, 0.6); }
      70% { box-shadow: 0 0 0 5px rgba(123, 90, 250, 0); }
      100% { box-shadow: 0 0 0 0 rgba(123, 90, 250, 0); }
    }
  `;
  document.head.appendChild(style);

  // Create filter toolbar directly in the container
  const filterToolbar = document.createElement('div');
  filterToolbar.className = 'timeline-filters';
  container.appendChild(filterToolbar);
  
  // Filter buttons
  const filterButtons = [
    { text: 'All', value: 'all' },
    { text: 'Chat', value: 'chat' },
    { text: 'Command', value: 'command' }
  ];
  
  // Current active filter
  let activeFilter = initialFilter;
  
  // Create filter buttons container (left side)
  const filterButtonsContainer = document.createElement('div');
  filterButtonsContainer.className = 'filter-buttons-container';
  filterToolbar.appendChild(filterButtonsContainer);
  
  // Add refresh button to separate container on the right side
  const refreshButton = document.createElement('button');
  refreshButton.className = 'message-refresh-btn';
  refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
  refreshButton.title = 'Refresh messages';
  refreshButton.onclick = () => {
    refreshButton.classList.add('spinning');
    loadMessages(true); // Force full refresh
    
    // Remove spinning class after animation completes
    setTimeout(() => {
      refreshButton.classList.remove('spinning');
    }, 1500);
  };
  // Add refresh button directly to the toolbar (not inside filter buttons container)
  filterToolbar.appendChild(refreshButton);
  
  // Add filter buttons
  filterButtons.forEach(filter => {
    const button = document.createElement('button');
    button.className = 'timeline-filter-btn';
    button.dataset.filter = filter.value;
    button.innerHTML = filter.text;
    
    // Highlight the active filter
    if (filter.value === activeFilter) {
      button.classList.add('active');
    }
    
    // Simplified click handler that uses the store's applyFilter function
    button.addEventListener('click', () => {
      // Don't do anything if this is already the active filter
      if (filter.value === activeFilter) return;
      
      // Update local state for visual consistency
      activeFilter = filter.value;
      
      // Always use the message store's filtering capability
      // This will handle both store updates and DOM updates
      messagesStore.applyFilter(filter.value);
      
      console.log(`[MessageTimeline] Filter changed to ${filter.value} using store applyFilter`);
    });
    
    // Append to the filter buttons container instead of directly to toolbar
    filterButtonsContainer.appendChild(button);
  });
  
  container.appendChild(filterToolbar);

  // Create messages container
  const messagesContainer = document.createElement('div');
  messagesContainer.className = 'message-timeline-container';
  container.appendChild(messagesContainer);

  // --- Thought Streaming Bubble Logic ---
  // Only one active thought bubble per session
  let activeThoughtId = null;

  /**
   * Format command message content with proper styling for task results and reports
   * @param {string} content - The raw message content
   * @returns {string} Formatted HTML content
   */
  function formatCommandContent(content) {
    try {
      // Create a specialized container for task results
      let formattedHtml = '<div class="task-result-container">';
      
      // Debug the raw content
      console.log('Raw content before formatting:', content.substring(0, 200) + '...');
      
      // 1. Extract and format task description if present
      const taskMatch = content.match(/Task:\s*"([^"]+)"/i);
      if (taskMatch && taskMatch[1]) {
        formattedHtml += `<div class="task-header"><b>Task:</b> "${taskMatch[1].trim()}"</div>`;
      }
      
      // 2. Process main content
      let mainContent = content;
      
      // Remove task line if we displayed it separately
      if (taskMatch) {
        mainContent = mainContent.replace(/Task:\s*"([^"]+)"\n?/i, '');
      }
      
      // Format completion status if present
      const statusRegex = /(Successfully created [^\n]+|Task (completed|reached maximum steps) [^\n]+)/g;
      const statusMatch = statusRegex.exec(mainContent);
      
      if (statusMatch) {
        // Process URLs in status message
        let statusText = statusMatch[0].trim();
        
        // Format any URLs in the status message - use 'live link' text
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        statusText = statusText.replace(urlRegex, (url) => {
          return `<a href="javascript:void(0)" onclick="window.open('${url}', '_blank')" class="status-link">live link</a>`;
        });
        
        formattedHtml += `<div class="task-completion-status">${statusText}</div>`;
        mainContent = mainContent.replace(statusMatch[0], '').trim();
      }
      
      // Format report section
      let reportSection = '';
      if (mainContent.includes('Task Reports Available:')) {
        // Extract report section
        const reportRegex = /Task Reports Available:([\s\S]+)/;
        const reportMatch = reportRegex.exec(mainContent);
        
        if (reportMatch) {
          const reportContent = reportMatch[1];
          // No newlines between status and reports
          reportSection = '<div class="reports-section">';
          reportSection += '<div class="report-section-header">Run Reports:</div>';
          
          // Process each report link
          const reportLines = reportContent.split('\n').filter(line => line.trim());
          
          reportLines.forEach(line => {
            const linkMatch = line.match(/- (Analysis|Landing Page) Report: ([^\s]+)/);
            if (linkMatch) {
              const reportType = linkMatch[1];
              const reportUrl = linkMatch[2];
              const icon = reportType.toLowerCase().includes('analysis') ? 'fa-chart-bar' : 'fa-file-alt';
              
              // Ensure URL is absolute
              const fullUrl = reportUrl.startsWith('/') ? window.location.origin + reportUrl : reportUrl;
              
              // Use original report type in link text
              reportSection += `<div class="report-section">
                <a href="javascript:void(0)" onclick="window.open('${fullUrl}', '_blank')">
                  <i class="fas ${icon}"></i> ${reportType} Report
                </a>
              </div>`;
            }
          });
          
          reportSection += '</div>';
          
          // Remove report section from main content
          mainContent = mainContent.replace(reportRegex, '');
        }
      }
      
      // Format main text with financial data highlighting
      mainContent = mainContent.replace(/\$(\d[\d,.]+[BMK]?)/g, '<span class="data-point">$$$1</span>');
      mainContent = mainContent.replace(/(\d+)% (bullish|bearish)/gi, '<span class="sentiment-data">$1% $2</span>');
      
      // Clean up any excessive newlines that might create unwanted breaks
      // Especially before report sections
      mainContent = mainContent.trim().replace(/\n{2,}/g, '\n');
      
      // Replace any remaining newlines with <br> tags
      mainContent = mainContent.replace(/\n/g, '<br>');
      
      // Add the main content directly to the container without extra div
      formattedHtml += mainContent;
      
      // Add the report section directly without additional spacing
      formattedHtml += reportSection;
      
      // Close the task container
      formattedHtml += '</div>';
      
      // Remove any <br> tags between task-completion-status and reports-section
      formattedHtml = formattedHtml.replace(/<\/div><br><br><br><div class="reports-section"/g, '</div><div class="reports-section"');
      formattedHtml = formattedHtml.replace(/<\/div><br><br><div class="reports-section"/g, '</div><div class="reports-section"');
      formattedHtml = formattedHtml.replace(/<\/div><br><div class="reports-section"/g, '</div><div class="reports-section"');
      
      return formattedHtml;
    } catch (err) {
      console.error('Error formatting command content:', err);
      return `<div class="error-content">${content.replace(/\n/g, '<br>')}</div>`;
    }
  }


  
  // Process raw message and add basic metadata without formatting logic
  function processMessageData(message) {
    // Create a working copy to avoid mutating the original
    const processed = { ...message };
    
    // Only extract metadata from command messages from assistant
    if (processed.type === MESSAGE_TYPES.COMMAND && 
        processed.role === MESSAGE_ROLES.ASSISTANT && 
        processed.content) {
      
      // Extract task description if present
      const taskMatch = processed.content.match(/Task:\s*"([^"]+)"/i);
      if (taskMatch && taskMatch[1]) {
        processed.taskDescription = taskMatch[1].trim();
      }
      
      // Extract report URLs for fallback display
      if (processed.content.includes('Report:')) {
        const reportUrls = [];
        
        // Try to match reports in the standard format
        const reportRegex = /- (Analysis|Landing Page) Report: ([^\s\n]+)/g;
        let match;
        
        // Find all matches
        while ((match = reportRegex.exec(processed.content)) !== null) {
          const reportType = match[1].toLowerCase();
          const reportUrl = match[2];
          
          // Normalize report type
          const type = reportType.includes('analysis') ? 'analysis' : 'landing';
          
          // Add to reports list with absolute URL
          const fullUrl = reportUrl.startsWith('/') ? window.location.origin + reportUrl : reportUrl;
          reportUrls.push({
            type,
            url: fullUrl,
            label: `${match[1]} Report`
          });
        }
        
        // Alternative matching for reports without dash prefix
        if (reportUrls.length === 0) {
          // Try Analysis Report pattern
          const analysisMatch = processed.content.match(/Analysis Report:\s*([^\s\n]+)/i);
          if (analysisMatch && analysisMatch[1]) {
            const url = analysisMatch[1].trim();
            const fullUrl = url.startsWith('/') ? window.location.origin + url : url;
            reportUrls.push({
              type: 'analysis',
              url: fullUrl,
              label: 'Analysis Report'
            });
          }
          
          // Try Landing Page Report pattern
          const landingMatch = processed.content.match(/Landing Page Report:\s*([^\s\n]+)/i);
          if (landingMatch && landingMatch[1]) {
            const url = landingMatch[1].trim();
            const fullUrl = url.startsWith('/') ? window.location.origin + url : url;
            reportUrls.push({
              type: 'landing',
              url: fullUrl,
              label: 'Landing Page Report'
            });
          }
        }
        
        // Add extracted URLs to the message
        if (reportUrls.length > 0) {
          processed.reportUrls = reportUrls;
        }
      }
      
      // Check if this is a task result message
      processed.isTaskResult = !!(
        processed.content.includes('Task:') || 
        processed.content.includes('Report:') ||
        processed.content.includes('Successfully created') ||
        processed.content.includes('Task completed')
      );
    }
    
    return processed;
  }

  // Track system message contents to prevent duplicates
  const systemMessageContents = new Set();
  
  // Function to create a single message item
  function createMessageItem(message) {
    // Check if this is a duplicate system message showing as chat
    if (message.role === 'assistant' && message.type === 'chat' && message.content) {
      const normalizedContent = message.content.trim();
      
      // Check if we've already seen this content as a system message
      if (systemMessageContents.has(normalizedContent)) {
        console.log('Skipping duplicate assistant chat message (system content):', normalizedContent);
        return null; // Don't create the element at all
      }
    }
    
    // If this is a system message, remember its content to prevent duplicates
    if (message.role === 'system' && message.content) {
      systemMessageContents.add(message.content.trim());
    }
    
    // Log the message we're creating for debugging
    console.log('Creating message item for:', message);
    
    // Process and enhance the message data
    const enhancedMessage = processMessageData(message);
    const { 
      role, type, content, timestamp, id, streaming, 
      taskDescription, isTaskResult, reportUrls 
    } = enhancedMessage;
    
    // Create message element
    const msgEl = document.createElement('div');
    msgEl.className = `msg-item msg-${role || 'unknown'}`;
    if (type) msgEl.classList.add(`msg-${type}`);
    if (id) msgEl.dataset.messageId = id; // Add message ID for potential updates

    // Add fade-in animation for new messages
    msgEl.classList.add('fade-in-message');
    setTimeout(() => msgEl.classList.remove('fade-in-message'), 500);

    // Message metadata
    const metaEl = document.createElement('div');
    metaEl.className = 'msg-meta';
    
    // Role badge
    const roleEl = document.createElement('div');
    roleEl.className = 'msg-role';
    let roleIcon = '';
    switch (role) {
      case MESSAGE_ROLES.USER:
        roleIcon = 'fa-user';
        break;
      case MESSAGE_ROLES.ASSISTANT:
        roleIcon = 'fa-robot';
        break;
      case MESSAGE_ROLES.SYSTEM:
        roleIcon = 'fa-info-circle';
        break;
      default:
        roleIcon = 'fa-comment';
    }
    // Use FontAwesome solid style
    roleEl.innerHTML = `<i class="fas ${roleIcon}"></i>`;
    metaEl.appendChild(roleEl);
    
    // Type badge if not default
    if (type && type !== MESSAGE_TYPES.CHAT) {
      const typeEl = document.createElement('div');
      typeEl.className = `msg-type msg-${type}`;
      // Make thought type less prominent
      typeEl.textContent = type === MESSAGE_TYPES.THOUGHT ? 'Thinking...' : type;
      metaEl.appendChild(typeEl);
    }
    
    // Timestamp
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    
    // Format timestamp
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeEl.textContent = timeStr;
    
    // Add timestamp to metadata
    metaEl.appendChild(timeEl);
    msgEl.appendChild(metaEl);
    
    // Message content
    const contentEl = document.createElement('div');
    contentEl.className = 'msg-content';
    
    // Special formatting approach for command messages from assistant
    if (type === MESSAGE_TYPES.COMMAND && role === MESSAGE_ROLES.ASSISTANT) {
      // Log for debugging
      console.log('Creating command message:', message.id);
      
      // Check if this is a task-related command or a regular command
      const isTaskMessage = content && (
        content.includes('Task:') || 
        content.includes('Report:') || 
        content.includes('Successfully created') ||
        content.includes('Task completed')
      );
      
      if (isTaskMessage) {
        // Use the centralized formatting function for task messages
        contentEl.innerHTML = formatCommandContent(content);
        console.log('✅ Applied special task formatting');
      } else {
        // For command messages that aren't tasks, apply standard formatting
        let processedContent = content || '';
        processedContent = formatUrls(processedContent);
        
        // Apply standard markdown formatting
        let standardFormatting = processedContent
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n/g, '<br>');
        
        contentEl.innerHTML = standardFormatting;
        console.log('Applied standard command formatting');
      }
      
    } else {
      // Regular message formatting
      
      // Use our URL formatter to process content
      let processedContent = content || '';
      
      // Apply URL formatting
      processedContent = formatUrls(processedContent);
      
      // Format the content with markdown-like formatting
      let formattedContent = processedContent
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.+?)\*/g, '<em>$1</em>')             // Italics
        .replace(/\n/g, '<br>');                         // Convert newlines to <br>
        
      contentEl.innerHTML = formattedContent;
    }
    
    // Special handling for command result messages that might contain task completions
    if (type === MESSAGE_TYPES.COMMAND && role === MESSAGE_ROLES.ASSISTANT) {
      // The special formatting for task results is now handled above in the content element creation
    }
    
    // For elements with extracted reportUrls but using the standard formatting path
    if (!contentEl.querySelector('.task-result-container') && reportUrls && reportUrls.length > 0) {
      // Create a report links container
      const reportsContainer = document.createElement('div');
      reportsContainer.className = 'report-links-container';
      
      // Add header
      const reportsHeader = document.createElement('div');
      reportsHeader.className = 'report-links-header';
      reportsHeader.textContent = 'Task Reports:';
      reportsContainer.appendChild(reportsHeader);
      
      // Create links container
      const linksContainer = document.createElement('div');
      linksContainer.className = 'report-links-inline';
      
      // Add each report link
      reportUrls.forEach((report, index) => {
        // Choose appropriate icon
        let icon = 'fa-file';
        if (report.type === 'analysis') icon = 'fa-chart-bar';
        if (report.type === 'landing') icon = 'fa-file-alt';
        
        // Create link element
        const linkEl = document.createElement('a');
        linkEl.className = `gradient-link inline-report-link ${report.type}-report`;
        linkEl.href = 'javascript:void(0)';
        
        // Ensure URL is absolute
        const fullUrl = report.url.startsWith('/') ? window.location.origin + report.url : report.url;
        linkEl.setAttribute('onclick', `window.open('${fullUrl}', '_blank')`); 
        
        // Add icon and label
        const iconEl = document.createElement('i');
        iconEl.className = `fas ${icon}`;
        linkEl.appendChild(iconEl);
        linkEl.appendChild(document.createTextNode(` ${report.label}`));
        
        linksContainer.appendChild(linkEl);
        
        // Add separator if not the last link
        if (index < reportUrls.length - 1) {
          const separator = document.createElement('span');
          separator.textContent = ' | ';
          linksContainer.appendChild(separator);
        }
      });
      
      reportsContainer.appendChild(linksContainer);
      contentEl.appendChild(reportsContainer);
    }
    msgEl.appendChild(contentEl);
    
    // Check if message has error
    if (message.error) {
      const errorEl = document.createElement('div');
      errorEl.className = 'msg-error';
      errorEl.textContent = message.error;
      msgEl.appendChild(errorEl);
    }

    // Specific styling for thoughts
    if (type === MESSAGE_TYPES.THOUGHT) {
        msgEl.style.opacity = '0.9';
        msgEl.style.fontStyle = 'italic';
        msgEl.style.fontSize = '0.9em'; // Make thoughts slightly smaller
        msgEl.classList.add('msg-thought-item'); // Add class for CSS targeting
        if (streaming) {
          const typingEl = document.createElement('span');
          typingEl.className = 'typing-indicator';
          typingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
          msgEl.appendChild(typingEl);
        }
    }

    return msgEl;
  }

  // Track if this is the first load
  let isFirstLoad = true;
  let messageElements = new Map(); // Cache of message elements by ID

  // Function to update visible messages based on filter
  function updateVisibleMessages() {
    // Get messages from store
    const { timeline, filter } = messagesStore.getState();
    
    console.log('Filtering messages with filter:', filter);
    console.log('Available messages:', timeline?.length || 0);
    

    
    // Handle empty state
    if (!timeline || timeline.length === 0) {
      messagesContainer.innerHTML = '';
      const emptyEl = document.createElement('div');
      emptyEl.className = 'message-timeline-empty';
      emptyEl.innerHTML = '<i class="fas fa-comments"></i><p>No messages yet</p>';
      messagesContainer.appendChild(emptyEl);
      return;
    }
    
    // No filtering in component - all messages are rendered and filtered via DOM
    const filteredMessages = timeline;
    
    // Trigger the centralized filter via store after messages render
    setTimeout(() => messagesStore.applyFilter(messagesStore.getState().filter || 'all'), 10);
    
    // Check if we should auto-scroll
    // We auto-scroll if:
    // 1. This is the first load
    // 2. User is already at the bottom (within 100px)
    // 3. Loading fresh messages
    const isAtBottom = messagesContainer.scrollHeight - messagesContainer.clientHeight - messagesContainer.scrollTop < 100;
    const shouldAutoScroll = isFirstLoad || isAtBottom || messagesStore.getState().loading;
    
    // Get current visible message IDs
    const currentMessageIds = new Set(Array.from(messagesContainer.children)
      .filter(el => el.dataset.messageId)
      .map(el => el.dataset.messageId));
    
    // Track new messages that need to be added
    const messagesToAdd = [];
    
    // Efficient DOM updates - only add or update messages that changed
    filteredMessages.forEach(message => {
      if (!message.id) {
        message.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      // SYSTEM MESSAGE DEDUPLICATION: Skip assistant chat messages with same content as system
      if (message.role === 'assistant' && message.type === 'chat' && message.content) {
        // Check if we already have a system message with this content
        const isDuplicate = filteredMessages.some(msg => 
          msg.id !== message.id && // Different message
          msg.role === 'system' && // Is a system message
          msg.content?.trim() === message.content.trim() // Same content
        );
        
        if (isDuplicate) {
          console.log('Skipping duplicate message in updateVisibleMessages:', message.content);
          return; // Skip this message entirely
        }
      }
      
      const existingElement = messagesContainer.querySelector(`[data-message-id="${message.id}"]`);
      
      if (existingElement) {
        // Message exists - update content if needed
        currentMessageIds.delete(message.id); // Remove from the set of messages to check
        
        console.log(`🔄 UPDATING existing message [${message.id}] - type: ${message.type}, role: ${message.role}`);
        
        // Only update content if it changed
        const contentEl = existingElement.querySelector('.msg-content');
        if (contentEl && contentEl.textContent !== message.content) {
          
          // Check if this is a command message from the assistant
          if (message.type === MESSAGE_TYPES.COMMAND && message.role === MESSAGE_ROLES.ASSISTANT) {
            console.log('✨ Updating command message:', message.id);
            
            // Check if this is a task-related message
            const isTaskMessage = message.content && (
              message.content.includes('Task:') || 
              message.content.includes('Report:') || 
              message.content.includes('Successfully created') ||
              message.content.includes('Task completed')
            );
            
            if (isTaskMessage) {
              // Use the centralized formatting function for task messages
              contentEl.innerHTML = formatCommandContent(message.content);
              console.log('✅ Applied special task formatting to UPDATED message');
            } else {
              // For command messages that aren't tasks, apply standard formatting
              const processedContent = formatUrls(message.content || '');
              const formattedContent = processedContent
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
                
              contentEl.innerHTML = formattedContent;
              console.log('Applied standard formatting to updated command message');
            }
          } else {
            // Regular message formatting for updates
            const sanitizedContent = (message.content || '')
              .replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            // Format the content with markdown-like formatting
            let formattedContent = sanitizedContent
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/\n/g, '<br>')
              .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
            
            // Check if the message has report URLs to display
            if (message.reportUrls && message.reportUrls.length > 0) {
              // Add a simple separator
              formattedContent += '<div class="report-links-inline">';
              
              // Add inline links for each report - USING window.open() APPROACH
              message.reportUrls.forEach((report, index) => {
                // Choose appropriate icon based on report type
                let icon = 'fa-file';
                if (report.type === 'nexus') icon = 'fa-chart-bar';
                if (report.type === 'landing') icon = 'fa-file-alt';
                if (report.type === 'error') icon = 'fa-exclamation-triangle';
                
                // Create link that bypasses React Router
                const fullUrl = report.url.startsWith('/') ? window.location.origin + report.url : report.url;
                formattedContent += `<a href="javascript:void(0)" onclick="window.open('${fullUrl}', '_blank')" class="inline-report-link ${report.type}-report">
                  <i class="fas ${icon}"></i> ${report.label}</a>`;
                
                // Add separator between links, but not after the last one
                if (index < message.reportUrls.length - 1) {
                  formattedContent += ' | ';
                }
              });
              
              formattedContent += '</div>';
            }
            
            contentEl.innerHTML = formattedContent;
          }
        }
      } else {
        // New message - create and queue for addition
        messagesToAdd.push(message);
      }
    });
    
    // Batch DOM operations - add all new messages at once
    if (messagesToAdd.length > 0) {
      const fragment = document.createDocumentFragment();
      messagesToAdd.forEach(message => {
        const msgEl = createMessageItem(message);
        if (msgEl) {
          fragment.appendChild(msgEl);
        } else {
          console.log('Skipping message (createMessageItem returned null):', message.id);
        }
      });
      messagesContainer.appendChild(fragment);
    }
    
    // Handle removing messages that are no longer in the filtered set
    currentMessageIds.forEach(id => {
      const msgToRemove = messagesContainer.querySelector(`[data-message-id="${id}"]`);
      if (msgToRemove) {
        // Add a fade-out animation before removing
        msgToRemove.classList.add('fade-out-message');
        setTimeout(() => msgToRemove.remove(), 300);
      }
    });
    
    // Scroll to bottom if needed
    if (shouldAutoScroll) {
      scrollToBottom();
    }
    
    // After first load, clear the flag
    if (isFirstLoad) {
      isFirstLoad = false;
      // Triple guarantee we scroll to bottom on first load
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 500);
    }
  }

  // Handle chat updates with fresh messages
  function handleChatUpdate(message) {
    console.log("MessageTimeline received chat-update:", message);
    const { timeline } = messagesStore.getState();
    
    // Create base message structure
    const baseMessage = {
      role: message.role || MESSAGE_ROLES.ASSISTANT,
      type: message.type || MESSAGE_TYPES.CHAT,
      content: message.payload?.text || '',
      timestamp: message.timestamp || Date.now(),
      id: message.id // Use server-provided ID if available
    };
    
    // Check if this is a system message and if we already have one with the same content
    if (baseMessage.role === 'system' && baseMessage.content) {
      // Look for an existing system message with the same content
      const duplicate = timeline.find(msg => 
        msg.role === 'system' && 
        msg.content?.trim() === baseMessage.content?.trim()
      );
      
      if (duplicate) {
        console.log('Detected duplicate system message in chat update, ignoring:', baseMessage.content);
        return; // Don't add duplicate system messages
      }
    }

    // Handle different message types
    switch (message.type) {
      case 'user_message':
        // User messages should always have a unique ID
        baseMessage.id = message.id || `user-${Date.now()}`;
        baseMessage.role = MESSAGE_ROLES.USER;
        break;

      case 'ai_thought_stream':
      case 'thought':
        // Handle thought streaming, both from chat and tasks
        if (message.id) {
          // If we have an ID, use it to update the existing message
          const updatedTimeline = timeline.map(msg =>
            msg.id === message.id ? { ...msg, content: message.payload?.text || message.content || '', streaming: true } : msg
          );
          messagesStore.setState({ timeline: updatedTimeline });
          return;
        }
        // If no ID, create a new thought
        baseMessage.id = `thought-${Date.now()}`;
        baseMessage.type = MESSAGE_TYPES.THOUGHT;
        baseMessage.streaming = true;
        // For task thoughts, check if they have a taskId to associate them
        if (message.taskId) {
          baseMessage.taskId = message.taskId;
          console.log(`[MessageTimeline] Associated thought with task: ${message.taskId}`);
        }
        break;

      case 'chat_response':
        // Handle final responses
        if (message.id) {
          // If we have an ID, use it to update the existing message
          const updatedTimeline = timeline.map(msg =>
            msg.id === message.id ? { ...msg, content: message.payload?.text || '', streaming: false } : msg
          );
          messagesStore.setState({ timeline: updatedTimeline });
          return;
        }
        // If no ID, create a new message
        baseMessage.id = `response-${Date.now()}`;
        break;

      default:
        console.warn(`MessageTimeline received unhandled chat-update type: ${message.type}`);
        return;
    }

    // More robust check for duplicates - check both assistant and system roles
    if ((baseMessage.role === 'assistant' || baseMessage.role === 'system') && baseMessage.type === 'chat' && baseMessage.content) {
      const normalizedContent = baseMessage.content.trim();
      
      // Look for any existing message with the same content that is a system message
      const isDuplicatingSystem = timeline.some(msg =>
        msg.id !== baseMessage.id && // Not the same message
        msg.role === 'system' && // Is a system message
        msg.content?.trim() === normalizedContent // Same content
      );
      
      if (isDuplicatingSystem) {
        console.log('Detected message duplicating system message content, ignoring:', normalizedContent);
        return; // Don't add messages that duplicate system content
      }
      
      // Also check if this message might be duplicating an existing assistant chat message
      const isDuplicatingAssistant = timeline.some(msg =>
        msg.id !== baseMessage.id && // Not the same message
        msg.role === 'assistant' && // Is an assistant message
        msg.type === 'chat' && // Is a chat message
        msg.content?.trim() === normalizedContent // Same content
      );
      
      if (isDuplicatingAssistant) {
        console.log('Detected duplicate assistant message content, ignoring:', normalizedContent);
        return; // Don't add duplicate assistant messages
      }
    }
    
    // Remove any existing messages with the same content and type
    const uniqueTimeline = timeline.filter(msg => 
      !(msg.content === baseMessage.content && msg.type === baseMessage.type)
    );

    // Add the new message
    const newTimeline = [...uniqueTimeline, baseMessage];
    
    // Sort by timestamp to maintain proper order
    const sortedTimeline = newTimeline.sort((a, b) => a.timestamp - b.timestamp);
    
    // Update the store with the fresh timeline
    messagesStore.setState({
      timeline: sortedTimeline
    });
  }

  // Load initial messages with proper date filtering and lazy loading
  function loadMessages(forceRefresh = false, initialBatchSize = 15) {
    messagesStore.setState({ loading: true, error: null });
    
    // Get time frame - last 2 days by default unless we're doing a force refresh
    const timeframe = forceRefresh ? null : 2; // Days
    
    // Calculate date filter
    const since = timeframe ? new Date(Date.now() - (timeframe * 24 * 60 * 60 * 1000)) : null;
    const sinceParam = since ? since.toISOString() : null;
    
    // Log what we're doing
    console.log(`Loading messages${sinceParam ? ` since ${sinceParam}` : ' (all history)'}`);
    
    // Show loading indicator while messages load
    const showLoadingIndicator = () => {
      if (!messagesContainer.querySelector('.message-loading')) {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'message-loading';
        loadingEl.innerHTML = '<div class="loading-spinner"></div><p>Loading messages...</p>';
        messagesContainer.appendChild(loadingEl);
      }
    };
    
    // Hide the loading indicator
    const hideLoadingIndicator = () => {
      const loadingEl = messagesContainer.querySelector('.message-loading');
      if (loadingEl) {
        loadingEl.remove();
      }
    };
    
    // Only show loading indicator for force refreshes or empty timeline
    if (forceRefresh || !messagesStore.getState().timeline.length) {
      showLoadingIndicator();
    }

    // Use the updated API with date filtering
    getMessageHistory(1, initialBatchSize, sinceParam)
      .then(data => {
        if (data && Array.isArray(data.items)) {
          console.log(`Received ${data.items.length} messages from API (initial batch)`);
          
          // Log the structure of the first message to understand its format
          if (data.items.length > 0) {
            // Log complete unfiltered message objects to understand their structure
            console.log('Complete message object:', data.items[0]);
            console.log('Stringified message structure:', JSON.stringify(data.items[0], null, 2));
            
            // Log a task message specifically if one exists
            const taskMessage = data.items.find(msg => 
              msg.type === MESSAGE_TYPES.COMMAND && 
              (msg.content?.includes('Task:') || msg.content?.includes('Reports Available')));
              
            if (taskMessage) {
              console.log('Task message example:', taskMessage);
              console.log('Task message content:', taskMessage.content);
            }
            
            // Log task-related messages specifically
            const taskMessages = data.items.filter(msg => 
              (msg.type === MESSAGE_TYPES.COMMAND && 
              (msg.content?.includes('Task:') || 
               msg.content?.includes('Task completed') || 
               msg.reportUrls)));
            
            if (taskMessages.length > 0) {
              console.log('Task message examples:', taskMessages.slice(0, 2));
            }
          }
          
          // Sort messages by timestamp (oldest first) to ensure consistent ordering
          const sortedItems = [...data.items].sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
          });
          
          // Log the data for debugging
          console.log('Raw API response:', JSON.stringify(data, null, 2));
          
          // Filter out chat messages that duplicate system messages
          const systemMessages = new Map(); // Map content to message object
          
          // First identify all system messages
          sortedItems.forEach(msg => {
            if (msg.role === 'system' && msg.content) {
              systemMessages.set(msg.content.trim(), msg);
            }
          });
          
          // Now filter out chat messages with duplicate content
          const dedupedMessages = sortedItems.filter(msg => {
            // If it's a chat message, check if we already have this content as a system message
            if ((msg.role === 'assistant' || msg.role === 'system') && msg.type === 'chat' && msg.content) {
              const normalizedContent = msg.content.trim();
              if (systemMessages.has(normalizedContent)) {
                const systemMsg = systemMessages.get(normalizedContent);
                if (systemMsg.id !== msg.id) { // Ensure we're not filtering out the actual system message
                  console.log('Filtering out message duplicating system message:', normalizedContent);
                  return false;
                }
              }
            }
            return true;
          });
          
          // Hide loading indicator
          hideLoadingIndicator();
          
          // Update store with filtered data
          messagesStore.setState({
            timeline: dedupedMessages,
            loading: false,
            error: null,
            lastRefresh: new Date().toISOString()
          });
          
          // Update messages display with what we have so far
          updateVisibleMessages();
          hideLoadingIndicator();
          
          // Auto-scroll to bottom after initial load
          scrollToBottom();
          
          // If there are more messages than the initial batch size and we need all history
          if (data.totalItems > initialBatchSize && !forceRefresh) {
            // After a short delay to let UI be responsive, load the rest in background
            setTimeout(() => {
              // Load the rest of the messages in the background
              getMessageHistory(1, 100, sinceParam)
                .then(fullData => {
                  if (fullData && Array.isArray(fullData.items)) {
                    console.log(`Loaded remaining ${fullData.items.length - initialBatchSize} messages in background`);
                    
                    // Log task messages in the full data set
                    // Log a sample message from each major type to understand structure
                    const messageTypes = {};
                    
                    fullData.items.forEach(msg => {
                      const key = `${msg.type || 'unknown'}-${msg.role || 'unknown'}`;
                      if (!messageTypes[key]) {
                        messageTypes[key] = msg;
                      }
                    });
                    
                    console.log('Message types found:', Object.keys(messageTypes));
                    console.log('Message type examples:', messageTypes);
                    
                    // Look for specifically task-related messages
                    const taskMessages = fullData.items.filter(msg => 
                      (msg.type === MESSAGE_TYPES.COMMAND && 
                      (msg.content?.includes('Task:') || 
                       msg.content?.includes('Task completed') || 
                       msg.reportUrls)));
                    
                    if (taskMessages.length > 0) {
                      console.log(`Found ${taskMessages.length} task-related messages in full dataset`);
                      // Log a sample task message to help with debugging formatting issues
                      const sampleMessage = taskMessages[0];
                      console.log('Sample task message:', sampleMessage);
                      console.log('Sample task content:', sampleMessage.content);
                    }
                    
                    // Sort full message set
                    const fullSortedItems = [...fullData.items].sort((a, b) => {
                      return new Date(a.timestamp) - new Date(b.timestamp);
                    });
                    
                    // Filter out chat messages that duplicate system messages
                    const systemMessages = new Map(); // Map content to message object
                    
                    // First identify all system messages
                    fullSortedItems.forEach(msg => {
                      if (msg.role === 'system' && msg.content) {
                        systemMessages.set(msg.content.trim(), msg);
                      }
                    });
                    
                    // Now filter out chat messages with duplicate content
                    const dedupedMessages = fullSortedItems.filter(msg => {
                      // If it's a chat message, check if we already have this content as a system message
                      if ((msg.role === 'assistant' || msg.role === 'system') && msg.type === 'chat' && msg.content) {
                        const normalizedContent = msg.content.trim();
                        if (systemMessages.has(normalizedContent)) {
                          const systemMsg = systemMessages.get(normalizedContent);
                          if (systemMsg.id !== msg.id) { // Ensure we're not filtering out the actual system message
                            console.log('Filtering out chat message duplicating system message in full dataset:', normalizedContent);
                            return false;
                          }
                        }
                      }
                      return true;
                    });
                    
                    // Update store with filtered data
                    messagesStore.setState({ 
                      timeline: dedupedMessages,
                      loading: false,
                      lastRefresh: new Date().toISOString()
                    });
                    
                    // Update visible messages with full dataset
                    updateVisibleMessages();
                  }
                })
                .catch(err => {
                  console.warn('Background message loading failed:', err);
                  // Mark as not loading but don't show error (we already have some messages)
                  messagesStore.setState({ loading: false });
                });
            }, 1000); // 1 second delay to ensure UI is responsive first
          } else {
            // We have all we need, mark as done loading
            messagesStore.setState({ loading: false });
          }
        }
      })
      .catch(error => {
        console.error('Failed to load messages:', error);
        messagesStore.setState({ 
          error: error.message || 'Failed to load messages',
          loading: false
        });
        
        hideLoadingIndicator();
        
        // Show error in timeline
        messagesContainer.innerHTML = `
          <div class="message-timeline-empty error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Failed to load messages</p>
          </div>
        `;
      });
  }

  // Auto-scroll to the bottom of the message container
  function scrollToBottom(smooth = false) {
    if (messagesContainer) {
      if (smooth) {
        messagesContainer.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
      console.log('[MessageTimeline] Scrolled to bottom');
    }
  }

  // --- Internal State / Subscriptions ---
  let storeUnsubscribe = null;
  let chatUpdateUnsubscribe = null; // To store the unsubscribe function for chat-update

  // --- Event Handling --- 
  // Subscribe to store changes
  storeUnsubscribe = messagesStore.subscribe(() => {
    updateVisibleMessages();
  });

  // Subscribe to chat updates from WebSocket handler
  chatUpdateUnsubscribe = eventBus.on('chat-update', handleChatUpdate);

  // Initialize component
  loadMessages();

  // Expose public methods
  container.refresh = loadMessages;
  container.filter = (filterType) => {
    activeFilter = filterType;
    messagesStore.setState({ filter: filterType });
    updateVisibleMessages();
  };
  
  // Cleanup method
  container.destroy = () => {
    if(storeUnsubscribe) storeUnsubscribe();
    if (chatUpdateUnsubscribe) {
        chatUpdateUnsubscribe(); // Unsubscribe from chat-update
        chatUpdateUnsubscribe = null;
    }

    console.log("MessageTimeline destroyed");
  };

  return container;
}

/**
 * Mount a message timeline to a parent element
 * @param {HTMLElement} parent - Parent element
 * @param {Object} props - Timeline properties
 * @returns {HTMLElement} The mounted timeline
 */
MessageTimeline.mount = (parent, props = {}) => {
  const timeline = MessageTimeline(props);
  parent.appendChild(timeline);
  return timeline;
};

export default MessageTimeline;
