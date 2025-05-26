import mongoose from 'mongoose';

const YamlMapSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  url: String,
  tags: [String],
  yaml: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: Date
});

// Add text search indexes
YamlMapSchema.index({ name: 'text', description: 'text', tags: 'text' });

const YamlMap = mongoose.model('YamlMap', YamlMapSchema);
export default YamlMap;
