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
    claude:     { type: String, default: '' },  // For Anthropic Claude models
    grok:       { type: String, default: '' }   // For xAI Grok models
  },
  // Model preferences for different task types
  modelPreferences: {
    default:   { type: String, default: 'gpt-4o' },
    code:      { type: String, default: 'gpt-4o' },
    content:   { type: String, default: 'gpt-4o' },
    research:  { type: String, default: 'gpt-4o' }
  },
  // General preferences
  preferredEngine:  { type: String, enum: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'qwen-2.5-vl-72b', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'ui-tars', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'grok-1'], default: 'gpt-4o' },
  executionMode:    { type: String, enum: ['step-planning', 'action-planning'], default: 'step-planning' },
  maxSteps:         { type: Number, min: 1, max: 50, default: 10 },
  privacyMode:      { type: Boolean, default: false },
  customUrls:       { type: [String], default: [] }
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

// Static method to find user by ID (supports both ObjectId and string IDs)
userSchema.statics.findByIdOrString = async function(id) {
  try {
    // If it's a valid ObjectId and not a guest ID, try to find by _id
    if (mongoose.Types.ObjectId.isValid(id) && !id.startsWith('guest_')) {
      const user = await this.findById(id);
      if (user) return user;
    }
    
    // If not found or it's a guest ID, return a guest user object
    return {
      _id: id,
      isGuest: true,
      email: 'guest@example.com',
      apiKeys: {},
      modelPreferences: {
        default: 'gpt-4o',
        code: 'gpt-4o',
        content: 'gpt-4o',
        research: 'gpt-4o'
      },
      preferredEngine: 'gpt-4o',
      executionMode: 'step-planning',
      maxSteps: 10,
      privacyMode: false,
      customUrls: []
    };
  } catch (err) {
    console.error('Error finding user:', err);
    // Return a guest user object on error
    return {
      _id: id,
      isGuest: true,
      email: 'guest@example.com',
      apiKeys: {},
      modelPreferences: {
        default: 'gpt-4o',
        code: 'gpt-4o',
        content: 'gpt-4o',
        research: 'gpt-4o'
      },
      preferredEngine: 'gpt-4o',
      executionMode: 'step-planning',
      maxSteps: 10,
      privacyMode: false,
      customUrls: []
    };
  }
};

const User = mongoose.model('User', userSchema);
export default User;
