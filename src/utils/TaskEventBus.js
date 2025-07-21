/**
 * TaskEventBus - Real-time communication system for task processing
 * 
 * Enables real-time bidirectional communication between task processing components:
 * - streamNliThoughts can receive updates from processTask execution
 * - processTask can receive command adjustments during execution
 */

import { EventEmitter } from 'events';

class TaskEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Allow many listeners for different tasks
    
    // Store active task plans and commands
    this.activeTasks = new Map(); // taskId -> task data
    this.taskSteps = new Map();   // taskId -> array of steps
    this.pendingUpdates = new Map(); // taskId -> array of command updates
  }

  /**
   * Register a new task for tracking
   */
  registerTask(taskId, userId, command, sessionId) {
    this.activeTasks.set(taskId, {
      taskId,
      userId,
      originalCommand: command,
      currentCommand: command,
      sessionId,
      status: 'initializing',
      startTime: Date.now(),
      steps: [],
      currentStepIndex: -1
    });
    
    this.emit('task:registered', {
      taskId,
      userId,
      command,
      sessionId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Start task execution
   */
  startTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;
    
    task.status = 'executing';
    task.executionStartTime = Date.now();
    
    this.emit('task:started', {
      taskId,
      userId: task.userId,
      command: task.currentCommand,
      sessionId: task.sessionId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Record a new step in the task
   */
  addTaskStep(taskId, description, command) {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;
    
    const step = {
      index: task.steps.length,
      description,
      command,
      status: 'pending',
      startTime: null,
      endTime: null
    };
    
    task.steps.push(step);
    
    // Also store in the taskSteps map
    if (!this.taskSteps.has(taskId)) {
      this.taskSteps.set(taskId, []);
    }
    this.taskSteps.get(taskId).push(step);
    
    this.emit('task:stepAdded', {
      taskId,
      userId: task.userId,
      stepIndex: step.index,
      description,
      command,
      sessionId: task.sessionId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Start executing a step
   */
  startTaskStep(taskId, stepIndex) {
    const task = this.activeTasks.get(taskId);
    if (!task || !task.steps[stepIndex]) return false;
    
    const step = task.steps[stepIndex];
    step.status = 'executing';
    step.startTime = Date.now();
    task.currentStepIndex = stepIndex;
    
    this.emit('task:stepStarted', {
      taskId,
      userId: task.userId,
      stepIndex,
      description: step.description,
      command: step.command,
      sessionId: task.sessionId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Complete a step with results
   */
  completeTaskStep(taskId, stepIndex, result) {
    const task = this.activeTasks.get(taskId);
    if (!task || !task.steps[stepIndex]) return false;
    
    const step = task.steps[stepIndex];
    step.status = 'completed';
    step.result = result;
    step.endTime = Date.now();
    
    this.emit('task:stepCompleted', {
      taskId,
      userId: task.userId,
      stepIndex,
      description: step.description,
      result,
      sessionId: task.sessionId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Fail a step with error
   */
  failTaskStep(taskId, stepIndex, error) {
    const task = this.activeTasks.get(taskId);
    if (!task || !task.steps[stepIndex]) return false;
    
    const step = task.steps[stepIndex];
    step.status = 'failed';
    step.error = error;
    step.endTime = Date.now();
    
    this.emit('task:stepFailed', {
      taskId,
      userId: task.userId,
      stepIndex,
      description: step.description,
      error,
      sessionId: task.sessionId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Complete the entire task
   */
  completeTask(taskId, success, finalResult) {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;
    
    task.status = success ? 'completed' : 'failed';
    task.endTime = Date.now();
    task.finalResult = finalResult;
    
    this.emit('task:completed', {
      taskId,
      userId: task.userId,
      success,
      finalResult,
      sessionId: task.sessionId,
      totalSteps: task.steps.length,
      completedSteps: task.steps.filter(s => s.status === 'completed').length,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Update command for a task (to be used in next iteration)
   */
  updateTaskCommand(taskId, newCommand, reason = 'optimization') {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;
    
    const oldCommand = task.currentCommand;
    task.currentCommand = newCommand;
    
    this.emit('task:commandUpdated', {
      taskId,
      userId: task.userId,
      oldCommand,
      newCommand,
      reason,
      sessionId: task.sessionId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Queue an update for a specific future step
   */
  queueStepUpdate(taskId, stepIndex, newCommand) {
    if (!this.pendingUpdates.has(taskId)) {
      this.pendingUpdates.set(taskId, []);
    }
    
    this.pendingUpdates.get(taskId).push({
      stepIndex,
      newCommand,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Check for pending updates for a specific step
   */
  getStepUpdate(taskId, stepIndex) {
    if (!this.pendingUpdates.has(taskId)) return null;
    
    const updates = this.pendingUpdates.get(taskId);
    const updateIndex = updates.findIndex(u => u.stepIndex === stepIndex);
    
    if (updateIndex === -1) return null;
    
    return updates.splice(updateIndex, 1)[0];
  }

  /**
   * Get current status of a task
   */
  getTaskStatus(taskId) {
    return this.activeTasks.get(taskId);
  }

  /**
   * Get all steps for a task
   */
  getTaskSteps(taskId) {
    return this.taskSteps.get(taskId) || [];
  }
}

// Create a singleton instance
const taskEventBus = new TaskEventBus();

export default taskEventBus;
