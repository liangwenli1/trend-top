import React from 'react';
import { SealCheck, UsersThree } from '@phosphor-icons/react';
import './source-badge.css';
export function SourceBadge({ official, evidence, l }) {
  const Icon = official ? SealCheck : UsersThree;
  const title = official ? (l === 'zh' ? '已识别的发布者；不是安全认证。' : 'Recognized publisher; not a security certification. ') + (evidence || '') : (l === 'zh' ? '社区发布的项目。' : 'Community-published project.');
  return <span className={'source-badge ' + (official ? 'source-badge-official' : 'source-badge-community')} title={title}><Icon size={15} weight="bold" aria-hidden="true"/>{official ? (l === 'zh' ? '官方' : 'Official') : (l === 'zh' ? '社区' : 'Community')}</span>;
}
