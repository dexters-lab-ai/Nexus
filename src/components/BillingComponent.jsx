import React, { useState, useEffect } from 'react';
import { getUserUsage, getPlans, purchaseTokens, subscribeToPlan, getTransactionHistory } from '../api/billing.js';
import '../styles/components/billing-component.css';

/**
 * BillingComponent - Display token usage, purchase options, and subscription plans
 */
const BillingComponent = () => {
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchaseAmount, setPurchaseAmount] = useState(10);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [activeTab, setActiveTab] = useState('usage');
  const [purchaseConfirmation, setPurchaseConfirmation] = useState(null);
  const [subscriptionConfirmation, setSubscriptionConfirmation] = useState(null);
  const [error, setError] = useState(null);

  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        setLoading(true);
        const [usageData, plansData, transactionsData] = await Promise.all([
          getUserUsage(),
          getPlans(),
          getTransactionHistory()
        ]);
        
        setUsage(usageData);
        setPlans(plansData);
        setTransactions(transactionsData);
        setError(null);
      } catch (err) {
        console.error('Error loading billing data:', err);
        setError('Failed to load billing data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, []);

  // Handle token purchase
  const handlePurchase = async () => {
    try {
      setLoading(true);
      
      const purchaseDetails = {
        amountUSD: parseFloat(purchaseAmount),
        paymentMethod
      };
      
      const result = await purchaseTokens(purchaseDetails);
      setPurchaseConfirmation(result);
      
      // Refresh usage data
      const updatedUsage = await getUserUsage();
      setUsage(updatedUsage);
      
      // Refresh transaction history
      const updatedTransactions = await getTransactionHistory();
      setTransactions(updatedTransactions);
      
      setError(null);
    } catch (err) {
      console.error('Error purchasing tokens:', err);
      setError('Failed to purchase tokens. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle plan subscription
  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    
    try {
      setLoading(true);
      
      const subscriptionDetails = {
        planId: selectedPlan,
        paymentMethod
      };
      
      const result = await subscribeToPlan(subscriptionDetails);
      setSubscriptionConfirmation(result);
      
      // Refresh usage data
      const updatedUsage = await getUserUsage();
      setUsage(updatedUsage);
      
      // Refresh transaction history
      const updatedTransactions = await getTransactionHistory();
      setTransactions(updatedTransactions);
      
      setError(null);
    } catch (err) {
      console.error('Error subscribing to plan:', err);
      setError('Failed to subscribe to plan. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Format date for transaction history
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (loading && !usage) {
    return (
      <div className="billing-loading">
        <div className="billing-loading-spinner"></div>
        <p>Loading billing information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="billing-error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="billing-container">
      <div className="billing-tabs">
        <button 
          className={`billing-tab ${activeTab === 'usage' ? 'active' : ''}`}
          onClick={() => setActiveTab('usage')}
        >
          Usage & Balance
        </button>
        <button 
          className={`billing-tab ${activeTab === 'purchase' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchase')}
        >
          Purchase Tokens
        </button>
        <button 
          className={`billing-tab ${activeTab === 'subscription' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscription')}
        >
          Subscription Plans
        </button>
        <button 
          className={`billing-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Transaction History
        </button>
      </div>

      <div className="billing-content">
        {/* Usage & Balance Tab */}
        {activeTab === 'usage' && usage && (
          <div className="billing-usage">
            <div className="stats-card">
              <h3>Token Balance</h3>
              <div className="token-balance">
                <div className="token-stats">
                  <div className="token-stat">
                    <span className="stat-label">Available:</span>
                    <span className="stat-value">{usage.tokens.available.toLocaleString()}</span>
                  </div>
                  <div className="token-stat">
                    <span className="stat-label">Used:</span>
                    <span className="stat-value">{usage.tokens.used.toLocaleString()}</span>
                  </div>
                </div>
                <div className="token-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${Math.min(100, (usage.tokens.used / (usage.tokens.available + usage.tokens.used)) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="progress-label">
                    {usage.tokens.used} / {usage.tokens.available + usage.tokens.used} tokens used
                  </div>
                </div>
              </div>
            </div>

            <div className="stats-card">
              <h3>API Requests</h3>
              <div className="requests-stats">
                <div className="token-stat">
                  <span className="stat-label">Count:</span>
                  <span className="stat-value">{usage.requests.count.toLocaleString()}</span>
                </div>
                <div className="token-stat">
                  <span className="stat-label">Limit:</span>
                  <span className="stat-value">{usage.requests.limit.toLocaleString()}</span>
                </div>
              </div>
              <div className="token-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${Math.min(100, (usage.requests.count / usage.requests.limit) * 100)}%` }}
                  ></div>
                </div>
                <div className="progress-label">
                  {usage.requests.count} / {usage.requests.limit} requests used
                </div>
              </div>
            </div>

            <div className="subscription-info">
              <h3>Current Plan</h3>
              <div className="current-plan">
                <div className="plan-badge">{usage.plan.toUpperCase()}</div>
                {usage.subscriptionDetails && usage.subscriptionDetails.renewDate && (
                  <div className="renewal-info">
                    Renews on: {formatDate(usage.subscriptionDetails.renewDate)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Purchase Tokens Tab */}
        {activeTab === 'purchase' && (
          <div className="billing-purchase">
            <h3>Purchase RATOR Tokens</h3>
            <p className="token-rate">1 USD = 1,000 RATOR Tokens</p>
            
            {purchaseConfirmation && (
              <div className="purchase-confirmation">
                <div className="confirmation-header">Purchase Complete!</div>
                <div className="confirmation-details">
                  <p>You purchased {purchaseConfirmation.purchase.tokenAmount.toLocaleString()} RATOR tokens for ${purchaseConfirmation.purchase.amountUSD}</p>
                  <p>New balance: {purchaseConfirmation.purchase.newBalance.toLocaleString()} tokens</p>
                </div>
                <button className="close-confirmation" onClick={() => setPurchaseConfirmation(null)}>Close</button>
              </div>
            )}
            
            <div className="purchase-form">
              <div className="form-group">
                <label htmlFor="amount">Amount in USD:</label>
                <div className="amount-input">
                  <span className="currency-symbol">$</span>
                  <input 
                    type="number" 
                    id="amount" 
                    value={purchaseAmount} 
                    onChange={(e) => setPurchaseAmount(e.target.value)}
                    min="1"
                    step="1"
                  />
                </div>
              </div>
              
              <div className="tokens-preview">
                You will receive: <span>{(purchaseAmount * 1000).toLocaleString()} RATOR tokens</span>
              </div>
              
              <div className="form-group">
                <label htmlFor="payment-method">Payment Method:</label>
                <select 
                  id="payment-method" 
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="credit_card">Credit Card</option>
                  <option value="paypal">PayPal</option>
                  <option value="crypto">Cryptocurrency</option>
                </select>
              </div>
              
              <button 
                className="purchase-button"
                onClick={handlePurchase}
                disabled={loading || purchaseAmount <= 0}
              >
                {loading ? 'Processing...' : `Purchase for $${purchaseAmount}`}
              </button>
            </div>
          </div>
        )}

        {/* Subscription Plans Tab */}
        {activeTab === 'subscription' && (
          <div className="billing-subscription">
            <h3>Subscription Plans</h3>
            
            {subscriptionConfirmation && (
              <div className="subscription-confirmation">
                <div className="confirmation-header">Subscription Successful!</div>
                <div className="confirmation-details">
                  <p>You are now subscribed to the {subscriptionConfirmation.subscription.plan.toUpperCase()} plan</p>
                  <p>Received: {subscriptionConfirmation.subscription.tokens.toLocaleString()} tokens</p>
                  <p>Next renewal: {formatDate(subscriptionConfirmation.subscription.renewDate)}</p>
                </div>
                <button className="close-confirmation" onClick={() => setSubscriptionConfirmation(null)}>Close</button>
              </div>
            )}
            
            <div className="plans-container">
              {plans.map((plan) => (
                <div 
                  key={plan.id}
                  className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''} ${usage?.plan === plan.id ? 'current' : ''}`}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {usage?.plan === plan.id && <div className="current-plan-badge">Current Plan</div>}
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">
                    {plan.price !== null ? `$${plan.price.toFixed(2)}/month` : 'Custom Pricing'}
                  </div>
                  <div className="plan-tokens">
                    {plan.tokens !== null ? `${plan.tokens.toLocaleString()} tokens` : 'Pay as you go'}
                  </div>
                  <div className="plan-requests">
                    {plan.requests.toLocaleString()} requests/month
                  </div>
                  <ul className="plan-features">
                    {plan.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                  {plan.id === 'pay-as-you-go' ? (
                    <div className="plan-actions">
                      <button 
                        className="switch-plan-button"
                        onClick={() => setActiveTab('purchase')}
                      >
                        Purchase Tokens
                      </button>
                    </div>
                  ) : (
                    <div className="plan-actions">
                      <button 
                        className="select-plan-button"
                        disabled={usage?.plan === plan.id || plan.id === 'pay-as-you-go'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlan(plan.id);
                        }}
                      >
                        {usage?.plan === plan.id ? 'Current Plan' : 'Select Plan'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {selectedPlan && selectedPlan !== 'pay-as-you-go' && selectedPlan !== usage?.plan && (
              <div className="subscription-form">
                <div className="form-group">
                  <label htmlFor="sub-payment-method">Payment Method:</label>
                  <select 
                    id="sub-payment-method" 
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="credit_card">Credit Card</option>
                    <option value="paypal">PayPal</option>
                    <option value="crypto">Cryptocurrency</option>
                  </select>
                </div>
                
                <button 
                  className="subscribe-button"
                  onClick={handleSubscribe}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Subscribe Now'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Transaction History Tab */}
        {activeTab === 'history' && (
          <div className="billing-history">
            <h3>Transaction History</h3>
            
            {transactions.length === 0 ? (
              <div className="no-transactions">
                <p>No transactions found.</p>
              </div>
            ) : (
              <div className="transactions-table-container">
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Tokens</th>
                      <th>Amount</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction, index) => (
                      <tr key={index}>
                        <td>{formatDate(transaction.timestamp)}</td>
                        <td>
                          <span className={`transaction-type ${transaction.type}`}>
                            {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                          </span>
                        </td>
                        <td>{transaction.tokens ? transaction.tokens.toLocaleString() : '-'}</td>
                        <td>${transaction.amount.toFixed(2)}</td>
                        <td>{transaction.details || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingComponent;
