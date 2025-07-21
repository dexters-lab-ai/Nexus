/**
 * TaskPlanAdapter - Connects streamNliThoughts to TaskPlan for bidirectional feedback
 * 
 * This module enables real-time feedback between streamNliThoughts and processTask:
 * 1. Enables taskPlan to be updated during execution based on step results
 * 2. Allows dynamic command adjustments during task processing
 * 3. Provides real-time streaming of task progress to clients
 */

import { EventEmitter } from 'events';

class TaskPlanAdapter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.activePlans = new Map(); // Map of taskId -> TaskPlan instances
    this.commandUpdates = new Map(); // Map of taskId -> command updates
    this.stepUpdates = new Map(); // Map of taskId -> step updates by index
  }

  /**
   * Register a TaskPlan instance for real-time monitoring and control
   * @param {object} taskPlan - TaskPlan instance to monitor 
   * @param {string} sessionId - Session identifier for the streaming connection
   */
  registerTaskPlan(taskPlan, sessionId) {
    if (!taskPlan || !taskPlan.taskId) {
      console.error('[TaskPlanAdapter] Cannot register plan: missing taskId');
      return false;
    }

    const taskId = taskPlan.taskId;
    
    // Store the plan reference
    this.activePlans.set(taskId, {
      plan: taskPlan,
      sessionId,
      originalPrompt: taskPlan.prompt,
      registeredAt: Date.now()
    });
    
    // Set up hooks into the TaskPlan methods
    this._enhanceTaskPlanMethods(taskPlan);
    
    // Emit registration event
    this.emit('plan:registered', {
      taskId,
      sessionId,
      userId: taskPlan.userId,
      prompt: taskPlan.prompt
    });
    
    return true;
  }

  /**
   * Add hooks into key TaskPlan methods to monitor execution
   * @private
   */
  _enhanceTaskPlanMethods(taskPlan) {
    const taskId = taskPlan.taskId;
    
    // Store original methods
    const originalCreateStep = taskPlan.createStep;
    const originalExecuteBrowserAction = taskPlan.executeBrowserAction;
    const originalExecuteBrowserQuery = taskPlan.executeBrowserQuery;
    const originalLog = taskPlan.log;
    
    // Enhance logging to emit events
    taskPlan.log = (message, metadata = {}) => {
      // Call original method
      const result = originalLog.call(taskPlan, message, metadata);
      
      // Emit log event
      this.emit('plan:log', {
        taskId,
        message,
        metadata,
        timestamp: Date.now()
      });
      
      return result;
    };
    
    // Enhance step creation to check for command updates
    taskPlan.createStep = (type, instruction, args) => {
      // Check if we have any command updates pending
      const pendingCommandUpdate = this.commandUpdates.get(taskId);
      if (pendingCommandUpdate) {
        console.log(`[TaskPlanAdapter] Applying command update to new step: ${pendingCommandUpdate.newCommand}`);
        if (type === 'action') {
          args = args || {};
          args.instruction = pendingCommandUpdate.newCommand;
        } else if (type === 'query') {
          args = args || {};
          args.query = pendingCommandUpdate.newCommand;
        }
        this.commandUpdates.delete(taskId);
      }
      
      // Call original method with potentially updated args
      const step = originalCreateStep.call(taskPlan, type, instruction, args);
      
      // Emit step creation event
      this.emit('plan:stepCreated', {
        taskId,
        stepIndex: step.index,
        type,
        instruction,
        timestamp: Date.now()
      });
      
      return step;
    };
    
    // Enhance browser action execution to emit events and apply step updates
    taskPlan.executeBrowserAction = async (args, stepIndex) => {
      // Check if we have step-specific updates
      this._applyStepUpdateIfAvailable(taskPlan, stepIndex, args);
      
      // Emit execution start event
      this.emit('plan:stepExecutionStarted', {
        taskId,
        stepIndex,
        type: 'action',
        args,
        timestamp: Date.now()
      });
      
      // Execute the original method
      let result;
      try {
        result = await originalExecuteBrowserAction.call(taskPlan, args, stepIndex);
        
        // Emit completion event
        this.emit('plan:stepExecutionCompleted', {
          taskId,
          stepIndex,
          success: result?.success || false,
          result,
          timestamp: Date.now()
        });
      } catch (error) {
        // Emit failure event
        this.emit('plan:stepExecutionFailed', {
          taskId,
          stepIndex,
          error: error.message,
          timestamp: Date.now()
        });
        throw error;
      }
      
      return result;
    };
    
    // Similarly enhance browser query execution
    taskPlan.executeBrowserQuery = async (args, stepIndex) => {
      // Check if we have step-specific updates
      this._applyStepUpdateIfAvailable(taskPlan, stepIndex, args);
      
      // Emit execution start event
      this.emit('plan:stepExecutionStarted', {
        taskId,
        stepIndex,
        type: 'query',
        args,
        timestamp: Date.now()
      });
      
      // Execute the original method
      let result;
      try {
        result = await originalExecuteBrowserQuery.call(taskPlan, args, stepIndex);
        
        // Emit completion event
        this.emit('plan:stepExecutionCompleted', {
          taskId,
          stepIndex,
          success: result?.success || false,
          result,
          timestamp: Date.now()
        });
      } catch (error) {
        // Emit failure event
        this.emit('plan:stepExecutionFailed', {
          taskId,
          stepIndex,
          error: error.message,
          timestamp: Date.now()
        });
        throw error;
      }
      
      return result;
    };
  }

  /**
   * Apply step-specific updates if available
   * @private
   */
  _applyStepUpdateIfAvailable(taskPlan, stepIndex, args) {
    const taskId = taskPlan.taskId;
    if (!this.stepUpdates.has(taskId)) return;
    
    const updates = this.stepUpdates.get(taskId);
    const updateForStep = updates.find(u => u.stepIndex === stepIndex);
    
    if (updateForStep) {
      console.log(`[TaskPlanAdapter] Applying update for step ${stepIndex}: ${updateForStep.newCommand}`);
      
      // Apply the update
      if (args.instruction) {
        args.instruction = updateForStep.newCommand;
      } else if (args.query) {
        args.query = updateForStep.newCommand;
      } else {
        // If no clear field to update, add the command to both
        args.instruction = updateForStep.newCommand;
        args.query = updateForStep.newCommand;
      }
      
      // Remove this update
      const updatedStepUpdates = updates.filter(u => u.stepIndex !== stepIndex);
      if (updatedStepUpdates.length > 0) {
        this.stepUpdates.set(taskId, updatedStepUpdates);
      } else {
        this.stepUpdates.delete(taskId);
      }
    }
  }

  /**
   * Update the command for a specific step before it executes
   * @param {string} taskId - Task identifier
   * @param {number} stepIndex - Index of the step to update
   * @param {string} newCommand - New command to execute
   */
  updateStepCommand(taskId, stepIndex, newCommand) {
    if (!this.activePlans.has(taskId)) {
      console.warn(`[TaskPlanAdapter] Cannot update step for unknown task: ${taskId}`);
      return false;
    }
    
    if (!this.stepUpdates.has(taskId)) {
      this.stepUpdates.set(taskId, []);
    }
    
    this.stepUpdates.get(taskId).push({
      stepIndex, 
      newCommand,
      timestamp: Date.now()
    });
    
    this.emit('plan:stepUpdateQueued', {
      taskId,
      stepIndex,
      newCommand,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Update the next command that will be used for the task
   * @param {string} taskId - Task identifier
   * @param {string} newCommand - New command to use for next steps
   * @param {string} reason - Reason for the update
   */
  updateTaskCommand(taskId, newCommand, reason = 'optimization') {
    if (!this.activePlans.has(taskId)) {
      console.warn(`[TaskPlanAdapter] Cannot update command for unknown task: ${taskId}`);
      return false;
    }
    
    // Store the command update for the next createStep call
    this.commandUpdates.set(taskId, {
      newCommand,
      reason,
      timestamp: Date.now()
    });
    
    const planInfo = this.activePlans.get(taskId);
    if (planInfo && planInfo.plan) {
      // Try to update the plan's prompt directly
      planInfo.plan.prompt = newCommand;
    }
    
    this.emit('plan:commandUpdated', {
      taskId,
      newCommand,
      reason,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Optimize a natural language command for direct execution
   * @param {string} command The original user command
   * @returns {string} Optimized command for direct execution
   */
  optimizeCommandForExecution(command) {
    // Remove any prefixes like "I want to" or "Please"
    let optimizedCommand = command
      .replace(/^(please|can you|i want to|i would like to|could you)\s+/i, '')
      .replace(/\s+for me\.?$/i, '');
      
    // Convert questions to commands when appropriate
    optimizedCommand = optimizedCommand
      .replace(/^can you (.*?)\??$/i, '$1')
      .replace(/^could you (.*?)\??$/i, '$1')
      .replace(/^would you (.*?)\??$/i, '$1');
    
    // Ensure command starts with action verb if possible
    if (!/^(go|navigate|visit|open|search|find|click|type|enter|select|check|submit)/i.test(optimizedCommand)) {
      // If it doesn't start with a common action verb, check if we need to add one
      if (/^(to|on|at|the)\s/i.test(optimizedCommand)) {
        optimizedCommand = `go ${optimizedCommand}`;
      }
    }
    
    return optimizedCommand;
  }

  /**
   * Unregister a task plan
   * @param {string} taskId - Task identifier 
   */
  unregisterTaskPlan(taskId) {
    if (!this.activePlans.has(taskId)) return false;
    
    this.activePlans.delete(taskId);
    this.commandUpdates.delete(taskId);
    this.stepUpdates.delete(taskId);
    
    this.emit('plan:unregistered', {
      taskId,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Get all registered task plans
   */
  getRegisteredPlans() {
    return Array.from(this.activePlans.entries()).map(([taskId, info]) => ({
      taskId,
      sessionId: info.sessionId,
      userId: info.plan.userId,
      prompt: info.plan.prompt,
      originalPrompt: info.originalPrompt,
      currentStepIndex: info.plan.currentStepIndex,
      steps: info.plan.steps.length,
      registeredAt: info.registeredAt
    }));
  }
}

// Create a singleton instance
const taskPlanAdapter = new TaskPlanAdapter();

export default taskPlanAdapter;
