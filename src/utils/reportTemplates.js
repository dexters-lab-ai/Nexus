/**
 * Report Templates and Utilities
 * Contains functions for generating properly formatted HTML report templates for Midscene
 */

/**
 * Fix improperly formatted HTML in Midscene reports
 * @param {string} htmlContent - The original HTML content
 * @returns {string} Fixed HTML content
 */
export function fixReportHtml(htmlContent) {
  if (!htmlContent) return htmlContent;
  
  // Replace Midscene logo with custom logo
  let fixedHtml = htmlContent.replace(
    /<div class="logo"><img alt="Midscene_logo" src="https:\/\/lf3-static\.bytednsdoc\.com\/obj\/eden-cn\/vhaeh7vhabf\/Midscene\.png"><\/div>/g,
    '<div class="logo"><img alt="Operator Logo" src="/logo.svg" style="height: 60px; filter: drop-shadow(0 0 8px rgba(93, 63, 211, 0.8)) drop-shadow(0 0 12px rgba(41, 17, 122, 0.6));"></div>'
  );

  // Also handle other variations of the Midscene logo
  fixedHtml = fixedHtml.replace(
    /<img[^>]*alt="Midscene_logo"[^>]*>/g,
    '<img alt="Operator Logo" src="/logo.svg" style="height: 60px; filter: drop-shadow(0 0 8px rgba(93, 63, 211, 0.8)) drop-shadow(0 0 12px rgba(41, 17, 122, 0.6));">'
  );
  
  // Comprehensive fix for HTML5 void elements
  // List of all HTML5 void elements that should not have closing tags
  const voidElements = [
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ];
  
  // Aggressive approach to fix void elements
  let fixedHtml2 = fixedHtml;
  
  // 1. First, remove any explicit closing tags for void elements
  voidElements.forEach(tag => {
    // Match and remove all closing void tags
    const closingTagPattern = new RegExp(`<\/${tag}>`, 'gi');
    fixedHtml2 = fixedHtml2.replace(closingTagPattern, '');
  });
  
  // 2. Then fix any self-closing syntax to be standard HTML5
  voidElements.forEach(tag => {
    // Convert XML-style self-closing tags to standard HTML5 void elements
    // <meta ... /> becomes <meta ...>
    const selfClosingPattern = new RegExp(`<${tag}([^>]*?)\s*\/>`, 'gi');
    fixedHtml2 = fixedHtml2.replace(selfClosingPattern, `<${tag}$1>`);
  });
  
  // 3. Fix incorrectly formatted meta tags with additional errors
  fixedHtml2 = fixedHtml2
    // Fix cases where meta tags have additional content
    .replace(/(<meta[^>]*>)[\s\S]*?(?=<\/meta>|<meta|<\w+)/gi, '$1')
    
    // Fix missing alt attributes in images
    .replace(/(<img[^>]*?)(?!\salt=)[^>]*?>/gi, '$1 alt="">');  
  
  // 4. Make sure script tags have proper content and fix control characters
  fixedHtml2 = fixedHtml2
    // Fix malformed script type attributes
    .replace(/<script([^>]*)type="module>"([^>]*)>/gi, '<script$1type="module"$2>')
    // Fix type attribute with an unclosed quote (e.g. type="module> or type='module>)
    .replace(/<script([^>]*)type=["']module>["']?([^>]*)>/gi, '<script$1type="module"$2>')
    // Fix any type attribute with an extra > inside the value
    .replace(/<script([^>]*)type=(["'])([^"'>]+)>\2([^>]*)>/gi, '<script$1type=$2$3$2$4>')
    // Remove control characters from script content
    .replace(/<script([^>]*)>([\x00-\x08\x0B\x0C\x0E-\x1F]+)/g, '<script$1>')
    // Fix double closing brackets on script tags
    .replace(/<script([^>]*)>>/gi, '<script$1>')
    // Fix script tags that aren't properly closed
    .replace(/<\/script</gi, '</script><')
    // Wrap script content in CDATA if it contains HTML-conflicting characters
    .replace(/<script([^>]*)>([^<]*?)(<\/script>)/gi, (match, attrs, content, endTag) => {
      // First remove any control characters
      content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      
      if (content.includes('<') || content.includes('&')) {
        return `<script${attrs}>/*<![CDATA[*/${content}/*]]>*/</script>`;
      }
      return `<script${attrs}>${content}</script>`;
    });

  // 5. Fix broken srcset attributes that might contain commas and spaces
  fixedHtml2 = fixedHtml2
    .replace(/srcset="([^"]*?)"/gi, (match, srcset) => {
      // Escape any characters that might interfere with HTML parsing
      return `srcset="${srcset.replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
    });
  
  return fixedHtml2;
}

/**
 * Apply a fixed report template to existing report content
 * @param {string} originalContent - Original HTML content
 * @returns {string} HTML content with fixed template applied
 */
export function applyFixedReportTemplate(originalContent) {
  // First fix any self-closing tags
  const fixedContent = fixReportHtml(originalContent);
  
  // Then extract the main content section
  let bodyContent = '';
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(fixedContent);
  if (bodyMatch && bodyMatch[1]) {
    bodyContent = bodyMatch[1];
  } else {
    // If no body found, use the entire content
    bodyContent = fixedContent;
  }
  
  // Extract title if available
  let title = 'Midscene Report';
  const titleMatch = /<title>([^<]*)<\/title>/i.exec(fixedContent);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1];
  }
  
  // Apply our template with the extracted content
  return generateReportTemplate(
    {
      title,
      description: 'Midscene execution report',
      timestamp: new Date().toISOString()
    },
    'execution'
  ).replace('<div id="content-placeholder"></div>', bodyContent);
}

/**
 * Generates a modern, futuristic HTML template for Midscene reports
 * @param {Object} data - Report data
 * @param {string} reportType - Type of report (e.g., 'web', 'task', etc.)
 * @returns {string} HTML template
 */
export function generateReportTemplate(data, reportType) {
  const title = data?.title || `${reportType.toUpperCase()} Report`;
  const timestamp = data?.timestamp || new Date().toISOString();
  const description = data?.description || '';
  
  // Create HTML5-compliant template with proper self-closing tags
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <meta name="description" content="${description}">
  <link rel="icon" href="/assets/images/dail-fav.png" type="image/png" sizes="32x32">
  <title>${title} | Nexus</title>
  <style>
    /* Modern, futuristic styling - Updated for OPERATOR UI */
    :root {
      --primary: #4e6fff;
      --secondary: #8a4fff;
      --accent: #ff4b8a;
      --background: #0a0c14;
      --card-bg: #1a1d2d;
      --text: #e3e5fc;
      --text-secondary: #a9adc7;
      --border: #2a2d3d;
      --success: #4caf50;
      --warning: #ff9800;
      --error: #f44336;
      --glow-primary: 0 0 15px rgba(78, 111, 255, 0.5);
      --glow-accent: 0 0 15px rgba(255, 75, 138, 0.5);
      --header-gradient: linear-gradient(135deg, var(--primary), var(--secondary));
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      background: linear-gradient(135deg, var(--background), #141b29);
      color: var(--text);
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      padding: 0;
      margin: 0;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 30px;
      animation: fadeIn 0.5s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(78, 111, 255, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(78, 111, 255, 0); }
      100% { box-shadow: 0 0 0 0 rgba(78, 111, 255, 0); }
    }
    
    header {
      background: linear-gradient(135deg, #1a1f36, #2a3152);
      padding: 25px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      position: relative;
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 30px;
    }
    
    header::before {
      content: '';
      position: absolute;
      top: -50px;
      right: -50px;
      width: 250px;
      height: 250px;
      background: radial-gradient(circle, rgba(78, 111, 255, 0.15), transparent 70%);
      border-radius: 50%;
      z-index: 0;
    }
    
    header::after {
      content: '';
      position: absolute;
      bottom: -30px;
      left: -30px;
      width: 150px;
      height: 150px;
      background: radial-gradient(circle, rgba(255, 75, 138, 0.15), transparent 70%);
      border-radius: 50%;
      z-index: 0;
    }
    
    .header-content {
      position: relative;
      z-index: 1;
      animation: slideUp 0.6s ease-out;
    }
    
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0;
      letter-spacing: 0.5px;
      background: linear-gradient(90deg, #fff, #a9adc7);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    h2 {
      font-size: 24px;
      margin: 1.5rem 0 1rem;
      color: var(--primary);
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    h2::before {
      content: '💡';
      font-size: 24px;
    }
    
    h3 {
      font-size: 20px;
      margin: 1.2rem 0 0.8rem;
      color: var(--secondary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    h3::before {
      content: '📊';
      font-size: 18px;
    }
    
    p {
      margin-bottom: 1rem;
      line-height: 1.8;
    }
    
    .timestamp {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-top: 8px;
    }
    
    .description {
      margin-top: 10px;
      font-size: 1rem;
      max-width: 600px;
      opacity: 0.8;
    }
    
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.3s ease;
      box-shadow: var(--glow-primary);
      letter-spacing: 0.5px;
    }
    
    .btn:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-2px);
    }
    
    .btn-primary {
      background: var(--primary);
    }
    
    .btn-primary:hover {
      background: var(--secondary);
    }
    
    .card {
      background: var(--card-bg);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      border: 1px solid var(--border);
    }
    
    .task {
      margin-bottom: 30px;
    }
    
    .task-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }
    
    .task-name {
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--text);
    }
    
    .task-status {
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    
    .status-success {
      background: rgba(76, 175, 80, 0.2);
      color: var(--success);
    }
    
    .status-error {
      background: rgba(244, 67, 54, 0.2);
      color: var(--error);
    }
    
    .steps {
      display: flex;
      flex-direction: column;
      gap: 15px;
      margin-top: 20px;
    }
    
    .step {
      position: relative;
      padding-left: 30px;
      padding-bottom: 15px;
      border-left: 2px dashed var(--border);
    }
    
    .step::before {
      content: '';
      position: absolute;
      left: -8px;
      top: 0;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--primary);
    }
    
    .step:last-child {
      border-left: none;
    }
    
    .step-content {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 15px;
    }
    
    .step-title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    .screenshot {
      width: 100%;
      border-radius: 8px;
      margin: 15px 0;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border);
    }
    
    .result {
      background: rgba(78, 111, 255, 0.1);
      border-left: 3px solid var(--primary);
      padding: 15px;
      border-radius: 8px;
      margin-top: 15px;
    }
    
    .error {
      background: rgba(244, 67, 54, 0.1);
      border-left: 3px solid var(--error);
      padding: 15px;
      border-radius: 8px;
      margin-top: 15px;
    }
    
    footer {
      margin-top: 50px;
      padding: 20px;
      text-align: center;
      font-size: 0.9rem;
      color: var(--text-secondary);
      border-top: 1px solid var(--border);
    }
    
    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .container {
      animation: fadeIn 0.3s ease-in-out;
    }
    
    .card {
      animation: slideUp 0.3s ease-in-out;
      animation-fill-mode: both;
    }
    
    .card:nth-child(1) { animation-delay: 0.1s; }
    .card:nth-child(2) { animation-delay: 0.2s; }
    .card:nth-child(3) { animation-delay: 0.3s; }
    
    /* Responsive */
    @media (max-width: 768px) {
      .container {
        padding: 10px;
      }
      
      header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
      
      .actions {
        display: flex;
        gap: 10px;
      }
      
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 20px;
        background: rgba(255, 255, 255, 0.15);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.2s ease;
      }
      
      .btn:hover {
        background: rgba(255, 255, 255, 0.25);
        transform: translateY(-2px);
      }
      
      .btn-primary {
        background: var(--primary);
      }
      
      .btn-primary:hover {
        background: var(--secondary);
      }
      
      .card {
        background: var(--card-bg);
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--border);
      }
      
      .task {
        margin-bottom: 30px;
      }
      
      .task-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--border);
      }
      
      .task-name {
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--text);
      }
      
      .task-status {
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 500;
      }
      
      .status-success {
        background: rgba(76, 175, 80, 0.2);
        color: var(--success);
      }
      
      .status-error {
        background: rgba(244, 67, 54, 0.2);
        color: var(--error);
      }
      
      .steps {
        display: flex;
        flex-direction: column;
        gap: 15px;
        margin-top: 20px;
      }
      
      .step {
        position: relative;
        padding-left: 30px;
        padding-bottom: 15px;
        border-left: 2px dashed var(--border);
      }
      
      .step::before {
        content: '';
        position: absolute;
        left: -8px;
        top: 0;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--primary);
      }
      
      .step:last-child {
        border-left: none;
      }
      
      .step-content {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 15px;
      }
      
      .step-title {
        font-weight: 600;
        margin-bottom: 8px;
      }
      
      .screenshot {
        width: 100%;
        border-radius: 8px;
        margin: 15px 0;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        border: 1px solid var(--border);
      }
      
      .result {
        background: rgba(78, 111, 255, 0.1);
        border-left: 3px solid var(--primary);
        padding: 15px;
        border-radius: 8px;
        margin-top: 15px;
      }
      
      .error {
        background: rgba(244, 67, 54, 0.1);
        border-left: 3px solid var(--error);
        padding: 15px;
        border-radius: 8px;
        margin-top: 15px;
      }
      
      footer {
        margin-top: 50px;
        padding: 20px;
        text-align: center;
        font-size: 0.9rem;
        color: var(--text-secondary);
        border-top: 1px solid var(--border);
      }
      
      /* Animations */
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      .container {
        animation: fadeIn 0.3s ease-in-out;
      }
      
      .card {
        animation: slideUp 0.3s ease-in-out;
        animation-fill-mode: both;
      }
      
      .card:nth-child(1) { animation-delay: 0.1s; }
      .card:nth-child(2) { animation-delay: 0.2s; }
      .card:nth-child(3) { animation-delay: 0.3s; }
      
      /* Responsive */
      @media (max-width: 768px) {
        .container {
          padding: 10px;
        }
        
        header {
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
        
        .actions {
          width: 100%;
          justify-content: flex-start;
        }
      }
    }
    </style>
  </head>
  <body>
    <header>
      <div class="header-content">
        <h1>${data.title}</h1>
        <div class="timestamp">${new Date(data.timestamp).toLocaleString()}</div>
        <p class="description">${data.description}</p>
      </div>
    </header>
    
    <main class="main-content">
      <div class="card information">
        <h3>Report Information</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Generated:</span>
            <span class="value">${new Date(data.timestamp).toLocaleString()}</span>
          </div>
          <div class="info-item">
            <span class="label">Type:</span>
            <span class="value">${reportType.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <!-- Content placeholder for dynamic report content -->
      <div id="content-placeholder"></div>
      <!-- Tasks section to be populated -->
      <div id="tasks-container">
      </div>
    </main>
    
    <footer>
      <p>Generated by Nexus at ${new Date(data.timestamp).toLocaleString()}</p>
    </footer>
  </div>
</body>
</html>`;
}

// These functions were duplicated - removed the second definitions

/**
 * Generate a brand new report from raw data
 * @param {Object} data - Report data
 * @param {string} reportType - Type of report
 * @returns {string} Complete HTML report
 */
export function generateCompleteReport(data, reportType) {
  const template = generateReportTemplate(data, reportType);
  
  // Format and insert task details
  let tasksHtml = '';
  
  if (data.tasks && Array.isArray(data.tasks)) {
    data.tasks.forEach(task => {
      let stepsHtml = '';
      
      if (task.steps && Array.isArray(task.steps)) {
        task.steps.forEach(step => {
          stepsHtml += `
          <div class="step">
            <div class="step-content">
              <div class="step-title">${step.name || 'Step'}</div>
              <p>${step.description || ''}</p>
              ${step.screenshot ? `<img src="${step.screenshot}" alt="Screenshot" class="screenshot">` : ''}
              ${step.result ? `<div class="result">${step.result}</div>` : ''}
              ${step.error ? `<div class="error">${step.error}</div>` : ''}
            </div>
          </div>`;
        });
      }
      
      tasksHtml += `
      <div class="task card">
        <div class="task-header">
          <div class="task-name">${task.name || 'Task'}</div>
          <div class="task-status status-${task.status === 'success' ? 'success' : 'error'}">${task.status || 'Unknown'}</div>
        </div>
        <p>${task.description || ''}</p>
        <div class="steps">
          ${stepsHtml}
        </div>
      </div>`;
    });
  }
  
  // Insert tasks HTML into the template
  return template.replace('<div id="tasks-container">', `<div id="tasks-container">${tasksHtml}`);
}

// Export the utility functions
export default {
  generateReportTemplate,
  fixReportHtml,
  applyFixedReportTemplate,
  generateCompleteReport
};
