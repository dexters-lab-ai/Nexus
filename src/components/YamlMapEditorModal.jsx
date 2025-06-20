import React, { useState, useEffect, useRef } from 'react';

// Load YAML maps CSS with environment detection
const loadYamlMapsCSS = () => {
  if (process.env.NODE_ENV === 'production') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/yaml-maps.css';
    link.id = 'yaml-maps-styles';
    document.head.appendChild(link);
  } else {
    // In development, use dynamic import with cache busting
    import('../styles/components/yaml-maps.css');
  }
};

// Load the CSS when this module is imported
loadYamlMapsCSS();

/**
 * Modal component for creating and editing YAML maps
 * This is a pure React component that can be dynamically loaded
 */
const YamlMapEditorModal = ({ initialMapId = null, onClose, onSave }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tags: [],
    yaml: '',
    isPublic: false
  });
  const [tagInput, setTagInput] = useState('');
  const editorRef = useRef(null);
  const isEditing = !!initialMapId;

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

  // Reset form when initialMapId changes
  useEffect(() => {
    let isMounted = true;
    
    const resetAndLoad = async () => {
      // Reset form state when opening a different map
      if (isMounted) {
        setFormData({
          name: '',
          description: '',
          tags: [],
          yaml: exampleYaml,
          isPublic: false
        });
        setError(null);
      }
      
      if (initialMapId && isMounted) {
        try {
          await loadMapData(initialMapId);
        } catch (error) {
          console.error('[YamlMapEditor] Error in initial load:', error);
        }
      }
    };
    
    resetAndLoad();
    
    return () => {
      isMounted = false;
    };
  }, [initialMapId]);
  
  // Reset form when modal is closed and reopened
  useEffect(() => {
    // This will run when the component mounts and when onClose changes
    return () => {
      // Reset form when modal is closed
      setFormData({
        name: '',
        description: '',
        tags: [],
        yaml: exampleYaml,
        isPublic: false
      });
      setError(null);
    };
  }, [onClose]);

  // Load map data from the server - matches Sidebar's approach
  const loadMapData = async (mapId) => {
    // Skip if no mapId is provided
    if (!mapId) return;
    
    try {
      console.log(`[YamlMapEditor] Loading map data for ID: ${mapId}`);
      setIsLoading(true);
      setError(null);
      
      // Match the Sidebar's fetch approach
      const response = await fetch(`/api/yaml-maps/${mapId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      // First, check if the response is JSON
      const contentType = response.headers.get('content-type');
      const responseText = await response.text();
      
      if (!contentType || !contentType.includes('application/json')) {
        console.error('[YamlMapEditor] Received non-JSON response:', {
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: responseText.substring(0, 500) // Log first 500 chars to avoid huge logs
        });
        throw new Error('Server returned an invalid response. Please try again.');
      }
      
      // If we got here, it's JSON
      const data = JSON.parse(responseText);
      
      if (!response.ok) {
        console.error(`[YamlMapEditor] Error response: ${response.status}`, data);
        throw new Error(data.error || `Failed to load YAML map: ${response.status} ${response.statusText}`);
      }
      
      console.log('[YamlMapEditor] Received map data:', data);
      
      if (data.success && data.yamlMap) {
        // Verify we're still supposed to be loading this map
        if (mapId === initialMapId) {
          setFormData({
            name: data.yamlMap.name || '',
            description: data.yamlMap.description || '',
            tags: data.yamlMap.tags || [],
            yaml: data.yamlMap.yaml || '',
            isPublic: data.yamlMap.isPublic || false
          });
        }
      } else {
        throw new Error(data.error || 'Failed to load YAML map: Invalid response format');
      }
    } catch (error) {
      console.error('[YamlMapEditor] Error loading YAML map:', error);
      setError(error.message);
      
      // Rethrow to allow parent components to handle if needed
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form field changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle tag input changes
  const handleTagInputChange = (e) => {
    setTagInput(e.target.value);
  };

  // Add a new tag
  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    
    // Prevent duplicate tags
    if (formData.tags.includes(tagInput.trim())) {
      setTagInput('');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      tags: [...prev.tags, tagInput.trim()]
    }));
    setTagInput('');
  };

  // Remove a tag
  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  // Handle pressing Enter in the tag input
  const handleTagKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Use template YAML
  const useTemplate = () => {
    setFormData(prev => ({ ...prev, yaml: exampleYaml }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    
    if (!formData.yaml.trim()) {
      setError('YAML content is required');
      return;
    }
    
    // Basic validation for YAML structure
    if (!formData.yaml.includes('tasks:') && !formData.yaml.includes('flow:')) {
      setError('Invalid YAML format. YAML must include tasks and flow sections.');
      return;
    }
    
    try {
      setIsSaving(true);
      setError(null);
      
      const url = isEditing 
        ? `/api/yaml-maps/${initialMapId}` 
        : '/api/yaml-maps';
      
      const method = isEditing ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${isEditing ? 'update' : 'create'} YAML map`);
      }
      
      const data = await response.json();
      
      if (data.success && data.yamlMap) {
        if (onSave) {
          onSave(data.yamlMap);
        }
        if (onClose) {
          onClose();
        }
      } else {
        throw new Error(`Failed to ${isEditing ? 'update' : 'create'} YAML map`);
      }
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} YAML map:`, error);
      setError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle modal close
  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="yaml-editor-container">
      <div className="yaml-editor">
        <div className="yaml-editor-header">
          <div className="yaml-editor-title">
            {isEditing ? 'Edit YAML Map' : 'Create New YAML Map'}
          </div>
          <button 
            className="yaml-editor-close" 
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        
        {isLoading ? (
          <div className="yaml-editor-loading">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Loading YAML map...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="yaml-editor-content">
              <div className="yaml-editor-form">
                <div className="yaml-editor-field">
                  <label htmlFor="yaml-name">Name</label>
                  <input
                    id="yaml-name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter a name for your YAML map"
                    required
                  />
                </div>
                
                <div className="yaml-editor-field">
                  <label htmlFor="yaml-description">Description</label>
                  <textarea
                    id="yaml-description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Describe what this YAML map does"
                  />
                </div>
                
                <div className="yaml-editor-field">
                  <label htmlFor="yaml-tags">Tags</label>
                  <div className="yaml-editor-tags">
                    {formData.tags.map(tag => (
                      <div key={tag} className="yaml-editor-tag">
                        {tag}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveTag(tag)}
                          aria-label={`Remove tag ${tag}`}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="yaml-editor-add-tag">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={handleTagInputChange}
                      onKeyPress={handleTagKeyPress}
                      placeholder="Add a tag"
                    />
                    <button 
                      type="button" 
                      className="btn-secondary"
                      onClick={handleAddTag}
                    >
                      Add
                    </button>
                  </div>
                </div>
                
                <div className="yaml-editor-field">
                  <div className="yaml-editor-public-toggle">
                    <input
                      id="yaml-public"
                      name="isPublic"
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={handleChange}
                    />
                    <label htmlFor="yaml-public">
                      Make this YAML map public for other users
                    </label>
                  </div>
                </div>
                
                <div className="yaml-editor-info">
                  <h4>YAML Map Structure</h4>
                  <p>
                    YAML Maps follow the Recommended YAML format for automation flows.
                    Each map can contain multiple tasks with a series of actions in the flow.
                  </p>
                  <p>
                    <a 
                      href="https://dexters-ai-lab.gitbook.io/dexters-ai-lab/getting-started/publish-your-docs-1" 
                      target="_blank" 
                      rel="noreferrer"
                    >
                      View Recommended YAML Documentation →
                    </a>
                  </p>
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={useTemplate}
                  >
                    Use Example Template
                  </button>
                </div>
              </div>
              
              <div className="yaml-editor-code">
                <div className="yaml-editor-code-header">
                  <span>YAML Content</span>
                  <div className="yaml-editor-code-actions">
                    <button 
                      type="button" 
                      className="btn-icon"
                      onClick={() => setFormData(prev => ({ ...prev, yaml: '' }))}
                      title="Clear"
                    >
                      <i className="fas fa-eraser"></i>
                    </button>
                  </div>
                </div>
                <div className="yaml-editor-code-content">
                  <textarea
                    ref={editorRef}
                    name="yaml"
                    value={formData.yaml}
                    onChange={handleChange}
                    placeholder="Enter your YAML code here..."
                    required
                  />
                </div>
              </div>
            </div>
            
            <div className="yaml-editor-footer">
              <div className="yaml-editor-status">
                {error && (
                  <div className="yaml-editor-error">
                    <i className="fas fa-exclamation-triangle"></i> {error}
                  </div>
                )}
                {isSaving && (
                  <div className="yaml-editor-saving">
                    <i className="fas fa-spinner fa-spin"></i> Saving...
                  </div>
                )}
              </div>
              <div className="yaml-editor-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={handleClose}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isSaving}
                >
                  <i className="fas fa-save"></i>
                  {isEditing ? 'Save Changes' : 'Create YAML Map'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// Track the current editor instance
let currentEditorInstance = null;

// Export a static method to open the editor
export const open = (mapId) => {
  // Close any existing editor instance
  if (currentEditorInstance) {
    currentEditorInstance.close();
    currentEditorInstance = null;
  }
  
  // Create a new modal container
  const modalContainer = document.createElement('div');
  modalContainer.className = 'yaml-map-editor-container';
  document.body.appendChild(modalContainer);
  
  // Helper function to clean up the modal
  const cleanup = () => {
    if (modalContainer && modalContainer.parentNode) {
      modalContainer.parentNode.removeChild(modalContainer);
    }
    currentEditorInstance = null;
  };
  
  // Create a promise that resolves when the modal is closed
  return new Promise((resolve) => {
    // Create a root for the modal
    const { createRoot } = require('react-dom/client');
    const root = createRoot(modalContainer);
    
    // Render the modal
    root.render(
      <YamlMapEditorModal
        initialMapId={mapId}
        onClose={() => {
          cleanup();
          resolve();
        }}
        onSave={(yamlMap) => {
          // Emit an event that the map was saved
          const event = new CustomEvent('yaml-map-saved', { detail: yamlMap });
          document.dispatchEvent(event);
          cleanup();
          resolve(yamlMap);
        }}
      />
    );
    
    // Store the current instance
    currentEditorInstance = {
      close: () => {
        cleanup();
        resolve();
      }
    };
  });
};

// Make the component globally available
if (typeof window !== 'undefined') {
  window.YamlMapEditor = YamlMapEditorModal;
}

export default YamlMapEditorModal;
