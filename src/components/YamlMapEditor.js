/**
 * YamlMapEditor - Vanilla JS implementation
 * Provides a modal for creating and editing YAML maps
 */

import api from '../utils/api';

// Example YAML template for new maps
const exampleYaml = `tasks:
  - name: search weather
    flow:
      - ai: input 'weather today' in input box, click search button
      - sleep: 3000

  - name: query weather
    flow:
      - aiQuery: "the result shows the weather info, {description: string}"
`;

class YamlMapEditor {
  constructor() {
    this.modalContainer = null;
    this.isLoading = false;
    this.isSaving = false;
    this.error = null;
    this.formData = {
      name: '',
      description: '',
      url: '',
      tags: [],
      yaml: exampleYaml,
      isPublic: false
    };
    this.tagInput = '';
    this.editorRef = null;
    this.initialMapId = null;
    this.isEditing = false;
    this.onCloseCallback = null;
    this.onSaveCallback = null;
  }

  // Load map data from the server
  async loadMapData(mapId) {
    if (!mapId) {
      console.log('No map ID provided, initializing with empty form');
      this.resetForm();
      return;
    }

    try {
      this.setIsLoading(true);
      this.setError(null);
      
      console.log('Fetching YAML map with ID:', mapId);
      const response = await api.yamlMaps.getById(mapId);
      console.log('Received YAML map data:', response);
      
      // Ensure we have a proper response with yamlMap
      if (!response || !response.yamlMap) {
        throw new Error('Invalid response format from server');
      }
      
      const { yamlMap } = response;
      
      // Reset form data before applying new data
      this.resetForm();
      
      // Update form data with the loaded map
      this.formData = {
        ...this.formData, // Keep any existing form data that might be set
        // Update with the loaded map data
        name: yamlMap.name || '',
        description: yamlMap.description || '',
        url: yamlMap.url || '',
        yaml: yamlMap.yaml || exampleYaml,
        isPublic: !!yamlMap.isPublic,
        tags: Array.isArray(yamlMap.tags) ? [...yamlMap.tags] : [],
        _id: yamlMap._id || null
      };
      
      console.log('Form data after loading map:', this.formData);
      
      // Force a re-render of the form
      this.renderForm();
      
      // Update the editor content if it exists
      const yamlTextarea = this.modalContainer?.querySelector('textarea[name="yaml"]');
      if (yamlTextarea) {
        yamlTextarea.value = this.formData.yaml;
        this.renderYamlPreview();
        this.updateLineNumbers();
      }
      
    } catch (error) {
      console.error('Error loading YAML map:', error);
      this.setError(error.message || 'Failed to load YAML map');
    } finally {
      this.setIsLoading(false);
    }
  };
  
  // Reset form to initial state
  resetForm() {
    this.formData = {
      name: '',
      description: '',
      url: '',
      tags: [],
      yaml: exampleYaml,
      isPublic: false,
      _id: null
    };
    this.tagInput = '';
  };

  // Handle form field changes
  handleChange(e) {
    const { name, value, type, checked } = e.target;
    this.formData[name] = type === 'checkbox' ? checked : value;
    
    if (name === 'yaml') {
      this.renderYamlPreview();
      this.updateLineNumbers();
      
      // Perform live validation
      const validation = this.validateYaml(value);
      if (!validation.valid) {
        // Show error message but don't block editing
        const errorMessage = document.createElement('div');
        errorMessage.className = 'yaml-validation-error';
        errorMessage.textContent = validation.error;
        
        // Update error display
        const errorContainer = this.modalContainer.querySelector('.yaml-editor-error');
        if (errorContainer) {
          errorContainer.innerHTML = '';
          errorContainer.appendChild(errorMessage);
        }
      } else {
        // Clear error if valid
        const errorContainer = this.modalContainer.querySelector('.yaml-editor-error');
        if (errorContainer) {
          errorContainer.innerHTML = '';
        }
      }
    }
  };
  
  // Update line numbers based on YAML content
  updateLineNumbers() {
    const textarea = this.modalContainer.querySelector('textarea[name="yaml"]');
    const lineNumbers = this.modalContainer.querySelector('#yaml-line-numbers');
    
    if (!textarea || !lineNumbers) return;
    
    // Count lines in the textarea
    const lines = textarea.value.split('\n');
    const lineCount = lines.length;
    
    // Generate HTML for line numbers
    let numbersHtml = '';
    for (let i = 1; i <= lineCount; i++) {
      numbersHtml += `${i}<br>`;
    }
    
    lineNumbers.innerHTML = numbersHtml;
    
    // Sync scrolling between textarea and line numbers
    textarea.addEventListener('scroll', () => {
      lineNumbers.scrollTop = textarea.scrollTop;
    });
  };

  // Handle tag input changes
  handleTagInputChange(e) {
    this.tagInput = e.target.value;
  };

  // Add a new tag
  handleAddTag() {
    if (!this.tagInput.trim()) return;
    
    // Prevent duplicate tags
    if (this.formData.tags.includes(this.tagInput.trim())) {
      this.tagInput = '';
      return;
    }
    
    this.formData.tags.push(this.tagInput.trim());
    this.tagInput = '';
    this.renderTags();
  };

  // Remove a tag
  handleRemoveTag(tagToRemove) {
    this.formData.tags = this.formData.tags.filter(tag => tag !== tagToRemove);
    this.renderTags();
  };

  // Use template YAML
  useTemplate() {
    this.formData.yaml = exampleYaml;
    const yamlTextarea = this.modalContainer.querySelector('textarea[name="yaml"]');
    if (yamlTextarea) {
      yamlTextarea.value = exampleYaml;
    }
  };

  // Set loading state
  setIsLoading(isLoading) {
    this.isLoading = isLoading;
    this.renderLoadingState();
  };

