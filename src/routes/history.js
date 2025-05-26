// src/routes/history.js
import express         from 'express';
import Task            from '../models/Task.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

/**
 * GET /history
 * Fetch paginated history of completed tasks
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    console.time('history-api'); // Add performance timing
    
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const skip  = (page - 1) * limit;
    const userId = req.session.user;
    
    // For initial page load, use a smaller limit to speed up first render
    const initialLoad = req.query.initial === 'true';
    const effectiveLimit = initialLoad ? Math.min(10, limit) : limit;
    
    // Use Promise.all to run the count and find queries in parallel
    const [totalItems, tasks] = await Promise.all([
      // Only count if not on the first page or if total is explicitly requested
      (page === 1 && !req.query.includeTotal) ? 
        Promise.resolve(null) : // Skip count for initial faster load
        Task.countDocuments({ userId, status: 'completed' }),
      
      // Use projection to limit fields returned - only get what's needed
      Task.find(
        { userId, status: 'completed' },
        { // Project only fields we need
          prompt: 1,
          command: 1,
          status: 1,
          createdAt: 1,
          endTime: 1,
          tags: 1,
          type: 1,
          summary: 1, // Top level summary field
          yamlMapName: 1, // For YAML tasks
          screenshotPath: 1, // Top level screenshot path
          screenshotUrl: 1, // Top level screenshot URL
          'result.landingReportUrl': 1,
          'result.nexusReportUrl': 1,
          'result.primaryReportUrl': 1,
          'result.reportUrl': 1,
          'result.summaryText': 1,
          'result.screenshotUrl': 1,
          'result.screenshotPath': 1, // Add the screenshot path from result
          'result.screenshot': 1,
          'result.aiSummary': 1, // Add AI summary from result
          'result.yamlMapName': 1 // YAML task name
        }
      )
        .sort({ endTime: -1 })
        .skip(skip)
        .limit(effectiveLimit)
        .lean()
    ]);

    // More efficient mapping function using destructuring and avoiding repeated lookups
    const formattedTasks = tasks.map(task => {
      // Extract common properties to avoid repeated lookups
      const { _id, createdAt, endTime, prompt, command, status, tags = [], type = 'task', 
              result = {}, summary, yamlMapName, screenshotPath, screenshotUrl, screenshot: taskScreenshot } = task;
      
      // Get screenshot from the most efficient source - check all possible locations
      const screenshot = 
        // First check top-level fields that may have been directly set
        taskScreenshot ||
        screenshotUrl || 
        screenshotPath ||
        // Then check nested result fields
        result.screenshotUrl || 
        result.screenshotPath ||
        result.screenshot ||
        // For YAML tasks, specifically check these paths
        (result.intermediateResults && result.intermediateResults.length > 0 && 
          (result.intermediateResults[0]?.screenshot || result.intermediateResults[0]?.screenshotPath || 
           result.intermediateResults[0]?.screenshotUrl)) ||
        // Check the steps which might contain screenshots (improved step checking)
        (result.steps && result.steps.length > 0 && (
          // First try to find a step with a screenshot property
          result.steps.find(step => step?.screenshot)?.screenshot ||
          // Then try to find a step with a screenshotPath property
          result.steps.find(step => step?.screenshotPath)?.screenshotPath ||
          // Then try to find a step with a screenshotUrl property
          result.steps.find(step => step?.screenshotUrl)?.screenshotUrl ||
          // If all else fails, check if the last step has a useful screenshot
          (result.steps[result.steps.length - 1]?.screenshot || 
           result.steps[result.steps.length - 1]?.screenshotPath || 
           result.steps[result.steps.length - 1]?.screenshotUrl)
        )) ||
        null;
      
      // Log screenshot debugging info for troubleshooting
      console.log('Processing history item:', JSON.stringify({
        id: _id,
        type,
        foundScreenshot: !!screenshot,
        screenshotSource: taskScreenshot ? 'task.screenshot' :
                         screenshotUrl ? 'task.screenshotUrl' :
                         screenshotPath ? 'task.screenshotPath' :
                         result.screenshotUrl ? 'result.screenshotUrl' :
                         result.screenshotPath ? 'result.screenshotPath' :
                         result.screenshot ? 'result.screenshot' :
                         'not found'
      }));
      
      // Process the final summary text, focusing on YAML tasks which have special format
      let taskSummary;
      
      // Special handling for YAML tasks
      if (prompt?.startsWith('/yaml') || (result && result.yamlMapName)) {
        // Use the result message from YAML task execution
        taskSummary = 
          summary || 
          result.aiSummary || 
          cleanResultMessage(result, yamlMapName || result.yamlMapName);
      } else {
        // Regular tasks
        taskSummary = 
          summary ||
          result.aiSummary ||
          result.summaryText ||
          'No description available';
      }
      
      // Helper function to extract a clean message from YAML result
      function cleanResultMessage(result, mapName) {
        // If we have a map name, use it
        if (mapName) {
          // First try to get a more specific description from executionResult if available
          if (result.executionResult) {
            try {
              const execResult = typeof result.executionResult === 'string' 
                ? JSON.parse(result.executionResult) 
                : result.executionResult;
                
              // Look for a description field in the execution result
              if (execResult['0'] && execResult['0'].description) {
                return execResult['0'].description;
              }
              
              // Check for any description in the result object
              for (const key in execResult) {
                if (execResult[key] && typeof execResult[key] === 'object' && execResult[key].description) {
                  return execResult[key].description;
                }
              }
            } catch (e) {
              // If parsing fails, continue with the default message
            }
          }
          
          return `YAML map ${mapName} executed successfully`;
        }
        
        return 'YAML task executed successfully';
      }
      
      return {
        id: _id,
        date: createdAt || endTime,
        title: (prompt?.substring(0, 50) || command || 'Untitled Task'),
        status,
        tags,
        type,
        // Only include essential data for the history list
        landingReportUrl: result.landingReportUrl || null,
        nexusReportUrl: result.nexusReportUrl || null,
        reportUrl: result.primaryReportUrl || result.reportUrl || null,
        summary: taskSummary,
        screenshot
      };
    });
    
    // Construct efficient response
    const response = {
      items: formattedTasks,
      currentPage: page,
    };
    
    // Only include pagination data if we have it
    // (We skip the count for initial page load to make it faster)
    if (totalItems !== null) {
      response.totalItems = totalItems;
      response.totalPages = Math.ceil(totalItems / limit);
    }
    
    console.timeEnd('history-api'); // End timing and log performance
    res.json(response);
  } catch (err) {
    console.error('History fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /history/:id
 * Fetch specific task details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.session.user
    }).lean();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      _id: task._id,
      url: task.url || 'Unknown URL',
      command: task.command,
      timestamp: task.endTime,
      status: task.status,
      error: task.error,
      subTasks: task.subTasks,
      intermediateResults: task.intermediateResults || [],
      result: task.result || {},
      landingReportUrl: task.result?.landingReportUrl || null,
      nexusReportUrl: task.result?.nexusReportUrl || null,
      runReport: task.result?.runReport || null,
      errorReportUrl: task.result?.errorReportUrl || null
    });
  } catch (err) {
    console.error('History item error:', err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

/**
 * DELETE /history/:id
 * Delete a specific task from history
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { deletedCount } = await Task.deleteOne({
      _id: req.params.id,
      userId: req.session.user
    });

    if (!deletedCount) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete history item error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /history
 * Delete all completed tasks from user's history
 */
router.delete('/', requireAuth, async (req, res) => {
  try {
    await Task.deleteMany({
      userId: req.session.user,
      status: 'completed'
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Clear history error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
