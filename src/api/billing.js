/**
 * Billing API functions for the Nexus platform
 * 
 * Handles token balances, purchases, and usage tracking
 */

import { get, post, put, del } from '../utils/api-helpers.js';

/**
 * Get user's current token balance and usage statistics
 * @returns {Promise<Object>} Token balance and usage data
 */
export async function getUserUsage() {
  try {
    return await get('/billing/usage');
  } catch (error) {
    console.error('Error fetching usage data:', error);
    throw error;
  }
}

/**
 * Get transactions history for the user
 * @returns {Promise<Array>} Transaction history data
 */
export async function getTransactionHistory() {
  try {    
    return await get('/billing/transactions');
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    throw error;
  }
}

/**
 * Purchase tokens using the specified payment method
 * @param {Object} purchaseDetails - Details of the token purchase
 * @param {string} purchaseDetails.paymentMethod - Payment method to use
 * @param {number} purchaseDetails.amountUSD - Amount in USD to purchase
 * @returns {Promise<Object>} Purchase confirmation data
 */
export async function purchaseTokens(purchaseDetails) {
  try {
    return await post('/billing/purchase', purchaseDetails);
  } catch (error) {
    console.error('Error purchasing tokens:', error);
    throw error;
  }
}

/**
 * Get available subscription plans
 * @returns {Promise<Array>} Available subscription plans
 */
export async function getPlans() {
  try {
    return await get('/billing/plans');
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    throw error;
  }
}

/**
 * Subscribe to a plan
 * @param {Object} subscriptionDetails - Details of the subscription
 * @param {string} subscriptionDetails.planId - Plan ID to subscribe to
 * @param {string} subscriptionDetails.paymentMethod - Payment method to use
 * @returns {Promise<Object>} Subscription confirmation data
 */
export async function subscribeToPlan(subscriptionDetails) {
  try {
    return await post('/billing/subscribe', subscriptionDetails);
  } catch (error) {
    console.error('Error subscribing to plan:', error);
    throw error;
  }
}

/**
 * Get the cost estimate for a specific operation
 * @param {Object} operationDetails - Details of the operation
 * @param {string} operationDetails.operationType - 'text_generation', 'code_completion', etc.
 * @param {string} operationDetails.model - LLM model to use
 * @param {number} operationDetails.inputTokens - Number of input tokens
 * @param {number} operationDetails.outputTokens - Estimated number of output tokens
 * @returns {Promise<Object>} Cost estimate data
 */
export async function estimateOperationCost(operationDetails) {
  try {
    const response = await fetchWithAuth('/api/billing/estimate-cost', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(operationDetails)
    });
    return await response.json();
  } catch (error) {
    console.error('Error estimating operation cost:', error);
    throw error;
  }
}
