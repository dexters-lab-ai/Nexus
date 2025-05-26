/**
 * Settings Modal Component
 * Provides a modern, world-class modal interface for configuring application preferences
 */

import { eventBus } from '../utils/events.js';
import { stores } from '../store/index.js';
import Button from './base/Button.jsx';
import { getSettings, saveApiKey, deleteApiKey, saveLlmPreferences } from '../api/settings.js';
import { version } from '../../package.json';
// PATCH: Ensure saveApiKey and deleteApiKey use '/api/settings/api-keys' as the route prefix internally

// Load all required CSS for settings modal
function loadStylesheets() {
  // Define all stylesheets we need to load
  const stylesheets = [
    '/src/styles/components/modal-theme-unified.css',       // Base unified modal theme
    '/src/styles/components/settings-button-styles.css',     // Modern button styling
    '/src/styles/components/settings-api-keys.css',          // API Keys tab styling
    '/src/styles/components/settings-llm-tab.css',           // LLM Settings tab styling
    '/src/styles/components/settings-advanced.css'           // Settings-specific styles
  ];
  
  // Load each stylesheet in order
  stylesheets.forEach(stylesheet => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheet;
    link.type = 'text/css';
    document.head.appendChild(link);
  });
  
  // Add settings footer styling
  const footerLink = document.createElement('link');
  footerLink.rel = 'stylesheet';
  footerLink.href = '/src/styles/components/settings-footer.css';
  footerLink.type = 'text/css';
  document.head.appendChild(footerLink);
}

// Load the stylesheets
loadStylesheets();

// Helper: Save to localStorage and store
function persistSettings(settings) {
  localStorage.setItem('userPreferences', JSON.stringify(settings));
  stores.ui.setState({ preferences: settings });
}

function loadPersistedSettings() {
  let fromStorage = localStorage.getItem('userPreferences');
  if (fromStorage) return JSON.parse(fromStorage);
  let fromStore = stores.ui.getState().preferences;
  if (fromStore) return fromStore;
  return null;
}

// SINGLE SOURCE OF TRUTH: Central mapping between backend provider IDs and UI DOM IDs
const PROVIDER_TO_DOM_ID = {
  openai: 'gpt4o',      // OpenAI's GPT-4o model (key input ID: gpt4o-key)
  qwen: 'qwen',         // Alibaba's Qwen model (key input ID: qwen-key)
  google: 'gemini',     // Google's Gemini model (key input ID: gemini-key)
  uitars: 'uitars',     // ByteDance's UI-TARS model (key input ID: uitars-key)
  anthropic: 'claude',  // Anthropic's Claude model (key input ID: claude-key)
  xai: 'grok'           // xAI's Grok model (key input ID: grok-key)
};

// Inverse mapping for DOM ID to backend provider ID conversion
const DOM_ID_TO_PROVIDER = Object.fromEntries(
  Object.entries(PROVIDER_TO_DOM_ID).map(([k, v]) => [v, k])
);

// For UI display and LLM logic - mapping provider IDs to their engine IDs
const PROVIDER_TO_ENGINE = {
  'openai': 'gpt-4o',
  'qwen': 'qwen-2.5-vl-72b',
  'google': 'gemini-2.5-pro',
  'uitars': 'ui-tars',
  'anthropic': 'claude-3-opus',
  'xai': 'grok-1'
};

// For LLM selection/preferences - mapping engine IDs to provider IDs
const ENGINE_TO_PROVIDER = {
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-3.5-turbo': 'openai',
  'qwen-2.5-vl-72b': 'qwen',
  'gemini-2.5-pro': 'google',
  'gemini-1.5-pro': 'google',
  'gemini-1.5-flash': 'google',
  'ui-tars': 'uitars',
  'claude-3-opus': 'anthropic',
  'claude-3-sonnet': 'anthropic',
  'claude-3-haiku': 'anthropic',
  'grok-1': 'xai'
};

// List of all valid backend provider IDs (for validation)
const VALID_PROVIDERS = Object.keys(PROVIDER_TO_DOM_ID);

// Available LLM engines with capabilities and use cases
const engines = [
  { 
    id: 'gpt-4o', 
    name: 'GPT-4o', 
    description: 'Advanced multimodal LLM with visual processing and superior reasoning capabilities', 
    provider: 'OpenAI',
    icon: 'fa-brain',
    capabilities: ['Code', 'Vision', 'Reasoning', 'Structured Output'],
    disabled: false
  },
  { 
    id: 'gpt-4o-mini', 
    name: 'GPT-4o Mini', 
    description: 'Smaller, faster version of GPT-4o with good performance at lower cost', 
    provider: 'OpenAI',
    icon: 'fa-brain',
    capabilities: ['Code', 'Vision', 'Reasoning'],
    disabled: false
  },
  { 
    id: 'gpt-3.5-turbo', 
    name: 'GPT-3.5 Turbo', 
    description: 'Efficient model balancing performance and cost', 
    provider: 'OpenAI',
    icon: 'fa-brain',
    capabilities: ['Code', 'Reasoning'],
    disabled: false
  },
  { 
    id: 'qwen-2.5-vl-72b', 
    name: 'Qwen-2.5-VL 72B', 
    description: 'Visual language model with excellent visual grounding and UI comprehension', 
    provider: 'Alibaba',
    icon: 'fa-eye',
    capabilities: ['Vision', 'UI Analysis', 'Multimodal'],
    disabled: true,
    tooltip: 'Chat support for Qwen will be added in an upcoming update'
  },
  { 
    id: 'gemini-2.5-pro', 
    name: 'Gemini-2.5-Pro', 
    description: 'Versatile model with strong multimedia capabilities and reasoning', 
    provider: 'Google',
    icon: 'fa-gem',
    capabilities: ['Vision', 'Reasoning', 'Multimodal', 'Planning'],
    disabled: true,
    tooltip: 'Chat support for Gemini will be added in an upcoming update'
  },
  { 
    id: 'ui-tars', 
    name: 'UI-TARS', 
    description: 'Specialized end-to-end GUI agent model for interface design and testing', 
    provider: 'ByteDance',
    icon: 'fa-window-maximize',
    capabilities: ['UI Design', 'UI Testing', 'UI Analysis'],
    disabled: true,
    tooltip: 'Chat support for UI-TARS will be added in an upcoming update'
  },
  { 
    id: 'claude-3-opus', 
    name: 'Claude-3 Opus', 
    description: 'Anthropic\'s most powerful model with superior reasoning and complex task capabilities', 
    provider: 'Anthropic',
    icon: 'fa-comment-alt',
    capabilities: ['Reasoning', 'Safety', 'Instruction-following'],
    disabled: true,
    tooltip: 'Chat support for Claude will be added in an upcoming update'
  },
  { 
    id: 'grok-1', 
    name: 'Grok-1', 
    description: 'Conversational AI with real-time data access and witty responses', 
    provider: 'xAI',
    icon: 'fa-robot',
    capabilities: ['Reasoning', 'Internet-access', 'Conversational'],
    disabled: true,
    tooltip: 'Chat support for Grok will be added in an upcoming update'
  },
];

// Processing types with detailed explanations
const processingTypes = [
  {
    id: 'yaml-planning',
    name: 'YAML Planning (Recommended)',
    icon: 'fa-file-code',
    description: 'Uses structured YAML to create detailed execution plans with superior accuracy and transparency. Always used when YAML is present in commands, regardless of this setting.',
    benefits: ['Higher accuracy', 'Better debugging', 'More transparent execution']
  },
  {
    id: 'step-planning',
    name: 'Step Planning (Default)',
    icon: 'fa-list-ol',
    description: 'Traditional step-by-step planning where each action is determined sequentially. Used with GPT-4o, Qwen, and Gemini models when no YAML is present.',
    benefits: ['Incremental progress', 'Human oversight', 'Sequential execution']
  },
  {
    id: 'action-planning',
    name: 'Action Planning (Autopilot)',
    icon: 'fa-rocket',
    description: 'Fully automated execution with minimal human intervention. Automatically used with UI-TARS regardless of this setting. Only modify this if you want to force a specific execution type.',
    benefits: ['Fastest execution', 'Fully automated', 'Minimal oversight']
  }
];

/**
 * Create a settings modal component
 * @param {Object} props - Component properties
 * @returns {HTMLElement} Settings modal element
 */
