/**
 * GuideOverlay.jsx - Enhanced Guide Component for O.P.E.R.A.T.O.R
 * A comprehensive and user-friendly guide with tabbed interface
 */

import { eventBus } from '../utils/events.js';
import { version } from '../../package.json';

// Import guide overlay styles
function importGuideStyles() {
  // First, remove any existing guide theme
  const existingLink = document.getElementById('guide-overlay-styles');
  if (existingLink) existingLink.remove();
  
  // Determine the correct path based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  const cssHref = isProduction 
    ? '/css/components/guide-overlay.css' 
    : '/src/styles/components/guide-overlay.css';
  
  // Add new theme
  const themeLink = document.createElement('link');
  themeLink.id = 'guide-overlay-styles';
  themeLink.rel = 'stylesheet';
  themeLink.href = cssHref;
  document.head.appendChild(themeLink);
  
  if (!isProduction) {
    console.log('[GuideOverlay] Loading CSS from:', cssHref);
  }
}

// Import the styles when this file is loaded
importGuideStyles();

// Create a singleton instance
let guideOverlayInstance = null;

// Factory function to get or create the instance
export function getGuideOverlay() {
  if (!guideOverlayInstance) {
    guideOverlayInstance = new GuideOverlay();
  }
  return guideOverlayInstance;
}

class GuideOverlay {
  constructor() {
    this.isVisible = false;
    this.activeTab = 'main';
    this.containerId = 'guide-overlay';
    this.overlay = null;
    this.container = null;
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }
  
  initialize() {
    // Create container if it doesn't exist
    this.container = document.createElement('div');
    this.container.id = this.containerId + '-container';
    
    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.className = 'guide-overlay';
    this.overlay.id = this.containerId;
    
    // Create main content
    const content = this.createContent();
    this.overlay.appendChild(content);
    
    // Add to DOM
    this.container.appendChild(this.overlay);
    document.body.appendChild(this.container);
    
    // Setup event listeners
    this.setupEventListeners();
  }
  
  createContent() {
    const content = document.createElement('div');
    content.className = 'guide-container';
    
    // Header
    const header = document.createElement('div')
    header.className = 'guide-header';
    
    header.innerHTML = `
      <h2>O.P.E.R.A.T.O.R Guide <span class="version-badge">v${version}</span></h2>
      <button class="close-btn">&times;</button>
    `;
    
    // Tabs navigation
    const tabsNav = document.createElement('div');
    tabsNav.className = 'guide-tabs-nav';
    tabsNav.innerHTML = `
      <button class="tab-btn active" data-tab="main">Main</button>
      <button class="tab-btn" data-tab="getting-started">Getting Started</button>
      <button class="tab-btn" data-tab="tasks">Task Management</button>
      <button class="tab-btn" data-tab="llm">LLM Engines</button>
      <button class="tab-btn" data-tab="advanced">Advanced Features</button>
      <button class="tab-btn" data-tab="tips">Tips & Tricks</button>
      <button class="tab-btn" data-tab="devices">Device Connections</button>
    `;
    
    // Tabs content container
    const tabsContent = document.createElement('div');
    tabsContent.className = 'guide-tabs-content';
    
    // Create each tab content
    const mainTab = this.createMainTab();
    const gettingStartedTab = this.createGettingStartedTab();
    const tasksTab = this.createTasksTab();
    const llmTab = this.createLLMTab();
    const advancedTab = this.createAdvancedTab();
    const tipsTab = this.createTipsTab();
    const devicesTab = this.createDevicesTab();
    
    // Set active tab
    mainTab.classList.add('active');
    
    // Add tabs to content
    tabsContent.appendChild(mainTab);
    tabsContent.appendChild(gettingStartedTab);
    tabsContent.appendChild(tasksTab);
    tabsContent.appendChild(llmTab);
    tabsContent.appendChild(advancedTab);
    tabsContent.appendChild(tipsTab);
    tabsContent.appendChild(devicesTab);
    
    // Assemble content
    content.appendChild(header);
    content.appendChild(tabsNav);
    content.appendChild(tabsContent);
    
    return content;
  }
  
