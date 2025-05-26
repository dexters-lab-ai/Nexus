/**
 * Task Bar Component
 * Displays active tasks and system status information
 */

// Add styles for step details
const styles = `
  @import url('/node_modules/@fortawesome/fontawesome-free/css/all.min.css');

  .task-details {
    position: relative;
    margin-top: 15px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    font-size: 0.85rem;
    border: 1px solid rgba(95, 110, 255, 0.1);
  }
  
  .task-card {
    position: relative;
    background: rgba(30, 35, 60, 0.8);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 10px;
    border: 1px solid rgba(95, 110, 255, 0.2);
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  .task-card.completed {
    background: rgba(20, 25, 40, 0.9);
    border-style: dashed;
    border-color: rgba(95, 110, 255, 0.1);
  }
  
  .task-card.completed {
    opacity: 0.8;
    border-style: dashed;
  }
  
  .task-card-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    width: 100%;
    height: 32px;
  }
  
  .task-card .title {
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  
  .task-card .meta {
    font-size: 0.8em;
    color: #a0a0c0;
    margin-left: 10px;
    white-space: nowrap;
  }
  
  .task-action {
    position: relative;
    padding: 8px 0;
    color: #e0e0e0;
    font-size: 0.9em;
  }
  
  .task-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
    gap: 8px;
  }
  
  .task-actions button {
    padding: 4px 10px;
    border: 1px solid rgba(95, 110, 255, 0.3);
    background: rgba(40, 45, 70, 0.8);
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8em;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s ease;
  }
  
  .task-actions button:hover {
    background: rgba(95, 110, 255, 0.3);
    border-color: rgba(95, 110, 255, 0.5);
  }
  
  .task-actions button i {
    font-size: 0.9em;
  }

  .task-step-details {
    margin-top: 10px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .step-info {
    margin-bottom: 10px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  .step-url {
    font-size: 0.9em;
    color: #666;
    margin-bottom: 4px;
  }

  .step-extract {
    font-size: 0.9em;
    line-height: 1.4;
    white-space: pre-wrap;
    max-height: 100px;
    overflow-y: auto;
  }

  .step-logs {
    margin-top: 10px;
  }

  .log-entry {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    border-left: 3px solid transparent;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    width: 90%;
    margin: 0 auto 6px;
  }
  
  .log-entry:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  
  .log-entry i {
    flex-shrink: 0;
    width: 16px;
    text-align: center;
  }
  
  .log-entry.success {
    border-left-color: #4caf50;
  }
  
  .log-entry.error {
    border-left-color: #f44336;
  }

  .log-entry:last-child {
    margin-bottom: 0;
  }

  .log-step {
    font-weight: 500;
    color: #4CAF50;
    margin-bottom: 2px;
  }

  .log-info {
    font-size: 0.9em;
    color: #fff;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .log-url {
    font-size: 0.8em;
    color: #666;
  }

  /* TaskBar tasks full-width expansion */
  .task-bar .task-bar-tasks {
    flex: 1;
    display: flex;
    flex-wrap: nowrap;
    gap: 0.5rem;
    box-sizing: border-box;
  }

  /* Hide legacy logs container (using creative bubbles instead) */
  .task-step-logs-container {
    visibility: hidden;
  }

  /* Timeline chain for step logs */
  .task-step-logs {
    position: relative;
    padding-left: 1.2rem;
    margin-top: 0.5rem;
  }
  .task-step-logs::before {
    content: '';
    position: absolute;
    left: 0.6rem;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(255, 255, 255, 0.2);
  }
  .task-step-log-entry {
    position: relative;
    margin-bottom: 0.5rem;
    padding-left: 0.6rem;
  }
  .task-step-log-entry::before {
    content: '';
    position: absolute;
    left: -0.3rem; /* Center the dot with the line */
    top: 0.4rem;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--primary);
    transform: translateX(0); /* Reset any translations */
    transition: transform 0.3s ease;
  }
  .task-step-log-entry.current::before {
    animation: pulse 1s infinite;
    background: var(--accent);
  }
  .task-step-log-entry.completed::before {
    background: var(--success);
  }
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.4); box-shadow: 0 0 8px rgba(95, 110, 255, 0.6); }
    100% { transform: scale(1); }
  }

  /* Thumbnails for intermediate results */
  .task-thumbnails {
    margin-top: 10px;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .task-thumbnail {
    padding: 0.2rem 0.4rem;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: default;
  }

  /* Futuristic TaskBar item styling */
  .task-bar-task-item {
    display: block;
    position: relative;
    background: linear-gradient(180deg, rgba(20, 25, 40, 0.8) 0%, rgba(30, 35, 60, 0.9) 100%);
    border: 1px solid rgba(95, 110, 255, 0.2);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    box-sizing: border-box;
    margin: 0.5rem;
    color: #fff;
    font-size: 0.9rem;
    width: calc(100% - 1rem);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(4px);
    transition: all 0.2s ease;
  }
  
  .task-bar-task-item:hover {
    border-color: rgba(95, 110, 255, 0.4);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2), 0 0 8px rgba(95, 110, 255, 0.15);
    transform: translateY(-1px);
  }
  
  /* Compact task strips for minimized view */
  .minimized .task-bar-task-item {
    padding: 0.4rem 0.75rem;
    margin: 0.25rem 0.5rem;
    display: flex;
    align-items: center;
    max-height: 40px;
    overflow: hidden;
    transition: all 0.3s ease;
  }
  
  .minimized .task-bar-task-item strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
  }
  
  .minimized .task-progress-container {
    width: 40px;
    min-width: 40px;
    margin: 0 0.5rem 0 0;
  }
  
  .minimized .task-reports-container,
  .minimized .task-step-logs {
    display: none;
  }

  /* Futuristic progress bar */
  .task-progress-container {
    height: 6px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.75rem;
    position: relative;
  }
  
  .task-progress {
    height: 100%;
    background: linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%);
    box-shadow: 0 0 8px rgba(95, 47, 255, 0.4);
    transition: width 0.3s ease;
    position: relative;
  }
  
  .task-progress::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    animation: shimmer 1.5s infinite;
  }
  
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  /* Task link style */
  .task-report-link {
    display: inline-block;
    color: var(--primary);
    text-decoration: underline;
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }

  .task-report-link:hover {
    color: var(--accent);
  }

  /* TaskBar container positioning */
  .task-bar.position-bottom {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    background: rgba(15, 15, 30, 0.95);
    border-top: 1px solid rgba(95, 110, 255, 0.2);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    z-index: 1001;
    box-shadow: 0 -2px 15px rgba(0, 0, 0, 0.4);
    padding: 0.25rem 1rem;
  }

  .task-bar.position-top {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    background: rgba(15, 15, 30, 0.95);
    border-bottom: 1px solid rgba(95, 110, 255, 0.2);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    z-index: 1001;

  .task-progress {
    height: 100%;
    background: linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%);
    box-shadow: 0 0 8px rgba(95, 47, 255, 0.4);
    transition: width 0.3s ease;
    position: relative;
  }
  
  .task-progress::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    animation: shimmer 1.5s infinite;
  }

  .task-bar-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0;
    gap: 0.5rem;
    min-height: 32px;
    background: rgba(10, 10, 20, 0.8);
    padding: 0;
    border-radius: 6px;
    margin-top: 0.5rem;
  }

  .task-count {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    background: rgba(95, 110, 255, 0.2);
    border-radius: 6px;
    color: #a0a0c0;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid rgba(95, 110, 255, 0.3);
  }
  
  .task-count:hover {
    background: rgba(95, 110, 255, 0.3);
    border-color: var(--primary);
  }
  
  .task-count i {
    font-size: 0.9em;
    color: var(--primary);
  }
  
  .task-count .count {
    font-weight: 600;
    color: #ffffff;
    min-width: 20px;
    text-align: center;
  }
  
  .task-bar-control {
    background: transparent;
    border: 1px solid rgba(95, 110, 255, 0.3);
    color: #a0a0c0;
    padding: 0.4rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .task-bar-control:hover {
    background: rgba(95, 110, 255, 0.2);
    border-color: var(--primary);
    color: #ffffff;
  }

  .task-bar-tasks {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
    background: rgba(15, 20, 35, 0.95);
    border-top: 1px solid rgba(95, 110, 255, 0.1);
    display: flex;
    flex-direction: column;
    width: 100%;
  }
  
  .task-bar-tasks.expanded {
    max-height: 70vh;
    overflow-y: auto;
    padding: 0.5rem;
  }
  
  .running-tasks-container {
    margin-bottom: 1rem;
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  
  .completed-tasks-container {
    background: rgba(10, 15, 30, 0.7);
    border-radius: 6px;
    padding: 0.75rem;
    margin-top: 0.5rem;
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  
  .tasks-header {
    color: #a0a0c0;
    font-size: 0.8rem;
    margin: 0 0 0.5rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(95, 110, 255, 0.2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Task reports container */
  .task-reports-container {
    margin-top: 0.5rem;
  }

  .task-reports-title {
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 0.25rem;
  }

  .task-reports-links {
    display: flex;
    gap: 0.5rem;
  }

  .task-report-link.landing-report {
    background: var(--primary);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    color: #fff;
  }

  .task-report-link.detailed-report {
    background: var(--accent);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    color: #fff;
  }
`;

