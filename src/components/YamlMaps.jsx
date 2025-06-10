import React, { useState, useEffect, useCallback } from 'react';
import YamlMapEditor from './YamlMapEditor';
import YamlMapViewer from './YamlMapViewer';

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
 * YAML Maps Component - Main interface for managing YAML automation maps
 * Allows users to create, view, edit, and use YAML maps for automated tasks
 */
const YamlMaps = ({ onAttachToInput, onClose }) => {
  const [yamlMaps, setYamlMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  // Fetch user's YAML maps on component mount
  useEffect(() => {
    fetchYamlMaps();
  }, []);
  
  // Reference to the detail container
  const detailContainerRef = React.useRef(null);
  
  // Handle rendering the YAML map viewer when selected map changes
  useEffect(() => {
    if (!detailContainerRef.current) return;
    
    const container = detailContainerRef.current;
    
    // Clear viewer initialized attribute when selected map changes
    if (container.hasAttribute('data-viewer-initialized')) {
      const currentMapId = container.getAttribute('data-map-id');
      if (!selectedMap || currentMapId !== selectedMap._id) {
        container.removeAttribute('data-viewer-initialized');
      }
    }
    
    // If we have a selected map, initialize the viewer
    if (selectedMap) {
      console.log('Map selected, initializing viewer for:', selectedMap._id);
      
      // Clean up any previous viewer
      container.innerHTML = '';
      
      try {
        // Create the YamlMapViewer instance
        const viewer = new YamlMapViewer({
          yamlMap: selectedMap,
          container: container,
          onClose: () => setSelectedMap(null),
          onEdit: () => setIsEditing(true),
          onDelete: () => handleDeleteMap(selectedMap._id),
          onAttach: () => handleAttachMap(selectedMap._id),
          onClone: () => handleCloneMap(selectedMap._id),
          isOwner: selectedMap.isOwner || false
        });
        
        // Render the viewer
        viewer.render();
        
        // Mark the container as initialized
        container.setAttribute('data-viewer-initialized', 'true');
        container.setAttribute('data-map-id', selectedMap._id);
      } catch (error) {
        console.error('Error initializing YamlMapViewer:', error);
        container.innerHTML = `
          <div class="yaml-maps-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error displaying YAML map: ${error.message}</p>
          </div>
        `;
      }
    } else {
      // No map selected, show default content
      container.removeAttribute('data-viewer-initialized');
      container.removeAttribute('data-map-id');
      container.innerHTML = `
        <div class="yaml-maps-empty">
          <div class="yaml-maps-empty-icon">
            <i class="fas fa-code"></i>
          </div>
          <h3>Select a YAML Map</h3>
          <p>Choose a YAML map from the sidebar to view its details, or create a new one.</p>
        </div>
      `;
    }
  }, [selectedMap]);

  // Fetch YAML maps from the server
  const fetchYamlMaps = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/yaml-maps', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch YAML maps');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setYamlMaps(data.yamlMaps);
      } else {
        throw new Error(data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error fetching YAML maps:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle search query change
  const handleSearchChange = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.trim() === '') {
      // If search is cleared, fetch all maps
      fetchYamlMaps();
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/yaml-maps/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setYamlMaps(data.yamlMaps);
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (error) {
      console.error('Error searching YAML maps:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle map deletion
  const handleDeleteMap = async (mapId) => {
    if (!confirm('Are you sure you want to delete this YAML map? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/yaml-maps/${mapId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete YAML map');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Remove the deleted map from state
        setYamlMaps(yamlMaps.filter(map => map._id !== mapId));
        
        // If the deleted map was selected, clear selection
        if (selectedMap && selectedMap._id === mapId) {
          setSelectedMap(null);
        }
      } else {
        throw new Error(data.error || 'Failed to delete YAML map');
      }
    } catch (error) {
      console.error('Error deleting YAML map:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Handle map creation
  const handleCreateMap = (newMap) => {
    setYamlMaps([newMap, ...yamlMaps]);
    setIsCreating(false);
    setSelectedMap(newMap);
  };

  // Handle map update
  const handleUpdateMap = (updatedMap) => {
    setYamlMaps(yamlMaps.map(map => 
      map._id === updatedMap._id ? updatedMap : map
    ));
    setIsEditing(false);
    setSelectedMap(updatedMap);
  };

  // Handle map attachment to input
  const handleAttachMap = (mapId) => {
    if (onAttachToInput && typeof onAttachToInput === 'function') {
      onAttachToInput(`/yaml ${mapId}`);
    }
  };

  // Create a clone of a map
  const handleCloneMap = async (mapId) => {
    try {
      const response = await fetch(`/api/yaml-maps/${mapId}/clone`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to clone YAML map');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Add the cloned map to state
        setYamlMaps([data.yamlMap, ...yamlMaps]);
        setSelectedMap(data.yamlMap);
      } else {
        throw new Error(data.error || 'Failed to clone YAML map');
      }
    } catch (error) {
      console.error('Error cloning YAML map:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Filter maps based on search query (client-side filtering for immediate feedback)
  const filteredMaps = searchQuery.trim() === '' 
    ? yamlMaps 
    : yamlMaps.filter(map => 
        map.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (map.description && map.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (map.tags && map.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())))
      );

  // Render YAML map list
  return (
    <div className="yaml-maps-container">
      <div className="yaml-maps-header">
        <h2>
          YAML Maps
          <div className="yaml-maps-help-tooltip">
            <div className="yaml-maps-help-icon">?</div>
            <div className="yaml-maps-tooltip-content">
              YAML Maps are pre-defined automation scripts that can be executed directly without writing code.
              They follow the MidsceneJS YAML format and can automate browser interactions, data collection, and more.
            </div>
          </div>
        </h2>
        <button className="btn-icon" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
      </div>
      
      <div className="yaml-maps-actions">
        <div className="yaml-maps-search">
          <i className="fas fa-search"></i>
          <input 
            type="text"
            placeholder="Search YAML maps..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        <button 
          className="btn-primary"
          onClick={() => setIsCreating(true)}
        >
          <i className="fas fa-plus"></i>
          New Map
        </button>
      </div>
      
      <div className="yaml-maps-content">
        <div className="yaml-maps-sidebar">
          {isLoading ? (
            <div className="yaml-maps-loading">
              <i className="fas fa-spinner fa-spin"></i>
              <p>Loading YAML maps...</p>
            </div>
          ) : error ? (
            <div className="yaml-maps-error">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button 
                className="btn-secondary"
                onClick={fetchYamlMaps}
              >
                Retry
              </button>
            </div>
          ) : filteredMaps.length === 0 ? (
            <div className="yaml-maps-empty">
              <div className="yaml-maps-empty-icon">
                <i className="fas fa-file-code"></i>
              </div>
              <h3>No YAML Maps Found</h3>
              <p>
                {searchQuery ? 
                  `No maps matching "${searchQuery}" were found.` : 
                  "You haven't created any YAML maps yet."}
              </p>
              <button 
                className="btn-primary"
                onClick={() => setIsCreating(true)}
              >
                <i className="fas fa-plus"></i>
                Create Your First Map
              </button>
            </div>
          ) : (
            <div className="yaml-maps-list">
              {filteredMaps.map(map => (
                <div 
                  key={map._id} 
                  className={`yaml-map-item ${selectedMap && selectedMap._id === map._id ? 'active' : ''}`}
                  onClick={() => setSelectedMap(map)}
                >
                  <div className="yaml-map-name">{map.name}</div>
                  {map.description && (
                    <div className="yaml-map-description">
                      {map.description.length > 80 
                        ? map.description.substring(0, 80) + '...' 
                        : map.description}
                    </div>
                  )}
                  {map.tags && map.tags.length > 0 && (
                    <div className="yaml-map-tags">
                      {map.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="yaml-map-tag">{tag}</span>
                      ))}
                      {map.tags.length > 3 && (
                        <span className="yaml-map-tag">+{map.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                  <div className="yaml-map-meta">
                    {map.usageCount !== undefined && (
                      <div className="yaml-map-usage">
                        <i className="fas fa-play"></i>
                        {map.usageCount} {map.usageCount === 1 ? 'use' : 'uses'}
                      </div>
                    )}
                    <div className="yaml-map-date">
                      {new Date(map.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {map.isPublic && (
                    <div className="yaml-map-badge public">Public</div>
                  )}
                  {!map.isPublic && (
                    <div className="yaml-map-badge private">Private</div>
                  )}
                  {map.isOwner && (
                    <div className="yaml-map-badge owner">Owner</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* <div className="yaml-map-detail" ref={detailContainerRef} /> */}
      </div>
      
      {/* YAML Map Creator Modal */}
      {isCreating && (
        <YamlMapEditor 
          onClose={() => setIsCreating(false)}
          onSave={handleCreateMap}
          isCreating={true}
        />
      )}
      
      {/* YAML Map Editor Modal */}
      {isEditing && selectedMap && (
        <YamlMapEditor 
          onClose={() => setIsEditing(false)}
          onSave={handleUpdateMap}
          yamlMap={selectedMap}
          isCreating={false}
        />
      )}
    </div>
  );
};

export default YamlMaps;
