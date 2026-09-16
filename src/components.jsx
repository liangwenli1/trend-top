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
const SelectChevron = () => (
  <span className="design-select-chevron" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="m4 7 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </span>
);

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
  placeholder = 'All',
  ariaLabel
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];
  const labels = options.filter(option => selected.includes(option.value)).map(option => option.label);
  const visibleOptions = options.filter(option => String(option.label).toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    if (!open) return undefined;
    const close = event => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const escape = event => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      rootRef.current?.querySelector('button')?.focus();
    };
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
        className="design-select-trigger"
        data-state={open ? 'open' : 'closed'}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(current => !current)}
      >
        <span className="topic-multi-value">{labels.length ? labels.join(', ') : placeholder}</span>
        <SelectChevron />
      </button>
      {open && (
        <div className="design-select-content topic-multi-menu" role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
          {options.length > 16 && <input className="topic-multi-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={document.documentElement.lang === 'zh' ? '搜索选项' : 'Search options'} aria-label={document.documentElement.lang === 'zh' ? '搜索选项' : 'Search options'}/>}
          <div className="design-select-viewport">
            {visibleOptions.length ? visibleOptions.map(option => (
              <button
                type="button"
                key={option.value}
                className="design-select-item"
                role="option"
                aria-selected={selected.includes(option.value)}
                data-state={selected.includes(option.value) ? 'checked' : 'unchecked'}
                onClick={() => toggle(option.value)}
              >
                <span>{option.label}</span>
                {selected.includes(option.value) && <span className="design-select-check" aria-hidden="true">✓</span>}
              </button>
            )) : <p className="topic-multi-empty">{placeholder}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function SubscribeDialog({trigger,title,description,children}) {
  const contentRef=useRef(null);
  const escape=event=>{
    // The first Escape closes the nested multi-select, preserving unsaved settings.
    if(contentRef.current?.querySelector('.topic-multi-select [aria-expanded="true"]'))event.preventDefault();
  };
  return <Dialog.Root><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content ref={contentRef} className="dialog-content" onEscapeKeyDown={escape}><Dialog.Close className="dialog-close" aria-label={document.documentElement.lang==='zh'?'关闭':'Close'}>×</Dialog.Close><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function TopicDialog({trigger,topics,title,description,hrefFor,onSelect,locale='en'}) {
  const [open,setOpen]=useState(false);
  const selectTopic=(event,topic)=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    setOpen(false);
    onSelect(topic);
  };
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay"/>
      <Dialog.Content className="dialog-content topic-dialog">
        <Dialog.Close className="dialog-close" aria-label={locale==='zh'?'关闭':'Close'}>×</Dialog.Close>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
        <div className="topic-dialog-list">
          {topics.map(topic=><a key={topic} href={hrefFor(topic)} onClick={event=>selectTopic(event,topic)}>{topic}</a>)}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