  createMainTab() {
    const tab = document.createElement('div');
    tab.className = 'guide-tab';
    tab.dataset.tab = 'main';
    
    tab.innerHTML = `
      <div class="guide-section">
        <div class="section-header">
          <h3><span class="icon">🚀</span> Welcome to the Guidebook</h3>
        </div>
        <div class="section-content">
          <p>O.P.E.R.A.T.O.R is your advanced autonomous agent with browser, computer, and Android device automation capabilities, powered by the Nexus Engine.</p>
          
          <div class="guide-highlights">
            <div class="highlight-item">
              <i class="fas fa-robot"></i>
              <h4>Autonomous</h4>
              <p>Advanced AI that can navigate and interact with any application, website, or Android device</p>
            </div>
            <div class="highlight-item">
              <i class="fas fa-mobile-alt"></i>
              <h4>Android Automation</h4>
              <p>Control and automate Android devices via USB, WiFi, or remote ADB connections</p>
            </div>
            <div class="highlight-item">
              <i class="fas fa-tasks"></i>
              <h4>Task Automation</h4>
              <p>Automate complex workflows across multiple platforms and devices</p>
            </div>
            <div class="highlight-item">
              <i class="fas fa-brain"></i>
              <h4>Adaptive Learning</h4>
              <p>Improves performance through machine learning and user feedback</p>
            </div>
            <div class="highlight-item">
              <i class="fas fa-shield-alt"></i>
              <h4>Secure</h4>
              <p>Enterprise-grade security for all your automation needs</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="guide-section">
        <div class="section-header">
          <h3><span class="icon">⚡</span> Quick Start</h3>
        </div>
        <div class="section-content">
          <ol class="quick-start-steps">
            <li>
              <h4>Enter your objective</h4>
              <p>Type what you want O.P.E.R.A.T.O.R to accomplish in the Command Center.</p>
            </li>
            <li>
              <h4>Provide context (optional)</h4>
              <p>Add any specific requirements, preferences, or constraints.</p>
            </li>
            <li>
              <h4>Review and execute</h4>
              <p>O.P.E.R.A.T.O.R will analyze your request and execute the necessary steps.</p>
            </li>
            <li>
              <h4>Automate Android devices</h4>
              <p>Connect your Android device and automate tasks with our intuitive interface. <a href="#" class="tab-link" data-tab="devices">Set up now</a></p>
            </li>
            <li>
              <h4>Monitor and refine</h4>
              <p>Track progress and provide feedback to improve results.</p>
            </li>
          </ol>
          
          <div class="guide-cta">
            <button class="btn btn-primary tab-link-btn" data-tab="getting-started">
              <i class="fas fa-book-open"></i> View Full Guide
            </button>
          </div>
        </div>
      </div>
    `;
    
    return tab;
  }
  
  createGettingStartedTab() {
    const tab = document.createElement('div');
    tab.className = 'guide-tab';
    tab.dataset.tab = 'getting-started';
    
    tab.innerHTML = `
      <div class="guide-section">
        <h3>Getting Started with O.P.E.R.A.T.O.R</h3>
        <p>O.P.E.R.A.T.O.R is designed to be intuitive and powerful, helping you automate tasks with AI assistance.</p>
        
        <div class="guide-subsection">
          <h4>The Agent Interface</h4>
          <div class="guide-image-container">
            <div class="guide-image-placeholder">
              <i class="fas fa-desktop"></i>
              <p>Interface Overview</p>
            </div>
          </div>
          <p>The Agent interface consists of several key components:</p>
          <ul>
            <li><strong>Command Center</strong> - Located at the bottom of the screen, this is where you enter your tasks and queries.</li>
            <li><strong>Message Timeline</strong> - The central area displays the conversation history and task results.</li>
            <li><strong>Navigation Bar</strong> - Access settings, history, and this guide from the top navigation.</li>
            <li><strong>Task Bar</strong> - Monitor active and recently completed tasks.</li>
          </ul>
        </div>
        
        <div class="guide-subsection">
          <h4>Your First Task</h4>
          <p>Let's walk through creating your first task in O.P.E.R.A.T.O.R:</p>
          <ol>
            <li><strong>Navigate to the Command Center</strong> at the bottom of the screen</li>
            <li><strong>Enter a clear, specific request</strong>, such as "Go to Ebay and find me the best lawnmower robot based on reviews"</li>
            <li><strong>Submit your task</strong> by pressing Enter or clicking the Send button</li>
            <li><strong>Watch as O.P.E.R.A.T.O.R processes</strong> your request, showing real-time progress</li>
            <li><strong>Review the results</strong> in the Message Timeline</li>
            <li><strong>Save or reference</strong> the output for future use</li>
          </ol>
        </div>
      </div>
      
      <div class="guide-section">
        <h3>Interacting with the AI</h3>
        <p>O.P.E.R.A.T.O.R uses advanced language models to understand and process your requests. Here are some tips for effective communication:</p>
        
        <div class="guide-tips-grid">
          <div class="guide-tip-card">
            <i class="fas fa-bullseye"></i>
            <h4>Be Specific</h4>
            <p>Clearly instruct it to go do something, provide relevant details like site name for better results.</p>
          </div>
          <div class="guide-tip-card">
            <i class="fas fa-list-ol"></i>
            <h4>Structure Complex Requests</h4>
            <p>Break down complex tasks into steps or bullet points for clarity.</p>
          </div>
          <div class="guide-tip-card">
            <i class="fas fa-comment-dots"></i>
            <h4>Follow-up is Welcome</h4>
            <p>You can ask clarifying questions or request adjustments to the results.</p>
          </div>
          <div class="guide-tip-card">
            <i class="fas fa-lightbulb"></i>
            <h4>Provide Context</h4>
            <p>Include relevant background information or preferences when appropriate.</p>
          </div>
        </div>
      </div>
    `;
    
    return tab;
  }
  
