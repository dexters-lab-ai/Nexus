/**
 * OPERATOR Store
 * Centralized state management using a simple publish/subscribe pattern
 * This will later be replaced with a more robust solution (like Zustand or Pinia)
 */

/**
 * Create a simple reactive store
 * @param {Object} initialState - Initial state object
 * @returns {Object} Store methods and state
 */
export function createStore(initialState = {}) {
  // Internal state
  let state = { ...initialState };
  const listeners = new Set();

  /**
   * Get current state (immutable)
   * @returns {Object} Shallow copy of current state
   */
  const getState = () => ({ ...state });

  /**
   * Update state and notify subscribers
   * @param {Object|Function} updater - New state object or updater function
   */
  const setState = (updater) => {
    const newState = typeof updater === 'function' 
      ? updater(state)
      : updater;
    
    state = { ...state, ...newState };
    notifyListeners();
  };

  /**
   * Subscribe to state changes
   * @param {Function} listener - Callback for state updates
   * @returns {Function} Unsubscribe function
   */
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  /**
   * Notify all listeners of state change
   */
  const notifyListeners = () => {
    listeners.forEach(listener => listener(state));
  };

  return {
    getState,
    setState,
    subscribe
  };
}

// Create application stores

/**
 * UI State Store
 * Manages UI-related state like active tabs, overlays, modals
 */
export const uiStore = createStore({
  activeTab: 'nli',
  activeSubtab: 'active',
  overlays: {
    history: false,
    settings: false
  },
  modals: {
    historyDetails: {
      visible: false,
      taskId: null
    }
  },
  theme: 'dark'
});

/**
 * Tasks Store
 * Manages active tasks state
 */
export const tasksStore = createStore({
  active: [],
  scheduled: [],
  repetitive: [],
  loading: false,
  error: null,
  streams: {},
  intermediateResults: {},
  stepLogs: {}
});

// Task store helper methods with deduplication protection

// Set all active tasks with deduplication
tasksStore.setActiveTasks = tasks => {
  // Deduplicate by task ID
  const uniqueTasksMap = new Map();
  tasks.forEach(task => uniqueTasksMap.set(task._id, task));
  const uniqueTasks = Array.from(uniqueTasksMap.values());
  
  if (uniqueTasks.length !== tasks.length) {
    console.log(`[TaskStore] Deduplication: Found ${tasks.length - uniqueTasks.length} duplicate task(s) during setActiveTasks`);
  }
  
  tasksStore.setState({ active: uniqueTasks });
};

// Add a task with deduplication check
tasksStore.addTask = task => {
  if (!task || !task._id) {
    console.error('[TaskStore] Cannot add task: Invalid task or missing ID');
    return;
  }
  
  tasksStore.setState(state => {
    // Check if task already exists
    const existingTaskIndex = state.active.findIndex(t => t._id === task._id);
    
    if (existingTaskIndex >= 0) {
      // Task exists - update it instead of adding a duplicate
      console.log(`[TaskStore] Task ${task._id} already exists, updating instead of duplicating`);
      const updatedTasks = [...state.active];
      updatedTasks[existingTaskIndex] = { ...updatedTasks[existingTaskIndex], ...task };
      return { active: updatedTasks };
    } else {
      // New task - add it
      return { active: [...state.active, task] };
    }
  });
};

// Update a task by ID
tasksStore.updateTask = (taskId, patch) => tasksStore.setState(state => ({
  active: state.active.map(task => task._id === taskId ? { ...task, ...patch } : task)
}));

// Remove a task by ID
tasksStore.removeTask = taskId => tasksStore.setState(state => ({
  active: state.active.filter(task => task._id !== taskId)
}));
tasksStore.addStream = (taskId, es) => tasksStore.setState(state => ({
  streams: { ...state.streams, [taskId]: es }
}));
tasksStore.closeStream = taskId => {
  const es = tasksStore.getState().streams[taskId];
  if (es) es.close();
  tasksStore.setState(state => {
    const streams = { ...state.streams }; delete streams[taskId];
    return { streams };
  });
};
// Add helper for intermediate results
tasksStore.addIntermediate = (taskId, item) => {
  // Normalize the item to ensure it has expected properties
  // This prevents 'item is undefined' errors in the TaskBar
  let normalizedItem = item;
  
  // If item is undefined or not an object, create a default item structure
  if (!item || typeof item !== 'object') {
    normalizedItem = {
      type: 'info',
      title: 'Task Update',
      content: 'Task progress update',
      timestamp: new Date().toISOString()
    };
    console.log('[TaskStore] Created default item structure for missing item in addIntermediate');
  }
  
  // Ensure it has the extractedInfo property that TaskBar expects
  if (!normalizedItem.extractedInfo) {
    normalizedItem.extractedInfo = normalizedItem.content || normalizedItem.title || '';
  }
  
  // Update the state with the normalized item
  tasksStore.setState(state => ({
    intermediateResults: {
      ...state.intermediateResults,
      [taskId]: [...(state.intermediateResults[taskId] || []), normalizedItem]
    }
  }));
};
// Add helpers for step logs
tasksStore.addStepLog = (taskId, entry) => tasksStore.setState(state => ({
  stepLogs: {
    ...state.stepLogs,
    [taskId]: [...(state.stepLogs[taskId] || []), entry]
  }
}));
tasksStore.getStepLogs = taskId => tasksStore.getState().stepLogs[taskId] || [];
// Getter for intermediate results
tasksStore.getIntermediateResults = taskId => tasksStore.getState().intermediateResults[taskId] || [];

/**
 * History Store
 * Manages task history state
 */
export const historyStore = createStore({
  items: [],
  selectedItem: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 0
  }
});

// Re-export messagesStore for legacy components
export { messagesStore } from './messages.js';

// Export all stores as a single object
export const stores = {
  ui: uiStore,
  tasks: tasksStore,
  history: historyStore
};

export default stores;