// Add styles to head if not already present
if (!document.getElementById('task-bar-styles')) {
  const style = document.createElement('style');
  style.id = 'task-bar-styles';
  style.textContent = styles;
  document.head.appendChild(style);
}

import { eventBus } from '../utils/events.js';
import { stores } from '../store/index.js';
import Button from './base/Button.jsx';
import { getActiveTasks, cancelTask as cancelTaskApi } from '../api/tasks.js';
const tasksStore = stores.tasks;

/**
 * Create a task bar component
 * @param {Object} props - Component properties
 * @returns {HTMLElement} Task bar container
 */
export function TaskBar(props = {}) {
  const {
    containerId = 'task-bar',
    position = 'bottom'
  } = props;

  // State
  let isMinimized = false;
  let expanded = false;
  let unsubscribeFromStore = null;
  
  // Create component container
  const container = document.createElement('div');
  container.className = `task-bar position-${position}`;
  if (containerId) container.id = containerId;
  
  // Create status section
  const statusSection = document.createElement('div');
  statusSection.className = 'task-bar-status';
  
  // System status indicator
  const systemStatus = document.createElement('div');
  systemStatus.className = 'status-item system-status';
  systemStatus.innerHTML = `
    <i class="fas fa-server"></i>
    <span class="status-value">Online</span>
    <span class="status-indicator online"></span>
  `;
  
  // Connection status indicator
  const connectionStatus = document.createElement('div');
  connectionStatus.className = 'status-item connection-status';
  connectionStatus.innerHTML = `
    <i class="fas fa-wifi"></i>
    <span class="status-value">Stable</span>
    <span class="status-indicator online"></span>
  `;
  
  // Add status items
  statusSection.appendChild(systemStatus);
  statusSection.appendChild(connectionStatus);
  
  // Create tasks section (summary/count)
  const tasksSection = document.createElement('div');
  tasksSection.className = 'task-bar-tasks';
  
  // Create controls section
  const controlsSection = document.createElement('div');
  controlsSection.className = 'task-bar-controls';
  controlsSection.style.display = 'flex';
  controlsSection.style.justifyContent = 'flex-end';
  controlsSection.style.alignItems = 'center';
  controlsSection.style.gap = '1rem';
  controlsSection.style.padding = '0.5rem 1rem';
  
  // Task count indicator
  const taskCount = document.createElement('div');
  taskCount.className = 'task-count';
  taskCount.innerHTML = `
    <i class="fas fa-tasks"></i>
    <span class="count">0</span>
  `;
  
  // Make task count clickable
  taskCount.style.cursor = 'pointer';
  taskCount.addEventListener('click', () => toggleMinimized());
  
  // Expand/collapse button
  const expandButton = document.createElement('button');
  expandButton.className = 'task-bar-control';
  expandButton.title = 'Expand Tasks';
  expandButton.innerHTML = '<i class="fas fa-chevron-up"></i>';
  expandButton.style.background = 'transparent';
  expandButton.style.border = '1px solid rgba(95, 110, 255, 0.3)';
  expandButton.style.color = '#a0a0c0';
  expandButton.style.padding = '0.4rem 1rem';
  expandButton.style.borderRadius = '6px';
  expandButton.style.cursor = 'pointer';
  expandButton.style.transition = 'all 0.2s ease';
  expandButton.addEventListener('mouseenter', () => {
    expandButton.style.background = 'rgba(95, 110, 255, 0.2)';
    expandButton.style.borderColor = 'var(--primary)';
    expandButton.style.color = '#ffffff';
  });
  expandButton.addEventListener('mouseleave', () => {
    expandButton.style.background = 'transparent';
    expandButton.style.borderColor = 'rgba(95, 110, 255, 0.3)';
    expandButton.style.color = '#a0a0c0';
  });
  expandButton.addEventListener('click', () => toggleMinimized());
  
  controlsSection.appendChild(taskCount);
  controlsSection.appendChild(expandButton);
  
  // Assemble layout
  container.appendChild(statusSection);
  container.appendChild(tasksSection);
  container.appendChild(controlsSection);

  // Initialize task containers
  function initializeContainers() {
    // Create running tasks container if it doesn't exist
    let runningTasksContainer = container.querySelector('.running-tasks-container');
    if (!runningTasksContainer) {
      runningTasksContainer = document.createElement('div');
      runningTasksContainer.className = 'running-tasks-container';
      tasksSection.appendChild(runningTasksContainer);
    }
    
    // Create completed tasks container if it doesn't exist
    let completedTasksContainer = container.querySelector('.completed-tasks-container');
    if (!completedTasksContainer) {
      completedTasksContainer = document.createElement('div');
      completedTasksContainer.className = 'completed-tasks-container';
      completedTasksContainer.innerHTML = '<h4 class="tasks-header">Completed Tasks</h4>';
      tasksSection.appendChild(completedTasksContainer);
    }
    
    return { runningTasksContainer, completedTasksContainer };
  }

  // Initialize task count display
  function updateTaskCount(count) {
    const taskCount = container.querySelector('.task-count');
    if (!taskCount) return;
    
    // Ensure we have a valid number
    const taskCountNum = Number.isInteger(count) ? count : 0;
    const countElement = taskCount.querySelector('.count');
    
    // Always show the count, even if zero
    if (countElement) {
      countElement.textContent = taskCountNum;
    }
    
    // Update the title for accessibility
    taskCount.title = `${taskCountNum} active task${taskCountNum !== 1 ? 's' : ''}`;
  }
  
  // Update both task list and count in one go
  function updateTaskDisplay() {
    // Get all active tasks from the store
    const { active: activeTasks = [] } = tasksStore.getState();
    
    // Deduplicate tasks by ID to prevent duplicate task entries
    // This is a map to keep only the most recent task with each ID
    const uniqueTasksMap = new Map();
    
    // Process tasks in order (keeping the last one for each ID)
    activeTasks.forEach(task => {
      uniqueTasksMap.set(task._id, task);
    });
    
    // Convert back to array
    const uniqueTasks = Array.from(uniqueTasksMap.values());
    
    // If we found and removed duplicates, update the store
    if (uniqueTasks.length !== activeTasks.length) {
      console.log(`[TaskBar] Deduplication: Removed ${activeTasks.length - uniqueTasks.length} duplicate task(s)`);
      tasksStore.setState({ active: uniqueTasks });
      return; // The state update will trigger another updateTaskDisplay call
    }
    
    // Continue with normal processing using deduplicated tasks
    const runningTasks = uniqueTasks.filter(t => t.status !== 'completed');
    updateTaskCount(runningTasks.length);
    updateTasks();
  }
  
  // Initialize containers and update UI
  initializeContainers();
  
  // Subscribe to task store updates
  unsubscribeFromStore = tasksStore.subscribe(updateTaskDisplay);
  
  // Initial update
  updateTaskDisplay();
  
  // Expose public methods
  container.getActiveTasks = () => [...tasksStore.getState().active];
  
  /**
   * Toggle minimized state
   */
  function toggleMinimized() {
    expanded = !expanded;
    tasksSection.classList.toggle('expanded', expanded);
    
    if (expanded) {
      // align popup flush with TaskBar edge
      tasksSection.style.left = '0px';
      tasksSection.style.minWidth = '';
      // Ensure tasks are updated when expanding
      updateTasks();
    } else {
      // reset inline styles
      tasksSection.style.left = '';
      tasksSection.style.minWidth = '';
    }
    
    // Update icon in both the task count and expand button
    const expandIcon = expandButton.querySelector('i');
    if (expandIcon) {
      expandIcon.className = `fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-up'}`;
    }
    
    // Update tooltips
    const newTitle = expanded ? 'Collapse Tasks' : 'Expand Tasks';
    expandButton.title = newTitle;
    taskCount.title = `${taskCount.querySelector('.count')?.textContent || 0} active task${taskCount.querySelector('.count')?.textContent !== '1' ? 's' : ''} - ${newTitle}`;
  }
  
  /**
   * Update tasks display
   */
  // Scroll logs container to bottom
  function scrollLogsToBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }
  
  function updateTasks() {
    // Get all tasks from store
    const { active: activeTasks = [] } = tasksStore.getState();
    
    // Update task count first
    updateTaskCount(activeTasks.filter(t => t.status !== 'completed').length);
    
    // Ensure containers exist and get references
    const { runningTasksContainer, completedTasksContainer } = initializeContainers();
    
    if (!runningTasksContainer || !completedTasksContainer) {
      console.error('Failed to initialize task containers');
      return;
    }
    
    // Clear existing content but keep the containers
    runningTasksContainer.innerHTML = '';
    completedTasksContainer.innerHTML = '';
    
    // Process tasks - separate into running and completed
    const runningTasks = [];
    const completedTasks = [];
    
    // Separate tasks into running and completed
    activeTasks.forEach(task => {
      if (task.status === 'completed') {
        completedTasks.push(task);
      } else {
        runningTasks.push(task);
      }
    });
    
    // Clear and update completed tasks container
    
    // Add completed tasks header if there are any completed tasks
    if (completedTasks.length > 0) {
      completedTasksContainer.innerHTML = '<h4 class="tasks-header">Completed Tasks</h4>';
      
      // Process completed tasks
      completedTasks.forEach(task => {
        // Check if task item already exists in completed container
        const existingItem = document.querySelector(`.task-bar-task-item[data-task-id="${task._id}"]`);
        
        // Only process if not already in the completed container
        if (!existingItem || !existingItem.closest('.completed-tasks-container')) {
          const taskItem = document.createElement('div');
          taskItem.className = 'task-bar-task-item completed';
          taskItem.setAttribute('data-task-id', task._id);
          
          // Add task content with enhanced title
          taskItem.innerHTML = `
            <div class="task-card completed">
              <div class="task-card-header">
                <div class="title">${getTaskTitle(task)}</div>
                <div class="meta">Completed</div>
              </div>
              <div class="task-details">
                <div class="task-action">Task completed successfully</div>
              </div>
            </div>
          `;
          
          completedTasksContainer.appendChild(taskItem);
        }
      });
    }
    
    // Empty state - just leave the containers empty without any message
    if (!activeTasks || activeTasks.length === 0) {
      return;
    }
    
    // Identify stale task items that need to be removed (tasks no longer active)
    const currentTaskIds = activeTasks.map(task => task._id);
    document.querySelectorAll('.task-bar-task-item').forEach(item => {
      const itemTaskId = item.getAttribute('data-task-id');
      if (!currentTaskIds.includes(itemTaskId)) {
        item.remove();
      }
    });
    
    // Now we have both running and completed tasks separated
    
    // Clear existing running tasks first
    runningTasksContainer.innerHTML = '';
    
    // Track existing task items to prevent duplicates
    const existingTaskItems = new Set();
    
    // Render running tasks
    runningTasks.forEach(task => {
      // Check if task item already exists
      const existingItem = document.querySelector(`.task-bar-task-item[data-task-id="${task._id}"]`);
      let taskItem;
      
      if (existingItem) {
        // Reuse existing item
        taskItem = existingItem;
        // Clear any existing content
        taskItem.innerHTML = '';
      } else {
        // Create new task item
        taskItem = document.createElement('div');
        taskItem.className = `task-bar-task-item ${task.status === 'completed' ? 'completed' : ''}`;
        taskItem.setAttribute('data-task-id', task._id);
      }
      
      // Add to container if not already there
      if (!existingItem) {
        runningTasksContainer.appendChild(taskItem);
      }
      
      // Track this task item to prevent duplicates
      existingTaskItems.add(task._id);
      
      // Get latest logs dynamically
      const logsForTask = tasksStore.getState().stepLogs[task._id] || [];
      const overallProgress = Math.min(Math.max(task.progress || 0, 0), 100);
      
      // Better step count calculation - check for stepNumber in planLog entries
      let currentStep = 0;
      let matchedStepNumbers = logsForTask
        .filter(log => log.type === 'planLog' && log.stepNumber)
        .map(log => log.stepNumber);
      
      if (matchedStepNumbers.length > 0) {
        // Use the highest step number that has been recorded
        currentStep = Math.max(...matchedStepNumbers);
      } else {
        // Fallback to counting stepProgress logs
        const latestStep = logsForTask.filter(l => l.type === 'stepProgress').slice(-1)[0] || {};
        currentStep = latestStep.stepIndex || 0;
      }
      
      // Get total steps from task if available, otherwise default to 10
      const totalSteps = task.totalSteps || 10;
      
      // Get latest function call and plan log
      const latestFunctionCall = logsForTask
        .filter(l => l.type === 'functionCallPartial')
        .slice(-1)[0] || {};
      
      const latestPlanLog = logsForTask
        .filter(l => l.type === 'planLog')
        .slice(-1)[0] || {};
      
      // Format progress text
      const progressText = `${currentStep}/${totalSteps} steps | ${overallProgress}% complete`;
      
      // Format current action
      const currentAction = latestFunctionCall.message || latestPlanLog.message || 'Waiting...';
      
      // Check for task completion and report URLs
      const isCompleted = task.status === 'completed';
      const hasLandingReport = task.result?.landingReportUrl;
      const hasDetailedReport = task.result?.detailedReportUrl;
      
      // Build report links section for completed tasks
      let reportLinksHTML = '';
      if (isCompleted && (hasLandingReport || hasDetailedReport)) {
        reportLinksHTML = `
          <div class="task-reports-container">
            <div class="task-reports-title">
              <i class="fas fa-file-alt"></i> Task Reports
            </div>
            <div class="task-reports-links">
              ${hasLandingReport ? (() => {
  const url = task.result.landingReportUrl.startsWith('/') ? window.location.origin + task.result.landingReportUrl : task.result.landingReportUrl;
  return `<a href="javascript:void(0)" onclick="window.open('${url}', '_blank')" class="task-report-link landing-report">
    <i class="fas fa-chart-pie"></i> Landing Report
  </a>`;
})() : ''}
              ${hasDetailedReport ? (() => {
  const url = task.result.detailedReportUrl.startsWith('/') ? window.location.origin + task.result.detailedReportUrl : task.result.detailedReportUrl;
  return `<a href="javascript:void(0)" onclick="window.open('${url}', '_blank')" class="task-report-link detailed-report">
    <i class="fas fa-file-code"></i> Detailed Report
  </a>`;
})() : ''}
            </div>
          </div>
        `;
      }
      
      // Check for screenshot in result
      const hasScreenshot = task.result?.screenshot;
      const screenshotHTML = hasScreenshot ? `
        <div class="task-screenshot">
          <img src="${task.result.screenshot}" alt="Task result" style="max-width: 100%; border-radius: 4px; margin-top: 10px;" />
        </div>` : '';

      // Task card HTML with conditional styling for completed tasks
      taskItem.innerHTML = `
        <div class="task-card ${isCompleted ? 'completed' : ''}">
          <div class="task-card-header">
            <div class="title" title="${getTaskTitle(task)} - ${progressText}">
              ${getTaskTitle(task)} ${isCompleted ? '- Completed' : ''}
            </div>
            <div class="meta">${progressText}</div>
          </div>
          ${!isCompleted ? `
            <div class="task-progress-container">
              <div class="task-progress" style="width: ${overallProgress}%"></div>
            </div>
          ` : ''}
          <div class="task-details">
            <div class="task-action">${currentAction}</div>
            ${!isCompleted ? `
              <div class="task-actions">
                <button class="cancel-task" title="Cancel this task">
                  <i class="fas fa-times"></i> Cancel
                </button>
              </div>
            ` : ''}
            ${screenshotHTML}
            ${reportLinksHTML}
          </div>
        </div>`;
      
      // Render step logs
      if (logsForTask.length) {
        const logContainer = document.createElement('div');
        logContainer.className = 'task-step-logs';
        logContainer.style.maxHeight = '150px';
        logContainer.style.overflowY = 'auto';
        
        // Process logs in chronological order (oldest first) for better reading
        const sortedLogs = [...logsForTask].sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return timeA - timeB; // Sort oldest first for better reading
        });
        
        sortedLogs.forEach(entry => {
          const entryEl = document.createElement('div');
          entryEl.className = `log-entry ${entry.type}`;
          
          // Create icon element
          const icon = document.createElement('i');
          let text = '';
          
          // Set icon and text based on entry type
          switch (entry.type) {
            case 'planLog':
              icon.className = 'fas fa-shoe-prints';
              text = `[${entry.stepNumber || '>_'}] ${entry.message || ''}`;
              break;
            case 'functionCallPartial':
              icon.className = 'fas fa-arrow-right';
              text = entry.message || '';
              break;
            case 'stepProgress':
              icon.className = 'fas fa-check-circle';
              text = `Step ${(entry.stepIndex || 0) + 1} completed`;
              break;
            case 'taskError':
              icon.className = 'fas fa-exclamation-circle';
              text = entry.error || 'Unknown error';
              entryEl.classList.add('error');
              break;
            default:
              icon.className = 'fas fa-info-circle';
              text = entry.message || JSON.stringify(entry);
          }
          
          // Add icon and text to entry
          entryEl.appendChild(icon);
          const textNode = document.createTextNode(` ${text}`);
          entryEl.appendChild(textNode);
          logContainer.appendChild(entryEl);
        });
        
        taskItem.querySelector('.task-details').appendChild(logContainer);
        
        // Auto-scroll to bottom after a small delay to ensure DOM is updated
        setTimeout(() => {
          scrollLogsToBottom(logContainer);
        }, 100);
      }
      
      // Thumbnails for intermediate results with screenshots
      const items = tasksStore.getState().intermediateResults[task._id] || [];
      // Filter items to only show those with screenshots
      const itemsWithScreenshots = items.filter(item => item && item.screenshot);
      
      if (itemsWithScreenshots.length > 0) {
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'task-thumbnails';
        itemsWithScreenshots.forEach((item, idx) => {
          const thumb = document.createElement('div');
          thumb.className = 'task-thumbnail';
          thumb.textContent = `Step ${idx + 1}`;
          thumb.title = item.extractedInfo || '';
          thumbContainer.appendChild(thumb);
        });
        taskItem.appendChild(thumbContainer);
      }

      // Add cancel handler - with null check to prevent errors
      const cancelButton = taskItem.querySelector('.cancel-task');
      if (cancelButton) {
        cancelButton.addEventListener('click', () => {
          cancelTask(task._id);
        });
      } else {
        console.warn(`[DEBUG] Cancel button not found for task ${task._id}`);
      }
      
      // Add step info click handler
      taskItem.addEventListener('click', () => {
        const stepDetails = taskItem.querySelector('.task-step-details');
        if (stepDetails) {
          stepDetails.classList.toggle('expanded');
        }
      });

    });
  }
  
  /**
   * Get a formatted display title with emoji for a task object
   * @param {Object} task - Task object
   * @returns {string} Display title with emoji
   */
  function getTaskTitle(task) {
    // Get appropriate emoji based on task properties
    const emoji = getTaskEmoji(task);
    
    // Use command if available
    if (task.command) {
      // Truncate long commands
      const commandText = task.command.length > 30 
        ? task.command.substring(0, 30) + '...'
        : task.command;
      return `${emoji} ${commandText}`;
    }
    
    // Use description if available
    if (task.description) {
      // Truncate descriptions too
      const descriptionText = task.description.length > 30
        ? task.description.substring(0, 30) + '...'
        : task.description;
      return `${emoji} ${descriptionText}`;
    }
    
    // Fallback with task type and ID
    const taskType = getTaskTypeDisplay(task);
    const taskId = task._id ? `#${task._id.substring(0, 6)}` : '';
    return `${emoji} ${taskType} ${taskId}`;
  }
  
  /**
   * Get emoji for task based on its properties
   * @param {Object} task - Task object
   * @returns {string} Emoji character
   */
  function getTaskEmoji(task) {
    // Check for YAML map first
    if (task.yamlMapId) {
      return '📋'; // YAML map task
    }
    
    // Check for browser session
    if (task.browserSessionId) {
      return '🌐'; // Browser task
    }
    
    // Check for URL
    if (task.url) {
      return '🔗'; // URL-based task
    }
    
    // Check for complex tasks with subtasks
    if (task.isComplex) {
      return '🧩'; // Complex task
    }

    // Check for command content to determine type
    const cmd = task.command?.toLowerCase() || '';
    if (cmd.includes('browser') || cmd.includes('navigate') || cmd.includes('web')) {
      return '🌐'; // Web/browser task
    }
    if (cmd.includes('code') || cmd.includes('script') || cmd.includes('function')) {
      return '💻'; // Code task
    }
    if (cmd.includes('file') || cmd.includes('document')) {
      return '📄'; // File task
    }
    if (cmd.includes('analyze') || cmd.includes('research')) {
      return '🔍'; // Analysis task
    }
    
    // Default rocket emoji for all other tasks
    return '🚀';
  }
  
  /**
   * Get a friendly display name based on task properties
   * @param {Object} task - Task object
   * @returns {string} Friendly display name
   */
  function getTaskTypeDisplay(task) {
    // Check for YAML map first
    if (task.yamlMapId) {
      return task.yamlMapName || 'YAML Task';
    }
    
    // Check for browser session
    if (task.browserSessionId) {
      return 'Browser Task';
    }
    
    // Check for URL
    if (task.url) {
      return 'Web Task';
    }
    
    // Check for complex tasks with subtasks
    if (task.isComplex) {
      return 'Complex Task';
    }

    // Default
    return 'Task';
  }
  
  /**
   * Cancel a task
   * @param {string} taskId - ID of task to cancel
   */
  async function cancelTask(taskId) {
    try {
      // Send cancel request
      await cancelTaskApi(taskId);
      
      // Remove from active tasks
      const { active: activeTasks } = tasksStore.getState();
      tasksStore.setState({ active: activeTasks.filter(task => task._id !== taskId) });
      
      // Update UI
      updateTasks();
      
      // Notify success
      eventBus.emit('notification', {
        message: 'Task cancelled successfully',
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to cancel task:', error);
      
      // Notify error
      eventBus.emit('notification', {
        message: 'Failed to cancel task',
        type: 'error'
      });
    }
  }
  
  /**
   * Update system status
   * @param {Object} status - System status object
   */
  function updateSystemStatus(status) {
    const statusValue = systemStatus.querySelector('.status-value');
    const statusIndicator = systemStatus.querySelector('.status-indicator');
    
    if (statusValue && statusIndicator) {
      // Always check actual network connectivity status first
      if (!navigator.onLine) {
        statusValue.textContent = 'Offline';
        statusIndicator.className = 'status-indicator offline';
        return;
      }
      
      const isOnline = status.status === 'online' || status.status === 'operational';
      
      statusValue.textContent = capitalizeFirstLetter(status.status || 'Unknown');
      statusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
    }
  }
  
  /**
   * Update connection status
   * @param {Object} status - Connection status object
   */
  function updateConnectionStatus(status) {
    const statusValue = connectionStatus.querySelector('.status-value');
    const statusIndicator = connectionStatus.querySelector('.status-indicator');
    
    if (statusValue && statusIndicator) {
      // Always check actual network connectivity status first
      if (!navigator.onLine) {
        statusValue.textContent = 'Disconnected';
        statusIndicator.className = 'status-indicator warning';
        return;
      }
      
      const isStable = status.status === 'stable' || status.status === 'connected';
      
      statusValue.textContent = capitalizeFirstLetter(status.status || 'Unknown');
      statusIndicator.className = `status-indicator ${isStable ? 'online' : 'warning'}`;
    }
  }
  
  /**
   * Capitalize first letter of string
   * @param {string} string - String to capitalize
   * @returns {string} Capitalized string
   */
  function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
  
  /**
   * Initialize the component
   */
  function initialize() {
    // Subscribe to task updates
    unsubscribeFromStore = tasksStore.subscribe(updateTasks);
    // Initial update
    updateTasks();
    
    // Set up network status event listeners
    window.addEventListener('online', handleNetworkStatusChange);
    window.addEventListener('offline', handleNetworkStatusChange);
    
    // Initial network status check
    handleNetworkStatusChange();
    
    // Set up periodic connection check (every 30 seconds)
    const connectionCheckInterval = setInterval(() => {
      if (navigator.onLine) {
        checkServerConnection();
      }
    }, 30000);
    
    // Set up cleanup when component is unmounted
    if (container && !container._cleanupRegistered) {
      container._cleanupRegistered = true;
      const originalRemove = container.remove;
      container.remove = function() {
        cleanup();
        clearInterval(connectionCheckInterval);
        if (originalRemove) originalRemove.call(this);
      };
    }
    
    return function cleanupListeners() {
      window.removeEventListener('online', handleNetworkStatusChange);
      window.removeEventListener('offline', handleNetworkStatusChange);
      clearInterval(connectionCheckInterval);
    };
  }
  
  /**
   * Handle network status changes
   */
  function handleNetworkStatusChange() {
    console.log(`[TaskBar] Network status changed: ${navigator.onLine ? 'Online' : 'Offline'}`);
    
    // Update both system and connection status immediately
    if (navigator.onLine) {
      // If we're back online, set status to online/stable
      updateSystemStatus({ status: 'online' });
      updateConnectionStatus({ status: 'stable' });
      
      // Also try to ping the server to verify actual connection
      checkServerConnection();
    } else {
      // If we're offline, update both indicators
      updateSystemStatus({ status: 'offline' });
      updateConnectionStatus({ status: 'disconnected' });
    }
  }
  
  /**
   * Check if the server is actually reachable
   */
  async function checkServerConnection() {
    try {
      // Simple ping to server with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // Use the dedicated health check endpoint - no auth required
      const response = await fetch('/api/health', { 
        method: 'GET', 
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // Server is responding - that's all we need to know since 
        // this endpoint always returns { status: 'ok', serverReady: true }
        console.log('[TaskBar] Server health check successful');
        updateSystemStatus({ status: 'online' });
        updateConnectionStatus({ status: 'stable' });
      } else {
        // Server returned an error
        console.warn('[TaskBar] Server health check returned error status:', response.status);
        updateSystemStatus({ status: 'degraded' });
        updateConnectionStatus({ status: 'unstable' });
      }
    } catch (error) {
      // Could not reach server despite navigator.onLine being true
      console.warn('[TaskBar] Server health check failed:', error);
      updateSystemStatus({ status: 'limited' });
      updateConnectionStatus({ status: 'unstable' });
    }
  }
  
  /**
   * Clean up subscriptions and resources
   */
  function cleanup() {
    if (unsubscribeFromStore) {
      unsubscribeFromStore();
      unsubscribeFromStore = null;
    }
    
    // Remove network status event listeners
    window.removeEventListener('online', handleNetworkStatusChange);
    window.removeEventListener('offline', handleNetworkStatusChange);
  }
  
  // This function makes sure we display reports in both the task cards and task completion stores
  function processCompletedTask(task) {
    if (task.status === 'completed') {
      // Store completed task in local cache for persistence
      const cachedTasks = JSON.parse(localStorage.getItem('completedTasks') || '[]');
      const existingIndex = cachedTasks.findIndex(t => t._id === task._id);
      
      if (existingIndex >= 0) {
        cachedTasks[existingIndex] = task;
      } else {
        cachedTasks.push(task);
      }
      
      // Limit cache to recent 20 completed tasks
      if (cachedTasks.length > 20) {
        cachedTasks.splice(0, cachedTasks.length - 20);
      }
      
      localStorage.setItem('completedTasks', JSON.stringify(cachedTasks));
    }
    
    return task;
  }
  
  // Subscribe to task status updates to handle various task events
  eventBus.on('taskComplete', (taskId, result) => {
    // Fix: Get tasks from store instead of using undefined activeTasks variable
    const tasks = tasksStore.getState().active;
    const taskIndex = tasks.findIndex(t => t._id === taskId);
    
    if (taskIndex >= 0) {
      // Update task via store instead of direct mutation
      tasksStore.updateTask(taskId, {
        status: 'completed',
        result: result || {}
      });
      
      // Process the completed task
      processCompletedTask(tasks[taskIndex]);
      
      // Update task display
      updateTasks('taskComplete event');
    }
  });
  
  // Handle task start - auto expand sidebar
  eventBus.on('taskStart', (taskId) => {
    console.log(`[TaskBar] Task started: ${taskId}, auto-expanding sidebar`);
    if (isMinimized) {
      toggleMinimized(); // Auto-expand the sidebar when task starts
    }
    // Update task display
    updateTasks('taskStart event');
  });
  
  // Handle intermediate results - ensure sidebar is expanded
  eventBus.on('intermediateResult', (data) => {
    console.log(`[TaskBar] Intermediate result received, ensuring sidebar is expanded`);
    if (isMinimized) {
      toggleMinimized(); // Auto-expand the sidebar when intermediates arrive
    }
    // Update task display
    updateTasks('intermediateResult event');
  });
  
  // Initialize component
  const cleanupTasks = initialize();
  
  // Expose public methods
  container.minimize = () => {
    if (!isMinimized) {
      toggleMinimized();
    }
  };
  
  container.expand = () => {
    if (isMinimized) {
      toggleMinimized();
    }
  };
  
  container.getActiveTasks = () => [...activeTasks];
  
  container.refreshTasks = () => updateTasks();
  
  // Cleanup method
  container.destroy = () => {
    if (cleanupTasks) cleanupTasks();
    cleanup();
  };

  return container;
}

/**
 * Mount a task bar to a parent element
 * @param {HTMLElement} parent - Parent element to mount to
 * @param {Object} props - Component properties
 * @returns {HTMLElement} The mounted task bar
 */
export function mount(parent, props = {}) {
  const taskBar = TaskBar(props);
  if (parent) {
    parent.appendChild(taskBar);
  }
  
  // Initialize the task bar
  taskBar.initialize();
  
  // Set up cleanup when parent is removed from DOM
  if (parent) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.removedNodes) {
          for (let i = 0; i < mutation.removedNodes.length; i++) {
            if (mutation.removedNodes[i] === taskBar) {
              if (taskBar.cleanup) taskBar.cleanup();
              observer.disconnect();
              return;
            }
          }
        }
      });
    });
    
    observer.observe(parent, { childList: true });
  }
  
  return taskBar;
}

export default TaskBar;
