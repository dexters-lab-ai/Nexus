// src/api/tasks.js
import { get, post, put, del } from '../utils/api-helpers.js';

// Fetch all active tasks
export async function getActiveTasks() {
  return get('/tasks/active');
}

// Cancel a task by ID
export async function cancelTask(taskId) {
  return del(`/tasks/${taskId}`);
}

// Create a new task
export async function createTask(command, url, options = {}) {
  // Build request payload
  const payload = {
    command,
    url,
    ...options
  };
  
  return post('/tasks', payload);
}

// Get YAML map execution details
export async function getYamlMapExecutionDetails(taskId) {
  return get(`/tasks/${taskId}/yaml-execution`);
}

// Get execution report for a completed YAML map task
export async function getYamlMapReport(taskId) {
  return get(`/tasks/${taskId}/report`);
}

// Update progress on a task
export async function updateTaskProgress(taskId, progress) {
  return put(`/tasks/${taskId}/progress`, { progress });
}