  // Set saving state
  setIsSaving(isSaving) {
    this.isSaving = isSaving;
    this.renderSavingState();
  };

  // Set error message
  setError(error) {
    console.log('Setting error:', error);
    this.error = error;
    
    // Ensure the error container is visible
    const errorContainer = this.modalContainer?.querySelector('.yaml-editor-error');
    if (errorContainer) {
      errorContainer.style.display = error ? 'block' : 'none';
      errorContainer.textContent = error || '';
      
      // Scroll to error if it's not visible
      if (error) {
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    
    // If we're setting an error, ensure the loading state is cleared
    if (error) {
      this.setIsSaving(false);
      const saveOverlay = this.modalContainer?.querySelector('.yaml-editor-save-overlay');
      if (saveOverlay) {
        saveOverlay.remove();
      }
    }
  };

  // Render loading state
  renderLoadingState() {
    const container = this.modalContainer;
    if (!container) return;
    
    const form = container.querySelector('.yaml-editor-form');
    const loader = container.querySelector('.yaml-editor-loader');
    
    if (this.isLoading) {
      if (form) form.style.display = 'none';
      if (loader) loader.style.display = 'flex';
    } else {
      if (form) form.style.display = 'flex';
      if (loader) loader.style.display = 'none';
    }
  };

  // Render saving state
  renderSavingState() {
    const container = this.modalContainer;
    if (!container) return;
    
    const savingEl = container.querySelector('.yaml-editor-saving');
    const submitBtn = container.querySelector('button[type="submit"]');
    
    if (this.isSaving) {
      if (savingEl) savingEl.style.display = 'flex';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      }
      
      // Add a saving overlay
      let saveOverlay = container.querySelector('.yaml-editor-save-overlay');
      if (!saveOverlay) {
        saveOverlay = document.createElement('div');
        saveOverlay.className = 'yaml-editor-save-overlay';
        saveOverlay.innerHTML = `
          <div class="yaml-editor-save-overlay-content">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Saving YAML Map...</span>
          </div>
        `;
        container.appendChild(saveOverlay);
      }
      saveOverlay.style.display = 'flex';
    } else {
      if (savingEl) savingEl.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Save';
      }
      
      // Remove saving overlay
      const saveOverlay = container.querySelector('.yaml-editor-save-overlay');
      if (saveOverlay) {
        saveOverlay.style.display = 'none';
      }
    }
  };

  // Render error message
  renderError() {
    const container = this.modalContainer;
    if (!container) return;
    
    const errorEl = container.querySelector('.yaml-editor-error');
    
    if (this.error && errorEl) {
      errorEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${this.error}`;
      errorEl.style.display = 'flex';
    } else if (errorEl) {
      errorEl.style.display = 'none';
    }
  };

  // Render tags
  renderTags() {
    const container = this.modalContainer;
    if (!container) return;
    
    const tagsContainer = container.querySelector('.yaml-editor-tags');
    if (!tagsContainer) return;
    
    tagsContainer.innerHTML = '';
    
    this.formData.tags.forEach(tag => {
      const tagEl = document.createElement('div');
      tagEl.className = 'yaml-editor-tag';
      tagEl.innerHTML = `
        ${tag}
        <button type="button" class="yaml-editor-tag-remove">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      const removeBtn = tagEl.querySelector('.yaml-editor-tag-remove');
      removeBtn.addEventListener('click', () => this.handleRemoveTag(tag));
      
      tagsContainer.appendChild(tagEl);
    });
    