  createTasksTab() {
    const tab = document.createElement('div');
    tab.className = 'guide-tab';
    tab.dataset.tab = 'tasks';
    
    tab.innerHTML = `
      <div class="guide-section">
        <h3>Task Management</h3>
        <p>O.P.E.R.A.T.O.R provides powerful tools for managing, tracking, and analyzing your tasks.</p>
        
        <div class="guide-subsection">
          <h4>Task Lifecycle</h4>
          <div class="task-lifecycle">
            <div class="lifecycle-step">
              <div class="step-number">1</div>
              <h5>Creation</h5>
              <p>Enter task in Command Center</p>
            </div>
            <div class="lifecycle-connector"><i class="fas fa-arrow-right"></i></div>
            <div class="lifecycle-step">
              <div class="step-number">2</div>
              <h5>Processing</h5>
              <p>AI analyzes and works on your task</p>
            </div>
            <div class="lifecycle-connector"><i class="fas fa-arrow-right"></i></div>
            <div class="lifecycle-step">
              <div class="step-number">3</div>
              <h5>Completion</h5>
              <p>Results are displayed in timeline</p>
            </div>
            <div class="lifecycle-connector"><i class="fas fa-arrow-right"></i></div>
            <div class="lifecycle-step">
              <div class="step-number">4</div>
              <h5>Storage</h5>
              <p>Task saved to history for later reference</p>
            </div>
          </div>
        </div>
        
        <div class="guide-subsection">
          <h4>Progress Tracking</h4>
          <p>Monitor the progress of your active tasks through:</p>
          <ul>
            <li><strong>Task Bar</strong> - Shows active tasks with progress indicators</li>
            <li><strong>Timeline Updates</strong> - Real-time updates appear as your task progresses</li>
            <li><strong>Notifications</strong> - Receive alerts when tasks are completed or need attention</li>
          </ul>
        </div>
      </div>
      
      <div class="guide-section">
        <h3>History and Reporting</h3>
        <p>Access comprehensive reports and historical data to gain insights from your tasks.</p>
        
        <div class="guide-subsection">
          <h4>Accessing History</h4>
          <p>Open the History modal from the navigation bar to view all past tasks. From there, you can:</p>
          <ul>
            <li>Filter tasks by date, type, or status</li>
            <li>Search for specific keywords across all tasks</li>
            <li>View detailed reports for each completed task</li>
            <li>Delete tasks that are no longer needed</li>
          </ul>
        </div>
        
        <div class="guide-subsection">
          <h4>Reports and Analytics</h4>
          <p>Each completed task generates a detailed report that includes:</p>
          <ul>
            <li><strong>Task Summary</strong> - Overview of the task and results</li>
            <li><strong>Process Details</strong> - Step-by-step breakdown of how the task was completed</li>
            <li><strong>Resource Usage</strong> - Information about the AI models and resources used</li>
            <li><strong>Performance Metrics</strong> - Time taken, efficiency insights, and other metrics</li>
          </ul>
          <p>These reports help you understand how O.P.E.R.A.T.O.R approaches different tasks and can inform your future requests.</p>
        </div>
      </div>
    `;
    
    return tab;
  }
  
