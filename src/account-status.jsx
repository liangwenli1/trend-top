import React from 'react';

export function StatusBadge({ children, tone = 'muted', title }) {
  return <span className={`status-badge status-badge-${tone}`} title={title}><span className="status-dot" aria-hidden="true"/>{children}</span>;
}

export function PlanBadge({ active, l }) {
  return <StatusBadge tone={active ? 'pro' : 'muted'}>{active == null ? (l === 'zh' ? '确认套餐中' : 'Checking plan') : active ? 'Pro' : 'Free'}</StatusBadge>;
}

export function DeliveryBadge({ status, proActive, l }) {
  const zh = l === 'zh';
  const sending = status === 'active' && proActive === true;
  const label = proActive == null ? (zh ? '确认推送状态中' : 'Checking delivery')
    : sending ? (zh ? '邮件推送已开启' : 'Emails on')
    : status === 'paused' ? (zh ? '邮件推送已暂停' : 'Emails paused')
    : status === 'cancelled' ? (zh ? '邮件推送已停止' : 'Emails stopped')
    : status === 'active' ? (zh ? '未发送 · 需 Pro' : 'Emails off · Pro required')
    : (zh ? '邮件推送未设置' : 'Emails not set up');
  return <StatusBadge tone={sending ? 'active' : 'muted'}>{label}</StatusBadge>;
}
