import { getSettings } from './settings.js';

export async function creemConfig() {
  const settings = await getSettings();
  const billing = settings.public.billing;
  return {
    mode: billing.mode,
    enabled: billing.enabled,
    apiKey: settings.secret.creemApiKey,
    webhookSecret: settings.secret.creemWebhookSecret,
    baseUrl: billing.apiBaseUrl,
    monthlyProductId: billing.monthlyProductId,
    yearlyProductId: billing.yearlyProductId,
    graceDays: billing.graceDays
  };
}

export async function creemReady() {
  const config = await creemConfig();
  return Boolean(config.enabled && config.apiKey && config.webhookSecret);
}

export async function creemRequest(path, { method = 'POST', body } = {}) {
  const config = await creemConfig();
  if (!config.apiKey) throw Object.assign(new Error('Creem billing is not configured'), { status: 503 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result?.message || result?.error || `Creem request failed (${response.status})`;
      throw Object.assign(new Error(message), { status: response.status >= 500 ? 502 : 400 });
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('Creem request timed out'), { status: 504 });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const createCreemCheckout = body => creemRequest('/v1/checkouts', { body });
export const createCreemPortal = customerId => creemRequest('/v1/customers/billing', { body: { customer_id: customerId } });
export const cancelCreemSubscription = subscriptionId => creemRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { body: { mode: 'scheduled', onExecute: 'cancel' } });
export const refundCreemTransaction = transactionId => creemRequest('/v1/refunds', { body: { transaction_id: transactionId } });