  createLLMTab() {
    const tab = document.createElement('div');
    tab.className = 'guide-tab';
    tab.dataset.tab = 'llm';
    
    tab.innerHTML = `
      <div class="guide-section">
        <h3>Language Model Engines</h3>
        <p>O.P.E.R.A.T.O.R leverages four cutting-edge multimodal language models optimized for browser control and visual understanding tasks.</p>
        
        <div class="guide-subsection">
          <h4>Recommended Models</h4>
          <div class="llm-models-grid">
            <div class="llm-model-card">
              <div class="model-header gpt4o">
                <h5>GPT-4o</h5>
                <span class="model-provider">OpenAI</span>
              </div>
              <div class="model-body">
                <p class="model-description">Multimodal LLM with advanced visual understanding and step-by-step browser control.</p>
                <div class="model-strengths">
                  <div class="strength-item"><i class="fas fa-check"></i> Step-by-step browser control</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Visual understanding</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Advanced task planning</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Adaptive screen parsing</div>
                </div>
                <p class="model-best-for">Best for: General web tasks, form filling, content extraction, and UI navigation</p>
                <p class="model-api-source">API Key: <a href="https://platform.openai.com/" target="_blank">OpenAI Platform</a></p>
              </div>
            </div>
            
            <div class="llm-model-card">
              <div class="model-header qwen">
                <h5>Qwen-2.5-VL 72B Instruct</h5>
                <span class="model-provider">Alibaba</span>
              </div>
              <div class="model-body">
                <p class="model-description">Advanced visual language model with exceptional visual grounding abilities.</p>
                <div class="model-strengths">
                  <div class="strength-item"><i class="fas fa-check"></i> Visual grounding</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Action planning</div>
                  <div class="strength-item"><i class="fas fa-check"></i> 72B parameter model</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Precise element targeting</div>
                </div>
                <p class="model-best-for">Best for: Complex visual tasks, precise element selection, and ambiguous UI interactions</p>
                <p class="model-api-source">API Key: <a href="https://openrouter.ai/" target="_blank">OpenRouter</a> or <a href="https://www.alibabacloud.com/" target="_blank">Alibaba Cloud</a></p>
              </div>
            </div>
            
            <div class="llm-model-card">
              <div class="model-header gemini">
                <h5>Gemini-2.5-Pro</h5>
                <span class="model-provider">Google</span>
              </div>
              <div class="model-body">
                <p class="model-description">Google's advanced multimodal model with strong visual processing capabilities.</p>
                <div class="model-strengths">
                  <div class="strength-item"><i class="fas fa-check"></i> Visual understanding</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Action planning</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Long-range context</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Information extraction</div>
                </div>
                <p class="model-best-for">Best for: Research tasks, information extraction, and complex visual analysis</p>
                <p class="model-api-source">API Key: <a href="https://ai.google.dev/" target="_blank">Google AI Studio</a></p>
              </div>
            </div>
            
            <div class="llm-model-card">
              <div class="model-header uitars">
                <h5>UI-TARS</h5>
                <span class="model-provider">ByteDance</span>
              </div>
              <div class="model-body">
                <p class="model-description">End-to-end GUI agent model based on VLM architecture specifically for browser control.</p>
                <div class="model-strengths">
                  <div class="strength-item"><i class="fas fa-check"></i> Full-time visual grounding</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Precise step planning</div>
                  <div class="strength-item"><i class="fas fa-check"></i> Element targeting</div>
                  <div class="strength-item"><i class="fas fa-check"></i> UI state tracking</div>
                </div>
                <p class="model-best-for">Best for: Complex UI workflows, web automation, and multi-step processes</p>
                <p class="model-api-source">API Key: <a href="https://www.volcengine.com/" target="_blank">VolcEngine</a> (ByteDance)</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="guide-subsection">
          <h4>Setting Up Your API Keys</h4>
          <p>To use these models with O.P.E.R.A.T.O.R, you'll need to obtain and configure the appropriate API keys:</p>
          <ol>
            <li>Open the <strong>Settings</strong> from the navigation bar</li>
            <li>Navigate to the <strong>API Keys</strong> tab</li>
            <li>Enter your API keys for each model you wish to use</li>
            <li>Click <strong>Save</strong> for each key</li>
          </ol>
          <p><strong>Note:</strong> GPT-4o is set as the default engine upon signup. Ensure you have a valid GPT-4o API key for the best experience.</p>
          <p>The system will automatically use the appropriate key based on your selected LLM engine.</p>
        </div>
        
        <div class="guide-subsection">
          <h4>Choosing the Right Model</h4>
          <p>Each model has unique strengths for different types of browser automation tasks:</p>
          <ul>
            <li><strong>GPT-4o</strong> - Best for general purpose web tasks and good balance of capabilities</li>
            <li><strong>Qwen-2.5-VL</strong> - Ideal when precise visual understanding and element targeting is critical</li>
            <li><strong>Gemini-2.5-Pro</strong> - Excellent for research and information extraction tasks</li>
            <li><strong>UI-TARS</strong> - Optimal for complex workflows requiring precise UI interactions</li>
          </ul>
          <p>You can switch between models in the LLM Engines tab of Settings based on your current needs.</p>
        </div>
        
        <div class="guide-subsection">
          <h4>Execution Mode Configuration</h4>
          <p>In addition to selecting your preferred model, you can also configure how the model executes tasks:</p>
          <div class="execution-mode-summary">
            <div class="mode-option">
              <i class="fas fa-list-ol"></i>
              <strong>Step Planning</strong>
              <p>Tasks are broken down into small, discrete steps with feedback after each one (Default)</p>
            </div>
            <div class="mode-option">
              <i class="fas fa-sitemap"></i>
              <strong>Action Planning</strong>
              <p>Tasks are planned as a comprehensive sequence of actions for more efficient execution</p>
            </div>
          </div>
          <p>Configure your execution mode in the LLM Engines tab of Settings alongside your preferred model.</p>
          <p><strong>Tip:</strong> For models with strong planning capabilities like GPT-4o and UI-TARS, action planning mode can significantly improve task completion efficiency.</p>
          <p>See the <a href="#" class="tab-link" data-tab="advanced">Advanced Features</a> section for more details on execution modes.</p>
        </div>
      </div>
    `;
    
    return tab;
  }
  
