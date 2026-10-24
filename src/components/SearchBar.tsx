import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  value, 
  onChange, 
  placeholder = "메모 검색 (단어, 이미지 속 글자)..." 
}) => {
  const [localText, setLocalText] = useState(value);
  const isComposingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with external value changes (e.g. cleared externally)
  useEffect(() => {
    setLocalText(value);
  }, [value]);

  const triggerChange = (newVal: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onChange(newVal);
    }, 200);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalText(val);
    triggerChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      onChange(localText);
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  const handleClear = () => {
    setLocalText('');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    onChange('');
  };

  return (
    <div className="relative flex items-center w-full">
      <Search 
        className="absolute left-2.5 text-slate-400 pointer-events-none" 
        size={14} 
      />
      <input
        type="text"
        value={localText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={(e) => { 
          isComposingRef.current = false; 
          // Trigger change right after Korean composition finishes
          triggerChange(e.currentTarget.value);
        }}
        placeholder={placeholder}
        className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow shadow-inner"
      />
      {localText && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
          title="검색어 지우기"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
};
