import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Folder, FolderPlus, FileText, Plus, Trash2, 
  Eye, Edit3, Columns, Settings, Image as ImageIcon, 
  Bold, Italic, Link, Code, List, ListOrdered, CheckSquare, 
  Minus, RefreshCw, Database, Check, Pin, Tag, RotateCcw
} from 'lucide-react';
import { marked } from 'marked';
import { SearchBar } from './components/SearchBar';
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
  is_todo?: number;
  todo_completed?: number;
  hl_title?: string;
  snippet?: string;
  match_type?: 'title' | 'body' | 'image' | null;
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Active Note
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

  // Load Notes
  const loadNotes = async (q = searchQuery, fId = selectedFolderId) => {
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (fId) params.set('folder_id', fId);

      const res = await fetch(`/api/notes?${params.toString()}`);
      const data = await res.json();
      setNotes(data);

      if (data.length > 0) {
        if (!selectedNoteId || !data.some((n: Note) => n.id === selectedNoteId)) {
          setSelectedNoteId(data[0].id);
        }
      } else {
        setSelectedNoteId('');
      }
    } catch (e) {
      console.error('Failed to load notes', e);
    }
  };

  useEffect(() => {
    loadFolders();
    loadNotes('', '');
  }, []);

  // Folder select
  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    loadNotes(searchQuery, folderId);
  };

  // Search trigger from SearchBar
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    loadNotes(q, selectedFolderId);
  };

  // Create new note
  const handleCreateNote = async (isTodo = 0) => {
    const targetFolder = selectedFolderId || (folders[0]?.id ?? 'default');
    const newNote = {
      folder_id: targetFolder,
      title: isTodo ? '새로운 할 일' : '새로운 메모',
      body: isTodo ? '- [ ] 해야 할 일을 적으세요\n' : ''
    };

    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNote)
    });
    const created = await res.json();
    await loadFolders();
    await loadNotes(searchQuery, selectedFolderId);
    setSelectedNoteId(created.id);
  };

  // Create new folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderTitle.trim()) return;

    await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newFolderTitle.trim() })
    });
    setNewFolderTitle('');
    setIsNewFolderOpen(false);
    loadFolders();
  };

  // Auto-save active note
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const handleNoteChange = (updates: Partial<Note>) => {
    if (!activeNote) return;

    const updated = { ...activeNote, ...updates, updated_time: Date.now() };
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setSaveStatus('saving');

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        });
        setSaveStatus('saved');
        loadFolders();
      } catch (err) {
        console.error('Save failed', err);
      }
    }, 350);
  };

  // Delete note
  const handleDeleteNote = async (id: string) => {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    await loadFolders();
    loadNotes(searchQuery, selectedFolderId);
  };

  // Reset database to clean state
  const handleResetDb = async () => {
    if (!confirm('데이터를 완전히 초기화하고 새 상태로 시작하시겠습니까?\n(기존에 테스트로 작성된 메모가 모두 정리됩니다.)')) return;
    await fetch('/api/db/reset', { method: 'POST' });
    setSearchQuery('');
    setSelectedFolderId('');
    await loadFolders();
    await loadNotes('', '');
  };

  // Markdown Toolbar Actions
  const insertMarkdown = (prefix: string, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !activeNote) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = activeNote.body;
    const selected = text.substring(start, end);

    const replacement = prefix + selected + suffix;
    const newBody = text.substring(0, start) + replacement + text.substring(end);

    handleNoteChange({ body: newBody });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  // Render HTML preview
  const renderedHtml = useMemo(() => {
    if (!activeNote || !activeNote.body) return '';
    let markdown = activeNote.body.replace(/:\/([a-zA-Z0-9]{32})/g, '/resources/$1.png');
    try {
      return marked.parse(markdown) as string;
    } catch (e) {
      return '<p class="text-rose-500">마크다운 렌더링 오류</p>';
    }
  }, [activeNote]);

  const currentFolderTitle = useMemo(() => {
    if (!selectedFolderId) return '전체 메모';
    return folders.find(f => f.id === selectedFolderId)?.title || '노트북';
  }, [folders, selectedFolderId]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-slate-800 font-sans select-none">
      {/* 1. TOP CLASSIC JOPLIN MENU BAR */}
      <div className="h-6 bg-[#f0f2f5] border-b border-[#d8dce2] px-3 flex items-center gap-4 text-[11px] text-[#444] shrink-0 font-medium">
        <span className="hover:text-blue-600 cursor-pointer">파일(F)</span>
        <span className="hover:text-blue-600 cursor-pointer">편집(E)</span>
        <span className="hover:text-blue-600 cursor-pointer">보기(V)</span>
        <span className="hover:text-blue-600 cursor-pointer">노트(N)</span>
        <span className="hover:text-blue-600 cursor-pointer">도구(T)</span>
        <span className="hover:text-blue-600 cursor-pointer">도움말(H)</span>
        <div className="ml-auto text-[10px] text-slate-400 font-mono">Momo v0.2.0 (Joplin Edition)</div>
      </div>

      {/* 2. JOPLIN ACTION TOOLBAR */}
      <div className="h-10 bg-[#f7f8fa] border-b border-[#d8dce2] px-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          {/* New Note Button */}
          <button
            onClick={() => handleCreateNote(0)}
            className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#eef2f6] border border-[#ced4da] rounded text-xs font-medium text-slate-700 shadow-xs transition-colors"
          >
            <Plus size={13} className="text-blue-600" />
            <span>새 메모</span>
          </button>

          {/* New Todo Button */}
          <button
            onClick={() => handleCreateNote(1)}
            className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#eef2f6] border border-[#ced4da] rounded text-xs font-medium text-slate-700 shadow-xs transition-colors"
          >
            <CheckSquare size={13} className="text-emerald-600" />
            <span>새 할 일</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-300 mx-1" />

          {/* New Notebook Button */}
          <button
            onClick={() => setIsNewFolderOpen(true)}
            className="flex items-center gap-1 px-2 py-1 hover:bg-[#eef2f6] rounded text-xs text-slate-600 transition-colors"
            title="새 노트북 추가"
          >
            <FolderPlus size={14} className="text-amber-600" />
            <span>노트북 추가</span>
          </button>
        </div>

        {/* Center/Right: High-Performance Search Bar & Tools */}
        <div className="flex items-center gap-3 flex-1 max-w-md justify-end">
          <div className="w-64">
            <SearchBar 
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="메모 검색 (제목, 본문, 이미지)..."
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-[#e9ecef] p-0.5 rounded border border-[#ced4da]">
            <button
              onClick={() => setViewMode('edit')}
              title="에디터만 보기"
              className={`p-1 rounded text-xs transition-colors ${viewMode === 'edit' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-black'}`}
            >
              <Edit3 size={13} />
            </button>
            <button
              onClick={() => setViewMode('split')}
              title="좌우 분할 보기"
              className={`p-1 rounded text-xs transition-colors ${viewMode === 'split' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-black'}`}
            >
              <Columns size={13} />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              title="미리보기만 보기"
              className={`p-1 rounded text-xs transition-colors ${viewMode === 'preview' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-black'}`}
            >
              <Eye size={13} />
            </button>
          </div>

          {/* Reset Clean Slate Button */}
          <button
            onClick={handleResetDb}
            title="깨끗한 새 상태로 초기화"
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* 3. MAIN 3-COLUMN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* COLUMN 1: SIDEBAR (JOPLIN DARK SLATE PALETTE) */}
        <div className="w-60 bg-[#2e3440] text-[#d8dee9] flex flex-col border-r border-[#242933] shrink-0">
          {/* Notebooks Header */}
          <div className="p-3 border-b border-[#3b4252] flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#88c0d0]">
              노트북
            </span>
            <button
              onClick={() => setIsNewFolderOpen(true)}
              className="text-[#88c0d0] hover:text-white p-0.5 rounded"
              title="새 노트북"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Notebooks List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 text-xs">
            {/* All Notes */}
            <div
              onClick={() => handleSelectFolder('')}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                selectedFolderId === '' ? 'bg-[#434c5e] text-white font-medium' : 'hover:bg-[#3b4252] text-[#d8dee9]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FileText size={14} className={selectedFolderId === '' ? 'text-[#88c0d0]' : 'text-slate-400'} />
                <span className="truncate">전체 메모</span>
              </div>
              <span className="text-[11px] opacity-60 font-mono">
                {notes.length}
              </span>
            </div>

            {/* Folder Items */}
            {folders.map(f => {
              const isSelected = selectedFolderId === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => handleSelectFolder(f.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#434c5e] text-white font-medium' : 'hover:bg-[#3b4252] text-[#d8dee9]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder size={14} className={isSelected ? 'text-[#ebcb8b]' : 'text-amber-400/80'} />
                    <span className="truncate">{f.title}</span>
                  </div>
                  <span className="text-[11px] opacity-60 font-mono">
                    ({f.note_count})
                  </span>
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer (Joplin Import Callout) */}
          <div className="p-2.5 border-t border-[#3b4252] bg-[#292e39] space-y-1">
            <button
              onClick={() => setIsJoplinModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-[#3b4252] hover:bg-[#434c5e] text-[11px] text-white transition-colors"
            >
              <Database size={13} className="text-[#88c0d0]" />
              <span>Joplin 데이터 가져오기</span>
            </button>
          </div>
        </div>

        {/* COLUMN 2: NOTE LIST (JOPLIN LIGHT THEME) */}
        <div className="w-72 bg-white border-r border-[#d8dce2] flex flex-col shrink-0">
          {/* Note List Header */}
          <div className="h-8 border-b border-[#e5e7eb] px-3 flex items-center justify-between text-xs text-slate-500 bg-[#f8f9fa]">
            <span className="font-semibold text-slate-700 truncate">{currentFolderTitle}</span>
            <span className="text-[11px] font-mono text-slate-400">{notes.length}개</span>
          </div>

          {/* Notes List Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#f1f3f5]">
            {notes.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                {searchQuery ? '일치하는 메모가 없습니다.' : '메모가 없습니다.'}
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
                    className={`p-3 cursor-pointer transition-colors relative ${
                      isSelected 
                        ? 'bg-[#e8f0fe] border-l-[3px] border-[#1a73e8]' 
                        : 'hover:bg-[#f8f9fa] border-l-[3px] border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        {note.is_pinned === 1 && (
                          <Pin size={11} className="text-blue-600 shrink-0 fill-blue-600" />
                        )}
                        <h4 
                          className={`text-xs font-semibold truncate ${isSelected ? 'text-[#1a73e8]' : 'text-slate-800'}`}
                          dangerouslySetInnerHTML={{ __html: note.hl_title || note.title || '새 메모' }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">{dateStr}</span>
                    </div>

                    {/* Contextual snippet */}
                    <p 
                      className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: note.snippet || '내용 없음' }}
                    />

                    {/* Match Tag Badge */}
                    {note.match_type && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium">
                        {note.match_type === 'image' && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <ImageIcon size={10} />
                            <span>이미지 텍스트 일치</span>
                          </span>
                        )}
                        {note.match_type === 'title' && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                            제목 일치
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 3: NOTE EDITOR & VIEWER (PURE WHITE JOPLIN) */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {activeNote ? (
            <>
              {/* Note Title Input */}
              <div className="pt-3 px-5 pb-1 flex items-center justify-between border-b border-[#e5e7eb]">
                <input
                  type="text"
                  value={activeNote.title}
                  onChange={e => handleNoteChange({ title: e.target.value })}
                  placeholder="제목 없음"
                  className="w-full text-lg font-bold text-slate-900 placeholder-slate-300 focus:outline-none"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    {saveStatus === 'saved' ? (
                      <>
                        <Check size={12} className="text-emerald-500" />
                        <span>저장됨</span>
                      </>
                    ) : (
                      <span>저장 중...</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleDeleteNote(activeNote.id)}
                    title="메모 삭제"
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Joplin Markdown Formatting Toolbar */}
              <div className="h-8 border-b border-[#e5e7eb] px-4 flex items-center gap-1 bg-[#fafbfc] text-slate-600 text-xs">
                <button
                  type="button"
                  onClick={() => insertMarkdown('**', '**')}
                  title="굵게 (Ctrl+B)"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <Bold size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('*', '*')}
                  title="기울임 (Ctrl+I)"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <Italic size={13} />
                </button>
                <div className="h-3 w-[1px] bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  onClick={() => insertMarkdown('[', '](https://)')}
                  title="하이퍼링크"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <Link size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('`', '`')}
                  title="인라인 코드"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <Code size={13} />
                </button>
                <div className="h-3 w-[1px] bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  onClick={() => insertMarkdown('- ')}
                  title="글머리 기호 목록"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <List size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('1. ')}
                  title="번호 목록"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <ListOrdered size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('- [ ] ')}
                  title="체크박스 할 일"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <CheckSquare size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown('\n---\n')}
                  title="수평선 구분선"
                  className="p-1 hover:bg-[#eef2f6] rounded"
                >
                  <Minus size={13} />
                </button>
              </div>

              {/* Editor & Viewer Split Area */}
              <div className="flex-1 flex overflow-hidden">
                {/* Raw Markdown Editor */}
                {(viewMode === 'edit' || viewMode === 'split') && (
                  <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-[#e5e7eb]' : 'w-full'} h-full bg-white`}>
                    <textarea
                      ref={textareaRef}
                      value={activeNote.body}
                      onChange={e => handleNoteChange({ body: e.target.value })}
                      placeholder="마크다운 형식으로 자유롭게 메모를 작성하세요..."
                      className="w-full h-full p-5 bg-white text-slate-800 placeholder-slate-300 font-mono text-[13px] leading-relaxed resize-none focus:outline-none overflow-y-auto"
                    />
                  </div>
                )}

                {/* Rendered HTML Preview */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                  <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full p-6 overflow-y-auto bg-white`}>
                    <div 
                      className="markdown-body max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <FileText size={36} className="text-slate-300" />
              <p>선택된 메모가 없습니다. [+ 새 메모]를 눌러 작성해 보세요.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Folder Modal */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form 
            onSubmit={handleCreateFolder}
            className="w-80 bg-white rounded-lg shadow-xl border border-slate-200 p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-800">새 노트북 만들기</h3>
            <input
              type="text"
              autoFocus
              value={newFolderTitle}
              onChange={e => setNewFolderTitle(e.target.value)}
              placeholder="노트북 이름 (예: 독서 노트, 아이디어)"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsNewFolderOpen(false)}
                className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-500"
              >
                만들기
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Joplin Migration Modal */}
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
