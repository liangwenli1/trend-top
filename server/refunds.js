import crypto from 'node:crypto';
import { asIso, asNumber, many, one, query } from './db.js';
import { requireUser } from './auth.js';
import { requireAdmin } from './admin.js';
import { creemConfig, creemReady, refundCreemTransaction } from './creem-client.js';

const paidStatuses = ['paid', 'completed', 'succeeded'];
const refundable = (row, firstId) => row.id === firstId && paidStatuses.includes(row.status) && asNumber(row.amount) > 0 && asNumber(row.refunded_amount) === 0 && Date.now() - new Date(row.created_at).getTime() >= 0 && Date.now() - new Date(row.created_at).getTime() <= 7 * 86400000;
export const serializeRefund = row => ({ id: row.id, transactionId: row.transaction_id, reason: row.reason, status: row.status, adminNote: row.admin_note, createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at) });

export async function transactionSummary(userId, mode) {
  const first = await one("SELECT id FROM billing_transactions WHERE user_id=$1 AND mode=$2 AND status IN ('paid','completed','succeeded','refunded') ORDER BY created_at,id LIMIT 1", [userId, mode]);
  const rows = await many('SELECT * FROM billing_transactions WHERE user_id=$1 AND mode=$2 ORDER BY created_at DESC,id LIMIT 50', [userId, mode]);
  const refunds = await many('SELECT * FROM billing_refund_requests WHERE user_id=$1 AND mode=$2 ORDER BY created_at DESC LIMIT 50', [userId, mode]);
  return { transactions: rows.map(row => ({ id: row.id, amount: asNumber(row.amount), taxAmount: asNumber(row.tax_amount), refundedAmount: asNumber(row.refunded_amount), currency: row.currency, status: row.status, createdAt: asIso(row.created_at), refundEligible: refundable(row, first?.id) && !refunds.some(request => request.transaction_id === row.id) })), refundRequests: refunds.map(serializeRefund) };
}

export function registerRefundRoutes(app) {
  app.post('/api/billing/refund-requests', requireUser, async (req, res) => {
    const config = await creemConfig(), reason = String(req.body?.reason || '').trim();
    if (reason.length < 10 || reason.length > 1000) return res.status(400).json({ error: 'Describe the service issue in 10–1000 characters' });
    const transaction = await one('SELECT * FROM billing_transactions WHERE id=$1 AND user_id=$2 AND mode=$3', [String(req.body?.transactionId || ''), req.user.id, config.mode]);
    if (!transaction) return res.status(404).json({ error: 'Payment not found' });
    const existing = await one('SELECT * FROM billing_refund_requests WHERE transaction_id=$1', [transaction.id]);
    if (existing) return res.json({ refundRequest: serializeRefund(existing), duplicate: true });
    const first = await one("SELECT id FROM billing_transactions WHERE user_id=$1 AND mode=$2 AND status IN ('paid','completed','succeeded','refunded') ORDER BY created_at,id LIMIT 1", [req.user.id, config.mode]);
    if (!refundable(transaction, first?.id)) return res.status(409).json({ error: 'Online requests cover the first payment within 7 days. Contact support for other payment issues.' });
    const now = new Date().toISOString();
    const result = await query(`INSERT INTO billing_refund_requests (id,user_id,transaction_id,mode,reason,status,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,'requested',$6,$6) ON CONFLICT (transaction_id) DO NOTHING RETURNING *`, [crypto.randomUUID(), req.user.id, transaction.id, config.mode, reason, now]);
    res.status(result.rows.length ? 201 : 200).json({ refundRequest: serializeRefund(result.rows[0] || await one('SELECT * FROM billing_refund_requests WHERE transaction_id=$1', [transaction.id])) });
  });
  app.get('/api/admin/refund-requests', requireAdmin, async (_req, res) => {
    const { mode } = await creemConfig();
    const rows = await many(`SELECT r.*,u.email,t.amount,t.tax_amount,t.currency,t.creem_transaction_id FROM billing_refund_requests r
      JOIN users u ON u.id=r.user_id JOIN billing_transactions t ON t.id=r.transaction_id WHERE r.mode=$1 ORDER BY r.created_at DESC LIMIT 100`, [mode]);
    res.json({ requests: rows.map(row => ({ ...serializeRefund(row), email: row.email, amount: asNumber(row.amount) + asNumber(row.tax_amount), currency: row.currency })) });
  });
  app.post('/api/admin/refund-requests/:id/review', requireAdmin, async (req, res) => {
    const config = await creemConfig(), action = req.body?.action, note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!['approve', 'reject'].includes(action) || (action === 'reject' && note.length < 5)) return res.status(400).json({ error: 'Choose an action and explain any rejection' });
    const row = await one(`SELECT r.*,t.creem_transaction_id,t.amount,t.refunded_amount FROM billing_refund_requests r
      JOIN billing_transactions t ON t.id=r.transaction_id WHERE r.id=$1 AND r.mode=$2`, [req.params.id, config.mode]);
    if (!row) return res.status(404).json({ error: 'Refund request not found' });
    if (row.status !== 'requested') return res.status(409).json({ error: 'This request has already been reviewed or is processing' });
    if (action === 'approve' && !await creemReady()) return res.status(503).json({ error: 'Creem is not configured' });
    const now = new Date().toISOString();
    const locked = await query(`UPDATE billing_refund_requests SET status=$1,admin_note=$2,reviewed_by=$3,updated_at=$4 WHERE id=$5 AND status='requested' RETURNING *`, [action === 'approve' ? 'processing' : 'rejected', note, req.user.id, now, row.id]);
    if (!locked.rows.length) return res.status(409).json({ error: 'This request is already processing' });
    if (action === 'reject') return res.json({ refundRequest: serializeRefund(locked.rows[0]) });
    try {
      const result = await refundCreemTransaction(row.creem_transaction_id);
      const status = ({ requiresAction: 'requires_action', canceled: 'failed' })[result.status] || (['succeeded', 'pending', 'failed'].includes(result.status) ? result.status : 'pending');
      // Do not overwrite a final webhook status that arrived during the provider request.
      await query("UPDATE billing_refund_requests SET status=$1,provider_refund_id=$2,updated_at=$3 WHERE id=$4 AND status='processing'", [status, result.id || null, new Date().toISOString(), row.id]);
      if (status === 'succeeded') await query("UPDATE billing_transactions SET refunded_amount=amount+COALESCE(tax_amount,0),status='refunded',updated_at=$1 WHERE id=$2", [new Date().toISOString(), row.transaction_id]);
      res.json({ refundRequest: serializeRefund(await one('SELECT * FROM billing_refund_requests WHERE id=$1', [row.id])) });
    } catch (error) {
      // A timeout may have created a refund at the provider. Keep it pending for
      // webhook reconciliation; never issue a second refund automatically.
      const status = error.status === 400 ? 'failed' : 'pending';
      await query("UPDATE billing_refund_requests SET status=$1,updated_at=$2 WHERE id=$3 AND status='processing'", [status, new Date().toISOString(), row.id]);
      res.status(error.status || 502).json({ error: status === 'pending' ? 'Awaiting Creem confirmation. Check the request status before taking further action.' : 'Creem could not process this refund. Review it in the Creem dashboard.' });
    }
  });
}
