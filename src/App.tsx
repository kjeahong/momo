import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Folder, FolderOpen, FileText, Search, Plus, Trash2, 
  Eye, Edit3, Columns, Settings, Image as ImageIcon, 
  Sparkles, Check, Pin, Database, RefreshCw
} from 'lucide-react';
import { marked } from 'marked';
import { JoplinModal } from './components/JoplinModal';

interface Note {
  id: string;
  folder_id: string;
  title: string;
  body: string;
  image_text?: string;
  created_time: number;
  updated_time: number;
  is_pinned?: number;
  hl_title?: string;
  hl_body?: string;
  hl_image?: string;
  match_type?: 'text' | 'image';
}

interface FolderItem {
  id: string;
  title: string;
  parent_id: string;
  note_count: number;
}

export default function App() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(''); // empty = all notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [isJoplinModalOpen, setIsJoplinModalOpen] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<{ total: number; current: number; status: string }>({ total: 0, current: 0, status: 'idle' });
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Currently active note object
  const activeNote = useMemo(() => {
    return notes.find(n => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  // Load Folders
  const loadFolders = async () => {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      setFolders(data);
    } catch (e) {
      console.error('Failed to load folders', e);
    }
  };

  // Load Notes (Search or Folder filter)
  const loadNotes = async (q = searchQuery, fId = selectedFolderId) => {
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (fId) params.set('folder_id', fId);

      const res = await fetch(`/api/notes?${params.toString()}`);
      const data = await res.json();
      setNotes(data);

      // Auto select first note if current note not in results
      if (data.length > 0 && (!selectedNoteId || !data.some((n: Note) => n.id === selectedNoteId))) {
        setSelectedNoteId(data[0].id);
      } else if (data.length === 0) {
        setSelectedNoteId('');
      }
    } catch (e) {
      console.error('Failed to load notes', e);
    }
  };

  // Check OCR Status periodically
  const checkOcr = async () => {
    try {
      const res = await fetch('/api/ocr/status');
      const data = await res.json();
      setOcrStatus(data);
    } catch (e) {}
  };

  useEffect(() => {
    loadFolders();
    loadNotes('', '');
    checkOcr();
    const interval = setInterval(checkOcr, 5000);
    return () => clearInterval(interval);
  }, []);

  // When folder selection changes
  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    loadNotes(searchQuery, folderId);
  };

  // When search query changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadNotes(searchQuery, selectedFolderId);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedFolderId]);

  // Create new note
  const handleCreateNote = async () => {
    const newNote = {
      folder_id: selectedFolderId || (folders[0]?.id ?? 'default'),
      title: '새로운 메모',
      body: ''
    };

    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNote)
    });
    const created = await res.json();
    await loadNotes(searchQuery, selectedFolderId);
    setSelectedNoteId(created.id);
  };

  // Save active note changes
  const updateTimer = useRef<NodeJS.Timeout | null>(null);
  const handleNoteChange = (updates: Partial<Note>) => {
    if (!activeNote) return;

    const updatedNote = { ...activeNote, ...updates, updated_time: Date.now() };
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    setSaveStatus('saving');

    if (updateTimer.current) clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedNote)
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Save failed', err);
      }
    }, 400);
  };

  // Delete note
  const handleDeleteNote = async (id: string) => {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    loadNotes(searchQuery, selectedFolderId);
  };

  // Render markdown with Joplin resource image translation
  const renderedHtml = useMemo(() => {
    if (!activeNote || !activeNote.body) return '';

    // Replace Joplin image syntax `:/resource_id` with `/resources/resource_id.png`
    let markdown = activeNote.body.replace(/:\/([a-zA-Z0-9]{32})/g, '/resources/$1.png');

    try {
      return marked.parse(markdown) as string;
    } catch (e) {
      return '<p class="text-rose-400">마크다운 렌더링 오류</p>';
    }
  }, [activeNote]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* COLUMN 1: SIDEBAR (JOPLIN NOTEBOOKS & SETTINGS) */}
      <div className="w-64 flex flex-col bg-slate-900 border-r border-slate-800 shrink-0 select-none">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20">
              M
            </div>
            <span className="font-bold text-base tracking-wide text-white">Momo</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Smart
            </span>
          </div>

          <button
            onClick={() => setIsJoplinModalOpen(true)}
            title="Joplin 1클릭 마이그레이션"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Database size={17} />
          </button>
        </div>

        {/* Notebooks List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => handleSelectFolder('')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedFolderId === '' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <FolderOpen size={15} />
              <span className="truncate">전체 메모</span>
            </div>
            <span className="text-[11px] opacity-75 font-mono">
              {notes.length}
            </span>
          </button>

          <div className="pt-3 pb-1 px-3 flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>노트북 / 폴더</span>
            <span className="text-[10px] font-mono">{folders.length}개</span>
          </div>

          {folders.map(f => (
            <button
              key={f.id}
              onClick={() => handleSelectFolder(f.id)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                selectedFolderId === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Folder size={14} className={selectedFolderId === f.id ? 'text-white' : 'text-slate-400'} />
                <span className="truncate">{f.title}</span>
              </div>
              <span className="text-[11px] opacity-75 font-mono">
                {f.note_count}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom Status & Joplin Import Callout */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/50 space-y-2">
          {ocrStatus.status === 'running' && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-indigo-950/40 border border-indigo-800/40 text-[11px] text-indigo-300">
              <RefreshCw size={12} className="animate-spin text-indigo-400 shrink-0" />
              <span className="truncate">이미지 글자 자동 분석 중 ({ocrStatus.current}/{ocrStatus.total})</span>
            </div>
          )}

          <button
            onClick={() => setIsJoplinModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
          >
            <Database size={13} className="text-blue-400" />
            <span>Joplin 데이터 가져오기</span>
          </button>
        </div>
      </div>

      {/* COLUMN 2: NOTE LIST & SEARCH BAR */}
      <div className="w-80 flex flex-col bg-slate-900/60 border-r border-slate-800 shrink-0">
        {/* Search Input Box */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="relative flex items-center">
            <Search className="absolute left-3 text-slate-400" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="글, 키워드, 스크린샷 속 글자..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-400 font-mono text-[11px]">
              {searchQuery ? `검색 결과 ${notes.length}건` : `${notes.length}개의 메모`}
            </span>
            <button
              onClick={handleCreateNote}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] transition-colors shadow-sm"
            >
              <Plus size={13} />
              <span>새 메모</span>
            </button>
          </div>
        </div>

        {/* Notes Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {notes.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              {searchQuery ? '일치하는 메모가 없습니다.' : '이 폴더에 메모가 없습니다.'}
            </div>
          ) : (
            notes.map(note => {
              const isSelected = note.id === selectedNoteId;
              const dateStr = new Date(note.updated_time).toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric'
              });

              return (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`p-3.5 cursor-pointer transition-colors relative ${
                    isSelected ? 'bg-blue-600/15 border-l-4 border-blue-500' : 'hover:bg-slate-800/40 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 
                      className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}
                      dangerouslySetInnerHTML={{ __html: note.hl_title || note.title || '무제' }}
                    />
                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">{dateStr}</span>
                  </div>

                  {/* Highlight snippet or body snippet */}
                  <div 
                    className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed"
                    dangerouslySetInnerHTML={{ 
                      __html: note.hl_body || note.body?.slice(0, 80) || '내용 없음' 
                    }}
                  />

                  {/* OCR Match Tag */}
                  {note.match_type === 'image' && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded w-fit">
                      <ImageIcon size={11} />
                      <span>스크린샷/이미지 속 글자 일치</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* COLUMN 3: MARKDOWN EDITOR & VIEWER */}
      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {activeNote ? (
          <>
            {/* Top Editor Toolbar */}
            <div className="h-12 border-b border-slate-800 px-4 flex items-center justify-between bg-slate-900/30">
              <div className="flex items-center gap-3 flex-1 mr-4">
                <input
                  type="text"
                  value={activeNote.title}
                  onChange={e => handleNoteChange({ title: e.target.value })}
                  placeholder="메모 제목을 입력하세요"
                  className="bg-transparent text-sm font-bold text-white placeholder-slate-500 focus:outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mr-2">
                  {saveStatus === 'saved' ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span>저장됨</span>
                    </>
                  ) : (
                    <span>저장 중...</span>
                  )}
                </div>

                {/* View Mode Toggle */}
                <div className="flex rounded-lg bg-slate-800/80 p-0.5 border border-slate-700/80">
                  <button
                    onClick={() => setViewMode('edit')}
                    title="에디터만 보기"
                    className={`p-1.5 rounded-md text-xs transition-colors ${viewMode === 'edit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode('split')}
                    title="좌우 분할 보기"
                    className={`p-1.5 rounded-md text-xs transition-colors ${viewMode === 'split' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Columns size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode('preview')}
                    title="미리보기만 보기"
                    className={`p-1.5 rounded-md text-xs transition-colors ${viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Eye size={14} />
                  </button>
                </div>

                <button
                  onClick={() => handleDeleteNote(activeNote.id)}
                  title="메모 삭제"
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Note Content Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Markdown Editor */}
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-slate-800' : 'w-full'} flex flex-col h-full bg-slate-950`}>
                  <textarea
                    value={activeNote.body}
                    onChange={e => handleNoteChange({ body: e.target.value })}
                    placeholder="마크다운 문법으로 메모를 작성하세요..."
                    className="flex-1 w-full h-full p-6 bg-transparent text-slate-200 placeholder-slate-600 font-mono text-xs leading-relaxed resize-none focus:outline-none overflow-y-auto"
                  />
                </div>
              )}

              {/* Markdown Rendered Preview */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full p-6 overflow-y-auto bg-slate-900/20`}>
                  <div 
                    className="markdown-body max-w-none text-xs"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs gap-3">
            <FileText size={36} className="text-slate-700" />
            <p>선택된 메모가 없습니다. 왼쪽 목록에서 메모를 선택하거나 새로 작성하세요.</p>
          </div>
        )}
      </div>

      {/* Joplin 1-Click Migration Modal */}
      <JoplinModal
        isOpen={isJoplinModalOpen}
        onClose={() => setIsJoplinModalOpen(false)}
        onImportComplete={() => {
          loadFolders();
          loadNotes('', '');
        }}
      />
    </div>
  );
}
