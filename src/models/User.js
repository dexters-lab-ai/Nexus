import mongoose from 'mongoose';
const { Schema } = mongoose;

const userSchema = new Schema({
  email:            { type: String, required: true, unique: true },
  password:         { type: String, required: true },
  // Legacy fields for backwards compatibility
  openaiApiKey:     { type: String, default: '' },
  openaiApiKeys:    { type: [String], default: [] },
  defaultKey:       { type: Number, default: 0 },
  // API key storage for supported models
  apiKeys: {
    gpt4o:      { type: String, default: '' },  // For OpenAI GPT-4o
    qwen:       { type: String, default: '' },  // For Alibaba Qwen-2.5-VL 72B
    gemini:     { type: String, default: '' },  // For Google Gemini-2.5-Pro
    uitars:     { type: String, default: '' },  // For ByteDance UI-TARS
    grok:       { type: String, default: '' }   // For xAI Grok models
  },
  // Model preferences for different task types
  modelPreferences: {
    default:   { type: String, default: 'gemini-2.5-pro' },
    code:      { type: String, default: 'gemini-2.5-pro' },
    content:   { type: String, default: 'gemini-2.5-pro' },
    research:  { type: String, default: 'gemini-2.5-pro' }
  },
  // General preferences
  preferredEngine:  { type: String, enum: ['gpt-4o', 'qwen-2.5-vl-72b', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'ui-tars', 'grok-1'], default: 'gemini-2.5-pro' },
  executionMode:    { type: String, enum: ['step-planning', 'action-planning'], default: 'action-planning' },
  maxSteps:         { type: Number, min: 1, max: 50, default: 20 },
  privacyMode:      { type: Boolean, default: false },
  customUrls:       { type: [String], default: [] },
  // ADB Configuration
  adbConfig: {
    // Local device connection (USB)
    deviceIpAddress: { type: String, default: '' },  // For direct network device connection (when not using USB)
    adbPort: { type: Number, default: 5555 },       // ADB port for network devices (default: 5555)
    
    // Remote ADB configuration (for production/remote debugging)
    remoteAdbHost: { type: String, default: '' },   // Remote ADB server host
    remoteAdbPort: { type: Number, default: 5037 },  // Remote ADB server port (default: 5037)
    customAdbPath: { type: String, default: '' },   // Custom ADB binary path
    
    // Connection preferences
    useRemoteAdb: { type: Boolean, default: false }, // Whether to use remote ADB
    lastUsedConnection: { 
      type: String, 
      enum: ['usb', 'network', 'remote'], 
      default: 'usb' 
    },
    
    // Timestamps
    lastConnected: { type: Date },
    lastUpdated: { type: Date, default: Date.now }
  }
});

userSchema.index({ email: 1 }, { unique: true });

// Add a pre-save hook to migrate legacy API keys to the new structure
userSchema.pre('save', function(next) {
  // If we have a legacy openaiApiKey but not in the new structure, migrate it
  if (this.openaiApiKey && this.openaiApiKey.length > 0 && (!this.apiKeys || !this.apiKeys.openai)) {
    if (!this.apiKeys) this.apiKeys = {};
    this.apiKeys.openai = this.openaiApiKey;
  }
  next();
});

// Static method to find user by ID, handling both ObjectId and guest string IDs
userSchema.statics.findByIdOrString = async function(id) {
  try {
    // Try to find by ObjectId first if it's a valid ObjectId and not a guest ID
    if (mongoose.Types.ObjectId.isValid(id) && !id.startsWith('guest_')) {
      const user = await this.findById(id);
      if (user) return user;
    }
    // If not found or it's a guest ID, return a guest user object
    return {
      _id: id,
      isGuest: true,
      email: 'guest@example.com'
    };
  } catch (err) {
    console.error('Error finding user:', err);
    return {
      _id: id,
      isGuest: true,
      email: 'guest@example.com'
    };
  }
};

const User = mongoose.model('User', userSchema);
export default User;