  createAdvancedTab() {
    const tab = document.createElement('div');
    tab.className = 'guide-tab';
    tab.dataset.tab = 'advanced';
    
    tab.innerHTML = `
      <div class="guide-section">
        <div class="section-header">
          <h3><span class="icon">⚙️</span> Advanced Features</h3>
        </div>
        <div class="section-content">
          <p>O.P.E.R.A.T.O.R's Nexus Engine offers a range of advanced capabilities for power users and specialized workflows.</p>
          
          <div class="guide-subsection">
            <h4>YAML Integration</h4>
            <p>Leverage the power of YAML to create reusable automation templates and complex workflows:</p>
            
            <div class="code-block">
              <pre># Example YAML automation template
name: Job Application Assistant
description: Automates the job application process
version: 1.0

# Define your variables here or pass them when running the workflow
# Example variables:
# - jobTitle: "Software Engineer"
# - location: "San Francisco"
# - minSalary: 120000

tasks:
  - name: Search Job Listings
    action: web.search
    params:
      query: "{{jobTitle}} in {{location}} site:linkedin.com/jobs"
      limit: 5
    
  - name: Filter Results
    action: filter
    params:
      condition: "{{item.salary}} >= {{minSalary}} && {{item.remote}} === true"
    
  - name: Apply to Position
    action: web.fill_form
    params:
      url: "{{job.url}}"
      fields:
        "#resume-upload": "/path/to/resume.pdf"
        "#cover-letter": "{{coverLetter}}"
    
  - name: Follow Up
    action: email.send
    params:
      to: "{{hiringManager.email}}"
      subject: "Following up on my application for {{job.title}}"
      body: |
        Dear {{hiringManager.name}},
        
        I wanted to follow up on my application for the {{job.title}} position.
        I'm very excited about this opportunity and look forward to your response.
        
        Best regards,
        {{yourName}}
      </pre>
              <button class="copy-code-btn" title="Copy to clipboard">
                <i class="far fa-copy"></i>
              </button>
            </div>
            
            <p>Key YAML features:</p>
            <ul class="feature-list">
              <li>Define complex, multi-step workflows with dependencies</li>
              <li>Use variables and expressions for dynamic behavior</li>
              <li>Integrate with web APIs and services</li>
              <li>Handle errors and retries automatically</li>
              <li>Reuse templates across different scenarios</li>
            </ul>
          </div>
        
        <div class="guide-subsection">
          <h4>API Integration</h4>
          <p>Configure API keys in Settings to enable O.P.E.R.A.T.O.R to interact with external services:</p>
          <ul>
            <li><strong>OpenAI API</strong> - For GPT-4o Visual Step Based automation</li>
            <li><strong>ByteDance API</strong> - For UI-TARS GUI explorative automation</li>
            <li><strong>Google API</strong> - For Visual Grounded action planning automation</li>
            <li><strong>Qwen API</strong> - For Visual Grounded action planning automation</li>
          </ul>
          <p>With these integrations, O.P.E.R.A.T.O.R can perform research, access external data, and automate web-based tasks.</p>
        </div>
        
        <div class="guide-subsection">
          <h4>Custom Workflows</h4>
          <p>Create specialized workflows for repeated tasks by:</p>
          <ol>
            <li>Developing a clear task template Map with specific parameters</li>
            <li>Saving successful tasks as templates in the History view</li>
            <li>Using structured prompts with consistent formatting</li>
            <li>Creating workflow sequences by linking multiple tasks</li>
          </ol>
          <p>This allows you to streamline recurring processes and ensure consistent results.</p>
        </div>
        
        <div class="guide-subsection">
          <h4>Execution Modes</h4>
          <p>O.P.E.R.A.T.O.R offers two different execution modes for task processing:</p>
          
          <div class="execution-modes-comparison">
            <div class="execution-mode">
              <h5>Step Planning Mode</h5>
              <p>The default mode that performs tasks step-by-step with feedback after each action.</p>
              <ul>
                <li><strong>Interactive</strong> - Provides detailed progress updates</li>
                <li><strong>Cautious</strong> - Validates each step before proceeding</li>
                <li><strong>Transparent</strong> - Easier to follow the reasoning process</li>
                <li><strong>Precise</strong> - Higher accuracy for complex tasks</li>
              </ul>
              <p><em>Best for: New users, complex tasks requiring precision, or when you want to follow the execution closely.</em></p>
            </div>
            
            <div class="execution-mode">
              <h5>Action Planning Mode</h5>
              <p>An advanced mode that plans a complete sequence of actions upfront to accomplish tasks more efficiently.</p>
              <ul>
                <li><strong>Efficient</strong> - Completes tasks with fewer interactions</li>
                <li><strong>Proactive</strong> - Anticipates next steps without prompting</li>
                <li><strong>Streamlined</strong> - Less back-and-forth for simple tasks</li>
                <li><strong>Faster</strong> - Reduced completion time for familiar tasks</li>
              </ul>
              <p><em>Best for: Experienced users, repetitive tasks, or when speed is prioritized over step-by-step visibility.</em></p>
            </div>
          </div>
          
          <p>To change your execution mode:</p>
          <ol>
            <li>Open <strong>Settings</strong> from the navigation bar</li>
            <li>Navigate to the <strong>LLM Engines</strong> tab</li>
            <li>Find the <strong>Execution Mode</strong> toggle</li>
            <li>Select your preferred mode</li>
            <li>Click <strong>Save</strong></li>
          </ol>
          <p>You can switch between modes at any time based on your current needs.</p>
        </div>
      </div>
      
      <div class="guide-section">
        <h3>Reports & Sharing</h3>
        <p>O.P.E.R.A.T.O.R generates detailed reports for every automation task, allowing you to review, analyze, and share the results.</p>
        
        <div class="export-options-grid">
          <div class="export-option">
            <i class="fas fa-file-alt"></i>
            <h4>Landing Report</h4>
            <p>A concise summary of your automation task with key screenshots from each step. Includes a link to the full Nexus Report for detailed analysis.</p>
          </div>
          <div class="export-option">
            <i class="fas fa-file-code"></i>
            <h4>Nexus Report</h4>
            <p>A comprehensive replay of the entire automation process, generated in real-time by the Agent. Shows the complete decision-making process and actions taken.</p>
          </div>
          <div class="export-option">
            <i class="fas fa-download"></i>
            <h4>Offline Access</h4>
            <p>Both report types can be downloaded as self-contained HTML files, allowing you to replay and analyze the automation on any device without an internet connection.</p>
          </div>
          <div class="export-option">
            <i class="fas fa-share-nodes"></i>
            <h4>YAML Maps</h4>
            <p>Share your automation workflows with the community as YAML files. Explore and reuse maps created by other users in the shared library.</p>
          </div>
        </div>
        
        <div class="guide-subsection" style="margin-top: 20px;">
          <h4>Sharing YAML Maps</h4>
          <p>Create and share your automation workflows with the O.P.E.R.A.T.O.R community:</p>
          <ol>
            <li>After completing a successful automation, save it as a YAML map from the task menu</li>
            <li>Add a clear name, description, and tags to help others find your map</li>
            <li>Share your map with the community via the sidebar's shared library</li>
            <li>Browse and import maps shared by other users to speed up your workflow</li>
          </ol>
          <p class="note"><i class="fas fa-info-circle"></i> All reports include interactive elements that let you replay the automation steps and examine the Agent's decision-making process.</p>
        </div>
      </div>
    `;
    
    return tab;
  }
  
