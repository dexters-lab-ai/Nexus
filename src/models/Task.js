import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  command:           String,
  status:            { type: String, enum: ['pending','processing','completed','error','cancelled'], default: 'pending' },
  progress:          { type: Number, default: 0 },
  startTime:         { type: Date, default: Date.now },
  endTime:           Date,
  cancelledAt:       Date,
  cancellationReason: String,
  result:            mongoose.Schema.Types.Mixed,
  error:             String,
  url:               String,
  runId:             String,
  sessionId:         String,  // For tracking multiple tasks in the same streaming session
  browserSessionId:  String,  // For tracking active browser sessions
  cleanupAttempted:  { type: Boolean, default: false },
  isComplex:         { type: Boolean, default: false },
  subTasks:          [{ id: String, command: String, status: String, result: mongoose.Schema.Types.Mixed, progress: Number, error: String }],
  intermediateResults:[mongoose.Schema.Types.Mixed],
  plan:              String,
  steps:             [String],
  totalSteps:        Number,
  currentStep:       Number,
  stepMap:           mongoose.Schema.Types.Mixed,
  currentStepDescription: String,
  currentStepFunction:    String,
  currentStepArgs:        mongoose.Schema.Types.Mixed,
  planAdjustment:    String,
  lastAction:        String,
  lastQuery:         String,
  // YAML map related fields
  yamlMapId:         { type: String, index: true },  // Reference to the YAML map being executed
  yamlMapName:       String,                         // Name of the YAML map for display
  yamlMapTags:       [String],                       // Tags of the YAML map
  reportPath:        String,                         // Path to the YAML execution report
  nexusReportUrl:    String,                         // URL to the Nexus report
  landingReportUrl:  String,                         // URL to the landing page report
});
// TTL index for document expiration
taskSchema.index({ endTime: 1 }, { expireAfterSeconds: 604000 });

// Compound index for history queries - optimizes userId+status+endTime sort pattern
taskSchema.index({ userId: 1, status: 1, endTime: -1 });

// Index for status-only queries
taskSchema.index({ status: 1 });
const Task = mongoose.model('Task', taskSchema);
export default Task;