    // Update the tag input
    const tagInput = container.querySelector('input[name="tagInput"]');
    if (tagInput) {
      tagInput.value = this.tagInput;
    }
  };

  // Enhanced YAML validation for agent.runYaml() compatibility
  validateYaml(yamlText) {
    if (!yamlText || !yamlText.trim()) {
      return { valid: false, error: 'YAML content is required' };
    }
    
    try {
      // Check for required structure based on agent.runYaml() format
      const lines = yamlText.split('\n');
      let hasTasksRoot = false;
      let hasTaskName = false;
      let hasFlow = false;
      let inTaskDef = false;
      let inFlow = false;
      let hasActionOrQuery = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;
        
        // Check for colon followed by value validation
        // We now only validate colons that aren't at the end of the string
        // and aren't in quoted strings
        const colonCount = (trimmedLine.match(/:/g) || []).length;
        const quoteCount = (trimmedLine.match(/[\"']/g) || []).length;
        
        if (colonCount > 0 && quoteCount === 0) {
          // Only validate colons that are followed by more content
          // Find each colon that's not at the end of the string
          for (let pos = 0; pos < trimmedLine.length - 1; pos++) {
            if (trimmedLine[pos] === ':' && trimmedLine[pos+1] !== ' ' && trimmedLine[pos+1] !== '\n') {
              return { 
                valid: false, 
                error: `Line ${i+1}: Missing space after colon in '${trimmedLine}'` 
              };
            }
          }
        }
        
        // Check for required structure
        if (trimmedLine === 'tasks:') {
          hasTasksRoot = true;
        } else if (trimmedLine.startsWith('- name:')) {
          inTaskDef = true;
          hasTaskName = true;
          inFlow = false;
          
          // Error - name needs a value
          if (trimmedLine === '- name:') {
            return { 
              valid: false, 
              error: `Line ${i+1}: Task name is missing a value` 
            };
          }
        } else if (trimmedLine === 'flow:' && inTaskDef) {
          inFlow = true;
          hasFlow = true;
        } else if (inFlow && (trimmedLine.includes('ai:') || trimmedLine.includes('aiQuery:'))) {
          hasActionOrQuery = true;
        }
      }
      
      // Check for structural completeness
      if (!hasTasksRoot) {
        return {
          valid: false,
          error: 'Missing root "tasks:" element. YAML must start with "tasks:"'
        };
      }
      
      if (!hasTaskName) {
        return {
          valid: false,
          error: 'Missing task definition. Each task must have a name.'
        };
      }
      
      if (!hasFlow) {
        return {
          valid: false,
          error: 'Missing "flow:" section. Each task must have a flow.'
        };
      }
      
      if (!hasActionOrQuery) {
        return {
          valid: false,
          error: 'Missing action or query step. Flow must include at least one "ai:" or "aiQuery:" instruction.'
        };
      }
      
      // Basic validation passed
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: `YAML validation error: ${error.message}` };
    }
  };

  // Handle form submission
  async handleSubmit(e = null) {
    if (e) e.preventDefault();
    
    console.log('Submitting YAML Map form');
    console.log('Current form data:', JSON.stringify(this.formData, null, 2));
    
    // Clear any previous errors
    this.setError(null);
    
    try {
      // Ensure we have the latest form values
      const nameInput = this.modalContainer?.querySelector('input[name="name"]');
      if (nameInput) {
        this.formData.name = nameInput.value.trim();
      }
      
      const descriptionInput = this.modalContainer?.querySelector('textarea[name="description"]');
      if (descriptionInput) {
        this.formData.description = descriptionInput.value;
      }
      
      const urlInput = this.modalContainer?.querySelector('input[name="url"]');
      if (urlInput) {
        this.formData.url = urlInput.value.trim();
      }
      
      const yamlTextarea = this.modalContainer?.querySelector('textarea[name="yaml"]');
      if (yamlTextarea) {
        this.formData.yaml = yamlTextarea.value;
      }
      
      const isPublicCheckbox = this.modalContainer?.querySelector('input[name="isPublic"]');
      if (isPublicCheckbox) {
        this.formData.isPublic = isPublicCheckbox.checked;
      }
      
      const yamlMap = { 
        name: this.formData.name,
        description: this.formData.description,
        url: this.formData.url,
        yaml: this.formData.yaml,
        tags: [...(this.formData.tags || [])],
        isPublic: !!this.formData.isPublic
      };
      
      console.log('Prepared YAML map data for submission:', JSON.stringify(yamlMap, null, 2));
      
      // Validate form data
      if (!yamlMap.name || !yamlMap.name.trim()) {
        throw new Error('Name is required');
      }
      
      // Validate YAML content
      const yamlValidation = this.validateYaml(yamlMap.yaml);
      if (!yamlValidation.valid) {
        throw new Error(yamlValidation.error);
      }
      
      // Basic validation for YAML structure
      if (!yamlMap.yaml.includes('tasks:') && !yamlMap.yaml.includes('flow:')) {
        throw new Error('Invalid YAML format. YAML must include tasks and flow sections.');
      }
      
      // Set saving state
      this.setIsSaving(true);
      
      // Make API call
      const data = this.isEditing
        ? await api.yamlMaps.update(this.initialMapId, yamlMap)
        : await api.yamlMaps.create(yamlMap);
      
      // On success
      if (this.onSaveCallback) {
        this.onSaveCallback(data);
      }
      this.handleClose();
      
    } catch (error) {
      console.error('Error in form submission:', error);
      
      // Handle specific error cases
      if (error.message === 'Name is required') {
        this.setError('Name is required');
      } 
      // Handle permission denied errors specifically
      else if (error.message && (error.message.includes('permission') || error.status === 403)) {
        this.setError('You do not have permission to modify this YAML map. You can only edit your own maps.');
      } 
      // Handle YAML validation errors
      else if (error.message && (error.message.includes('YAML') || error.message.includes('tasks:') || error.message.includes('flow:'))) {
        this.setError(error.message);
      }
      // Handle network or other errors
      else {
        console.error('Unexpected error in form submission:', error);
        this.setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      // Always ensure loading state is reset
      this.setIsSaving(false);
      
      // Ensure any loading overlays are removed
      const saveOverlay = this.modalContainer?.querySelector('.yaml-editor-save-overlay');
      if (saveOverlay) {
        saveOverlay.remove();
      }
    }
  }

  // Handle modal close
  handleClose() {
    console.log('Closing YamlMapEditor modal');
    if (this.modalContainer) {
      // Make sure we reset the saving state first
      this.isSaving = false;
      
      // Remove any saving overlay that might be present
      const saveOverlay = this.modalContainer.querySelector('.yaml-editor-save-overlay');
      if (saveOverlay) {
        saveOverlay.remove();
      }
      
      // Hide the modal instead of removing it
      this.modalContainer.style.display = 'none';
      
      // Reset form data to avoid stale values on reopen
      this.formData = {
        name: '',
        description: '',
        url: '',
        tags: [],
        yaml: exampleYaml,  
        isPublic: false
      };
      this.tagInput = ''; 
    }
    
    if (typeof this.onCloseCallback === 'function') {
      this.onCloseCallback();
    }
  }

  // Render the form
  renderForm() {
    if (!this.modalContainer) return;
    
    const form = this.modalContainer.querySelector('.yaml-editor-form');
    if (!form) return;
    
    // Add event listeners for form inputs
    const nameInput = this.modalContainer.querySelector('input[name="name"]');
    const descriptionInput = this.modalContainer.querySelector('textarea[name="description"]');
    const yamlTextarea = this.modalContainer.querySelector('textarea[name="yaml"]');
    const urlInput = this.modalContainer.querySelector('input[name="url"]');
    const isPublicCheckbox = this.modalContainer.querySelector('input[name="isPublic"]');
    
    if (nameInput) nameInput.value = this.formData.name;
    if (descriptionInput) descriptionInput.value = this.formData.description;
    if (urlInput) urlInput.value = this.formData.url || '';
    if (yamlTextarea) yamlTextarea.value = this.formData.yaml;
    if (isPublicCheckbox) isPublicCheckbox.checked = this.formData.isPublic;

    // Add event listeners for URL field
    if (urlInput) {
      urlInput.addEventListener('input', (e) => {
        this.formData.url = e.target.value;
      });
      urlInput.addEventListener('change', (e) => {
        this.formData.url = e.target.value;
      });
    }

    // Use the correctly defined isPublicCheckbox variable instead of undefined publicCheckbox
    if (isPublicCheckbox) isPublicCheckbox.checked = this.formData.isPublic;
    
    // Initialize YAML editor features
    this.updateLineNumbers();
    this.renderYamlPreview();
    
    // Render tags
    this.renderTags();
  }
  
  // Add indentation guides to YAML content
  addIndentationGuides(yamlText) {
    if (!yamlText) return '';
    
    const lines = yamlText.split('\n');
    let result = '';
    
    lines.forEach(line => {
      // Calculate indentation level
      const indent = line.match(/^\s*/)[0].length;
      let guidedLine = line;
      
      if (indent > 0) {
        // Add indentation guide spans for each level
        let indentHtml = '';
        for (let i = 0; i < indent; i += 2) {
          indentHtml += '<span class="indent-guide"></span>';
        }
        guidedLine = indentHtml + line.trimStart();
      }
      
      result += guidedLine + '\n';
    });
    
    return result;
  }
  
  // Apply enhanced syntax highlighting to YAML content
  applyYamlSyntaxHighlighting(yamlText) {
    if (!yamlText) return '';
    
    // Split into lines and process each one
    const lines = yamlText.split('\n');
    let inFlowBlock = false;
    let result = '';
    
    lines.forEach((line, index) => {
      let processedLine = line;
      
      // Handle indentation
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      const content = line.trim();
      
      // Skip empty lines
      if (!content) {
        result += '<br>';
        return;
      }
      
      // Highlight YAML keys (words followed by colon not in strings)
      processedLine = processedLine.replace(/(^|\s)([a-zA-Z0-9_-]+):/g, 
        (match, space, key) => `${space}<span class="yaml-key">${key}</span>:`);
      
      // Highlight YAML list items
      processedLine = processedLine.replace(/^(\s*)-(?=\s|$)/gm, 
        '<span class="yaml-list">$1-</span>');
      
      // Highlight strings (quoted and unquoted values)
      processedLine = processedLine.replace(/:\s*(['"]?)([^'"\n{}:]+?)(['"]?)(?=\s*$|\s*#|\s*\n|\s*\{)/g, 
        (match, openQuote, value, closeQuote) => {
          if (value.trim()) {
            return `: ${openQuote}<span class="yaml-value">${value}</span>${closeQuote}`;
          }
          return match;
        });
      
      // Highlight numbers
      processedLine = processedLine.replace(/:\s*(\d+)(?=\s*$|\s*#|\s*\n)/g, 
        ': <span class="yaml-number">$1</span>');
      
      // Highlight booleans and null
      processedLine = processedLine.replace(/:\s*(true|false|null)(?=\s*$|\s*#|\s*\n)/gi, 
        (match, value) => `: <span class="yaml-boolean">${value}</span>`);
      
      // Special handling for flow blocks
      if (content.includes('flow:')) {
        inFlowBlock = true;
      } else if (content === '') {
        inFlowBlock = false;
      }
      
      // Add line with CSS-based line numbers
      result += `<div class="yaml-line">${processedLine}</div>`;
    });
    
    return `<div class="yaml-code-block">${result}</div>`;
  }
  
  // Render the YAML preview with syntax highlighting
  renderYamlPreview() {
    const previewContainer = this.modalContainer?.querySelector('.yaml-editor-preview');
    if (!previewContainer) return;
    
    const highlighted = this.applyYamlSyntaxHighlighting(this.formData.yaml);
    previewContainer.innerHTML = highlighted;
  }

  // Initialize the editor
  init(initialMapId, onClose, onSave) {
    this.initialMapId = initialMapId;
    this.isEditing = !!initialMapId;
    this.onCloseCallback = onClose;
    this.onSaveCallback = onSave;
    
    console.log('Initializing YamlMapEditor modal');
    
    // Create modal container or use existing container
    let existingContainer = document.getElementById('yaml-map-editor-modal');
    if (existingContainer) {
      this.modalContainer = existingContainer;
      // Clear any existing content
      this.modalContainer.innerHTML = '';
    } else {
      this.modalContainer = document.createElement('div');
      this.modalContainer.className = 'yaml-editor-container';
      this.modalContainer.id = 'yaml-map-editor-modal';
      document.body.appendChild(this.modalContainer);
    }
    
    // Add inline styles to ensure visibility
    this.modalContainer.style.position = 'fixed';
    this.modalContainer.style.top = '0';
    this.modalContainer.style.left = '0';
    this.modalContainer.style.width = '100%';
    this.modalContainer.style.height = '100%';
    this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.modalContainer.style.display = 'flex';
    this.modalContainer.style.justifyContent = 'center';
    this.modalContainer.style.alignItems = 'center';
    this.modalContainer.style.zIndex = '10000';
    
    // Create modal content with iOS-inspired design
    this.modalContainer.innerHTML = `
      <div class="yaml-editor">
        <div class="yaml-editor-loader">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading YAML Map...</span>
        </div>
        
        <form class="yaml-editor-form">
          <div class="yaml-editor-content">
            <div class="yaml-editor-sidebar">
              <!-- Header moved to sidebar -->
              <div class="yaml-editor-sidebar-header">
                <h3>
                  <i class="fas fa-bolt"></i>
                  ${this.isEditing ? 'Edit YAML Map' : 'Create YAML Map'}
                </h3>
                <button type="button" class="yaml-editor-close" aria-label="Close">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            
              <div class="yaml-editor-sidebar-content">
                <div class="yaml-editor-field">
                  <label for="name">Name <span class="required">*</span></label>
                  <input 
                    type="text" 
                    name="name" 
                    placeholder="Enter a name for your YAML map"
                    value="${this.formData.name || ''}"
                    required
                  />
                </div>
                
                <div class="yaml-editor-field">
                  <label for="description">Description</label>
                  <textarea 
                    name="description"
                    placeholder="A short description of this YAML map"
                    rows="3"
                    style="width: 100%; box-sizing: border-box;"
                    value="${this.formData.description}">${this.formData.description}</textarea>
                </div>

                <div class="yaml-editor-field">
                  <label for="url"><i class="fas fa-link" style="font-size: 14px; width: 18px; color: var(--accent);"></i> URL <span class="hint">(The website your YAML map will automate)</span></label>
                  <input 
                    type="url" 
                    name="url"
                    pattern="https?://.*"
                    placeholder="https://example.com"
                    title="Enter a valid URL starting with http:// or https://"
                    style="width: 100%; box-sizing: border-box;"
                    value="${this.formData.url || ''}"
                  />
                </div>
                
                <div class="yaml-editor-field">
                  <label for="tagInput">Tags</label>
                  <div class="yaml-editor-tag-input">
                    <input 
                      type="text" 
                      name="tagInput" 
                      placeholder="Add tags..."
                    />
                    <button 
                      type="button" 
                      class="yaml-editor-tag-add"
                    >
                      <i class="fas fa-plus"></i>
                    </button>
                  </div>
                  <div class="yaml-editor-tags"></div>
                </div>
                
                <div class="yaml-editor-field yaml-editor-publish" style="padding: 0; margin-bottom: 10px;">
                  <label class="yaml-editor-checkbox publish-toggle" style="display: inline-flex; align-items: center;">
                    <input 
                      type="checkbox" 
                      name="isPublic"
                      style="margin-right: 8px;"
                    />
                    <span>Make this YAML map public</span>
                  </label>
                </div>
                
                <!-- Temporarily commented out help section
                <div class="yaml-editor-help">
                  <h4>YAML Map Format</h4>
                  <p>
                    YAML maps define automated task sequences that can be executed by the agent.
                    Define tasks with specific actions and parameters.
                  </p>
                  <p>
                    <a 
                      href="https://midscenejs.com/api.html#agentrunyaml" 
                      target="_blank" 
                      rel="noreferrer"
                      class="yaml-doc-link"
                    >
                      View MidsceneJS YAML Documentation →
                    </a>
                  </p>
                  <button 
                    type="button" 
                    class="btn-secondary use-template-btn"
                  >
                    Use Example Template
                  </button>
                </div>
                -->
                
                <!-- Footer moved to sidebar -->
                <div class="yaml-editor-sidebar-footer">
                  <div class="yaml-editor-actions">
                    <button 
                      type="button" 
                      class="btn-secondary cancel-btn"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      class="btn-primary submit-btn"
                    >
                      <i class="fas fa-save"></i>
                      ${this.isEditing ? 'Save Changes' : 'Create YAML Map'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="yaml-editor-code">
              <!-- Unified YAML Editor Toolbox Header -->              
              <div class="yaml-editor-code-header">
                <span class="code-header-title">YAML Editor 1.0.0</span>
                <div class="yaml-editor-tools">
                  <button type="button" class="yaml-tool-btn" data-command="task">+ Task</button>
                  <button type="button" class="yaml-tool-btn" data-command="ai">+ AI Step</button>
                  <button type="button" class="yaml-tool-btn" data-command="aiQuery">+ AI Query</button>
                  <button type="button" class="yaml-tool-btn" data-command="sleep">+ Sleep</button>
                  <button 
                    type="button" 
                    class="btn-icon clear-yaml-btn"
                    title="Clear"
                  >
                    <i class="fas fa-eraser"></i>
                  </button>
                </div>
              </div>
              
              <div class="yaml-editor-code-container">
                <div class="yaml-editor-line-numbers" id="yaml-line-numbers"></div>
                <textarea
                  name="yaml"
                  placeholder="Enter your YAML code here..."
                  required
                  wrap="off"
                >${exampleYaml}</textarea>
              </div>

              <!-- Preview Section with Copy Button -->  
              <div class="yaml-editor-code-header preview-header">
                <span class="code-header-title">Preview</span>
                <button type="button" class="copy-preview-btn" title="Copy to clipboard">
                  <i class="far fa-copy"></i>
                </button>
              </div>
              <div class="yaml-editor-preview"></div>
              
              <!-- Help Section --> 
              <div class="yaml-editor-code-header help-header">
                <span class="code-header-title">Format Requirements</span>
                <a href="https://jsonformatter.org/yaml-formatter" target="_blank" rel="noopener noreferrer" style="margin-left: auto; font-size: 12px; color: #4ddb66; text-decoration: none; display: flex; align-items: center;">
                  <i class="fas fa-magic" style="margin-right: 4px;"></i> Format YAML Online
                </a>
              </div>
              <div class="yaml-help-content">
                  <p>Your YAML must follow this structure to work with <code>agent.runYaml()</code>:</p>
                  <pre>tasks:
  - name: your_task_name
    flow:
      - ai: your instruction here
      - aiQuery: "query to extract data as {field: type}"</pre>
                  <ul>
                    <li>Start with <code>tasks:</code> as the root element</li>
                    <li>Each task must have a name and flow section</li>
                    <li>Flow must include at least one <code>ai:</code> or <code>aiQuery:</code> instruction</li>
                    <li>Use <code>sleep:</code> with milliseconds to add delays</li>
                  </ul>
                  <p>
                    Need help? <a href="https://www.yamlchecker.com/" target="_blank" class="yaml-checker-link">Verify your YAML format online</a>
                    or ask AI for assistance with proper formatting.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Error status (moved from footer) -->
          <div class="yaml-editor-status">
            <div class="yaml-editor-error"></div>
            <div class="yaml-editor-saving">
              <i class="fas fa-spinner fa-spin"></i> Saving...
            </div>
          </div>
        </form>
      </div>
    `;
    
    // Add CSS to document head to style the modal
  if (!document.getElementById('yaml-editor-styles')) {
    const style = document.createElement('style');
    style.id = 'yaml-editor-styles';
    style.textContent = `
      /* YAML Syntax Highlighting */
      .yaml-key { color: #61affe; font-weight: 500; }
      .yaml-value { color: #e0e0e0; }
      .yaml-string { color: #98c379; }
      .yaml-number { color: #d19a66; }
      .yaml-boolean { color: #c678dd; font-style: italic; }
      .yaml-null { color: #c678dd; font-style: italic; }
      .yaml-list { color: #e06c75; }
      .yaml-line { 
        counter-increment: line;
        position: relative;
        padding-left: 40px;
      }
      
      .yaml-line::before {
        content: counter(line);
        position: absolute;
        left: 0;
        color: #6b7280;
        user-select: none;
        text-align: right;
        width: 30px;
        opacity: 0.7;
      }
      .yaml-line {
        min-height: 1.5em;
        white-space: pre;
        font-family: 'Fira Code', 'Consolas', monospace;
        font-size: 13px;
        line-height: 1.5;
      }
      .yaml-line:hover {
        background-color: rgba(255, 255, 255, 0.03);
      }
      .yaml-code-block {
        display: block;
        padding: 8px 0;
        margin: 0;
        overflow-x: auto;
        counter-reset: line;
      }
      .yaml-content {
        white-space: pre;
        tab-size: 2;
      }
      .yaml-editor-preview { 
        padding: 12px 0; 
        border-radius: 0 0 6px 6px;
        font-family: 'Fira Code', 'Consolas', monospace;
        line-height: 1.5;
        font-size: 13px;
        color: #f8f8f2;
        overflow: auto;
        max-height: 200px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-top: none;
        position: relative;
      }
      .yaml-editor-preview::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      .yaml-editor-preview::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 4px;
      }
      .yaml-editor-preview::-webkit-scrollbar-thumb {
        background: rgba(120, 120, 150, 0.4);
        border-radius: 4px;
      }
      .yaml-editor-preview::-webkit-scrollbar-thumb:hover {
        background: rgba(150, 150, 180, 0.6);
      }
      
      .preview-header {
        margin-top: 15px;
        background: rgba(30, 40, 60, 0.6);
        border-radius: 6px 6px 0 0;
        font-size: 14px;
        color: var(--accent);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-bottom: none;
      }
      
      .yaml-editor {
        background: #1e2530;
        color: #f0f0f0;
        border-radius: 12px;
        width: 90%;
        max-width: 1200px;
        max-height: 90vh;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .yaml-editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(30, 40, 60, 0.6);
      }
      .yaml-editor-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 18px;
        cursor: pointer;
        padding: 5px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .yaml-editor-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }
      .yaml-editor-content {
        display: flex;
        height: 100%;
        overflow: hidden;
      }
      .yaml-editor-sidebar {
        width: 35%;
        padding: 0;
        border-right: 1px solid rgba(255, 255, 255, 0.1);
        overflow-y: auto;
      }
      .yaml-editor-code {
        width: 65%;
        display: flex;
        flex-direction: column;
      }
      .yaml-editor-code-content {
        flex: 1;
        padding: 10px;
        overflow: auto;
      }
      .yaml-editor-code-wrapper {
        display: flex;
        height: 100%;
        min-height: 400px;
        background: rgba(20, 30, 50, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        overflow: hidden;
      }
      .yaml-editor-line-numbers {
        width: 40px;
        padding: 12px 5px;
        background: rgba(18, 26, 42, 0.8);
        color: rgba(255, 255, 255, 0.4);
        font-family: 'Fira Code', 'Consolas', monospace;
        font-size: 14px;
        line-height: 1.4;
        text-align: right;
        border-right: 1px solid rgba(255, 255, 255, 0.1);
        user-select: none;
      }
      .yaml-editor-code-content textarea {
        width: 100%;
        height: 100%;
        background: transparent;
        color: #f0f0f0;
        border: none;
        padding: 12px;
        font-family: 'Fira Code', 'Consolas', monospace;
        resize: none;
        tab-size: 2;
        line-height: 1.4;
        font-size: 14px;
      }
      .yaml-editor-field {
        margin-bottom: 15px;
      }
      .yaml-editor-field label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
      }
      .yaml-editor-field input,
      .yaml-editor-field textarea {
        width: 100%;
        padding: 8px 12px;
        background: rgba(20, 30, 50, 0.6);
        color: #f0f0f0;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
      }
      .yaml-editor-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(30, 40, 60, 0.6);
      }
      .btn-primary, .btn-secondary {
        padding: 8px 15px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .btn-primary {
        background: #4e6fff;
        color: white;
        border: none;
      }
      .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #f0f0f0;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      .yaml-editor-saving {
        display: none;
        align-items: center;
        gap: 8px;
        color: #4e6fff;
      }
      .yaml-editor-error {
        color: #ff5858;
        font-size: 14px;
        padding: 6px 10px;
        margin-top: 5px;
        border-radius: 4px;
        background: rgba(255, 88, 88, 0.1);
        border-left: 3px solid #ff5858;
      }
      .yaml-validation-error {
        display: flex;
        align-items: center;
      }
      .yaml-validation-error:before {
        content: '⚠️';
        margin-right: 6px;
      }
      
      /* Styling for help section */
      .help-header {
        color: var(--accent);
      }
      
      .yaml-help-content {
        background: rgba(20, 30, 50, 0.8);
        padding: 12px;
        border-radius: 0 0 6px 6px;
        font-size: 14px;
        color: #f0f0f0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-top: none;
        margin-bottom: 15px;
      }
      
      .yaml-help-content pre {
        background: rgba(15, 25, 40, 0.5);
        padding: 10px;
        border-radius: 4px;
        border-left: 3px solid #66d9e8;
        font-family: 'Fira Code', 'Consolas', monospace;
        overflow-x: auto;
      }
      
      .yaml-help-content code {
        background: rgba(15, 25, 40, 0.5);
        padding: 2px 4px;
        border-radius: 3px;
        font-family: 'Fira Code', 'Consolas', monospace;
        color: #66d9e8;
      }
      
      .yaml-help-content ul {
        padding-left: 20px;
        margin: 10px 0;
      }
      
      .yaml-help-content li {
        margin-bottom: 5px;
      }
      
      .yaml-checker-link {
        color: var(--accent);
        text-decoration: none;
        transition: color 0.2s;
      }
      
      .yaml-checker-link:hover {
        color: #c6a6ff;
        text-decoration: underline;
      }
      
      /* YAML Toolbar Styling */
      .yaml-editor-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
        padding: 8px;
        background: rgba(30, 40, 60, 0.4);
        border-radius: 6px;
      }
      
      .yaml-tool-btn {
        background: rgba(30, 40, 55, 0.8);
        color: var(--accent);
        border: 1px solid rgba(157, 113, 234, 0.3);
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .yaml-tool-btn:hover {
        background: rgba(157, 113, 234, 0.2);
        border-color: var(--accent);
      }
      .yaml-editor-loader {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 15px;
        padding: 30px;
        text-align: center;
      }
      
      .copy-preview-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        margin-left: 8px;
        transition: all 0.2s;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
      }
      
      .copy-preview-btn:hover {
        color: #61affe;
        background: rgba(97, 175, 254, 0.1);
      }
      
      .copy-preview-btn:active {
        transform: translateY(1px);
      }
      
      .copy-preview-btn i {
        font-size: 14px;
      }
      
      .preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Make sure the modal is visible
  this.modalContainer.style.display = 'flex';
    
    // Add event listeners
    this.addEventListeners();
    
    // Set initial state
    this.renderLoadingState();
    this.renderSavingState();
    this.renderError();
    
    // Load map data if editing
    if (this.isEditing) {
      this.loadMapData(initialMapId);
    } else {
      this.renderForm();
    }
  }

  // Insert YAML command template at cursor position
  insertYamlCommand(commandType) {
    const textarea = this.modalContainer.querySelector('textarea[name="yaml"]');
    if (!textarea) return;
    
    // Get cursor position
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    
    // Calculate indentation level at cursor position
    let indentation = '';
    const lines = textBefore.split('\n');
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      const match = lastLine.match(/^\s*/);
      if (match) indentation = match[0];
    }
    
    // Prepare command template based on type
    let template = '';
    
    switch (commandType) {
      case 'task':
        template = `\n${indentation}- name: new_task\n${indentation}  flow:\n${indentation}    - ai: `;
        break;
      case 'ai':
        template = `\n${indentation}- ai: `;
        break;
      case 'aiQuery':
        template = `\n${indentation}- aiQuery: "{result: string}"`;
        break;
      case 'sleep':
        template = `\n${indentation}- sleep: 1000`;
        break;
      default:
        return;
    }
    
    // Insert template at cursor position
    textarea.value = textBefore + template + textAfter;
    
    // Update cursor position after template
    const newCursorPos = cursorPos + template.length;
    textarea.selectionStart = newCursorPos;
    textarea.selectionEnd = newCursorPos;
    
    // Focus back on textarea
    textarea.focus();
    
    // Trigger change event to update preview and line numbers
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
  }

  // Add event listeners to form elements
  addEventListeners() {
    console.log('Adding event listeners to YamlMapEditor');
    if (!this.modalContainer) {
      console.error('Modal container not found!');
      return;
    }
    
    // Close button
    
    // Cancel button
    const cancelBtn = this.modalContainer.querySelector('.cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.handleClose());
    }
    
    // Form submission
    const form = this.modalContainer.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }
    
    // Name input
    const nameInput = this.modalContainer.querySelector('input[name="name"]');
    if (nameInput) {
      // Set initial value from formData
      nameInput.value = this.formData.name || '';
      
      nameInput.addEventListener('input', (e) => {
        this.formData.name = e.target.value;
        console.log('Name updated:', this.formData.name);
      });
      
      // Also handle change event to catch all cases
      nameInput.addEventListener('change', (e) => {
        this.formData.name = e.target.value;
        console.log('Name changed:', this.formData.name);
      });
    }
    
    // Description input
    const descriptionInput = this.modalContainer.querySelector('textarea[name="description"]');
    if (descriptionInput) {
      descriptionInput.addEventListener('input', (e) => {
        this.formData.description = e.target.value;
      });
    }
    
    // URL input
    const urlInput = this.modalContainer.querySelector('input[name="url"]');
    if (urlInput) {
      urlInput.addEventListener('input', (e) => {
        this.formData.url = e.target.value;
      });
    }
    
    // Public checkbox
    const isPublicCheckbox = this.modalContainer.querySelector('input[name="isPublic"]');
    if (isPublicCheckbox) {
      isPublicCheckbox.addEventListener('change', (e) => {
        this.formData.isPublic = e.target.checked;
      });
    }
    
    // Add tag button
    const addTagBtn = this.modalContainer.querySelector('.yaml-editor-tag-add');
    if (addTagBtn) {
      addTagBtn.addEventListener('click', () => this.handleAddTag());
    }
    
    // Tag input
    const tagInput = this.modalContainer.querySelector('input[name="tagInput"]');
    if (tagInput) {
      tagInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleAddTag();
        }
      });
      
      tagInput.addEventListener('input', (e) => {
        this.handleTagInputChange(e);
      });
    }
    
    // YAML textarea with enhanced editing features
    const yamlInput = this.modalContainer.querySelector('textarea[name="yaml"]');
    if (yamlInput) {
      yamlInput.addEventListener('input', (e) => this.handleChange(e));
      
      // Add tab key handling for proper indentation
      yamlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault(); // Prevent moving focus
          
          // Get cursor position
          const start = yamlInput.selectionStart;
          const end = yamlInput.selectionEnd;
          
          // Add two spaces for indentation (YAML standard)
          const newValue = yamlInput.value.substring(0, start) + '  ' + yamlInput.value.substring(end);
          yamlInput.value = newValue;
          
          // Update cursor position
          yamlInput.selectionStart = yamlInput.selectionEnd = start + 2;
          
          // Trigger change event to update preview
          const event = new Event('input', { bubbles: true });
          yamlInput.dispatchEvent(event);
        }
      });
    }
    
    // Public checkbox already handled above
    
    // Template button
    const templateBtn = this.modalContainer.querySelector('.use-template-btn');
    if (templateBtn) {
      templateBtn.addEventListener('click', () => this.useTemplate());
    }
    
    // Clear YAML button
    const clearYamlBtn = this.modalContainer.querySelector('.clear-yaml-btn');
    if (clearYamlBtn) {
      clearYamlBtn.addEventListener('click', () => {
        this.formData.yaml = '';
        const yamlTextarea = this.modalContainer.querySelector('textarea[name="yaml"]');
        if (yamlTextarea) {
          yamlTextarea.value = '';
        }
      });
    }
    
    // YAML toolbar buttons
    const toolButtons = this.modalContainer.querySelectorAll('.yaml-tool-btn');
    if (toolButtons.length > 0) {
      toolButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          const command = e.target.getAttribute('data-command');
          if (command) {
            this.insertYamlCommand(command);
          }
        });
      });
    }
    
    // Copy preview button
    const copyPreviewBtn = this.modalContainer.querySelector('.copy-preview-btn');
    if (copyPreviewBtn) {
      copyPreviewBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(this.formData.yaml);
          // Show feedback
          const icon = copyPreviewBtn.querySelector('i');
          const originalIcon = icon.className;
          icon.className = 'fas fa-check';
          copyPreviewBtn.setAttribute('title', 'Copied!');
          
          // Reset after 2 seconds
          setTimeout(() => {
            icon.className = originalIcon;
            copyPreviewBtn.setAttribute('title', 'Copy to clipboard');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy YAML to clipboard:', err);
          alert('Failed to copy YAML to clipboard. Please try again.');
        }
      });
    }
  }

  // Static method to open the editor
  static open(mapId) {
    console.log(`Opening YamlMapEditor with mapId: ${mapId || 'new'}`);
    
    // Check if we're opening a different map than the current one
    const isDifferentMap = window._yamlMapEditorInstance && 
                         window._yamlMapEditorInstance.initialMapId !== mapId;
    
    // If we have an existing instance and we're not opening a different map
    if (window._yamlMapEditorInstance && !isDifferentMap) {
      console.log('Reusing existing YamlMapEditor instance');
      const editor = window._yamlMapEditorInstance;
      
      // If the modal exists but is hidden, show it again
      if (editor.modalContainer) {
        editor.modalContainer.style.display = 'flex';
        return editor;
      }
    } else if (isDifferentMap && window._yamlMapEditorInstance) {
      console.log('Opening different map, resetting editor instance');
      // If opening a different map, clean up the existing instance
      window._yamlMapEditorInstance.handleClose();
      window._yamlMapEditorInstance = null;
    }
    
    // Ensure the modal container exists
    let modalContainer = document.getElementById('yaml-map-editor-modal');
    if (modalContainer) {
      console.log('Found existing modal container, clearing it');
      modalContainer.innerHTML = '';
      modalContainer.style.display = 'flex';
    } else {
      console.log('Creating new modal container for YamlMapEditor');
      modalContainer = document.createElement('div');
      modalContainer.id = 'yaml-map-editor-modal';
      modalContainer.className = 'yaml-editor-container';
      document.body.appendChild(modalContainer);
    }
    
    try {
      // Create and initialize a new instance
      const editor = new YamlMapEditor();
      
      // Save editor instance to window for debugging and access
      if (typeof window !== 'undefined') {
        window._yamlMapEditorInstance = editor;
      }
      
      editor.init(
        mapId,
        () => {
          console.log('YamlMapEditor closed');
        },
        (yamlMap) => {
          console.log('YamlMap saved:', yamlMap ? yamlMap._id : 'unknown');
          // Emit an event that the map was saved
          const event = new CustomEvent('yaml-map-saved', { detail: yamlMap });
          document.dispatchEvent(event);
          
          // Show success notification
          const notification = document.createElement('div');
          notification.className = 'notification notification-success';
          notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>YAML Map saved successfully!</span>
          `;
          document.body.appendChild(notification);
          
          // Auto-remove after delay
          setTimeout(() => {
            notification.classList.add('notification-hide');
            setTimeout(() => notification.remove(), 300);
          }, 3000);
          
          // Reload YAML maps list if it exists
          if (typeof loadYamlMaps === 'function') {
            console.log('Reloading YAML maps list after save');
            loadYamlMaps();
          }
        }
      );
      
      return editor;
    } catch (error) {
      console.error('Error opening YAML map editor:', error);
      alert('Failed to open YAML editor. Please try again or check the console for details.');
      return null;
    }
  }
}

// Make the class globally accessible for easier reference
if (typeof window !== 'undefined') {
  window.YamlMapEditor = YamlMapEditor;
  console.log('YamlMapEditor attached to global window object');
}

// Export the class
export default YamlMapEditor;