  createDevicesTab() {
    const tab = document.createElement('div');
    tab.className = 'guide-tab';
    tab.dataset.tab = 'devices';
    
    tab.innerHTML = `
      <div class="guide-section">
        <h3>Android Device Connections</h3>
        <div class="device-connection-notice">
          <div class="notice-header">
            <i class="fas fa-rocket"></i>
            <span>For Best Results</span>
          </div>
          <div class="notice-content">
            <strong>Local Fullstack App Required</strong>
            <p>To see the browser in real-time controlled by the AI Agent and to control Android devices via USB or Network connection, please download and run the fullstack app locally.</p>
            <ol>
              <li>Download the fullstack app from the sidebar link</li>
              <li>Install Node.js 18 or later</li>
              <li>Run <code>npm install</code> to install dependencies</li>
              <li>Start the app with <code>npm run dev</code></li>
            </ol>
          </div>
        </div>
        <p>Connect and automate Android devices with O.P.E.R.A.T.O.R's powerful device management features. Choose the connection method that best fits your needs.</p>
        
        <div class="connection-options">
          <div class="connection-option">
            <div class="connection-header usb">
              <i class="fas fa-usb"></i>
              <h4>USB Connection</h4>
              <span class="connection-badge">Recommended</span>
            </div>
            <div class="connection-content">
              <p><strong>Best for:</strong> Local development and debugging</p>
              <p><strong>Speed:</strong> ⚡⚡⚡⚡⚡ (Fastest)</p>
              <p><strong>Stability:</strong> ⭐⭐⭐⭐⭐ (Most stable)</p>
              <button class="btn btn-outline connection-details-btn" data-connection="usb">Setup Guide</button>
            </div>
          </div>
          
          <div class="connection-option">
            <div class="connection-header network">
              <i class="fas fa-wifi"></i>
              <h4>Network Connection</h4>
            </div>
            <div class="connection-content">
              <p><strong>Best for:</strong> Wireless testing and multi-device setups</p>
              <p><strong>Speed:</strong> ⚡⚡⚡ (Depends on network)</p>
              <p><strong>Convenience:</strong> ⭐⭐⭐⭐⭐ (No cables needed)</p>
              <button class="btn btn-outline connection-details-btn" data-connection="network">Setup Guide</button>
            </div>
          </div>
          
          <div class="connection-option">
            <div class="connection-header remote">
              <i class="fas fa-cloud"></i>
              <h4>Remote ADB</h4>
              <span class="connection-badge">Advanced</span>
            </div>
            <div class="connection-content">
              <p><strong>Best for:</strong> Teams and CI/CD pipelines</p>
              <p><strong>Flexibility:</strong> ⭐⭐⭐⭐⭐ (Access anywhere)</p>
              <p><strong>Setup:</strong> ⚙️⚙️⚙️ (Advanced configuration)</p>
              <button class="btn btn-outline connection-details-btn" data-connection="remote">Setup Guide</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="guide-section connection-details" id="usb-details">
        <h4><i class="fas fa-usb"></i> USB Connection Setup</h4>
        <div class="setup-steps">
          <div class="setup-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h5>Enable USB Debugging</h5>
              <ol>
                <li>Go to <strong>Settings</strong> > <strong>About Phone</strong></li>
                <li>Tap <strong>Build Number</strong> 7 times to enable Developer Options</li>
                <li>Go to <strong>System</strong> > <strong>Developer Options</strong></li>
                <li>Enable <strong>USB Debugging</strong></li>
              </ol>
            </div>
          </div>
          <div class="setup-step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h5>Connect Your Device</h5>
              <ol>
                <li>Connect your Android device to your computer using a USB cable</li>
                <li>On your device, tap <strong>Allow USB Debugging</strong> when prompted</li>
                <li>In O.P.E.R.A.T.O.R, select <strong>USB</strong> as the connection type</li>
                <li>Click <strong>Connect</strong> and wait for the connection to establish</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      
      <div class="guide-section connection-details" id="network-details">
        <div class="device-connection-notice warning" style="margin-top: 20px;">
          <div class="notice-header">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Docker Limitation</span>
          </div>
          <div class="notice-content">
            <p>When running in a Docker container, network ADB connections may not work due to network namespace isolation.</p>
            <p><strong>Recommendation:</strong> For development and testing, run the app directly on your host machine.</p>
          </div>
        </div>
        <h4><i class="fas fa-wifi"></i> Network Connection Setup</h4>
        <div class="setup-steps">
          <div class="setup-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h5>Initial USB Setup</h5>
              <ol>
                <li>First, connect your device via USB and enable USB debugging</li>
                <li>Open a command prompt/terminal and run: <code>adb tcpip 5555</code></li>
                <li>Note your device's IP address in <strong>Settings</strong> > <strong>About Phone</strong> > <strong>Status</strong></li>
              </ol>
            </div>
          </div>
          <div class="setup-step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h5>Connect Wirelessly</h5>
              <ol>
                <li>In O.P.E.R.A.T.O.R, select <strong>Network</strong> as the connection type</li>
                <li>Enter your device's IP address (e.g., 192.168.1.100)</li>
                <li>Port will default to 5555</li>
                <li>Click <strong>Connect</strong> and wait for the connection to establish</li>
                <li>You can now disconnect the USB cable</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      
      <div class="guide-section connection-details" id="remote-details">
        <h4><i class="fas fa-cloud"></i> Remote ADB Setup</h4>
        <div class="setup-steps">
          <div class="setup-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h5>Set Up ADB Server</h5>
              <p>On the computer with your Android device connected:</p>
              <ol>
                <li>Open a command prompt/terminal as administrator</li>
                <li>Navigate to your ADB directory (e.g., <code>cd C:\platform-tools</code>)</li>
                <li>Start the ADB server in network mode: <code>adb -a -P 5037 nodaemon server</code></li>
                <li>Note the computer's IP address</li>
              </ol>
            </div>
          </div>
          <div class="setup-step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h5>Configure Remote Connection</h5>
              <ol>
                <li>In O.P.E.R.A.T.O.R, select <strong>Remote ADB</strong> as the connection type</li>
                <li>Enter the ADB server's IP address and port (default: 5037)</li>
                <li>If needed, specify the path to ADB (e.g., <code>C:\platform-tools\adb.exe</code>)</li>
                <li>Click <strong>Save Settings</strong> then <strong>Test Connection</strong></li>
                <li>Once connected, you can manage devices as if they were connected locally</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      
      <div class="guide-section">
        <h3>Troubleshooting</h3>
        <div class="troubleshooting-grid">
          <div class="troubleshooting-card">
            <i class="fas fa-question-circle"></i>
            <h5>Device Not Found</h5>
            <ul>
              <li>Check if USB debugging is enabled</li>
              <li>Try a different USB cable/port</li>
              <li>Run: <code>adb kill-server && adb start-server</code></li>
            </ul>
          </div>
          <div class="troubleshooting-card">
            <i class="fas fa-unlink"></i>
            <h5>Connection Drops</h5>
            <ul>
              <li>Check WiFi/network stability</li>
              <li>Ensure device IP hasn't changed</li>
              <li>Verify port 5555 is open (network mode)</li>
            </ul>
          </div>
          <div class="troubleshooting-card">
            <i class="fas fa-exclamation-triangle"></i>
            <h5>Authentication Issues</h5>
            <ul>
              <li>Revoke USB debugging authorizations</li>
              <li>Reconnect and accept the RSA key</li>
              <li>Check for conflicting ADB versions</li>
            </ul>
          </div>
        </div>
        
        <div class="guide-cta">
          <button class="btn btn-primary" id="reset-connection-guide">
            <i class="fas fa-sync-alt"></i> Reset Connection Guide
          </button>
        </div>
      </div>
    `;
    
    return tab;
  }
  
