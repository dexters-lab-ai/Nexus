/**
 * TaskProcessorAdapter - Connects processTask to the TaskEventBus
 * 
 * This module wraps around the existing processTask function to:
 * 1. Emit events during task execution
 * 2. Listen for command updates
 * 3. Enable real-time adjustments to task steps
 */

import taskEventBus from './TaskEventBus.js';

/**
 * Enhance processTask with real-time feedback capabilities
 * @param {Function} originalProcessTask - The original processTask function
 * @returns {Function} Enhanced processTask function with real-time feedback
 */
function enhanceProcessTask(originalProcessTask) {
  return async function* enhancedProcessTask(userId, userEmail, taskId, runId, runDir, command, url, engine, sessionId) {
    console.log(`[TaskProcessorAdapter] Enhancing task execution for ${taskId} with command: ${command}`);
    
    // Register task if not already registered
    if (!taskEventBus.getTaskStatus(taskId)) {
      taskEventBus.registerTask(taskId, userId, command, sessionId);
      taskEventBus.startTask(taskId);
    }
    
    // Set up step tracking
    let currentStep = 0;
    let currentPhase = 'initialization';
    let stepDescription = '';
    let stepCommand = command;
    
    // Track parsing of multi-step commands
    let isParsingSteps = false;
    let detectedSteps = [];
    
    // Yield start event and track it in the event bus
    yield {
      event: 'taskStart',
      taskId,
      command,
      timestamp: Date.now()
    };
    
    try {
      // Intercept and enhance task execution
      for await (const event of originalProcessTask(userId, userEmail, taskId, runId, runDir, command, url, engine, sessionId)) {
        // Always pass through the original events
        yield event;
        
        // Parse and track task progress
        if (event.event === 'thought' && event.text) {
          // Look for step indicators in thoughts
          if (event.text.includes('Step ') || event.text.includes('step ')) {
            // Possible step description
            const stepMatch = event.text.match(/Step\s+(\d+)(?:\/\d+)?:\s+(.+?)(?:\n|$)/i);
            if (stepMatch) {
              const stepNumber = parseInt(stepMatch[1]);
              stepDescription = stepMatch[2].trim();
              
              // Record the step
              taskEventBus.addTaskStep(taskId, stepDescription, stepCommand);
              taskEventBus.startTaskStep(taskId, currentStep);
              
              currentStep = stepNumber - 1; // zero-indexed
              currentPhase = 'executing_step';
              
              console.log(`[TaskProcessorAdapter] Detected Step ${stepNumber}: ${stepDescription}`);
            }
          }
          
          // Look for step completion indicators
          if (currentPhase === 'executing_step' && 
             (event.text.includes('✅') || 
              event.text.toLowerCase().includes('completed') || 
              event.text.toLowerCase().includes('finished'))) {
            
            // Extract result from completion message
            const resultText = event.text.replace(/✅.+?Completed step \d+:.+?\n/i, '').trim();
            taskEventBus.completeTaskStep(taskId, currentStep, resultText);
            
            // Check if there are any pending updates for the next step
            const nextStepIndex = currentStep + 1;
            const pendingUpdate = taskEventBus.getStepUpdate(taskId, nextStepIndex);
            
            if (pendingUpdate) {
              console.log(`[TaskProcessorAdapter] Applying pending update for step ${nextStepIndex}: ${pendingUpdate.newCommand}`);
              stepCommand = pendingUpdate.newCommand;
              
              // Emit a notification about the command adjustment
              yield {
                event: 'thought',
                taskId,
                text: `📝 Optimizing next step with updated command based on previous results`
              };
            }
            
            currentPhase = 'step_completed';
          }
          
          // Look for failure indicators
          if (event.text.includes('❌') || 
              event.text.toLowerCase().includes('failed') || 
              event.text.toLowerCase().includes('error')) {
            
            const errorText = event.text.replace(/❌.+?Failed step \d+:.+?\n/i, '').trim();
            taskEventBus.failTaskStep(taskId, currentStep, errorText);
            currentPhase = 'step_failed';
          }
        }
        
        // Track final results
        if (event.event === 'final_result') {
          taskEventBus.completeTask(taskId, !event.hasFailedSteps, event.result);
        }
      }
      
      // Mark task as completed if not already done
      if (taskEventBus.getTaskStatus(taskId)?.status !== 'completed') {
        taskEventBus.completeTask(taskId, true, 'Task execution completed');
      }
      
    } catch (error) {
      console.error(`[TaskProcessorAdapter] Error in task execution:`, error);
      
      // Mark current step as failed
      if (currentPhase === 'executing_step') {
        taskEventBus.failTaskStep(taskId, currentStep, error.message);
      }
      
      // Mark task as failed
      taskEventBus.completeTask(taskId, false, error.message);
      
      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Wrap the command processing to optimize for direct automation
 * @param {string} command The original user command
 * @returns {string} Optimized command for direct execution
 */
function optimizeCommandForExecution(command) {
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
 * Get optimized command for the next step based on previous results
 * @param {string} taskId Task identifier
 * @param {number} nextStepIndex Index of the next step
 * @param {string} defaultCommand Default command to use
 * @returns {string} Optimized command for the next step
 */
function getOptimizedNextStepCommand(taskId, nextStepIndex, defaultCommand) {
  const taskStatus = taskEventBus.getTaskStatus(taskId);
  if (!taskStatus) return defaultCommand;
  
  // Get all completed steps
  const steps = taskEventBus.getTaskSteps(taskId);
  const completedSteps = steps.filter(s => s.status === 'completed' && s.index < nextStepIndex);
  
  // Check if there's a pending update for this step
  const pendingUpdate = taskEventBus.getStepUpdate(taskId, nextStepIndex);
  if (pendingUpdate) {
    return pendingUpdate.newCommand;
  }
  
  // If we have previous steps with results, we could analyze them to optimize the command
  // This would typically involve NLP/AI to interpret the results and modify commands
  // For now, we'll just return the default command
  return defaultCommand;
}

// Export utility functions
export {
  enhanceProcessTask,
  optimizeCommandForExecution,
  getOptimizedNextStepCommand,
  taskEventBus
};
