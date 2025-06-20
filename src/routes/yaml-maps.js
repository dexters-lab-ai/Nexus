import express from 'express';
import YamlMap from '../models/YamlMap.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

/**
 * Get all YAML maps for a user
 * GET /api/yaml-maps
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const searchQuery = req.query.q ? req.query.q.trim() : '';
    
    // Build base query to include user's maps and public maps
    const baseQuery = {
      $or: [
        { userId },
        { isPublic: true }
      ]
    };
    
    // Add search filtering if a query is provided
    let finalQuery = baseQuery;
    if (searchQuery) {
      console.log(`[YAML Maps API] Searching for maps matching: "${searchQuery}"`);
      
      // Add search criteria to filter by name, description, or tags
      finalQuery = {
        $and: [
          baseQuery,
          {
            $or: [
              { name: { $regex: searchQuery, $options: 'i' } },
              { description: { $regex: searchQuery, $options: 'i' } },
              { tags: { $in: [new RegExp(searchQuery, 'i')] } }
            ]
          }
        ]
      };
    }
    
    // Execute the query with proper filtering
    const yamlMaps = await YamlMap.find(finalQuery).sort({ updatedAt: -1 });
    
    console.log(`[YAML Maps API] Found ${yamlMaps.length} maps${searchQuery ? ` for query "${searchQuery}"` : ''}`);
    
    // Mark which maps belong to the current user
    const mapsWithOwnership = yamlMaps.map(map => ({
      ...map.toObject(),
      isOwner: map.userId === userId
    }));
    
    res.json({ success: true, yamlMaps: mapsWithOwnership });
  } catch (error) {
    console.error('Error fetching YAML maps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Search YAML maps
 * GET /api/yaml-maps/search?q=query
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const query = req.query.q;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }
    
    const yamlMaps = await YamlMap.find({
      $and: [
        { $text: { $search: query } },
        {
          $or: [
            { userId },
            { isPublic: true }
          ]
        }
      ]
    }).sort({ score: { $meta: 'textScore' } });
    
    const mapsWithOwnership = yamlMaps.map(map => ({
      ...map.toObject(),
      isOwner: map.userId === userId
    }));
    
    res.json({ success: true, yamlMaps: mapsWithOwnership });
  } catch (error) {
    console.error('Error searching YAML maps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get a specific YAML map
 * GET /api/yaml-maps/:id
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    // Ensure we're sending JSON
    res.set('Content-Type', 'application/json');
    
    const userId = req.session.user;
    const yamlMap = await YamlMap.findById(req.params.id);
    
    if (!yamlMap) {
      return res.status(404).json({ 
        success: false, 
        error: 'YAML map not found' 
      });
    }
    
    // Check if user has access (owner or public map)
    if (yamlMap.userId.toString() !== userId.toString() && !yamlMap.isPublic) {
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to view this YAML map' 
      });
    }
    
    const response = { 
      success: true, 
      yamlMap: {
        ...yamlMap.toObject(),
        isOwner: yamlMap.userId.toString() === userId.toString()
      }
    };
    
    console.log('Sending YAML map response:', JSON.stringify(response, null, 2));
    return res.json(response);
    
  } catch (error) {
    console.error('Error in GET /api/yaml-maps/:id:', error);
    
    // Ensure we're sending JSON even for errors
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create a new YAML map
 * POST /api/yaml-maps
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description, url, tags, yaml, isPublic } = req.body;
    const userId = req.session.user;
    
    if (!name || !yaml) {
      return res.status(400).json({ success: false, error: 'Name and YAML content are required' });
    }
    
    // Basic validation for YAML structure
    if (!yaml.includes('tasks:') && !yaml.includes('flow:')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YAML format. YAML must include tasks and flow sections.'
      });
    }
    
    const yamlMap = new YamlMap({
      userId,
      name,
      description: description || '',
      url: url || '',
      tags: tags || [],
      yaml,
      isPublic: isPublic || false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await yamlMap.save();
    
    // Add isOwner flag (will be true for creator)
    const responseMap = {
      ...yamlMap.toObject(),
      isOwner: true
    };
    
    res.json({ success: true, yamlMap: responseMap });
  } catch (error) {
    console.error('Error creating YAML map:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update a YAML map
 * PUT /api/yaml-maps/:id
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, url, tags, yaml, isPublic } = req.body;
    const userId = req.session.user;
    
    if (!name || !yaml) {
      return res.status(400).json({ success: false, error: 'Name and YAML content are required' });
    }
    
    const yamlMap = await YamlMap.findById(req.params.id);
    
    if (!yamlMap) {
      return res.status(404).json({ success: false, error: 'YAML map not found' });
    }
    
    // Debug logging for permission issues
    console.log(`[YAML Maps API] Update permission check - Map User ID: ${yamlMap.userId}, Session User ID: ${userId}`);
    
    // Ensure user owns this YAML map - convert both to strings for comparison
    const mapUserId = yamlMap.userId ? yamlMap.userId.toString() : null;
    const sessionUserId = userId ? userId.toString() : null;
    
    if (mapUserId !== sessionUserId) {
      console.error(`[YAML Maps API] Permission denied - Map User ID (${mapUserId}) does not match Session User ID (${sessionUserId})`);
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to update this YAML map',
        debug: {
          mapUserId: mapUserId,
          sessionUserId: sessionUserId,
          types: {
            mapUserId: typeof yamlMap.userId,
            sessionUserId: typeof userId
          }
        }
      });
    }
    
    // Basic validation for YAML structure
    if (!yaml.includes('tasks:') && !yaml.includes('flow:')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YAML format. YAML must include tasks and flow sections.'
      });
    }
    
    yamlMap.name = name;
    yamlMap.description = description || '';
    yamlMap.url = url || '';
    yamlMap.tags = tags || [];
    yamlMap.yaml = yaml;
    yamlMap.isPublic = isPublic || false;
    yamlMap.updatedAt = new Date();
    
    await yamlMap.save();
    
    res.json({ 
      success: true, 
      yamlMap: {
        ...yamlMap.toObject(),
        isOwner: true
      }
    });
  } catch (error) {
    console.error('Error updating YAML map:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a YAML map
 * DELETE /api/yaml-maps/:id
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const yamlMap = await YamlMap.findById(req.params.id);
    
    if (!yamlMap) {
      return res.status(404).json({ success: false, error: 'YAML map not found' });
    }
    
    // Ensure user owns this YAML map - convert both to strings for comparison
    const mapUserId = yamlMap.userId ? yamlMap.userId.toString() : null;
    const sessionUserId = userId ? userId.toString() : null;
    
    if (mapUserId !== sessionUserId) {
      console.error(`[YAML Maps API] Delete permission denied - Map User ID (${mapUserId}) does not match Session User ID (${sessionUserId})`);
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to delete this YAML map',
        debug: {
          mapUserId: mapUserId,
          sessionUserId: sessionUserId,
          types: {
            mapUserId: typeof yamlMap.userId,
            sessionUserId: typeof userId
          }
        }
      });
    }
    
    await YamlMap.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'YAML map deleted successfully' });
  } catch (error) {
    console.error('Error deleting YAML map:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Clone a YAML map (create a copy in user's account)
 * POST /api/yaml-maps/:id/clone
 */