  createTipsTab() {
    const tab = document.createElement('div');
    tab.className = 'guide-tab';
    tab.dataset.tab = 'tips';
    
    tab.innerHTML = `
      <div class="guide-section">
        <div class="section-header">
          <h3><span class="icon">💡</span> Tips & Best Practices</h3>
        </div>
        <div class="section-content">
          <p>Maximize your productivity with these expert tips for using O.P.E.R.A.T.O.R effectively.</p>
          
          <div class="guide-tips-list">
            <div class="guide-tip">
              <div class="tip-number">01</div>
              <div class="tip-content">
                <h4>Be Specific with Instructions</h4>
                <p>Provide clear, detailed instructions with all necessary context for optimal results.</p>
                <div class="tip-example">
                  <strong>Instead of:</strong> "Help me shop for a laptop"<br>
                  <strong>Try:</strong> "Find me the best laptop under $1500 for software development with at least 16GB RAM, 512GB SSD, and 8+ hours of battery life. Compare top 3 options with pros and cons."
                </div>
              </div>
            </div>
          
          <div class="guide-tip">
            <div class="tip-number">02</div>
            <div class="tip-content">
              <h4>Iterate and Refine</h4>
              <p>Don't expect perfect results on the first try. Use follow-up requests to refine outputs, provide additional context, or ask for specific changes.</p>
              <div class="tip-example">
                <strong>Follow-up example:</strong> "That's great. Now could you expand on the section about perovskite solar cells, particularly their durability challenges?"
              </div>
            </div>
          </div>
          
          <div class="guide-tip">
            <div class="tip-number">03</div>
            <div class="tip-content">
              <h4>Choose the Right Model</h4>
              <p>Match the language model to your task type. Use more powerful models (GPT-4, UI-TARS, QWEN-VL) for complex reasoning tasks, and faster models for simpler tasks.</p>
            </div>
          </div>
          
          <div class="guide-tip">
            <div class="tip-number">04</div>
            <div class="tip-content">
              <h4>Break Down Complex Tasks</h4>
              <p>Split complex projects into smaller, more manageable subtasks. This helps maintain focus and allows for more specific instructions.</p>
            </div>
          </div>
          
          <div class="guide-tip">
            <div class="tip-number">05</div>
            <div class="tip-content">
              <h4>Use Templates for Consistency</h4>
              <p>Develop templates for recurring tasks to ensure consistent formatting and completeness in the results.</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="guide-section">
        <div class="section-header">
          <h3><span class="icon">✨</span> Common Use Cases</h3>
        </div>
        <div class="section-content">
          <p>Discover powerful ways to leverage O.P.E.R.A.T.O.R in your daily workflow:</p>
          
          <div class="use-cases-grid">
            <div class="use-case-card">
              <div class="use-case-icon"><i class="fas fa-shopping-cart"></i></div>
              <h4>Smart Shopping Assistant</h4>
              <p>Automate price comparisons, track deals, and make informed purchasing decisions.</p>
              <div class="use-case-example">
                "Find the best deal on a 65\" 4K TV with HDR and smart features under $800. Compare prices across major retailers and alert me if the price drops below $750 in the next 2 weeks."
              </div>
            </div>
            
            <div class="use-case-card">
              <div class="use-case-icon"><i class="fas fa-briefcase"></i></div>
              <h4>Job Application Manager</h4>
              <p>Streamline your job search by automating applications and tracking responses.</p>
              <div class="use-case-example">
                "Search for remote software engineering positions at companies with 4+ star ratings on Glassdoor. Customize my resume for each application and track all submissions in a spreadsheet with application deadlines and follow-up dates."
              </div>
            </div>
            
            <div class="use-case-card">
              <div class="use-case-icon"><i class="fas fa-video"></i></div>
              <h4>Meeting Assistant</h4>
              <p>Automate meeting preparation, attendance, and follow-ups.</p>
              <div class="use-case-example">
                "Join my Zoom meeting at 2 PM, transcribe the discussion in real-time, identify action items, and schedule follow-up tasks in my project management tool. Send a summary to all participants within 30 minutes after the meeting ends."
              </div>
            </div>
            
            <div class="use-case-card">
              <div class="use-case-icon"><i class="fas fa-robot"></i></div>
              <h4>Workflow Automation</h4>
              <p>Create custom automations that connect multiple applications and services.</p>
              <div class="use-case-example">
                "When I receive an email with an invoice attachment, extract the total amount and due date, add it to my accounting software, and create a calendar reminder 3 days before the due date."
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    return tab;
  }
  
  // Setting up event listeners
  setupEventListeners() {
    // Close on overlay click (outside content)
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });
    
    // Close button (X in top-right corner)
    const closeBtn = this.overlay.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hide();
      });
    }
    
    // Tab switching
    const tabButtons = this.overlay.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Connection details toggles
    const detailButtons = this.overlay.querySelectorAll('.connection-details-btn');
    detailButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleConnectionDetails(btn.dataset.connection);
      });
    });
    
    // Reset connection guide button
    const resetBtn = this.overlay.querySelector('#reset-connection-guide');
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.resetConnectionGuide();
      });
    }
    
    // Video placeholder click
    const videoPlaceholder = this.overlay.querySelector('.video-placeholder');
    if (videoPlaceholder) {
      videoPlaceholder.addEventListener('click', () => {
        // Replace with actual video embed
        const videoContainer = this.overlay.querySelector('.video-container');
        videoContainer.innerHTML = `
          <iframe width="100%" height="315" 
            src="https://www.youtube.com/embed/placeholder" 
            title="O.P.E.R.A.T.O.R Demo Video" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
          </iframe>
        `;
      });
    }
  }
  
  switchTab(tabId) {
    // Update active tab
    this.activeTab = tabId;
    
    // Update tab buttons
    const tabBtns = this.overlay.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Update tab content
    const tabContents = this.overlay.querySelectorAll('.guide-tab');
    tabContents.forEach(tab => {
      if (tab.dataset.tab === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }
  
  show() {
    if (!this.isVisible) {
      this.overlay.classList.add('visible');
      this.isVisible = true;
    }
  }
  
  hide() {
    if (this.isVisible) {
      this.overlay.classList.remove('visible');
      this.isVisible = false;
    }
  }
  
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  toggleConnectionDetails(connectionType) {
    // Hide all connection details
    const allDetails = this.overlay.querySelectorAll('.connection-details');
    allDetails.forEach(detail => detail.classList.remove('active'));
    
    // Remove active class from all buttons
    const allButtons = this.overlay.querySelectorAll('.connection-details-btn');
    allButtons.forEach(btn => {
      btn.classList.remove('active');
      btn.innerHTML = btn.innerHTML.replace('Hide', 'Show');
    });
    
    // If clicking the same button, don't show any details (toggle off)
    const activeButton = this.overlay.querySelector(`.connection-details-btn[data-connection="${connectionType}"]`);
    if (activeButton && activeButton.classList.contains('active')) {
      return;
    }
    
    // Show the selected connection details
    const details = this.overlay.querySelector(`#${connectionType}-details`);
    if (details) {
      details.classList.add('active');
      if (activeButton) {
        activeButton.classList.add('active');
        activeButton.innerHTML = activeButton.innerHTML.replace('Show', 'Hide');
      }
      
      // Scroll to the details section
      details.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  resetConnectionGuide() {
    // Hide all connection details
    const allDetails = this.overlay.querySelectorAll('.connection-details');
    allDetails.forEach(detail => detail.classList.remove('active'));
    
    // Reset all buttons
    const allButtons = this.overlay.querySelectorAll('.connection-details-btn');
    allButtons.forEach(btn => {
      btn.classList.remove('active');
      btn.textContent = 'Setup Guide';
    });
    
    // Scroll to top
    this.overlay.querySelector('.guide-tabs-content').scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}

// Export the factory function
export default getGuideOverlay;
