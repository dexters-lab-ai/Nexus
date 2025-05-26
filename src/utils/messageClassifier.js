/**
 * Utility for classifying and filtering message elements
 * Centralizes the logic for determining message types across the application
 */

/**
 * Determines if a message element is a chat message
 * @param {Element} element - DOM element to classify
 * @param {Array} classList - Optional pre-extracted class list
 * @returns {boolean} - True if the element is a chat message
 */
export function isChatMessage(element, classList = null) {
  const classes = classList || Array.from(element.classList);
  
  return classes.includes('msg-chat') || 
         classes.includes('msg-user') || 
         element.querySelector('.msg-role i.fa-user') != null || 
         (classes.includes('msg-assistant') && !classes.includes('msg-command')) ||
         (!classes.includes('msg-command') && !classes.includes('msg-system') && 
          !classes.includes('msg-error') && !classes.includes('msg-thought'));
}

/**
 * Determines if a message element is a command message
 * @param {Element} element - DOM element to classify
 * @param {Array} classList - Optional pre-extracted class list
 * @returns {boolean} - True if the element is a command message
 */
export function isCommandMessage(element, classList = null) {
  const classes = classList || Array.from(element.classList);
  
  return classes.includes('msg-command') || 
         element.querySelector('.msg-type.msg-command') != null;
}

/**
 * Applies filtering to a collection of message elements
 * @param {NodeList|Array} messageElements - Collection of DOM elements to filter
 * @param {string} filterType - Filter type ('all', 'chat', 'command')
 * @returns {Object} - Counts of each message type for logging/debugging
 */
export function applyFilterToElements(messageElements, filterType) {
  // Counters for stats
  let chatCount = 0, commandCount = 0, otherCount = 0;
  
  // Apply filtering to each element
  Array.from(messageElements).forEach(el => {
    const classList = Array.from(el.classList);
    const isChat = isChatMessage(el, classList);
    const isCommand = isCommandMessage(el, classList);
    
    // Apply visibility based on filter
    if (filterType === 'all') {
      el.style.display = ''; // Show all messages
      
      // Track counts for debugging
      if (isChat) chatCount++;
      else if (isCommand) commandCount++;
      else otherCount++;
    } 
    else if (filterType === 'chat' && isChat) {
      el.style.display = ''; // Show only chat messages
      chatCount++;
    } 
    else if (filterType === 'command' && isCommand) {
      el.style.display = ''; // Show only command messages
      commandCount++;
    } 
    else {
      el.style.display = 'none'; // Hide everything else
    }
  });
  
  return { chatCount, commandCount, otherCount };
}
