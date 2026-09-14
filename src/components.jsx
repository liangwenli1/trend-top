import React, { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';

// Adapted from float_ui's 21st.dev Radix tabs example for controlled rankings.
export function BoardTabs({value,onChange,items,label}) {
  return <Tabs.Root value={value} onValueChange={onChange}><Tabs.List className="board-tabs" aria-label={label}>{items.map(x=><Tabs.Trigger key={x.id} value={x.id} className="board-tab">{x.label}</Tabs.Trigger>)}</Tabs.List></Tabs.Root>;
}

// Adapted from HextaUI's 21st.dev clearable icon input usage.
export function SearchInput({value,onChange,label,placeholder,clearLabel}) {
  return <div className="field"><label htmlFor="repo-search">{label}</label><div className="search-wrap"><span aria-hidden="true">⌕</span><input id="repo-search" type="search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value&&<button type="button" className="clear-button" aria-label={clearLabel} onClick={()=>onChange('')}>×</button>}</div></div>;
}

const emptyValue='__github_pulse_empty__';
export function DesignSelect({id,value,onChange,options,ariaLabel}) {
  const selected=String(value??'')||emptyValue;
  return <Select.Root value={selected} onValueChange={next=>onChange(next===emptyValue?'':next)}>
    <Select.Trigger id={id} className="design-select-trigger" aria-label={ariaLabel}>
      <Select.Value/>
      <Select.Icon className="design-select-chevron" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="m4 7 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="design-select-content" position="popper" sideOffset={7} collisionPadding={12} align="start"><Select.Viewport className="design-select-viewport">
      {options.map(option=>{const optionValue=String(option.value??'')||emptyValue;return <Select.Item key={optionValue} value={optionValue} className="design-select-item"><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator className="design-select-check" aria-hidden="true">✓</Select.ItemIndicator></Select.Item>})}
    </Select.Viewport></Select.Content></Select.Portal>
  </Select.Root>;
}

export function TopicMultiSelect({
  id,
  value = [],
  onChange,
  options = [],
  placeholder = 'All topics',
  selectedLabel = 'topics selected',
  ariaLabel = 'Topics',
  clearLabel = 'Clear all',
  doneLabel = 'Done'
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];
  useEffect(() => {
    if (!open) return undefined;
    const close = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const toggle = option => {
    const next = selected.includes(option)
      ? selected.filter(item => item !== option)
      : [...selected, option];
    onChange(next);
  };
  return (
    <div className="topic-multi-select" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="topic-multi-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(current => !current)}
      >
        <span>{selected.length ? `${selected.length} ${selectedLabel}` : placeholder}</span>
        <span className="topic-multi-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="topic-multi-menu" role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
          <div className="topic-multi-menu-actions">
            <button type="button" onClick={() => onChange([])} disabled={!selected.length}>{clearLabel}</button>
            <button type="button" onClick={() => setOpen(false)}>{doneLabel}</button>
          </div>
          <div className="topic-multi-options">
            {options.length ? options.map(option => (
              <label key={option.value} className="topic-multi-option" role="option" aria-selected={selected.includes(option.value)}>
                <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} />
                <span>{option.label}</span>
              </label>
            )) : <p className="topic-multi-empty">{placeholder}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Adapted from float_ui's 21st.dev Radix newsletter dialog; content is Trend Top's own form.
export function SubscribeDialog({trigger,title,description,children}) {
  return <Dialog.Root><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content"><Dialog.Close className="dialog-close" aria-label={document.documentElement.lang==='zh'?'关闭':'Close'}>×</Dialog.Close><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
