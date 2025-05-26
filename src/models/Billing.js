import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['purchase', 'usage', 'refund', 'subscription'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  details: {
    type: String
  },
  paymentMethod: {
    type: String
  },
  tokens: {
    type: Number,
    default: 0
  }
});

const billingSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  tokens: {
    used: {
      type: Number,
      default: 0
    },
    available: {
      type: Number,
      default: 1000 // Start with 1000 free tokens
    }
  },
  requests: {
    count: {
      type: Number,
      default: 0
    },
    limit: {
      type: Number,
      default: 100
    }
  },
  plan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'pay-as-you-go'],
    default: 'free'
  },
  transactions: [transactionSchema],
  subscriptionDetails: {
    startDate: Date,
    renewDate: Date,
    status: {
      type: String,
      enum: ['active', 'canceled', 'expired'],
      default: 'active'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on every save
billingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate token value in USD (1 USD = 1000 RATOR tokens)
billingSchema.methods.calculateUSDValue = function(tokens) {
  return tokens / 1000;
};

// Convert USD to tokens
billingSchema.statics.usdToTokens = function(usdAmount) {
  return usdAmount * 1000;
};

const Billing = mongoose.model('Billing', billingSchema);
export default Billing;
