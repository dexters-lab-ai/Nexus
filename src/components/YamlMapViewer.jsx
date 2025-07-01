import React, { useState, useEffect } from 'react';
import '../../styles/components/yaml-map-viewer.css';

/**
 * YAML Map Viewer Component
 * Displays details of a YAML map and provides actions for using, editing, and deleting
 */
const YamlMapViewer = ({ 
  yamlMap, 
  onClose, 
  onEdit, 
  onDelete, 
  onAttach,
  onClone,
  isOwner 
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  
  if (!yamlMap) return null;

  // Format the YAML for display with syntax highlighting
  // This is a simple formatter for now, could be enhanced with a proper syntax highlighter
  const formatYaml = (yamlContent) => {
    if (!yamlContent) return '';
    
    return yamlContent
      .replace(/tasks:/g, '<span style="color: #61affe;">tasks:</span>')
      .replace(/name:/g, '<span style="color: #f8ac30;">name:</span>')
      .replace(/flow:/g, '<span style="color: #49cc90;">flow:</span>')
      .replace(/- ai:/g, '<span style="color: #e83e8c;">- ai:</span>')
      .replace(/- aiQuery:/g, '<span style="color: #e83e8c;">- aiQuery:</span>')
      .replace(/- sleep:/g, '<span style="color: #9012fe;">- sleep:</span>');
  };

  // Handle using the YAML map
  const handleUseMap = async () => {
    setIsExecuting(true);
    
    try {
      // Track usage
      await fetch(`/api/yaml-maps/${yamlMap._id}/use`, {
        method: 'POST',
        credentials: 'include'
      });
      
      // Attach to input for execution
      if (onAttach && typeof onAttach === 'function') {
        onAttach(yamlMap);
      }
      
      // Close the viewer
      if (onClose) onClose();
    } catch (error) {
      console.error('Error using YAML map:', error);
      const errorMsg = error.message || 'Failed to use YAML map';
      if (window.showNotification) {
        window.showNotification(`Error: ${errorMsg}`, 'error');
      } else {
        alert(`Error: ${errorMsg}`);
      }
    } finally {
      setIsExecuting(false);
    }
  };

  // Handle attaching to command center
  const handleAttachToCommandCenter = async () => {
    console.log('Attaching YAML map to Command Center:', yamlMap._id);
    try {
      // Track usage
      await fetch(`/api/yaml-maps/${yamlMap._id}/use`, {
        method: 'POST',
        credentials: 'include'
      });
      
      // Use the callback to attach
      if (onAttach && typeof onAttach === 'function') {
        onAttach(yamlMap);
        console.log('onAttach callback executed');
      }
      
      // Emit the yaml-map-attached event
      if (window.eventBus) {
        window.eventBus.emit('yaml-map-attached', { mapId: yamlMap._id, yamlMap });
        console.log('yaml-map-attached event emitted');
      }
      
      // Show success message
      if (window.showNotification) {
        window.showNotification('YAML Map attached to Command Center!', 'success');
      } else {
        alert('YAML Map attached to Command Center!');
      }
      
      // Close the viewer
      if (onClose) onClose();
    } catch (error) {
      console.error('Error attaching YAML map:', error);
      const errorMsg = error.message || 'Failed to attach YAML map';
      if (window.showNotification) {
        window.showNotification(`Error: ${errorMsg}`, 'error');
      } else {
        alert(`Error: ${errorMsg}`);
      }
    }
  };

  return (
    <div className="yaml-viewer-modal-overlay" onClick={onClose}>
      <div className={`yaml-map-detail ${isFullscreen ? 'fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="yaml-map-detail-header">
          <div className="yaml-map-detail-title">
            <h3>{yamlMap.name}</h3>
            <div className="yaml-map-detail-meta">
              <span>
                Updated: {new Date(yamlMap.updatedAt).toLocaleDateString()} | 
                {yamlMap.isPublic ? ' Public' : ' Private'} |
                {yamlMap.usageCount !== undefined ? ` Used ${yamlMap.usageCount} times` : ''}
              </span>
            </div>
          </div>
          <button className="yaml-viewer-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="yaml-map-actions">
          <button 
            className="btn-primary"
            onClick={handleUseMap}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Executing...
              </>
            ) : (
              <>
                <i className="fas fa-play"></i>
                Run
              </>
            )}
          </button>
          
          <button 
            className="btn-outline attach-btn command-center-btn"
            onClick={handleAttachToCommandCenter}
          >
            <i className="fas fa-paperclip"></i>
            Attach to Command Center
          </button>
          
          {isOwner && (
            <button 
              className="btn-secondary"
              onClick={onEdit}
            >
              <i className="fas fa-edit"></i>
              Edit
            </button>
          )}
          
          <button 
            className="btn-secondary"
            onClick={onClone}
          >
            <i className="fas fa-copy"></i>
            Clone
          </button>
          
          {isOwner && (
            <button 
              className="btn-danger"
              onClick={onDelete}
            >
              <i className="fas fa-trash"></i>
              Delete
            </button>
          )}
        </div>
      </div>
      
      {yamlMap.description && (
        <div className="yaml-map-detail-description">
          {yamlMap.description}
        </div>
      )}
      
      {yamlMap.tags && yamlMap.tags.length > 0 && (
        <div className="yaml-map-tags" style={{ marginBottom: '20px' }}>
          {yamlMap.tags.map(tag => (
            <span key={tag} className="yaml-map-tag">{tag}</span>
          ))}
        </div>
      )}
      
      <div className="yaml-map-detail-content">
        <div className="yaml-map-code">
          <div className="yaml-map-code-header">
            <span>YAML Content</span>
            <div>
              <button 
                className="btn-icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                <i className={`fas fa-${isFullscreen ? 'compress' : 'expand'}`}></i>
              </button>
              <button 
                className="btn-icon"
                onClick={() => {
                  navigator.clipboard.writeText(yamlMap.yaml);
                  alert('YAML content copied to clipboard');
                }}
                title="Copy to clipboard"
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <pre>
            <code 
              dangerouslySetInnerHTML={{ __html: formatYaml(yamlMap.yaml) }}
            />
          </pre>
        </div>
      </div>
      
      <div className="yaml-map-guide">
        <h4>How to Use This YAML Map</h4>
        <ol>
          <li>Click <strong>Run</strong> to execute this YAML map directly</li>
          <li>Click <strong>Attach to Input</strong> to reference this map in your chat input</li>
          <li>Reference in chat by typing: <code>/yaml {yamlMap._id}</code></li>
        </ol>
        <p>
          <a 
            href="https://dexters-ai-lab.gitbook.io/dexters-ai-lab/getting-started/publish-your-docs-1" 
            target="_blank" 
            rel="noreferrer"
          >
            Learn more about YAML automation →
          </a>
        </p>
      </div>
    </div>
  );
};

export default YamlMapViewer;