router.post('/:id/clone', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const sourceMap = await YamlMap.findById(req.params.id);
    
    if (!sourceMap) {
      return res.status(404).json({ success: false, error: 'YAML map not found' });
    }
    
    // Check if user has access to clone (owner or public map)
    if (sourceMap.userId !== userId && !sourceMap.isPublic) {
      return res.status(403).json({ success: false, error: 'You do not have permission to clone this YAML map' });
    }
    
    // Create a new map with the same content but new ownership
    const newMap = new YamlMap({
      userId,
      name: `${sourceMap.name} (Clone)`,
      description: sourceMap.description,
      tags: sourceMap.tags,
      yaml: sourceMap.yaml,
      isPublic: false,  // Clones start as private
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await newMap.save();
    
    res.json({ 
      success: true, 
      yamlMap: {
        ...newMap.toObject(),
        isOwner: true
      },
      message: 'YAML map cloned successfully' 
    });
  } catch (error) {
    console.error('Error cloning YAML map:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Track usage of a YAML map
 * POST /api/yaml-maps/:id/use
 */
router.post('/:id/use', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const yamlMap = await YamlMap.findById(req.params.id);
    
    if (!yamlMap) {
      return res.status(404).json({ success: false, error: 'YAML map not found' });
    }
    
    // Check if user has access to use this map
    if (yamlMap.userId !== userId && !yamlMap.isPublic) {
      return res.status(403).json({ success: false, error: 'You do not have permission to use this YAML map' });
    }
    
    // Update usage statistics
    yamlMap.usageCount += 1;
    yamlMap.lastUsed = new Date();
    await yamlMap.save();
    
    res.json({ success: true, message: 'Usage tracked successfully' });
  } catch (error) {
    console.error('Error tracking YAML map usage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get the content of a YAML map
 * GET /api/yaml-maps/:id/content
 */
router.get('/:id/content', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const yamlMap = await YamlMap.findById(req.params.id);
    
    if (!yamlMap) {
      return res.status(404).json({ success: false, error: 'YAML map not found' });
    }
    
    // Check if user has access (owner or public map)
    if (yamlMap.userId !== userId && !yamlMap.isPublic) {
      return res.status(403).json({ success: false, error: 'You do not have permission to access this YAML map' });
    }
    
    // Check if the yaml property exists
    if (!yamlMap.yaml) {
      return res.status(404).json({ success: false, error: 'YAML content not found' });
    }
    
    // Return the content based on Accept header
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('application/json')) {
      res.json({ success: true, content: yamlMap.yaml });
    } else {
      // Return as plain text
      res.setHeader('Content-Type', 'text/plain');
      res.send(yamlMap.yaml);
    }
  } catch (error) {
    console.error('Error fetching YAML content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get the raw content of a YAML map
 * GET /api/yaml-maps/:id/raw
 */
router.get('/:id/raw', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const yamlMap = await YamlMap.findById(req.params.id);
    
    if (!yamlMap) {
      return res.status(404).json({ success: false, error: 'YAML map not found' });
    }
    
    // Check if user has access (owner or public map)
    if (yamlMap.userId !== userId && !yamlMap.isPublic) {
      return res.status(403).json({ success: false, error: 'You do not have permission to access this YAML map' });
    }
    
    // Check if the yaml property exists
    if (!yamlMap.yaml) {
      return res.status(404).json({ success: false, error: 'YAML content not found' });
    }
    
    // Always return as plain text for raw endpoint
    res.setHeader('Content-Type', 'text/plain');
    res.send(yamlMap.yaml);
  } catch (error) {
    console.error('Error fetching raw YAML content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
