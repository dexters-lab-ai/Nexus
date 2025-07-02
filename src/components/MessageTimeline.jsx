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
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return content.replace(urlRegex, (url) => {
    const encodedUrl = encodeURIComponent(url);
    return `<a href="javascript:void(0)" class="url-link open-link" data-url="${encodedUrl}">${url}</a>`;
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
      let formattedHtml = '<div class="task-result-container">';
      
      //console.log('Raw content before formatting:', content.substring(0, 200) + '...');
      
      const taskMatch = content.match(/Task:\s*"([^"]+)"/i);
      if (taskMatch && taskMatch[1]) {
        formattedHtml += `<div class="task-header"><b>Task:</b> "${taskMatch[1].trim()}"</div>`;
      }
      
      let mainContent = content;
      if (taskMatch) {
        mainContent = mainContent.replace(/Task:\s*"([^"]+)"\n?/i, '');
      }
      
      const statusRegex = /(Successfully created [^\n]+|Task (completed|reached maximum steps) [^\n]+)/g;
      const statusMatch = statusRegex.exec(mainContent);
      
      if (statusMatch) {
        let statusText = statusMatch[0].trim();
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        statusText = statusText.replace(urlRegex, (url) => {
          const encodedUrl = encodeURIComponent(url);
          return `<a href="javascript:void(0)" class="status-link open-link" data-url="${encodedUrl}">live link</a>`;
        });
        formattedHtml += `<div class="task-completion-status">${statusText}</div>`;
        mainContent = mainContent.replace(statusMatch[0], '').trim();
      }
      
      let reportSection = '';
      if (mainContent.includes('Task Reports Available:')) {
        const reportRegex = /Task Reports Available:([\s\S]+)/;
        const reportMatch = reportRegex.exec(mainContent);
        
        if (reportMatch) {
          const reportContent = reportMatch[1];
          reportSection = '<div class="reports-section">';
          reportSection += '<div class="report-section-header">Run Reports:</div>';
          
          const reportLines = reportContent.split('\n').filter(line => line.trim());
          
          reportLines.forEach(line => {
            const linkMatch = line.match(/- (Analysis|Landing Page) Report: ([^\s]+)/);
            if (linkMatch) {
              const reportType = linkMatch[1];
              const reportUrl = linkMatch[2];
              const icon = reportType.toLowerCase().includes('analysis') ? 'fa-chart-bar' : 'fa-file-alt';
              const fullUrl = reportUrl.startsWith('/') ? window.location.origin + reportUrl : reportUrl;
              const encodedUrl = encodeURIComponent(fullUrl);
              reportSection += `<div class="report-section">
                <a href="javascript:void(0)" class="report-link open-link" data-url="${encodedUrl}">
                  <i class="fas ${icon}"></i> ${reportType} Report
                </a>
              </div>`;
            }
          });
          
          reportSection += '</div>';
          mainContent = mainContent.replace(reportRegex, '');
        }
      }
      
      mainContent = mainContent.replace(/\$(\d[\d,.]+[BMK]?)/g, '<span class="data-point">$$$1</span>');
      mainContent = mainContent.replace(/(\d+)% (bullish|bearish)/gi, '<span class="sentiment-data">$1% $2</span>');
      mainContent = mainContent.trim().replace(/\n{2,}/g, '\n');
      mainContent = mainContent.replace(/\n/g, '<br>');
      
      formattedHtml += mainContent;
      formattedHtml += reportSection;
      formattedHtml += '</div>';
      
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
    if (message.role === 'assistant' && message.type === 'chat' && message.content) {
      const normalizedContent = message.content.trim();
      if (systemMessageContents.has(normalizedContent)) {
        console.log('Skipping duplicate assistant chat message (system content):', normalizedContent);
        return null;
      }
    }
    
    if (message.role === 'system' && message.content) {
      systemMessageContents.add(message.content.trim());
    }
    
    //console.log('Creating message item for:', message);
    
    const enhancedMessage = processMessageData(message);
    const { role, type, content, timestamp, id, streaming, taskDescription, isTaskResult, reportUrls } = enhancedMessage;
    
    const msgEl = document.createElement('div');
    msgEl.className = `msg-item msg-${role || 'unknown'}`;
    if (type) msgEl.classList.add(`msg-${type}`);
    if (id) msgEl.dataset.messageId = id;
    
    msgEl.classList.add('fade-in-message');
    setTimeout(() => msgEl.classList.remove('fade-in-message'), 500);
    
    const metaEl = document.createElement('div');
    metaEl.className = 'msg-meta';
    
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
    roleEl.innerHTML = `<i class="fas ${roleIcon}"></i>`;
    metaEl.appendChild(roleEl);
    
    if (type && type !== MESSAGE_TYPES.CHAT) {
      const typeEl = document.createElement('div');
      typeEl.className = `msg-type msg-${type}`;
      typeEl.textContent = type === MESSAGE_TYPES.THOUGHT ? 'Thinking...' : type;
      metaEl.appendChild(typeEl);
    }
    
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeEl.textContent = timeStr;
    metaEl.appendChild(timeEl);
    msgEl.appendChild(metaEl);
    
    const contentEl = document.createElement('div');
    contentEl.className = 'msg-content';
    
    if (type === MESSAGE_TYPES.COMMAND && role === MESSAGE_ROLES.ASSISTANT) {
      //console.log('Creating command message:', message.id);
      const isTaskMessage = content && (
        content.includes('Task:') ||
        content.includes('Report:') ||
        content.includes('Successfully created') ||
        content.includes('Task completed')
      );
      
      if (isTaskMessage) {
        contentEl.innerHTML = formatCommandContent(content);
        console.log('✅ Applied special task formatting');
      } else {
        let processedContent = content || '';
        processedContent = formatUrls(processedContent);
        let standardFormatting = processedContent
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n/g, '<br>');
        contentEl.innerHTML = standardFormatting;
        console.log('Applied standard command formatting');
      }
    } else {
      let processedContent = content || '';
      processedContent = formatUrls(processedContent);
      let formattedContent = processedContent
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      contentEl.innerHTML = formattedContent;
    }
    
    if (!contentEl.querySelector('.task-result-container') && reportUrls && reportUrls.length > 0) {
      const reportsContainer = document.createElement('div');
      reportsContainer.className = 'report-links-container';
      
      const reportsHeader = document.createElement('div');
      reportsHeader.className = 'report-links-header';
      reportsHeader.textContent = 'Task Reports:';
      reportsContainer.appendChild(reportsHeader);
      
      const linksContainer = document.createElement('div');
      linksContainer.className = 'report-links-inline';
      
      reportUrls.forEach((report, index) => {
        let icon = 'fa-file';
        if (report.type === 'analysis') icon = 'fa-chart-bar';
        if (report.type === 'landing') icon = 'fa-file-alt';
        
        const linkEl = document.createElement('a');
        linkEl.className = `gradient-link inline-report-link ${report.type}-report open-link`;
        linkEl.href = 'javascript:void(0)';
        const fullUrl = report.url.startsWith('/') ? window.location.origin + report.url : report.url;
        linkEl.setAttribute('data-url', encodeURIComponent(fullUrl));
        
        const iconEl = document.createElement('i');
        iconEl.className = `fas ${icon}`;
        linkEl.appendChild(iconEl);
        linkEl.appendChild(document.createTextNode(` ${report.label}`));
        
        linksContainer.appendChild(linkEl);
        
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
    
    if (message.error) {
      const errorEl = document.createElement('div');
      errorEl.className = 'msg-error';
      errorEl.textContent = message.error;
      msgEl.appendChild(errorEl);
    }
    
    if (type === MESSAGE_TYPES.THOUGHT) {
      msgEl.style.opacity = '0.9';
      msgEl.style.fontStyle = 'italic';
      msgEl.style.fontSize = '0.9em';
      msgEl.classList.add('msg-thought-item');
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

  // Event Delegation Logic
  messagesContainer.addEventListener('click', (event) => {
    const link = event.target.closest('.open-link');
    if (link) {
      event.preventDefault();
      const url = decodeURIComponent(link.getAttribute('data-url'));
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        console.warn('No URL found for link:', link);
      }
    }
  });

  // Function to update visible messages based on filter
  function updateVisibleMessages() {
    const { timeline, filter } = messagesStore.getState();
    
    console.log('Filtering messages with filter:', filter);
    console.log('Available messages:', timeline?.length || 0);
    
    if (!timeline || timeline.length === 0) {
      messagesContainer.innerHTML = '';
      const emptyEl = document.createElement('div');
      emptyEl.className = 'message-timeline-empty';
      emptyEl.innerHTML = '<i class="fas fa-comments"></i><p>No messages yet</p>';
      messagesContainer.appendChild(emptyEl);
      return;
    }
    
    const filteredMessages = timeline;
    setTimeout(() => messagesStore.applyFilter(messagesStore.getState().filter || 'all'), 10);
    
    const isAtBottom = messagesContainer.scrollHeight - messagesContainer.clientHeight - messagesContainer.scrollTop < 100;
    const shouldAutoScroll = isFirstLoad || isAtBottom || messagesStore.getState().loading;
    
    const currentMessageIds = new Set(Array.from(messagesContainer.children)
      .filter(el => {
        // Skip elements with data-neural-flow="true" or neural canvas containers
        if (el.dataset.neuralFlow === 'true' || 
            el.classList?.contains('neural-canvas-container') || 
            el.classList?.contains('neural-flow-container') ||
            el.querySelector('[data-neural-flow="true"], .neural-canvas-container, .neural-flow-container')) {
          return false;
        }
        return el.dataset.messageId;
      })
      .map(el => el.dataset.messageId));
    
    const messagesToAdd = [];
    
    filteredMessages.forEach(message => {
      if (!message.id) {
        message.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      if (message.role === 'assistant' && message.type === 'chat' && message.content) {
        const isDuplicate = filteredMessages.some(msg =>
          msg.id !== message.id &&
          msg.role === 'system' &&
          msg.content?.trim() === message.content.trim()
        );
        if (isDuplicate) {
          console.log('Skipping duplicate message in updateVisibleMessages:', message.content);
          return;
        }
      }
      
      const existingElement = messagesContainer.querySelector(`[data-message-id="${message.id}"]`);
      
      if (existingElement) {
        currentMessageIds.delete(message.id);
        // console.log(`🔄 UPDATING existing message [${message.id}] - type: ${message.type}, role: ${message.role}`);
        
        const contentEl = existingElement.querySelector('.msg-content');
        if (contentEl && contentEl.textContent !== message.content) {
          if (message.type === MESSAGE_TYPES.COMMAND && message.role === MESSAGE_ROLES.ASSISTANT) {
            // console.log('✨ Updating command message:', message.id);
            const isTaskMessage = message.content && (
              message.content.includes('Task:') ||
              message.content.includes('Report:') ||
              content.includes('Successfully created') ||
              content.includes('Task completed')
            );
            
            if (isTaskMessage) {
              contentEl.innerHTML = formatCommandContent(message.content);
              // console.log('✅ Applied special task formatting to UPDATED message');
            } else {
              const processedContent = formatUrls(message.content || '');
              const formattedContent = processedContent
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
              contentEl.innerHTML = formattedContent;
              // console.log('Applied standard formatting to updated command message');
            }
          } else {
            const sanitizedContent = (message.content || '')
              .replace(/</g, "<").replace(/>/g, ">");
            let formattedContent = formatUrls(sanitizedContent)
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/\n/g, '<br>')
              .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
            
            if (message.reportUrls && message.reportUrls.length > 0) {
              formattedContent += '<div class="report-links-inline">';
              message.reportUrls.forEach((report, index) => {
                let icon = 'fa-file';
                if (report.type === 'nexus') icon = 'fa-chart-bar';
                if (report.type === 'landing') icon = 'fa-file-alt';
                if (report.type === 'error') icon = 'fa-exclamation-triangle';
                const fullUrl = report.url.startsWith('/') ? window.location.origin + report.url : report.url;
                const encodedUrl = encodeURIComponent(fullUrl);
                formattedContent += `<a href="javascript:void(0)" class="inline-report-link ${report.type}-report open-link" data-url="${encodedUrl}">
                  <i class="fas ${icon}"></i> ${report.label}</a>`;
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
        messagesToAdd.push(message);
      }
    });
    
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
    
    currentMessageIds.forEach(id => {
      const msgToRemove = messagesContainer.querySelector(`[data-message-id="${id}"]`);
      if (msgToRemove) {
        msgToRemove.classList.add('fade-out-message');
        setTimeout(() => msgToRemove.remove(), 300);
      }
    });
    
    if (shouldAutoScroll) {
      scrollToBottom();
    }
    
    if (isFirstLoad) {
      isFirstLoad = false;
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 500);
    }
  }
  
  // Updated handleChatUpdate function
  function handleChatUpdate(message) {
    // console.log("MessageTimeline received chat-update:", message);
    const { timeline } = messagesStore.getState();
    
    const baseMessage = {
      role: message.role || MESSAGE_ROLES.ASSISTANT,
      type: message.type || MESSAGE_TYPES.CHAT,
      content: message.payload?.text || '',
      timestamp: message.timestamp || Date.now(),
      id: message.id
    };
    
    if (baseMessage.role === 'system' && baseMessage.content) {
      const duplicate = timeline.find(msg =>
        msg.role === 'system' &&
        msg.content?.trim() === baseMessage.content.trim()
      );
      if (duplicate) {
        console.log('Detected duplicate system message in chat update, ignoring:', baseMessage.content);
        return;
      }
    }
    
    switch (message.type) {
      case 'user_message':
        baseMessage.id = message.id || `user-${Date.now()}`;
        baseMessage.role = MESSAGE_ROLES.USER;
        break;
      case 'ai_thought_stream':
      case 'thought':
        if (message.id) {
          const updatedTimeline = timeline.map(msg =>
            msg.id === message.id ? { ...msg, content: message.payload?.text || message.content || '', streaming: true } : msg
          );
          messagesStore.setState({ timeline: updatedTimeline });
          return;
        }
        baseMessage.id = `thought-${Date.now()}`;
        baseMessage.type = MESSAGE_TYPES.THOUGHT;
        baseMessage.streaming = true;
        if (message.taskId) {
          baseMessage.taskId = message.taskId;
          //console.log(`[MessageTimeline] Associated thought with task: ${message.taskId}`);
        }
        break;
      case 'chat_response':
        if (message.id) {
          const updatedTimeline = timeline.map(msg =>
            msg.id === message.id ? { ...msg, content: message.payload?.text || '', streaming: false } : msg
          );
          messagesStore.setState({ timeline: updatedTimeline });
          return;
        }
        baseMessage.id = `response-${Date.now()}`;
        break;
      default:
        //console.warn(`MessageTimeline received unhandled chat-update type: ${message.type}`);
        return;
    }
    
    if ((baseMessage.role === 'assistant' || baseMessage.role === 'system') && baseMessage.type === 'chat' && baseMessage.content) {
      const normalizedContent = baseMessage.content.trim();
      const isDuplicatingSystem = timeline.some(msg =>
        msg.id !== baseMessage.id &&
        msg.role === 'system' &&
        msg.content?.trim() === normalizedContent
      );
      if (isDuplicatingSystem) {
        console.log('Detected message duplicating system message content, ignoring:', normalizedContent);
        return;
      }
      
      const isDuplicatingAssistant = timeline.some(msg =>
        msg.id !== baseMessage.id &&
        msg.role === 'assistant' &&
        msg.type === 'chat' &&
        msg.content?.trim() === normalizedContent
      );
      if (isDuplicatingAssistant) {
        console.log('Detected duplicate assistant message content, ignoring:', normalizedContent);
        return;
      }
    }
    
    const uniqueTimeline = timeline.filter(msg =>
      !(msg.content === baseMessage.content && msg.type === baseMessage.type)
    );
    
    const newTimeline = [...uniqueTimeline, baseMessage];
    const sortedTimeline = newTimeline.sort((a, b) => a.timestamp - b.timestamp);
    
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
    //console.log(`Loading messages${sinceParam ? ` since ${sinceParam}` : ' (all history)'}`);
    
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
          //console.log(`Received ${data.items.length} messages from API (initial batch)`);
          
          // Log the structure of the first message to understand its format
          if (data.items.length > 0) {
            // Log complete unfiltered message objects to understand their structure
            // console.log('Complete message object:', data.items[0]);
            // console.log('Stringified message structure:', JSON.stringify(data.items[0], null, 2));
            
            // Log a task message specifically if one exists
            const taskMessage = data.items.find(msg => 
              msg.type === MESSAGE_TYPES.COMMAND && 
              (msg.content?.includes('Task:') || msg.content?.includes('Reports Available')));
            
            // Log task-related messages specifically
            const taskMessages = data.items.filter(msg => 
              (msg.type === MESSAGE_TYPES.COMMAND && 
              (msg.content?.includes('Task:') || 
               msg.content?.includes('Task completed') || 
               msg.reportUrls)));
            
            if (taskMessages.length > 0) {
              // console.log('Task message examples:', taskMessages.slice(0, 2));
            }
          }
          
          // Sort messages by timestamp (oldest first) to ensure consistent ordering
          const sortedItems = [...data.items].sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
          });
          
          // Log the data for debugging
          // console.log('Raw API response:', JSON.stringify(data, null, 2));
          
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
                 //console.log('Filtering out message duplicating system message:', normalizedContent);
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
                    
                    //console.log('Message types found:', Object.keys(messageTypes));
                    //console.log('Message type examples:', messageTypes);
                    
                    // Look for specifically task-related messages
                    const taskMessages = fullData.items.filter(msg => 
                      (msg.type === MESSAGE_TYPES.COMMAND && 
                      (msg.content?.includes('Task:') || 
                       msg.content?.includes('Task completed') || 
                       msg.reportUrls)));
                    
                    if (taskMessages.length > 0) {
                      //console.log(`Found ${taskMessages.length} task-related messages in full dataset`);
                      // Log a sample task message to help with debugging formatting issues
                      const sampleMessage = taskMessages[0];
                      //console.log('Sample task message:', sampleMessage);
                      //console.log('Sample task content:', sampleMessage.content);
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
                            //console.log('Filtering out chat message duplicating system message in full dataset:', normalizedContent);
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