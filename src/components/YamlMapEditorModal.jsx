import React, { useState, useEffect, useRef } from 'react';
import '../styles/components/yaml-maps.css';

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

  // Load existing map data when editing
  useEffect(() => {
    if (initialMapId) {
      loadMapData(initialMapId);
    } else {
      // Set default template for new maps
      setFormData(prev => ({ ...prev, yaml: exampleYaml }));
    }
  }, [initialMapId]);

  // Load map data from the server
  const loadMapData = async (mapId) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/yaml-maps/${mapId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load YAML map: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.yamlMap) {
        setFormData({
          name: data.yamlMap.name || '',
          description: data.yamlMap.description || '',
          tags: data.yamlMap.tags || [],
          yaml: data.yamlMap.yaml || '',
          isPublic: data.yamlMap.isPublic || false
        });
      } else {
        throw new Error(data.error || 'Failed to load YAML map');
      }
    } catch (error) {
      console.error('Error loading YAML map:', error);
      setError(error.message);
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
                    YAML Maps follow the MidsceneJS YAML format for automation flows.
                    Each map can contain multiple tasks with a series of actions in the flow.
                  </p>
                  <p>
                    <a 
                      href="https://midscenejs.com/api.html#agentrunyaml" 
                      target="_blank" 
                      rel="noreferrer"
                    >
                      View MidsceneJS YAML Documentation →
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

// Export a static method to open the editor
YamlMapEditorModal.open = (mapId) => {
  // Create the modal container if it doesn't exist
  let modalContainer = document.getElementById('yaml-editor-modal-container');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'yaml-editor-modal-container';
    document.body.appendChild(modalContainer);
  }
  
  // Render the component into the container
  // This requires React to be available globally
  if (window.React && window.ReactDOM) {
    window.ReactDOM.render(
      window.React.createElement(YamlMapEditorModal, {
        initialMapId: mapId,
        onClose: () => {
          window.ReactDOM.unmountComponentAtNode(modalContainer);
        },
        onSave: (yamlMap) => {
          // Emit an event that the map was saved
          const event = new CustomEvent('yaml-map-saved', { detail: yamlMap });
          document.dispatchEvent(event);
        }
      }),
      modalContainer
    );
  } else {
    console.error('React or ReactDOM not available globally');
  }
};

// Make the component globally available
if (typeof window !== 'undefined') {
  window.YamlMapEditor = YamlMapEditorModal;
}

export default YamlMapEditorModal;