function SettingsModal(props = {}) {
  const containerId = props.containerId || 'settings-modal';
  let isVisible = false;
  let currentTab = 'api-keys';
  let settings = loadPersistedSettings() || {
    profile: { username: '', email: '' },
    apiKeys: {},
    preferredEngine: 'gpt-4o',
    privacyMode: false,
    notifications: { enabled: true },
    interface: {
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      fontSize: 'medium',
      compactMode: false,
      showTimestamps: true
    },
    accessibility: {
      highContrast: false,
      largeText: false,
      focusOutlines: true,
      notificationPosition: 'bottom-left'
    },
    llmPreferences: {
      default: 'gpt-4',
      code: 'gpt-4',
      content: 'gpt-4',
      research: 'gpt-4'
    }
  };

  // Create modal container element
  const container = document.createElement('div');
  container.id = containerId + '-container';

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.className = 'settings-modal-overlay';
  overlay.id = containerId;

  // Create modal container
  const modalContainer = document.createElement('div');
  modalContainer.className = 'settings-modal';
  modalContainer.id = containerId;

  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'settings-notification';
  notification.innerHTML = `
    <div class="notification-title"></div>
    <div class="notification-message"></div>
  `;

  // Create modal header
  const header = document.createElement('div');
  header.className = 'settings-modal-header';
  
  const title = document.createElement('h2');
  title.innerHTML = `<i class="fas fa-cog"></i> Settings <span class="version-badge">v${version}</span>`;
  header.appendChild(title);
  
  const closeButton = Button({ 
    icon: 'fa-times', 
    variant: Button.VARIANTS.TEXT, 
    title: 'Close',
    onClick: () => hide() 
  });
  header.appendChild(closeButton);

  // Create tabs
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'settings-tabs';
  
  const tabs = [
    { id: 'api-keys', label: 'API Keys', icon: 'fa-key' },
    { id: 'llm-engine', label: 'LLM Engine', icon: 'fa-robot' },
    { id: 'interface', label: 'Interface', icon: 'fa-desktop' },
    { id: 'accessibility', label: 'Accessibility', icon: 'fa-universal-access' },
    { id: 'privacy', label: 'Privacy', icon: 'fa-shield-alt' },
    { id: 'password', label: 'Password', icon: 'fa-lock' },
    { id: 'billing', label: 'Billing', icon: 'fa-money-bill-wave' }
  ];
  
  tabs.forEach(tab => {
    const tabBtn = document.createElement('div');
    tabBtn.className = 'settings-tab';
    tabBtn.classList.toggle('active', tab.id === currentTab);
    tabBtn.dataset.tab = tab.id;
    
    tabBtn.innerHTML = `
      <i class="fas ${tab.icon}"></i>
      <span>${tab.label}</span>
    `;
    
    tabBtn.addEventListener('click', () => {
      selectTab(tab.id);
    });
    tabsContainer.appendChild(tabBtn);
  });

  // Create content area
  const content = document.createElement('div');
  content.className = 'settings-modal-content';
  
  // API Keys tab content
  const apiKeysTab = document.createElement('div');
  apiKeysTab.className = 'tab-content';
  apiKeysTab.id = 'api-keys-tab';
  apiKeysTab.style.display = currentTab === 'api-keys' ? 'block' : 'none';
  
  apiKeysTab.innerHTML = `
    <div class="settings-section">
      <h3 class="llm-section-title"><i class="fas fa-key"></i> API Keys Configuration</h3>

      <div class="api-key-group">
        <div class="api-key-label">
          <i class="fas fa-brain"></i> GPT-4o API Key
        </div>
        <div class="api-key-input-container">
          <input type="password" id="gpt4o-key" placeholder="Enter OPENAI API key" autocomplete="off" class="nexus-settings-input text-input">
          <span id="gpt4o-key-status" class="key-status"></span>
          <button class="toggle-visibility-btn" data-for="gpt4o-key"><i class="fas fa-eye"></i></button>
          <button class="save-key-btn" data-provider="gpt4o"><i class="fas fa-save"></i> Save</button>
          <button class="delete-key-btn" data-provider="gpt4o"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="api-key-description">OpenAI API key for GPT-4o - Advanced multimodal LLM with superior reasoning capabilities.</div>
      </div>

      <div class="api-key-group">
        <div class="api-key-label">
          <i class="fas fa-eye"></i> Qwen-2.5-VL API Key
        </div>
        <div class="api-key-input-container">
          <input type="password" id="qwen-key" placeholder="Enter QWEN API key" autocomplete="off" class="nexus-settings-input text-input">
          <span id="qwen-key-status" class="key-status"></span>
          <button class="toggle-visibility-btn" data-for="qwen-key"><i class="fas fa-eye"></i></button>
          <button class="save-key-btn" data-provider="qwen"><i class="fas fa-save"></i> Save</button>
          <button class="delete-key-btn" data-provider="qwen"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="api-key-description">Alibaba Cloud API key for Qwen-2.5-VL 72B - Visual language model with excellent visual grounding.</div>
      </div>

      <div class="api-key-group">
        <div class="api-key-label">
          <i class="fas fa-gem"></i> Gemini-2.5-Pro API Key
        </div>
        <div class="api-key-input-container">
          <input type="password" id="gemini-key" placeholder="Enter GOOGLE API key" autocomplete="off" class="nexus-settings-input text-input">
          <span id="gemini-key-status" class="key-status"></span>
          <button class="toggle-visibility-btn" data-for="gemini-key"><i class="fas fa-eye"></i></button>
          <button class="save-key-btn" data-provider="gemini"><i class="fas fa-save"></i> Save</button>
          <button class="delete-key-btn" data-provider="gemini"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="api-key-description">Google Cloud API key for Gemini-2.5-Pro - Versatile model with strong multimedia capabilities.</div>
      </div>

      <div class="api-key-group">
        <div class="api-key-label">
          <i class="fas fa-window-maximize"></i> UI-TARS API Key
        </div>
        <div class="api-key-input-container">
          <input type="password" id="uitars-key" placeholder="Enter UITARS API key" autocomplete="off" class="nexus-settings-input text-input">
          <span id="uitars-key-status" class="key-status"></span>
          <button class="toggle-visibility-btn" data-for="uitars-key"><i class="fas fa-eye"></i></button>
          <button class="save-key-btn" data-provider="uitars"><i class="fas fa-save"></i> Save</button>
          <button class="delete-key-btn" data-provider="uitars"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="api-key-description">ByteDance API key for UI-TARS - Specialized for UI tasks & visual interpretation.</div>
      </div>

      <div class="api-key-group">
        <div class="api-key-label">
          <i class="fas fa-comment-alt"></i> Claude API Key
        </div>
        <div class="api-key-input-container">
          <input type="password" id="claude-key" placeholder="Enter ANTHROPIC API key" autocomplete="off" class="nexus-settings-input text-input">
          <span id="claude-key-status" class="key-status"></span>
          <button class="toggle-visibility-btn" data-for="claude-key"><i class="fas fa-eye"></i></button>
          <button class="save-key-btn" data-provider="claude"><i class="fas fa-save"></i> Save</button>
          <button class="delete-key-btn" data-provider="claude"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="api-key-description">Anthropic API key for Claude models - High-quality language models with strong safety and instruction-following capabilities.</div>
      </div>

      <div class="api-key-group">
        <div class="api-key-label">
          <i class="fas fa-rocket"></i> Grok API Key
        </div>
        <div class="api-key-input-container">
          <input type="password" id="grok-key" placeholder="Enter GROK API key" autocomplete="off" class="nexus-settings-input text-input">
          <span id="grok-key-status" class="key-status"></span>
          <button class="toggle-visibility-btn" data-for="grok-key"><i class="fas fa-eye"></i></button>
          <button class="save-key-btn" data-provider="grok"><i class="fas fa-save"></i> Save</button>
          <button class="delete-key-btn" data-provider="grok"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="api-key-description">xAI API key for Grok models - Conversational AI with real-time data access and innovative reasoning abilities.</div>
      </div>
    </div>
  `;
  
  // Add validation for API keys
  const validateApiKey = (provider, value) => {
    if (!value || value.trim() === '') {
      return { valid: false, message: 'API key cannot be empty' };
    }
    
    switch (provider) {
      case 'openai':
        return { 
          valid: value.startsWith('sk-'), 
          message: value.startsWith('sk-') ? 'Valid format' : 'OpenAI keys should start with sk-' 
        };
      case 'midscene':
        return { 
          valid: true, // We'll accept any format for now
          message: 'Valid format' 
        };
      case 'google':
        return { 
          valid: true, // We'll accept any format for now
          message: 'Valid format' 
        };
      case 'anthropic':
        return { 
          valid: value.startsWith('sk-ant-'), 
          message: value.startsWith('sk-ant-') ? 'Valid format' : 'Anthropic keys should start with sk-ant-' 
        };
      case 'xai':
        return { 
          valid: value.startsWith('sk-'), 
          message: value.startsWith('sk-') ? 'Valid format' : 'Grok keys should start with sk-' 
        };
      case 'claude':
        return { 
          valid: value.startsWith('sk-ant-'), 
          message: value.startsWith('sk-ant-') ? 'Valid format' : 'Claude keys should start with sk-ant-' 
        };
      case 'grok':
        return { 
          valid: value.startsWith('sk-'), 
          message: value.startsWith('sk-') ? 'Valid format' : 'Grok keys should start with sk-' 
        };
      default:
        return { valid: true, message: 'Valid format' };
    }
  };
  
  // apiKeyForm no longer exists as we've restructured the API Keys tab
  content.appendChild(apiKeysTab);
  
  // LLM Engine Tab
  const llmEngineTab = document.createElement('div');
  llmEngineTab.className = 'tab-content';
  llmEngineTab.id = 'llm-engine-tab';
  llmEngineTab.style.display = currentTab === 'llm-engine' ? 'block' : 'none';
  
  const llmEngineSection = document.createElement('div');
  llmEngineSection.className = 'settings-section';
  llmEngineSection.innerHTML = `
    <h3 class="llm-section-title"><i class="fas fa-robot"></i> Advanced AI Configuration</h3>
    <p>Configure AI processing types, execution modes, and model selection for optimal performance.</p>
    
    <div class="feature-showcase">
      <h4 class="llm-section-title"><i class="fas fa-lightbulb"></i> Smart Processing Types</h4>
      <p>Choose how the AI approaches complex tasks. The processing type determines how the system plans and executes operations.</p>
      <div class="execution-mode-note">
        <i class="fas fa-info-circle"></i>
        <span>Note: YAML commands and UI-TARS model will automatically override this setting. Only modify if you want to force a specific execution type.</span>
      </div>
      
      <div class="processing-types">
        ${processingTypes.map(type => `
          <div class="processing-type-container" data-type-id="${type.id}">
            <div class="processing-type-header">
              <label class="settings-radio-container">
                <input type="radio" name="processing-type" class="processing-type-radio" value="${type.id}">
                <span class="settings-radio-custom"></span>
              </label>
              <div class="processing-type-name">
                <i class="fas ${type.icon}"></i> ${type.name}
                ${type.id === 'yaml-planning' ? '<span class="processing-type-tag">Recommended</span>' : ''}
              </div>
            </div>
            <div class="processing-type-description">${type.description}</div>
            <div class="benefits-list">
              ${type.benefits.map(benefit => `<div class="benefit-tag"><i class="fas fa-check"></i> ${benefit}</div>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div class="feature-showcase">
      <h4><i class="fas fa-cogs"></i> Execution Mode</h4>
      <p>Control how much human oversight you want during task execution:</p>
      
      <div class="execution-mode-container">
        <div class="execution-mode-card" data-mode="step-planning">
          <h4><i class="fas fa-list-ol"></i> Step Planning</h4>
          <p>AI suggests steps one at a time, waiting for your approval. Best for precision work and learning.</p>
        </div>
        <div class="execution-mode-card" data-mode="action-planning">
          <h4><i class="fas fa-rocket"></i> Autopilot</h4>
          <p>AI executes tasks autonomously with minimal interruption. Great for routine tasks and rapid development.</p>
        </div>
      </div>
    </div>

    <div class="feature-showcase">
      <h4><i class="fas fa-file-code"></i> YAML Maps & Structured Execution</h4>
      <p>YAML-based instruction maps provide precision, transparency, and enhanced AI performance.</p>
      
      <div class="yaml-benefits">
        <div class="yaml-benefit">
          <h5><i class="fas fa-bullseye"></i> Higher Accuracy</h5>
          <p>Structured instructions lead to more precise execution and fewer errors</p>
        </div>
        <div class="yaml-benefit">
          <h5><i class="fas fa-bug"></i> Better Debugging</h5>
          <p>Clear steps make it easier to identify where issues occur</p>
        </div>
        <div class="yaml-benefit">
          <h5><i class="fas fa-eye"></i> Transparency</h5>
          <p>See exactly what the AI is planning to do before execution</p>
        </div>
      </div>
    </div>
    
    <div class="model-selection-section">
      <h3 class="llm-section-title"><i class="fas fa-microchip"></i> Model Selection</h3>
      <p>Choose specialized AI models for different types of tasks:</p>
      
      <div class="model-card-container">
        ${engines.map(engine => `
          <div class="model-card" data-engine-id="${engine.id}">
            <div class="model-card-header">
              <div class="model-name"><i class="fas ${engine.icon}"></i> ${engine.name}</div>
              <div class="model-provider">${engine.provider}</div>
            </div>
            <div class="model-description">${engine.description}</div>
            <div class="model-capabilities">
              ${engine.capabilities.map(cap => `<span class="model-capability">${cap}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="llm-dropdown-container">
        <label for="preferred-engine" class="llm-dropdown-label">Default Model</label>
        <select id="preferred-engine" class="llm-dropdown">
          ${engines.map(engine => `<option value="${engine.id}">${engine.name} (${engine.provider})</option>`).join('')}
        </select>
        <div class="llm-tooltip" data-tooltip="This model will be used as the default for all tasks unless overridden by task-specific selections below.">?</div>
      </div>
      
      <div class="llm-dropdown-container">
        <label for="chat-llm-model" class="llm-dropdown-label">Chat Model</label>
        <select id="chat-llm-model" class="llm-dropdown">
          <option value="gpt-4o">GPT-4o (OpenAI)</option>
          <option value="gpt-4o-mini">GPT-4o Mini (OpenAI)</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo (OpenAI)</option>
          <option value="claude-3-opus">Claude 3 Opus (Anthropic)</option>
          <option value="claude-3-sonnet">Claude 3 Sonnet (Anthropic)</option>
          <option value="claude-3-haiku">Claude 3 Haiku (Anthropic)</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro (Google)</option>
          <option value="gemini-1.5-flash">Gemini 1.5 Flash (Google)</option>
          <option value="grok-1">Grok-1 (xAI)</option>
        </select>
        <div class="llm-tooltip" data-tooltip="Used for general conversation, answering questions, and text generation. Select a model that balances quality and cost for your chat needs.">?</div>
      </div>
      
      <div class="llm-dropdown-container">
        <label for="browser-llm-model" class="llm-dropdown-label">Browser Automation Model</label>
        <select id="browser-llm-model" class="llm-dropdown">
          <option value="gpt-4o">GPT-4o (OpenAI) - Recommended</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro (Google)</option>
          <option value="qwen-2.5-vl-72b">Qwen 2.5 VL (Alibaba)</option>
          <option value="ui-tars">UI-TARS (ByteDance)</option>
          <option value="claude-3-opus">Claude 3 Opus (Anthropic)</option>
        </select>
        <div class="llm-tooltip" data-tooltip="Used for browser automation, UI interaction, and visual tasks. Models with strong vision capabilities are recommended for optimal performance.">?</div>
      </div>
    </div>
        <div class="llm-dropdown-container">
        <label for="max-steps" class="llm-dropdown-label">Max Task Steps</label>
        <input 
          type="number" 
          id="max-steps" 
          class="llm-dropdown"
          min="1"
          max="50"
          step="1"
          value="10"
          placeholder="10"
        />
        <div class="llm-tooltip" data-tooltip="Maximum number of steps allowed for task execution. Higher values allow more complex tasks but may increase execution time and cost.">?</div>
      </div>
      
      <div class="save-llm-container">
        <button id="save-llm-preferences-btn"><i class="fas fa-save"></i> Save AI Configuration</button>
      </div>
  `;
  llmEngineTab.appendChild(llmEngineSection);
  content.appendChild(llmEngineTab);
  
  // No duplicate section needed since we already have the modern model selection section above
  
  // Privacy Tab
  const privacyTab = document.createElement('div');
  privacyTab.className = 'tab-content';
  privacyTab.id = 'privacy-tab';
  privacyTab.style.display = currentTab === 'privacy' ? 'block' : 'none';
  
  const privacySection = document.createElement('div');
  privacySection.className = 'settings-section';
  privacySection.innerHTML = `
    <h3><i class="fas fa-shield-alt"></i> Privacy Options</h3>
    <div class="toggle-container">
      <label class="toggle-switch">
        <input type="checkbox" id="privacy-toggle" />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Safe Puppeteer Mode</span>
    </div>
    <p class="setting-description">
      When enabled, puppeteer browser instances will launch with increased security settings.
    </p>
  `;
  privacyTab.appendChild(privacySection);
  content.appendChild(privacyTab);
  
  // Password Tab
  const passwordTab = document.createElement('div');
  passwordTab.className = 'tab-content';
  passwordTab.id = 'password-tab';
  passwordTab.style.display = currentTab === 'password' ? 'block' : 'none';
  
  const passwordSection = document.createElement('div');
  passwordSection.className = 'settings-section';
  passwordSection.innerHTML = `
    <h3><i class="fas fa-lock"></i> Change Password</h3>
    <div class="form-group">
      <label>Current Password</label>
      <input type="password" id="current-password" />
    </div>
    <div class="form-group">
      <label>New Password</label>
      <input type="password" id="new-password" />
    </div>
    <div class="form-group">
      <label>Confirm New Password</label>
      <input type="password" id="confirm-password" />
    </div>
    <button class="btn btn-primary" id="update-password-btn">
      <i class="fas fa-key"></i> Update Password
    </button>
  `;
  
  // Password update button handler
  passwordSection.querySelector('#update-password-btn').addEventListener('click', updatePassword);
  passwordTab.appendChild(passwordSection);
  content.appendChild(passwordTab);
  
  // Interface Tab
  const interfaceTab = document.createElement('div');
  interfaceTab.className = 'tab-content';
  interfaceTab.id = 'interface-tab';
  interfaceTab.style.display = currentTab === 'interface' ? 'block' : 'none';
  
  const interfaceSection = document.createElement('div');
  interfaceSection.className = 'settings-section';
  interfaceSection.innerHTML = `
    <h3><i class="fas fa-palette"></i> Theme Settings</h3>
    <div class="toggle-container">
      <label class="toggle-switch">
        <input type="checkbox" id="dark-mode-toggle" ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Dark Mode</span>
    </div>
    
    <h3 style="margin-top: 24px;"><i class="fas fa-text-height"></i> Text Settings</h3>
    <div class="toggle-container">
      <label class="toggle-switch">
        <input type="checkbox" id="compact-mode-toggle" ${settings.interface.compactMode ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Compact Mode</span>
    </div>
    
    <div class="toggle-container" style="margin-top: 12px;">
      <label class="toggle-switch">
        <input type="checkbox" id="timestamps-toggle" ${settings.interface.showTimestamps ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Show Timestamps</span>
    </div>
  `;
  
  // Theme toggle handler
  interfaceSection.querySelector('#dark-mode-toggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    settings.interface.theme = theme;
    saveSettings();
    showNotification('Theme updated', true);
  });
  
  // Compact mode toggle handler
  interfaceSection.querySelector('#compact-mode-toggle').addEventListener('change', (e) => {
    settings.interface.compactMode = e.target.checked;
    document.body.classList.toggle('compact-mode', e.target.checked);
    saveSettings();
    showNotification('Display mode updated', true);
  });
  
  // Timestamps toggle handler
  interfaceSection.querySelector('#timestamps-toggle').addEventListener('change', (e) => {
    settings.interface.showTimestamps = e.target.checked;
    saveSettings();
    showNotification('Timestamp setting updated', true);
  });
  
  interfaceTab.appendChild(interfaceSection);
  content.appendChild(interfaceTab);
  
  // Accessibility Tab
  const accessibilityTab = document.createElement('div');
  accessibilityTab.className = 'tab-content';
  accessibilityTab.id = 'accessibility-tab';
  accessibilityTab.style.display = currentTab === 'accessibility' ? 'block' : 'none';
  
  const accessibilitySection = document.createElement('div');
  accessibilitySection.className = 'settings-section';
  accessibilitySection.innerHTML = `
    <h3><i class="fas fa-universal-access"></i> Accessibility Options</h3>
    <div class="toggle-container">
      <label class="toggle-switch">
        <input type="checkbox" id="high-contrast-toggle" ${settings.accessibility.highContrast ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">High Contrast Mode</span>
    </div>
    
    <div class="toggle-container" style="margin-top: 12px;">
      <label class="toggle-switch">
        <input type="checkbox" id="large-text-toggle" ${settings.accessibility.largeText ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Large Text</span>
    </div>
    
    <div class="toggle-container" style="margin-top: 12px;">
      <label class="toggle-switch">
        <input type="checkbox" id="focus-outlines-toggle" ${settings.accessibility.focusOutlines ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-label">Focus Outlines</span>
    </div>
    
    <div class="settings-group" style="margin-top: 24px;">
      <h4 class="settings-subtitle"><i class="fas fa-bell"></i> Notification Settings</h4>
      
      <div class="setting-item">
        <div class="setting-label-container">
          <label for="notification-position-select" class="setting-label">Notification Position</label>
          <p class="setting-description">Choose where notifications appear on screen</p>
        </div>
        <div class="setting-control dropdown-container">
          <select id="notification-position-select" class="settings-select">
            <option value="top-right" ${settings.accessibility.notificationPosition === 'top-right' ? 'selected' : ''}>Top Right</option>
            <option value="top-left" ${settings.accessibility.notificationPosition === 'top-left' ? 'selected' : ''}>Top Left</option>
            <option value="bottom-right" ${settings.accessibility.notificationPosition === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
            <option value="bottom-left" ${settings.accessibility.notificationPosition === 'bottom-left' ? 'selected' : ''}>Bottom Left</option>
          </select>
          <i class="fas fa-chevron-down select-arrow"></i>
        </div>
      </div>
    </div>
  `;
  
  // Accessibility toggle handlers
  accessibilitySection.querySelector('#high-contrast-toggle').addEventListener('change', (e) => {
    settings.accessibility.highContrast = e.target.checked;
    document.body.classList.toggle('high-contrast', e.target.checked);
    saveAllSettings(); // Fixed: using saveAllSettings instead of undefined saveSettings
    showNotification('Contrast setting updated', true);
  });
  
  accessibilitySection.querySelector('#large-text-toggle').addEventListener('change', (e) => {
    settings.accessibility.largeText = e.target.checked;
    document.body.classList.toggle('large-text', e.target.checked);
    saveAllSettings(); // Fixed: using saveAllSettings instead of undefined saveSettings
    showNotification('Text size setting updated', true);
  });
  
  accessibilitySection.querySelector('#focus-outlines-toggle').addEventListener('change', (e) => {
    settings.accessibility.focusOutlines = e.target.checked;
    document.body.classList.toggle('focus-outlines', e.target.checked);
    saveAllSettings(); // Fixed: using saveAllSettings instead of undefined saveSettings
    showNotification('Focus outline setting updated', true);
  });
  
  // Notification position handler
  accessibilitySection.querySelector('#notification-position-select').addEventListener('change', (e) => {
    const newPosition = e.target.value;
    settings.accessibility.notificationPosition = newPosition;
    saveAllSettings(); // Fixed: using saveAllSettings instead of undefined saveSettings
    
    // Emit an event to update the notification position
    eventBus.emit('notification-position-change', { position: newPosition });
    
    // Show confirmation notification
    showNotification(`Notification position set to ${newPosition.replace('-', ' ')}`, 'success', 3000);
    
    console.log('[SETTINGS] Notification position changed to:', newPosition);
  });
  
  accessibilityTab.appendChild(accessibilitySection);
  content.appendChild(accessibilityTab);

  // Add Billing Tab after all other tabs
  const billingTab = document.createElement('div');
  billingTab.className = 'tab-content';
  billingTab.id = 'billing-tab';
  billingTab.style.display = currentTab === 'billing' ? 'block' : 'none';
  
  // Create billing section using the same pattern as other tabs
  const billingSection = document.createElement('div');
  billingSection.className = 'settings-section';
  
  // Add billing section header
  const billingHeader = document.createElement('h3');
  billingHeader.innerHTML = '<i class="fas fa-money-bill-wave"></i> Billing & Usage';
  billingSection.appendChild(billingHeader);
  
  // Add token usage stats section
  const tokenUsageDiv = document.createElement('div');
  tokenUsageDiv.className = 'billing-stats';
  tokenUsageDiv.innerHTML = `
    <div class="billing-stats-card">
      <h4>Token Balance</h4>
      <div class="token-balance">
        <div class="token-amount">1,000</div>
        <div class="token-label">RATOR tokens available</div>
      </div>
    </div>
  `;
  billingSection.appendChild(tokenUsageDiv);
  
  // Add subscription plans section
  const plansDiv = document.createElement('div');
  plansDiv.className = 'billing-plans';
  plansDiv.innerHTML = `
    <h4>Subscription Plans</h4>
    <div class="plan-cards">
      <div class="plan-card active">
        <div class="plan-name">Free</div>
        <div class="plan-price">$0/month</div>
        <div class="plan-features">
          <div class="plan-feature">1,000 RATOR tokens</div>
          <div class="plan-feature">Basic access</div>
        </div>
        <div class="plan-status">Current Plan</div>
      </div>
      <div class="plan-card">
        <div class="plan-name">Basic</div>
        <div class="plan-price">$9.99/month</div>
        <div class="plan-features">
          <div class="plan-feature">15,000 RATOR tokens</div>
          <div class="plan-feature">Priority support</div>
        </div>
        <button class="plan-button">Subscribe</button>
      </div>
      <div class="plan-card">
        <div class="plan-name">Pro</div>
        <div class="plan-price">$29.99/month</div>
        <div class="plan-features">
          <div class="plan-feature">50,000 RATOR tokens</div>
          <div class="plan-feature">Premium support</div>
        </div>
        <button class="plan-button">Subscribe</button>
      </div>
    </div>
  `;
  billingSection.appendChild(plansDiv);
  
  // Add token purchase section
  const purchaseDiv = document.createElement('div');
  purchaseDiv.className = 'token-purchase';
  purchaseDiv.innerHTML = `
    <h4>Purchase Additional Tokens</h4>
    <div class="purchase-form">
      <div class="input-group">
        <label for="token-amount">Amount (USD):</label>
        <div class="input-with-prefix">
          <span class="input-prefix">$</span>
          <input type="number" id="token-amount" value="10" min="1" step="1">
        </div>
      </div>
      <div class="token-estimate">You will receive: <span>10,000 RATOR tokens</span></div>
      <button id="purchase-tokens-btn" class="purchase-button">Purchase Tokens</button>
    </div>
  `;
  billingSection.appendChild(purchaseDiv);
  
  // Add transaction history placeholder
  const historyDiv = document.createElement('div');
  historyDiv.className = 'transaction-history';
  historyDiv.innerHTML = `
    <h4>Transaction History</h4>
    <div class="no-transactions">
      <p>No transactions yet.</p>
    </div>
  `;
  billingSection.appendChild(historyDiv);
  
  billingTab.appendChild(billingSection);
  content.appendChild(billingTab);
  modalContainer.appendChild(header);
  modalContainer.appendChild(tabsContainer);
  modalContainer.appendChild(content);

  // Create modal footer
  const footer = document.createElement('div');
  footer.className = 'settings-modal-footer';
  footer.innerHTML = `
    <button id="close-settings-btn"><i class="fas fa-times"></i> Close</button>
    <button id="save-all-changes-btn"><i class="fas fa-save"></i> Save All Changes</button>
  `;
  
  modalContainer.appendChild(footer);
  
  // Setup password toggle functionality after the modal is shown
function setupPasswordToggles() {
    const toggleBtns = document.querySelectorAll('.toggle-password-btn');
    toggleBtns.forEach(btn => {
      // Remove any existing event listeners to prevent duplicates
      btn.removeEventListener('click', togglePasswordVisibility);
      
      // Add the event listener
      btn.addEventListener('click', togglePasswordVisibility);
    });
  }

  // Separate function to handle password visibility toggle
  function togglePasswordVisibility() {
    console.log('Toggle password visibility clicked');
    const container = this.closest('.api-key-input-container');
    const input = container.querySelector('input[type]');
    const icon = this.querySelector('i');
    
    if (!input) {
      console.error('No input element found in container', container);
      return;
    }
    
    console.log('Toggling input type from', input.type);
    
    // For API keys that are stored in the database but not shown in the input
    if (input.type === 'password') {
      input.type = 'text';
      if (input.value === '' && (input.getAttribute('data-key-stored') === 'true' || input.placeholder.includes('•••••'))) {
        // Fetch the actual API key from the backend
        const providerMatch = input.id.match(/^(.*)-key$/);
        const provider = providerMatch ? providerMatch[1] : null;
        if (provider) {
          fetch(`/api/settings/api-keys/${provider}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          })
            .then(response => response.json())
            .then(data => {
              if (data && data.success && data.apiKey) {
                input.value = data.apiKey;
                input.classList.add('showing-stored-key');
              } else {
                input.value = '[API Key exists in database]';
                input.classList.add('placeholder-text');
              }
            })
            .catch(() => {
              input.value = '[API Key exists in database]';
              input.classList.add('placeholder-text');
            });
        } else {
          input.value = '[API Key exists in database]';
          input.classList.add('placeholder-text');
        }
      }
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      input.type = 'password';
      
      // Clear the placeholder text or stored key if we added it
      if ((input.value === '[API Key exists in database]' && input.classList.contains('placeholder-text')) || input.classList.contains('showing-stored-key')) {
        input.value = '';
        input.classList.remove('placeholder-text');
        input.classList.remove('showing-stored-key');
      }
      
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }

  // Assemble the modal components
  overlay.appendChild(modalContainer);
  overlay.appendChild(notification);
  container.appendChild(overlay);
  
  // Add to DOM
  document.body.appendChild(container);
  
  // Set initial display style
  overlay.style.display = 'none';
  
  // Initialize
  function initialize() {
    try {
      console.log("Initializing settings modal");
      
      // Select the first tab by default
      selectTab('api-keys');
      
      // Set up event listeners for tab switching
      const tabButtons = tabsContainer.querySelectorAll('.settings-tab');
      if (tabButtons && tabButtons.length > 0) {
        Array.from(tabButtons).forEach(tab => {
          tab.addEventListener('click', () => {
            selectTab(tab.dataset.tab);
          });
        });
        console.log(`Set up ${tabButtons.length} tab button listeners`);
      } else {
        console.warn("No tab buttons found to set up listeners");
      }
      
      // We'll defer the setup of other listeners until the modal is shown
      // to ensure elements are properly rendered in the DOM
      
      // Load settings from the server
    loadSettings();
    console.log("Settings modal initialized successfully");
    
    // Emit settings-initialized event to trigger the wormhole hiding
    // This is the optimal time as all core UI components are initialized
    const settingsReadyEvent = new Event('settings-initialized');
    document.dispatchEvent(settingsReadyEvent);
    console.log('[Settings] Emitted settings-initialized event to hide wormhole');
    } catch (err) {
      console.error("Error initializing settings modal:", err);
    }
  }
  
  initialize();
  
  // ===== FUNCTIONALITY =====
  
  // Function to select a tab
  function selectTab(tabId) {
    currentTab = tabId;
    
    // Update tab buttons
    const allTabButtons = tabsContainer.children;
    Array.from(allTabButtons).forEach(button => {
      if (button.dataset.tab === tabId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Update content visibility
    const allTabContents = content.children;
    Array.from(allTabContents).forEach(tabContent => {
      if (tabContent.id === `${tabId}-tab`) {
        tabContent.style.display = 'block';
      } else {
        tabContent.style.display = 'none';
      }
    });
    
    // Special handler for billing tab
    if (tabId === 'billing') {
      // Update token amount display based on latest usage data
      // This would normally fetch data from API but we're showing static data for now
      const tokenAmountInput = document.getElementById('token-amount');
      if (tokenAmountInput) {
        // Update token estimate when amount changes
        tokenAmountInput.addEventListener('input', function() {
          const amount = parseFloat(this.value) || 0;
          const tokenEstimate = amount * 1000; // 1 USD = 1000 RATOR tokens
          const tokenEstimateElement = document.querySelector('.token-estimate span');
          if (tokenEstimateElement) {
            tokenEstimateElement.textContent = tokenEstimate.toLocaleString() + ' RATOR tokens';
          }
        });
      }
      
      // Add purchase button handler
      const purchaseButton = document.getElementById('purchase-tokens-btn');
      if (purchaseButton) {
        purchaseButton.addEventListener('click', function() {
          const amount = parseFloat(document.getElementById('token-amount').value) || 0;
          if (amount <= 0) {
            showNotification('Please enter a valid amount', false);
            return;
          }
          
          // Mock purchase success
          showNotification(`Successfully purchased ${(amount * 1000).toLocaleString()} RATOR tokens`, true);
        });
      }
    }
  }
  
  // Function to show notification
  function showNotification(message, isSuccess) {
    const notification = document.querySelector('.settings-notification');
    notification.className = isSuccess ? 
      'settings-notification success show' : 
      'settings-notification error show';
    
    document.querySelector('.notification-message').textContent = message;
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
  
  // Get a human-readable display name for an engine ID
  // Matches the server-side implementation
  function getEngineDisplayName(engineId) {
    const displayNames = {
      'gpt-4o': 'OpenAI GPT-4o',
      'qwen-2.5-vl-72b': 'Qwen 2.5',
      'gemini-2.5-pro': 'Google Gemini',
      'ui-tars': 'UI-TARS'
    };
    return displayNames[engineId] || engineId;
  }
  
  // Function to add API key
  async function addApiKey(provider) {
    console.log(`Adding API key for provider: ${provider}`);
    const input = document.getElementById(`${provider}-key`);
    const key = input.value.trim();
    
    if (!key) {
      showNotification('Please enter an API key', false);
      return;
    }
    
    try {
      // Standard key type mapping for frontend providers
      // This should match the server-side ENGINE_KEY_MAPPING
      const apiKeyTypeMap = {
        'openai': 'openai',      // For GPT-4o
        'qwen': 'qwen',          // For Qwen models
        'gemini': 'google',      // For Google Gemini
        'uitars': 'uitars'       // For UI-TARS
      };
      
      const serverProvider = apiKeyTypeMap[provider] || provider;
      console.log(`Mapped provider ${provider} to server provider ${serverProvider}`);
      
      // Get the corresponding engine for this key type
      const engineMap = {
        'openai': 'gpt-4o',
        'qwen': 'qwen-2.5-vl-72b',
        'google': 'gemini-2.5-pro',
        'uitars': 'ui-tars'
      };
      
      // Use the imported saveApiKey utility function instead of direct fetch
      const response = await saveApiKey(serverProvider, key);
      console.log('Save API key response:', response);
      
      if (response && response.success) {
        // Cache the key before clearing the input
        cacheApiKey(input, key);
        input.value = '';
        await loadSettings();
        const engineName = engineMap[serverProvider] ? 
          getEngineDisplayName(engineMap[serverProvider]) : 
          provider.toUpperCase();
          
        showNotification(`${engineName} API key added successfully`, true);
      } else {
        showNotification(`Failed to add API key: ${response?.error || 'Unknown error'}`, false);
      }
    } catch (error) {
      console.error('Error adding API key:', error);
      showNotification(`Error adding API key: ${error.message}`, false);
    }
  }
  
  // Function to delete API key
  async function removeApiKey(provider) {
    console.log(`Deleting API key for provider: ${provider}`);
    try {
      // Use the same standard key type mapping as in addApiKey
      const apiKeyTypeMap = {
        'openai': 'openai',      // For GPT-4o
        'qwen': 'qwen',          // For Qwen models
        'gemini': 'google',      // For Google Gemini
        'uitars': 'uitars'       // For UI-TARS
      };
      
      const serverProvider = apiKeyTypeMap[provider] || provider;
      console.log(`Mapped provider ${provider} to server provider ${serverProvider}`);
      
      // Get the corresponding engine for this key type
      const engineMap = {
        'openai': 'gpt-4o',
        'qwen': 'qwen-2.5-vl-72b',
        'google': 'gemini-2.5-pro',
        'uitars': 'ui-tars'
      };
      
      // Use the imported deleteApiKey utility function instead of direct fetch
      const response = await deleteApiKey(serverProvider);
      console.log('Delete API key response:', response);
      
      if (response && response.success) {
        await loadSettings();
        
        const engineName = engineMap[serverProvider] ? 
          getEngineDisplayName(engineMap[serverProvider]) : 
          provider.toUpperCase();
          
        showNotification(`${engineName} API key deleted successfully`, true);
      } else {
        showNotification(`Failed to delete API key: ${response?.error || 'Unknown error'}`, false);
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      showNotification(`Error deleting API key: ${error.message}`, false);
    }
  }
  
  // Function to update password
  async function updatePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (!currentPassword || !newPassword) {
      showNotification('Please fill in all password fields', false);
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showNotification('New passwords do not match', false);
      return;
    }
    
    try {
      const response = await fetch('/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });
      
      if (response.ok) {
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        showNotification('Password updated successfully', true);
      } else {
        showNotification('Failed to update password', false);
      }
    } catch (error) {
      console.error('Error updating password:', error);
      showNotification('Error updating password', false);
    }
  }
  
  // Function to set default engine
  async function setDefaultEngine(engineId) {
    try {
      const response = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          preferredEngine: engineId
        })
      });
      
      if (response.ok) {
        if (!settings.modelPreferences) {
          settings.modelPreferences = {};
        }
        settings.modelPreferences.preferredEngine = engineId;
        // For backward compatibility
        settings.preferredEngine = engineId;
        showNotification('Default LLM updated', true);
      } else {
        showNotification('Failed to update default LLM', false);
      }
    } catch (error) {
      console.error('Error setting default engine:', error);
      showNotification('Error updating default LLM', false);
    }
  }
  
  // Function to toggle privacy mode
  async function togglePrivacyMode(enabled) {
    try {
      const response = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          privacyMode: enabled
        })
      });
      
      if (response.ok) {
        settings.privacyMode = enabled;
        showNotification(`Privacy mode ${enabled ? 'enabled' : 'disabled'}`, true);
      } else {
        showNotification('Failed to update privacy mode', false);
      }
    } catch (error) {
      console.error('Error toggling privacy mode:', error);
      showNotification('Error updating privacy mode', false);
    }
  }
  
  // Function to load settings from server
  async function loadSettingsFromServer() {
    try {
      const response = await getSettings();
      
      if (response && response.success) {
        const { settings } = response;
        
        // Set API key indicators
        if (settings.apiKeys) {
          Object.keys(settings.apiKeys).forEach(provider => {
            const hasKey = settings.apiKeys[provider];
            if (hasKey) {
              const statusElem = document.getElementById(`${provider}-key-status`);
              if (statusElem) {
                statusElem.textContent = 'API key is set';
                statusElem.className = 'key-status success';
              } else {
                console.warn(`Status element for ${provider} not found in settings modal`);
              }  }
                
                // Update placeholder to indicate key is set
                const input = document.getElementById(`${provider}-key`);
                if (input) {
                  input.placeholder = '••••••••••••••••••••••••••';
                }
              });
        }
        
        // Set engine preference
        if (settings.preferences && settings.preferences.defaultEngine) {
          const engineSelect = document.getElementById('engine-select');
          if (engineSelect) {
            engineSelect.value = settings.preferences.defaultEngine;
          }
        }
        
        // Set theme preference
        if (settings.preferences && settings.preferences.theme) {
          const themeSelect = document.getElementById('theme-select');
          if (themeSelect) {
            themeSelect.value = settings.preferences.theme;
          }
        }
        
        // Set accessibility preferences
        if (settings.preferences && settings.preferences.accessibility) {
          const { accessibility } = settings.preferences;
          
          if (accessibility.reduceMotion !== undefined) {
            const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
            if (reduceMotionToggle) {
              reduceMotionToggle.checked = accessibility.reduceMotion;
            }
          }
          
          if (accessibility.highContrast !== undefined) {
            const highContrastToggle = document.getElementById('high-contrast-toggle');
            if (highContrastToggle) {
              highContrastToggle.checked = accessibility.highContrast;
            }
          }
          
          if (accessibility.largeText !== undefined) {
            const largeTextToggle = document.getElementById('large-text-toggle');
            if (largeTextToggle) {
              largeTextToggle.checked = accessibility.largeText;
            }
          }
        }
        
        // Set privacy preferences
        if (settings.preferences && settings.preferences.privacy) {
          const { privacy } = settings.preferences;
          
          if (privacy.saveHistory !== undefined) {
            const saveHistoryToggle = document.getElementById('save-history-toggle');
            if (saveHistoryToggle) {
              saveHistoryToggle.checked = privacy.saveHistory;
            }
          }
          
          if (privacy.analytics !== undefined) {
            const analyticsToggle = document.getElementById('analytics-toggle');
            if (analyticsToggle) {
              analyticsToggle.checked = privacy.analytics;
            }
          }
        }
        
        // Set interface preferences
        if (settings.preferences && settings.preferences.interface) {
          const { interface: ui } = settings.preferences;
          
          if (ui.compactMode !== undefined) {
            const compactModeToggle = document.getElementById('compact-mode-toggle');
            if (compactModeToggle) {
              compactModeToggle.checked = ui.compactMode;
            }
          }
          
          if (ui.showHelp !== undefined) {
            const showHelpToggle = document.getElementById('show-help-toggle');
            if (showHelpToggle) {
              showHelpToggle.checked = ui.showHelp;
            }
          }
        }
        
        // Set LLM preferences
        if (settings.preferences && settings.preferences.llmPreferences) {
          const { llmPreferences } = settings.preferences;
          
          if (llmPreferences.default !== undefined) {
            const defaultModelSelect = document.getElementById('default-llm-model');
            if (defaultModelSelect) {
              defaultModelSelect.value = llmPreferences.default;
            }
          }
          
          if (llmPreferences.code !== undefined) {
            const codeModelSelect = document.getElementById('code-llm-model');
            if (codeModelSelect) {
              codeModelSelect.value = llmPreferences.code;
            }
          }
          
          if (llmPreferences.content !== undefined) {
            const contentModelSelect = document.getElementById('content-llm-model');
            if (contentModelSelect) {
              contentModelSelect.value = llmPreferences.content;
            }
          }
          
          if (llmPreferences.research !== undefined) {
            const researchModelSelect = document.getElementById('research-llm-model');
            if (researchModelSelect) {
              researchModelSelect.value = llmPreferences.research;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showNotification('Error', 'Failed to load settings. Please try again.', 'error');
    }
  }
  
  // Function to render API keys
  function renderApiKeys(keys) {
  Object.keys(keys).forEach(provider => {
    const hasKey = keys[provider];
    if (hasKey) {
      const statusElem = document.getElementById(`${provider}-key-status`);
      if (statusElem) {
        statusElem.textContent = 'API key is set';
        statusElem.className = 'key-status success';
      } else {
        console.warn(`Status element for ${provider} not found`);
      }
      // Update placeholder to indicate key is set
      const input = document.getElementById(`${provider}-key`);
      if (input) {
        input.placeholder = '••••••••••••••••••••••••••';
      }
    }
  });
}
  
  // Function to render engine options
  function renderEngineOptions(selectedEngine) {
    const container = document.getElementById('engine-options');
    container.innerHTML = '';
    
    // Add a global CSS rule for disabled options
    if (!document.getElementById('disabled-engine-style')) {
      const style = document.createElement('style');
      style.id = 'disabled-engine-style';
      style.textContent = `
        .radio-option.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .radio-option.disabled input {
          cursor: not-allowed;
        }
        .radio-option.disabled label {
          cursor: not-allowed;
        }
        .tooltip {
          position: relative;
          display: inline-block;
        }
        .tooltip .tooltip-text {
          visibility: hidden;
          width: 220px;
          background-color: #333;
          color: #fff;
          text-align: center;
          border-radius: 6px;
          padding: 8px;
          position: absolute;
          z-index: 1;
          bottom: 125%;
          left: 50%;
          margin-left: -110px;
          opacity: 0;
          transition: opacity 0.3s;
          font-size: 12px;
        }
        .tooltip:hover .tooltip-text {
          visibility: visible;
          opacity: 1;
        }
      `;
      document.head.appendChild(style);
    }
    
    engines.forEach(engine => {
      const option = document.createElement('div');
      option.className = 'radio-option';
      if (engine.disabled) {
        option.classList.add('disabled');
        option.classList.add('tooltip');
      }
      
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'default-engine';
      radio.id = `engine-${engine.id}`;
      radio.value = engine.id;
      radio.checked = engine.id === selectedEngine;
      radio.disabled = engine.disabled;
      
      if (!engine.disabled) {
        radio.addEventListener('change', () => {
          if (radio.checked) {
            setDefaultEngine(engine.id);
          }
        });
      }
      
      const label = document.createElement('label');
      label.htmlFor = `engine-${engine.id}`;
      label.textContent = engine.name;
      
      // Add tooltip if disabled
      if (engine.disabled && engine.tooltip) {
        const tooltipText = document.createElement('span');
        tooltipText.className = 'tooltip-text';
        tooltipText.textContent = engine.tooltip;
        option.appendChild(tooltipText);
      }
      
      option.appendChild(radio);
      option.appendChild(label);
      container.appendChild(option);
    });
  }
  
  // Function to save all settings
  function saveAllSettings() {
    // Any settings not directly tied to API calls
    const interfaceSettings = {
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      compactMode: document.getElementById('compact-mode-toggle').checked,
      showTimestamps: document.getElementById('timestamps-toggle').checked
    };
    
    // Get notification position from the select element
    const notificationPositionSelect = document.getElementById('notification-position-select');
    const notificationPosition = notificationPositionSelect ? notificationPositionSelect.value : 'bottom-left';
    
    const accessibilitySettings = {
      highContrast: document.getElementById('high-contrast-toggle').checked,
      largeText: document.getElementById('large-text-toggle') ? document.getElementById('large-text-toggle').checked : (settings.accessibility?.largeText || false),
      focusOutlines: document.getElementById('focus-outlines-toggle') ? document.getElementById('focus-outlines-toggle').checked : (settings.accessibility?.focusOutlines || false),
      notificationPosition: notificationPosition
    };
    
    console.log('[SETTINGS] Saving notification position:', notificationPosition);
    
    const llmPreferences = {
      default: document.getElementById('default-llm-model') ? document.getElementById('default-llm-model').value : (settings.llmPreferences?.default || ''),
      code: document.getElementById('code-llm-model') ? document.getElementById('code-llm-model').value : (settings.llmPreferences?.code || ''),
      content: document.getElementById('content-llm-model') ? document.getElementById('content-llm-model').value : (settings.llmPreferences?.content || ''),
      research: document.getElementById('research-llm-model') ? document.getElementById('research-llm-model').value : (settings.llmPreferences?.research || '')
    };
    
    settings.interface = interfaceSettings;
    settings.accessibility = accessibilitySettings;
    settings.llmPreferences = llmPreferences;
    // Save to localStorage
    persistSettings(settings);
    
    showNotification('All settings saved', true);
  }
  
  // Function to load settings from the server
  async function loadSettings() {
    try {
      console.log('Loading settings from server...');
      const response = await getSettings();
      
      if (response && response.success) {
        console.log('Settings loaded successfully:', response);
        const { settings } = response;
        // Show all API key indicators for all supported providers
        try {
          console.log('Rendering API key statuses from settings:', settings.apiKeys);
          
          // Process each backend provider and update corresponding DOM elements
          const allProviders = Object.keys(PROVIDER_TO_DOM_ID);
          allProviders.forEach(provider => {
            // Get the DOM ID from provider (e.g., 'openai' -> 'gpt4o')
            const domId = PROVIDER_TO_DOM_ID[provider];
            // Check if user has this key
            const hasKey = settings.apiKeys && settings.apiKeys[provider] === true;
            
            console.log(`Provider: ${provider}, DOM ID: ${domId}, Has Key: ${hasKey}`);
            
            // Update status indicator
            const statusElem = document.getElementById(`${domId}-key-status`);
            if (statusElem) {
              statusElem.textContent = hasKey ? 'API key is set' : '';
              statusElem.className = hasKey ? 'key-status success' : 'key-status';
            } else {
              console.warn(`Status element for ${domId} (provider: ${provider}) not found`);
            }
            
            // Update input field placeholder and data attribute
            const inputElem = document.getElementById(`${domId}-key`);
            if (inputElem) {
              if (hasKey) {
                inputElem.placeholder = '••••••••••••••••••••••••••';
                inputElem.setAttribute('data-key-stored', 'true');
                inputElem.value = ''; // Ensure field is empty
              } else {
                inputElem.placeholder = `Enter ${provider.toUpperCase()} API key`;
                inputElem.setAttribute('data-key-stored', 'false');
              }
            } else {
              console.warn(`Input element for ${domId} (provider: ${provider}) not found`);
            }
          });
        } catch (err) {
          console.error('Error rendering API key statuses:', err);
        }
        if (settings.preferences && settings.preferences.defaultEngine) {
          const engineSelect = document.getElementById('engine-select');
          if (engineSelect) {
            engineSelect.value = settings.preferences.defaultEngine;
          }
        }
        
        // Set theme preference
        if (settings.preferences && settings.preferences.theme) {
          const themeSelect = document.getElementById('theme-select');
          if (themeSelect) {
            themeSelect.value = settings.preferences.theme;
          }
        }
        
        // Set accessibility preferences
        if (settings.preferences && settings.preferences.accessibility) {
          const { accessibility } = settings.preferences;
          
          if (accessibility.reduceMotion !== undefined) {
            const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
            if (reduceMotionToggle) {
              reduceMotionToggle.checked = accessibility.reduceMotion;
            }
          }
          
          if (accessibility.highContrast !== undefined) {
            const highContrastToggle = document.getElementById('high-contrast-toggle');
            if (highContrastToggle) {
              highContrastToggle.checked = accessibility.highContrast;
            }
          }
          
          if (accessibility.largeText !== undefined) {
            const largeTextToggle = document.getElementById('large-text-toggle');
            if (largeTextToggle) {
              largeTextToggle.checked = accessibility.largeText;
            }
          }
        }
        
        // Set privacy preferences
        if (settings.preferences && settings.preferences.privacy) {
          const { privacy } = settings.preferences;
          
          if (privacy.saveHistory !== undefined) {
            const saveHistoryToggle = document.getElementById('save-history-toggle');
            if (saveHistoryToggle) {
              saveHistoryToggle.checked = privacy.saveHistory;
            }
          }
          
          if (privacy.analytics !== undefined) {
            const analyticsToggle = document.getElementById('analytics-toggle');
            if (analyticsToggle) {
              analyticsToggle.checked = privacy.analytics;
            }
          }
        }
        
        // Set interface preferences
        if (settings.preferences && settings.preferences.interface) {
          const { interface: ui } = settings.preferences;
          
          if (ui.compactMode !== undefined) {
            const compactModeToggle = document.getElementById('compact-mode-toggle');
            if (compactModeToggle) {
              compactModeToggle.checked = ui.compactMode;
            }
          }
          
          if (ui.showHelp !== undefined) {
            const showHelpToggle = document.getElementById('show-help-toggle');
            if (showHelpToggle) {
              showHelpToggle.checked = ui.showHelp;
            }
          }
        }
        
        // Set LLM preferences
        if (settings.preferences && settings.preferences.llmPreferences) {
          const { llmPreferences } = settings.preferences;
          
          if (llmPreferences.default !== undefined) {
            const defaultModelSelect = document.getElementById('default-llm-model');
            if (defaultModelSelect) {
              defaultModelSelect.value = llmPreferences.default;
            }
          }
          
          if (llmPreferences.code !== undefined) {
            const codeModelSelect = document.getElementById('code-llm-model');
            if (codeModelSelect) {
              codeModelSelect.value = llmPreferences.code;
            }
          }
          
          if (llmPreferences.content !== undefined) {
            const contentModelSelect = document.getElementById('content-llm-model');
            if (contentModelSelect) {
              contentModelSelect.value = llmPreferences.content;
            }
          }
          
          if (llmPreferences.research !== undefined) {
            const researchModelSelect = document.getElementById('research-llm-model');
            if (researchModelSelect) {
              researchModelSelect.value = llmPreferences.research;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showNotification('Failed to load settings', 'error');
    }
  }
  
  // Function to show notification
  function showNotification(title, message, type = 'info') {
    const notification = document.querySelector('.settings-notification');
    const titleElem = notification.querySelector('.notification-title');
    const messageElem = notification.querySelector('.notification-message');
    
    // Set content
    titleElem.textContent = title;
    messageElem.textContent = message;
    
    // Set type class
    notification.className = 'settings-notification';
    notification.classList.add(`notification-${type}`);
    
    // Show notification
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
    
    // Hide after 5 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(20px)';
    }, 5000);
  }
  
  // Save LLM Preferences
  const saveLlmPreferences = async () => {
    try {
      // Model dropdowns initialization
      const preferredEngineSelect = document.getElementById('preferred-engine');
      const chatLlmModelSelect = document.getElementById('chat-llm-model');
      const browserLlmModelSelect = document.getElementById('browser-llm-model');
      const defaultModel = document.getElementById('default-llm-model').value;
      const codeModel = document.getElementById('code-llm-model').value;
      const contentModel = document.getElementById('content-llm-model').value;
      const researchModel = document.getElementById('research-llm-model').value;
      
      // Prepare data object
      const modelPreferences = {
        default: defaultModel,
        code: codeModel,
        content: contentModel,
        research: researchModel
      };
      
      // Call API
      const response = await saveLlmPreferences(modelPreferences);
      
      if (response && response.success) {
        showNotification('LLM preferences saved successfully', 'success');
      } else {
        throw new Error(response.error || 'Failed to save LLM preferences');
      }
    } catch (error) {
      console.error('Error saving LLM preferences:', error);
      showNotification(`Error: ${error.message || 'Failed to save LLM preferences'}`, 'error');
    }
  };
  
  // Setup API Key Form Listeners
  function setupAPIKeyFormListeners() {
    // Import required API functions
    import('../api/settings.js').then(({ saveApiKey, deleteApiKey, getApiKey }) => {
      console.log('API key management functions loaded');
      
      // ==== TOGGLE VISIBILITY BUTTONS ====
      const toggleButtons = document.querySelectorAll('.toggle-visibility-btn');
      Array.from(toggleButtons).forEach(button => {
        button.addEventListener('click', async (e) => {
          console.log('Toggle password visibility clicked');
          // Get the input field this button controls
          const inputId = button.getAttribute('data-for');
          const inputField = document.getElementById(inputId);
          
          if (!inputField) {
            console.error(`Input field ${inputId} not found`);
            return;
          }
          
          // Extract the provider from the input ID (e.g., 'gpt4o-key' -> 'gpt4o')
          const domId = inputId.replace('-key', '');
          const provider = DOM_ID_TO_PROVIDER[domId];
          
          if (!provider) {
            console.error(`Could not map ${domId} to provider`);
            return;
          }
          
          console.log(`Toggling input type from ${inputField.type}`);
          const isPassword = inputField.type === 'password';
          
          // If showing the text and key is in DB but not in field
          if (isPassword && inputField.getAttribute('data-key-stored') === 'true' && !inputField.value) {
            try {
              // Fetch the actual key from the backend
              console.log(`Fetching key for provider: ${provider}`);
              const response = await getApiKey(provider);
              console.log('API key response:', response);
              
              // Handle different possible response formats
              if (response && response.success) {
                // The key could be in .key, .apiKey, or directly in .data
                const keyValue = response.key || response.apiKey || 
                                (response.data ? response.data.key || response.data.apiKey || response.data : null);
                                
                if (keyValue) {
                  console.log(`Key found for ${provider}, showing key`);
                  inputField.value = keyValue;
                  inputField.classList.add('showing-stored-key');
                  inputField.type = 'text'; // Ensure it's visible
                } else {
                  console.error(`Key not found in response for ${provider}:`, response);
                  inputField.type = 'text'; // Still change to text type
                }
              } else {
                console.error(`Failed to get key for ${provider}:`, response);
                inputField.type = 'text'; // Still change to text type
              }
            } catch (err) {
              console.error(`Error fetching API key for ${provider}:`, err);
              inputField.type = 'text'; // Still change to text type
            }
          }
          
          // Toggle visibility
          if (isPassword) {
            inputField.type = 'text';
            const icon = button.querySelector('i');
            if (icon) icon.className = 'fas fa-eye-slash';
          } else {
            inputField.type = 'password';
            
            // Clear placeholder or fetched key when hiding
            if (inputField.classList.contains('placeholder-text') || 
                inputField.classList.contains('showing-stored-key')) {
              inputField.value = '';
              inputField.classList.remove('placeholder-text');
              inputField.classList.remove('showing-stored-key');
            }
            
            const icon = button.querySelector('i');
            if (icon) icon.className = 'fas fa-eye';
          }
        });
      });
      
      // ==== SAVE API KEY BUTTONS ====
      const saveButtons = document.querySelectorAll('.save-key-btn');
      Array.from(saveButtons).forEach(button => {
        button.addEventListener('click', async (e) => {
          // Disable button to prevent double-clicks
          button.disabled = true;
          
          try {
            // Get the button's target provider from DOM
            const domId = button.getAttribute('data-provider');
            if (!domId) {
              throw new Error('No provider attribute found on save button');
            }
            
            // Map UI DOM ID to backend provider ID
            const provider = DOM_ID_TO_PROVIDER[domId];
            if (!VALID_PROVIDERS.includes(provider)) {
              throw new Error(`Invalid provider mapping: ${domId} -> ${provider}`);
            }
            
            // Get the input value
            const inputId = `${domId}-key`;
            const inputField = document.getElementById(inputId);
            if (!inputField) {
              throw new Error(`Input field ${inputId} not found`);
            }
            
            const apiKey = inputField.value.trim();
            if (!apiKey) {
              throw new Error('Please enter an API key');
            }
            
            // Basic API key validation
            const validation = validateApiKey(domId, apiKey);
            if (!validation.valid) {
              throw new Error(`Invalid API key format: ${validation.message}`);
            }
            
            // Save the API key to backend
            console.log(`Saving ${domId} API key as provider=${provider}...`);
            const saveResponse = await saveApiKey(provider, apiKey);
            
            if (!saveResponse || !saveResponse.success) {
              throw new Error(saveResponse?.error || 'Failed to save API key');
            }
            
            // Verify the key was actually saved by fetching it back
            const verifyResponse = await getApiKey(provider);
            console.log('Key verification response:', verifyResponse);
            
            // Check if we have either key or apiKey in the response
            const keyExists = verifyResponse && verifyResponse.success && 
                            (verifyResponse.key || verifyResponse.apiKey || 
                            (verifyResponse.data && (verifyResponse.data.key || verifyResponse.data.apiKey)));
            
            if (!keyExists) {
              throw new Error('API key was not properly saved in the database');
            }
            
            // Update UI to reflect successful save
            showNotification(`${domId.toUpperCase()} API key saved successfully`, true);
            
            // Update status indicator
            const statusElem = document.getElementById(`${domId}-key-status`);
            if (statusElem) {
              statusElem.textContent = 'API key is set';
              statusElem.className = 'key-status success';
            }
            
            // Clear input and update placeholder
            inputField.value = '';
            inputField.placeholder = '••••••••••••••••••••••••••';
            inputField.setAttribute('data-key-stored', 'true');
            
          } catch (error) {
            console.error('Error saving API key:', error);
            showNotification(error.message, false);
          } finally {
            // Re-enable button
            button.disabled = false;
          }
        });
      });
      
      // ==== DELETE API KEY BUTTONS ====
      const deleteButtons = document.querySelectorAll('.delete-key-btn');
      Array.from(deleteButtons).forEach(button => {
        button.addEventListener('click', async (e) => {
          // Disable button to prevent double-clicks
          button.disabled = true;
          
          try {
            // Get the button's target provider from DOM
            const domId = button.getAttribute('data-provider');
            if (!domId) {
              throw new Error('No provider attribute found on delete button');
            }
            
            // Map UI DOM ID to backend provider ID
            const provider = DOM_ID_TO_PROVIDER[domId];
            if (!VALID_PROVIDERS.includes(provider)) {
              throw new Error(`Invalid provider mapping: ${domId} -> ${provider}`);
            }
            
            // Ask for confirmation
            if (!confirm(`Are you sure you want to delete your ${domId.toUpperCase()} API key?`)) {
              return;
            }
            
            // Delete the API key
            console.log(`Deleting ${domId} API key as provider=${provider}...`);
            const deleteResponse = await deleteApiKey(provider);
            
            if (!deleteResponse || !deleteResponse.success) {
              throw new Error(deleteResponse?.error || 'Failed to delete API key');
            }
            
            // Verify the key was actually deleted by trying to fetch it
            const verifyResponse = await getApiKey(provider);
            console.log('Key deletion verification response:', verifyResponse);
            
            // Check if we have either key or apiKey in the response
            const keyStillExists = verifyResponse && verifyResponse.success && 
                                 (verifyResponse.key || verifyResponse.apiKey || 
                                 (verifyResponse.data && (verifyResponse.data.key || verifyResponse.data.apiKey)));
            
            if (keyStillExists) {
              throw new Error('API key was not properly deleted from the database');
            }
            
            // Update UI to reflect successful deletion
            showNotification(`${domId.toUpperCase()} API key deleted successfully`, true);
            
            // Update status indicator
            const statusElem = document.getElementById(`${domId}-key-status`);
            if (statusElem) {
              statusElem.textContent = '';
              statusElem.className = 'key-status';
            }
            
            // Reset input placeholder
            const inputField = document.getElementById(`${domId}-key`);
            if (inputField) {
              inputField.placeholder = `Enter ${domId.toUpperCase()} API key`;
              inputField.setAttribute('data-key-stored', 'false');
            }
            
          } catch (error) {
            console.error('Error deleting API key:', error);
            showNotification(error.message, false);
          } finally {
            // Re-enable button
            button.disabled = false;
          }
        });
      });
    }).catch(err => {
      console.error('Failed to load API key management functions:', err);
      showNotification('Failed to initialize API key management', false);
    });
  }
  
  // Setup Theme Toggle Listeners
  function setupThemeToggleListeners() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        eventBus.emit('theme-changed', { theme });
        
        // Save theme preference
        const updatedSettings = settings;
        updatedSettings.interface.theme = theme;
        persistSettings(updatedSettings);
      });
    }
  }
  
  // Setup Interface Option Listeners
  function setupInterfaceOptionListeners() {
    // Font size
    const fontSizeSelect = document.getElementById('font-size-select');
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        const fontSize = e.target.value;
        document.body.style.fontSize = fontSize;
        
        // Save font size preference
        const updatedSettings = settings;
        updatedSettings.interface.fontSize = fontSize;
        persistSettings(updatedSettings);
      });
    }
    
    // Compact mode
    const compactModeToggle = document.getElementById('compact-mode-toggle');
    if (compactModeToggle) {
      compactModeToggle.addEventListener('change', (e) => {
        const compactMode = e.target.checked;
        document.body.classList.toggle('compact-mode', compactMode);
        
        // Save compact mode preference
        const updatedSettings = settings;
        updatedSettings.interface.compactMode = compactMode;
        persistSettings(updatedSettings);
      });
    }
    
    // Show timestamps
    const showTimestampsToggle = document.getElementById('show-timestamps-toggle');
    if (showTimestampsToggle) {
      showTimestampsToggle.addEventListener('change', (e) => {
        const showTimestamps = e.target.checked;
        document.body.classList.toggle('show-timestamps', showTimestamps);
        
        // Save timestamps preference
        const updatedSettings = settings;
        updatedSettings.interface.showTimestamps = showTimestamps;
        persistSettings(updatedSettings);
      });
    }
  }
  
  // Setup LLM Preference Listeners
  function setupLLMPreferenceListeners() {
    // Initialize UI elements based on user settings
    if (settings && settings.modelPreferences) {
      // Get dropdown elements
      const preferredEngineSelect = document.getElementById('preferred-engine');
      const chatLlmModelSelect = document.getElementById('chat-llm-model');
      const browserLlmModelSelect = document.getElementById('browser-llm-model');
      
      // Set preferred engine
      if (settings.modelPreferences.preferredEngine && preferredEngineSelect) {
        preferredEngineSelect.value = settings.modelPreferences.preferredEngine;
        
        // Also update the model card UI to show the selected one
        document.querySelectorAll('.model-card').forEach(card => {
          card.classList.remove('selected');
          if (card.dataset.engineId === settings.modelPreferences.preferredEngine) {
            card.classList.add('selected');
          }
        });
      }
      
      // Set chat model
      if (settings.modelPreferences.chat && chatLlmModelSelect) {
        chatLlmModelSelect.value = settings.modelPreferences.chat;
      }
      
      // Set browser automation model
      if (settings.modelPreferences.browser && browserLlmModelSelect) {
        browserLlmModelSelect.value = settings.modelPreferences.browser;
      }
    }
    
    // Add change event listeners for the Chat Model dropdown
    if (chatLlmModelSelect) {
      chatLlmModelSelect.addEventListener('change', async function() {
        const selectedModel = this.value;
        try {
          // Save the chat model preference
          const response = await fetch('/api/settings/model-preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              modelPreferences: {
                chat: selectedModel
              }
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            // Update settings
            if (!settings.modelPreferences) {
              settings.modelPreferences = {};
            }
            settings.modelPreferences.chat = selectedModel;
            
            showNotification(`Chat model updated to ${selectedModel}`, true);
          } else {
            const data = await response.json();
            showNotification(`Failed to update chat model: ${data.error || 'Unknown error'}`, false);
          }
        } catch (error) {
          console.error('Error updating chat model:', error);
          showNotification(`Error updating chat model: ${error.message}`, false);
        }
      });
    }
    
    // Add change event listeners for the Browser Automation Model dropdown
    if (browserLlmModelSelect) {
      browserLlmModelSelect.addEventListener('change', async function() {
        const selectedModel = this.value;
        try {
          // Save the browser automation model preference
          const response = await fetch('/api/settings/model-preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              modelPreferences: {
                browser: selectedModel
              }
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            // Update settings
            if (!settings.modelPreferences) {
              settings.modelPreferences = {};
            }
            settings.modelPreferences.browser = selectedModel;
            
            showNotification(`Browser automation model updated to ${selectedModel}`, true);
          } else {
            const data = await response.json();
            showNotification(`Failed to update browser automation model: ${data.error || 'Unknown error'}`, false);
          }
        } catch (error) {
          console.error('Error updating browser automation model:', error);
          showNotification(`Error updating browser automation model: ${error.message}`, false);
        }
      });
    }
    
    // Set the preferred engine based on user's saved settings
    const preferredEngineSelect = document.getElementById('preferred-engine');
    if (preferredEngineSelect) {
      // Set initial value based on user settings
      if (settings?.modelPreferences?.preferredEngine) {
        preferredEngineSelect.value = settings.modelPreferences.preferredEngine;
      } else if (settings?.preferredEngine) {
        // Backward compatibility for old settings format
        preferredEngineSelect.value = settings.preferredEngine;
      }
      
      // Add change event listener
      preferredEngineSelect.addEventListener('change', async (e) => {
        const selectedEngine = e.target.value;
        
        // Define API key types based on engine IDs
        const apiKeyTypeMap = {
          'gpt-4o': 'openai',
          'qwen-2.5-vl-72b': 'qwen',
          'gemini-2.5-pro': 'google',
          'ui-tars': 'uitars'
        };
        
        const keyType = apiKeyTypeMap[selectedEngine];
        const displayName = getEngineDisplayName(selectedEngine);
        
        try {
          // Update the preferred engine on the server
          const response = await fetch('/api/user/set-engine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              engineId: selectedEngine,
              keyType: keyType
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Update internal settings
            if (!settings.modelPreferences) {
              settings.modelPreferences = {};
            }
            settings.modelPreferences.preferredEngine = selectedEngine;
            // For backward compatibility
            settings.preferredEngine = selectedEngine;
            
            // Update UI to show selected model card
            document.querySelectorAll('.model-card').forEach(card => {
              card.classList.remove('selected');
              if (card.dataset.engineId === selectedEngine) {
                card.classList.add('selected');
              }
            });
            
            // Show success notification with user-friendly name
            showNotification(`Model preference updated to ${displayName}`, true);
            
            // If the response includes a warning about missing API key, show it
            if (data.warning) {
              setTimeout(() => {
                showNotification(data.warning, false);
              }, 1000);
            }
          } else {
            const data = await response.json();
            showNotification(`Failed to update model: ${data.error || 'Unknown error'}`, false);
          }
        } catch (error) {
          console.error('Error updating preferred engine:', error);
          showNotification(`Error updating model: ${error.message}`, false);
        }
      });
    }
    
    // Processing type selection
    const processingTypeOptions = document.querySelectorAll('.processing-type-option');
    const processingTypeRadios = document.querySelectorAll('.processing-type-radio');
    
    // Initialize processing type based on user settings
    if (settings && settings.processingType) {
      const savedType = settings.processingType;
      processingTypeRadios.forEach(radio => {
        if (radio.value === savedType) {
          radio.checked = true;
          const option = radio.closest('.processing-type-option');
          if (option) option.classList.add('selected');
        }
      });
    } else {
      // Default to yaml-planning if no preference is set
      const defaultRadio = document.querySelector('.processing-type-radio[value="yaml-planning"]');
      if (defaultRadio) {
        defaultRadio.checked = true;
        const option = defaultRadio.closest('.processing-type-option');
        if (option) option.classList.add('selected');
      }
    }
    
    // Add event listeners to processing type options
    processingTypeOptions.forEach(option => {
      option.addEventListener('click', async () => {
        const typeId = option.dataset.typeId;
        const radio = option.querySelector('.processing-type-radio');
        
        // Update UI
        processingTypeOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        processingTypeRadios.forEach(rad => rad.checked = false);
        radio.checked = true;
        
        try {
          // Update the processing type on the server
          const response = await fetch('/api/user/set-processing-type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ type: typeId })
          });
          
          if (response.ok) {
            // Update settings
            if (!settings.processing) {
              settings.processing = {};
            }
            settings.processing.type = typeId;
            
            // Get display name from our processing types array
            const typeInfo = processingTypes.find(t => t.id === typeId);
            const typeDisplayName = typeInfo ? typeInfo.name : typeId;
            
            showNotification(`Processing type updated to ${typeDisplayName}`, true);
          } else {
            const data = await response.json();
            showNotification(`Failed to update processing type: ${data.error || 'Unknown error'}`, false);
          }
        } catch (error) {
          console.error('Error updating processing type:', error);
          showNotification(`Error updating processing type: ${error.message}`, false);
        }
      });
    });
    
    // Execution mode selection
    const executionModeCards = document.querySelectorAll('.execution-mode-card');
    
    // Initialize execution mode based on user settings
    if (settings && settings.executionPreferences && settings.executionPreferences.mode) {
      const savedMode = settings.executionPreferences.mode;
      executionModeCards.forEach(card => {
        if (card.dataset.mode === savedMode) {
          card.classList.add('selected');
        }
      });
    } else {
      // Default to step-planning if no preference is set
      const defaultCard = document.querySelector('.execution-mode-card[data-mode="step-planning"]');
      if (defaultCard) defaultCard.classList.add('selected');
    }
    
    // Add event listeners to execution mode cards
    executionModeCards.forEach(card => {
      card.addEventListener('click', async () => {
        const selectedMode = card.dataset.mode;
        
        // Update UI
        executionModeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        try {
          // Update the execution mode on the server
          const response = await fetch('/api/user/set-execution-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ mode: selectedMode })
          });
          
          const data = await response.json();
          
          if (response.ok) {
            // Update settings
            if (!settings.executionPreferences) {
              settings.executionPreferences = {};
            }
            settings.executionPreferences.mode = selectedMode;
            
            const modeDisplayName = selectedMode === 'step-planning' ? 
              'Step Planning' : 'Action Planning (Autopilot)';
              
            showNotification(`Execution mode updated to ${modeDisplayName}`, true);
          } else {
            showNotification(`Failed to update execution mode: ${data.error || 'Unknown error'}`, false);
          }
        } catch (error) {
          console.error('Error updating execution mode:', error);
          showNotification(`Error updating execution mode: ${error.message}`, false);
        }
      });
    });
    
    // Model card selection
    const modelCards = document.querySelectorAll('.model-card');
    
    // Initialize selected model card based on user settings
    if (settings?.modelPreferences?.preferredEngine || settings?.preferredEngine) {
      const savedEngine = settings?.modelPreferences?.preferredEngine || settings?.preferredEngine;
      modelCards.forEach(card => {
        if (card.dataset.engineId === savedEngine) {
          card.classList.add('selected');
        }
      });
    }
    
    // Add event listeners to model cards
    modelCards.forEach(card => {
      card.addEventListener('click', () => {
        const engineId = card.dataset.engineId;
        if (preferredEngineSelect) {
          preferredEngineSelect.value = engineId;
          // Trigger change event to save selection
          preferredEngineSelect.dispatchEvent(new Event('change'));
        }
      });
    });
    
    // Save button for LLM preferences
    const saveButton = document.getElementById('save-llm-preferences-btn');
    if (saveButton) {
      saveButton.addEventListener('click', async () => {
        try {
          // Get values from our new model selects
          const preferredEngine = document.getElementById('preferred-engine')?.value;
          const chatModel = document.getElementById('chat-llm-model')?.value;
          const browserModel = document.getElementById('browser-llm-model')?.value;
          
          // Prepare data object
          const modelPreferences = {
            preferredEngine: preferredEngine,
            chat: chatModel,
            browser: browserModel
          };
          
          // Update local settings
          const updatedSettings = settings;
          if (!updatedSettings.modelPreferences) {
            updatedSettings.modelPreferences = {};
          }
          updatedSettings.modelPreferences = {...updatedSettings.modelPreferences, ...modelPreferences};
          persistSettings(updatedSettings);
          
          // Call API
          const response = await fetch('/api/settings/model-preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ modelPreferences })
          });
          
          if (response.ok) {
            const data = await response.json();
            showNotification('AI model preferences saved successfully', true);
          } else {
            const data = await response.json();
            throw new Error(data?.error || 'Failed to save model preferences');
          }
        } catch (error) {
          console.error('Error saving model preferences:', error);
          showNotification(`Error: ${error.message || 'Failed to save model preferences'}`, false);
        }
      });
    }
  }
  
  // Setup Accessibility Option Listeners
  function setupAccessibilityOptionListeners() {
    // High contrast
    const highContrastToggle = document.getElementById('high-contrast-toggle');
    if (highContrastToggle) {
      highContrastToggle.addEventListener('change', (e) => {
        const highContrast = e.target.checked;
        document.body.classList.toggle('high-contrast', highContrast);
        
        // Save high contrast preference
        const updatedSettings = settings;
        updatedSettings.accessibility.highContrast = highContrast;
        persistSettings(updatedSettings);
      });
    }
    
    // Large text
    const largeTextToggle = document.getElementById('large-text-toggle');
    if (largeTextToggle) {
      largeTextToggle.addEventListener('change', (e) => {
        const largeText = e.target.checked;
        document.body.classList.toggle('large-text', largeText);
        
        // Save large text preference
        const updatedSettings = settings;
        updatedSettings.accessibility.largeText = largeText;
        persistSettings(updatedSettings);
      });
    }
    
    // Focus outlines
    const focusOutlinesToggle = document.getElementById('focus-outlines-toggle');
    if (focusOutlinesToggle) {
      focusOutlinesToggle.addEventListener('change', (e) => {
        const focusOutlines = e.target.checked;
        document.body.classList.toggle('focus-outlines', focusOutlines);
        
        // Save focus outlines preference
        const updatedSettings = settings;
        updatedSettings.accessibility.focusOutlines = focusOutlines;
        persistSettings(updatedSettings);
      });
    }
  }
  
  // Setup LLM Preference Listeners
  function setupLLMPreferenceListeners() {
    // Set the preferred engine based on user's saved settings
    const preferredEngineSelect = document.getElementById('preferred-engine');
    if (preferredEngineSelect) {
      // Set initial value based on user settings
      if (settings?.modelPreferences?.preferredEngine) {
        preferredEngineSelect.value = settings.modelPreferences.preferredEngine;
      } else if (settings?.preferredEngine) {
        // Backward compatibility for old settings format
        preferredEngineSelect.value = settings.preferredEngine;
      }
      
      // Add change event listener
      preferredEngineSelect.addEventListener('change', (e) => {
        const newEngine = e.target.value;
        settings.saveEnginePreference(newEngine)
          .then(response => {
            if (response.success) {
              showNotification('Engine preference saved', 'success');
              if (!settings.modelPreferences) {
                settings.modelPreferences = {};
              }
              settings.modelPreferences.preferredEngine = newEngine;
              // For backward compatibility
              settings.preferredEngine = newEngine;
            } else {
              showNotification('Failed to save engine preference', 'error');
            }
          })
          .catch(err => {
            console.error('Error saving engine preference:', err);
            showNotification('Error saving preference: ' + err.message, 'error');
          });
      });
    }
    
    // Set the execution mode based on user's saved settings
    const executionModeSelect = document.getElementById('execution-mode');
    if (executionModeSelect) {
      // Set initial value based on user settings
      if (settings && settings.executionMode) {
        executionModeSelect.value = settings.executionMode;
      }
      
      // Add change event listener
      executionModeSelect.addEventListener('change', (e) => {
        const newMode = e.target.value;
        settings.saveExecutionMode(newMode)
          .then(response => {
            if (response.success) {
              showNotification('Execution mode saved', 'success');
              settings.executionMode = newMode;
            } else {
              showNotification('Failed to save execution mode', 'error');
            }
          })
          .catch(err => {
            console.error('Error saving execution mode:', err);
            showNotification('Error saving mode: ' + err.message, 'error');
          });
      });
    }
  }
  
  // Setup execution mode selection listeners
  function setupExecutionModeListeners() {
    // Find all execution mode radio buttons
    const modeRadios = document.querySelectorAll('input[name="processing-type"]');
    
    // Set initial selection based on user settings
    if (settings && settings.executionMode) {
      Array.from(modeRadios).forEach(radio => {
        if (radio.value === settings.executionMode) {
          radio.checked = true;
        }
      });
    } else {
      // Default to step-planning if no preference is set
      const defaultRadio = Array.from(modeRadios).find(radio => radio.value === 'step-planning');
      if (defaultRadio) defaultRadio.checked = true;
    }
    
    // Add change event listeners
    Array.from(modeRadios).forEach(radio => {
      radio.addEventListener('change', async (e) => {
        if (e.target.checked) {
          const mode = e.target.value;
          try {
            // Import the API function
            const { saveExecutionMode } = await import('../api/settings.js');
            
            // Save to backend
            console.log(`Saving execution mode: ${mode}`);
            const response = await saveExecutionMode(mode);
            
            if (response && response.success) {
              // Update local settings
              settings.executionMode = mode;
              
              // Update UI
              const modeName = processingTypes.find(t => t.id === mode)?.name || mode;
              showNotification(`Execution mode set to ${modeName}`, true);
              
              // Show explanatory note based on selected mode
              if (mode === 'action-planning') {
                setTimeout(() => {
                  showNotification('Note: UI-TARS will always use Action Planning regardless of this setting.', 'info');
                }, 1000);
              } else if (mode === 'yaml-planning') {
                setTimeout(() => {
                  showNotification('Note: YAML will always be used when present in commands, regardless of this setting.', 'info');
                }, 1000);
              }
            } else {
              throw new Error(response?.error || 'Unknown error');
            }
          } catch (error) {
            console.error('Error saving execution mode:', error);
            showNotification(`Error saving execution mode: ${error.message}`, false);
          }
        }
      });
    });
  }
  
  // Show timestamps toggle handler
  function setupTimestampToggle() {
    const showTimestampsToggle = document.getElementById('show-timestamps-toggle');
    if (showTimestampsToggle) {
      showTimestampsToggle.addEventListener('change', (e) => {
        const showTimestamps = e.target.checked;
        document.body.classList.toggle('show-timestamps', showTimestamps);
        
        // Save timestamps preference
        const updatedSettings = settings;
        updatedSettings.interface.showTimestamps = showTimestamps;
        persistSettings(updatedSettings);
      });
    }
  }
  
  // Show modal
  function show() {
    if (!isVisible) {
      try {
        console.log("Showing settings modal");
        isVisible = true;
        overlay.style.display = 'flex';
        
        // One-time setup for buttons and components
        setTimeout(() => {
          // Setup footer buttons event listeners
          const closeBtn = document.getElementById('close-settings-btn');
          if (closeBtn) closeBtn.addEventListener('click', hide);
          
          const saveAllBtn = document.getElementById('save-all-changes-btn');
          if (saveAllBtn) saveAllBtn.addEventListener('click', saveAllSettings);
          
          // Setup password toggle functionality
          setupPasswordToggles();
          
          // Set up form listeners now that elements are in the DOM
          setupAPIKeyFormListeners();
          setupThemeToggleListeners();
          setupInterfaceOptionListeners();
          setupAccessibilityOptionListeners();
          setupLLMPreferenceListeners();
          setupExecutionModeListeners();
          setupTimestampToggle();
          
          // Add animation and emit event
          overlay.classList.add('visible');
          eventBus.emit('settings-modal-shown');
          
          // Load settings from server - do this AFTER all UI is ready
          loadSettings();
        }, 50); // small delay for DOM to be ready
      } catch (err) {
        console.error("Error showing settings modal:", err);
      }
    }
  }
  
  // Hide modal
  function hide() {
    if (isVisible) {
      overlay.classList.remove('visible');
      setTimeout(() => {
        overlay.style.display = 'none';
        isVisible = false;
        eventBus.emit('settings-modal-hidden');
      }, 300);
    }
  }
  
  // Handle clicks on the overlay background
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hide();
    }
  });
  
  // Add ESC key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible) {
      hide();
    }
  });
  
  // Add API methods to the container element
  container.show = show;
  container.hide = hide;
  container.toggle = () => (isVisible ? hide() : show());
  
  // Return the container element instead of just an object with methods
  return container;
}

// Create a singleton instance
let modalInstance = null;

export function getSettingsModal() {
  if (!modalInstance) {
    modalInstance = SettingsModal();
    // No need to append to DOM here, we're already returning the DOM element
  }
  return modalInstance;
}

// No need for DOMContentLoaded listener since we'll initialize on-demand
// through the singleton pattern when getSettingsModal() is called

export default {
  getSettingsModal
};
