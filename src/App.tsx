import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Folder, FolderPlus, FileText, Plus, Trash2, 
  Eye, Edit3, Columns, Settings, Image as ImageIcon, 
  Bold, Italic, Link, Code, List, ListOrdered, CheckSquare, 
  Minus, RefreshCw, Database, Check, Pin, ChevronRight, ChevronDown,
  MoreVertical, Edit2, ArrowUp, ArrowDown, Copy
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
  order_index?: number;
  note_count: number;
}

export default function App() {
  // Column Widths (Resizable)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    return parseInt(localStorage.getItem('momo_sidebar_w') || '240', 10);
  });
  const [noteListWidth, setNoteListWidth] = useState<number>(() => {
    return parseInt(localStorage.getItem('momo_notelist_w') || '280', 10);
  });

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(''); // empty = all notes
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [isJoplinModalOpen, setIsJoplinModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [copiedNotice, setCopiedNotice] = useState(false);

  // Folder Modals
  const [folderModal, setFolderModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'rename' | 'create_sub';
    targetFolder?: FolderItem | null;
    title: string;
  }>({
    isOpen: false,
    mode: 'create',
    targetFolder: null,
    title: ''
  });

  // Note Rename Modal
  const [noteRenameModal, setNoteRenameModal] = useState<{
    isOpen: boolean;
    targetNote: Note | null;
    title: string;
  }>({
    isOpen: false,
    targetNote: null,
    title: ''
  });

  // Joplin-style Right-Click Context Menu
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    type: 'folder' | 'note';
    targetFolder?: FolderItem | null;
    targetNote?: Note | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'folder',
    targetFolder: null,
    targetNote: null
  });

  // Drag & Drop for Folders and Notes
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<{
    id: string;
    position: 'before' | 'after' | 'inside';
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDraggingSidebar = useRef(false);
  const isDraggingNoteList = useRef(false);

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

  // Handle Resize Dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar.current) {
        const newW = Math.max(160, Math.min(450, e.clientX));
        setSidebarWidth(newW);
        localStorage.setItem('momo_sidebar_w', newW.toString());
      } else if (isDraggingNoteList.current) {
        const newW = Math.max(200, Math.min(600, e.clientX - sidebarWidth));
        setNoteListWidth(newW);
        localStorage.setItem('momo_notelist_w', newW.toString());
      }
    };

    const handleMouseUp = () => {
      isDraggingSidebar.current = false;
      isDraggingNoteList.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sidebarWidth]);

  // Close context menu on click or outside interaction
  useEffect(() => {
    const handleCloseMenu = () => {
      setContextMenu(prev => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    };
    window.addEventListener('click', handleCloseMenu);
    window.addEventListener('contextmenu', handleCloseMenu);
    return () => {
      window.removeEventListener('click', handleCloseMenu);
      window.removeEventListener('contextmenu', handleCloseMenu);
    };
  }, []);

  // Toggle Note Pin
  const handleTogglePin = async (noteId: string) => {
    await fetch(`/api/notes/${noteId}/pin`, { method: 'POST' });
    loadNotes(searchQuery, selectedFolderId);
  };

  // Duplicate Note
  const handleDuplicateNote = async (noteId: string) => {
    const res = await fetch(`/api/notes/${noteId}/duplicate`, { method: 'POST' });
    const data = await res.json();
    await loadFolders();
    await loadNotes(searchQuery, selectedFolderId);
    if (data.id) setSelectedNoteId(data.id);
  };

  // Note Rename Submit
  const handleNoteRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteRenameModal.targetNote) return;
    const newTitle = noteRenameModal.title.trim();
    if (!newTitle) return;

    await fetch(`/api/notes/${noteRenameModal.targetNote.id}/title`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });

    setNotes(prev => prev.map(n => n.id === noteRenameModal.targetNote!.id ? { ...n, title: newTitle } : n));
    setNoteRenameModal({ isOpen: false, targetNote: null, title: '' });
    loadFolders();
  };

  // Folder Drag & Drop
  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/momo-folder', folderId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFolderId(folderId);
  };

  const handleFolderDragOver = (e: React.DragEvent, targetFolder: FolderItem) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height;

    let position: 'before' | 'after' | 'inside' = 'inside';
    if (offsetY < height * 0.28) {
      position = 'before';
    } else if (offsetY > height * 0.72) {
      position = 'after';
    } else {
      position = 'inside';
    }

    setDragOverFolder({ id: targetFolder.id, position });
  };

  const handleFolderDragLeave = (e: React.DragEvent, targetFolderId: string) => {
    e.stopPropagation();
    if (dragOverFolder?.id === targetFolderId) {
      setDragOverFolder(null);
    }
  };

  const handleFolderDrop = async (e: React.DragEvent, targetFolder: FolderItem) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging note into folder
    const noteId = e.dataTransfer.getData('application/momo-note');
    if (noteId) {
      await fetch(`/api/notes/${noteId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: targetFolder.id })
      });
      await loadFolders();
      await loadNotes(searchQuery, selectedFolderId);
      setDragOverFolder(null);
      return;
    }

    // Dragging folder into/before/after folder
    const sourceFolderId = e.dataTransfer.getData('application/momo-folder') || draggedFolderId;
    if (sourceFolderId && sourceFolderId !== targetFolder.id) {
      const position = dragOverFolder?.position || 'inside';
      await fetch('/api/folders/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: sourceFolderId,
          target_id: targetFolder.id,
          position
        })
      });
      await loadFolders();
    }

    setDraggedFolderId(null);
    setDragOverFolder(null);
  };

  // Note Drag Start
  const handleNoteDragStart = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('application/momo-note', noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Folder select
  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    loadNotes(searchQuery, folderId);
  };

  // Toggle Folder expand
  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
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

  // Auto-save active note
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const handleNoteChange = (updates: Partial<Note>) => {
    if (!activeNote) return;

    const updated = { ...activeNote, ...updates, hl_title: undefined, updated_time: Date.now() };
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

  // Folder Operations
  const handleFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = folderModal.title.trim();
    if (!title) return;

    if (folderModal.mode === 'create') {
      await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: '' })
      });
    } else if (folderModal.mode === 'create_sub' && folderModal.targetFolder) {
      await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: folderModal.targetFolder.id })
      });
      setExpandedFolders(prev => ({ ...prev, [folderModal.targetFolder!.id]: true }));
    } else if (folderModal.mode === 'rename' && folderModal.targetFolder) {
      await fetch(`/api/folders/${folderModal.targetFolder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
    }

    setFolderModal({ isOpen: false, mode: 'create', targetFolder: null, title: '' });
    await loadFolders();
  };

  const handleDeleteFolder = async (folder: FolderItem) => {
    if (!confirm(`'${folder.title}' 노트북과 내부의 모든 메모를 삭제하시겠습니까?`)) return;
    await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
    if (selectedFolderId === folder.id) setSelectedFolderId('');
    await loadFolders();
    await loadNotes(searchQuery, '');
  };

  const handleReorderFolder = async (folderId: string, direction: 'up' | 'down') => {
    await fetch('/api/folders/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId, direction })
    });
    await loadFolders();
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

  // Render HTML preview with full copyable text
  const renderedHtml = useMemo(() => {
    if (!activeNote || !activeNote.body) return '';
    let markdown = activeNote.body.replace(/:\/([a-zA-Z0-9]{32})/g, '/resources/$1.png');
    try {
      return marked.parse(markdown) as string;
    } catch (e) {
      return '<p class="text-rose-500">마크다운 렌더링 오류</p>';
    }
  }, [activeNote]);

  // Copy Rendered Text to Clipboard
  const handleCopyPreviewText = () => {
    if (!activeNote) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(renderedHtml, 'text/html');
    const plainText = doc.body.innerText || '';
    navigator.clipboard.writeText(plainText).then(() => {
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    });
  };

  const currentFolderTitle = useMemo(() => {
    if (!selectedFolderId) return '전체 메모';
    return folders.find(f => f.id === selectedFolderId)?.title || '노트북';
  }, [folders, selectedFolderId]);

  // Build Folder Tree
  const { rootFolders, subFolderMap } = useMemo(() => {
    const root: FolderItem[] = [];
    const subs: Record<string, FolderItem[]> = {};

    for (const f of folders) {
      if (!f.parent_id) {
        root.push(f);
      } else {
        if (!subs[f.parent_id]) subs[f.parent_id] = [];
        subs[f.parent_id].push(f);
      }
    }
    return { rootFolders: root, subFolderMap: subs };
  }, [folders]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-slate-800 font-sans">
      {/* 1. TOP CLASSIC JOPLIN MENU BAR */}
      <div className="h-6 bg-[#f0f2f5] border-b border-[#d8dce2] px-3 flex items-center gap-4 text-[11px] text-[#444] shrink-0 font-medium select-none">
        <span className="hover:text-blue-600 cursor-pointer">파일(F)</span>
        <span className="hover:text-blue-600 cursor-pointer">편집(E)</span>
        <span className="hover:text-blue-600 cursor-pointer">보기(V)</span>
        <span className="hover:text-blue-600 cursor-pointer">노트(N)</span>
        <span className="hover:text-blue-600 cursor-pointer">도구(T)</span>
        <span className="hover:text-blue-600 cursor-pointer">도움말(H)</span>
        <div className="ml-auto text-[10px] text-slate-400 font-mono">Momo v0.3.0 (Joplin Pro Edition)</div>
      </div>

      {/* 2. JOPLIN ACTION TOOLBAR */}
      <div className="h-10 bg-[#f7f8fa] border-b border-[#d8dce2] px-3 flex items-center justify-between gap-3 shrink-0 select-none">
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
            onClick={() => setFolderModal({ isOpen: true, mode: 'create', targetFolder: null, title: '' })}
            className="flex items-center gap-1 px-2 py-1 hover:bg-[#eef2f6] rounded text-xs text-slate-600 transition-colors"
            title="새 노트북 추가"
          >
            <FolderPlus size={14} className="text-amber-600" />
            <span>새 노트북</span>
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
        </div>
      </div>

      {/* 3. MAIN 3-COLUMN RESIZABLE WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* COLUMN 1: SIDEBAR (JOPLIN DARK SLATE, RESIZABLE) */}
        <div 
          style={{ width: `${sidebarWidth}px` }} 
          className="bg-[#2e3440] text-[#d8dee9] flex flex-col shrink-0 select-none border-r border-[#242933]"
        >
          {/* Notebooks Header */}
          <div className="p-3 border-b border-[#3b4252] flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#88c0d0]">
              노트북
            </span>
            <button
              onClick={() => setFolderModal({ isOpen: true, mode: 'create', targetFolder: null, title: '' })}
              className="text-[#88c0d0] hover:text-white p-0.5 rounded"
              title="새 노트북 만들기"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Notebooks Tree List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 text-xs">
            {/* All Notes Folder */}
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

            {/* Folder Tree Items */}
            {rootFolders.map((folder, idx) => {
              const subs = subFolderMap[folder.id] || [];
              const hasSubs = subs.length > 0;
              const isExpanded = expandedFolders[folder.id] ?? true;
              const isSelected = selectedFolderId === folder.id;

              const isDragOver = dragOverFolder?.id === folder.id;
              const dragClass = isDragOver
                ? dragOverFolder.position === 'before'
                  ? 'border-t-2 border-[#88c0d0]'
                  : dragOverFolder.position === 'after'
                  ? 'border-b-2 border-[#88c0d0]'
                  : 'bg-[#4c566a] ring-2 ring-[#88c0d0]'
                : '';

              return (
                <div key={folder.id} className="space-y-0.5">
                  <div
                    draggable={true}
                    onDragStart={(e) => handleFolderDragStart(e, folder.id)}
                    onDragOver={(e) => handleFolderDragOver(e, folder)}
                    onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
                    onDrop={(e) => handleFolderDrop(e, folder)}
                    onClick={() => handleSelectFolder(folder.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        isOpen: true,
                        x: e.clientX,
                        y: e.clientY,
                        type: 'folder',
                        targetFolder: folder,
                        targetNote: null
                      });
                    }}
                    className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors relative ${dragClass} ${
                      isSelected ? 'bg-[#434c5e] text-white font-medium' : 'hover:bg-[#3b4252] text-[#d8dee9]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                      {hasSubs ? (
                        <button 
                          type="button" 
                          onClick={(e) => toggleFolderExpand(folder.id, e)}
                          className="p-0.5 text-slate-400 hover:text-white"
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}
                      <Folder size={14} className={isSelected ? 'text-[#ebcb8b]' : 'text-amber-400/80'} />
                      <span className="truncate">{folder.title}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] opacity-60 font-mono mr-1">
                        ({folder.note_count})
                      </span>

                      {/* Folder Action Buttons */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReorderFolder(folder.id, 'up');
                        }}
                        disabled={idx === 0}
                        title="위로 이동"
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white disabled:opacity-20 rounded"
                      >
                        <ArrowUp size={11} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReorderFolder(folder.id, 'down');
                        }}
                        disabled={idx === rootFolders.length - 1}
                        title="아래로 이동"
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white disabled:opacity-20 rounded"
                      >
                        <ArrowDown size={11} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderModal({ isOpen: true, mode: 'create_sub', targetFolder: folder, title: '' });
                        }}
                        title="하위 노트북 추가"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-[#88c0d0] rounded"
                      >
                        <Plus size={11} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderModal({ isOpen: true, mode: 'rename', targetFolder: folder, title: folder.title });
                        }}
                        title="노트북 이름 변경"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-amber-300 rounded"
                      >
                        <Edit2 size={11} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder);
                        }}
                        title="노트북 삭제"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 rounded"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Sub-Folders List */}
                  {hasSubs && isExpanded && (
                    <div className="pl-6 space-y-0.5 border-l border-[#3b4252] ml-4">
                      {subs.map(sub => {
                        const isSubSelected = selectedFolderId === sub.id;
                        const isSubDragOver = dragOverFolder?.id === sub.id;
                        const subDragClass = isSubDragOver
                          ? dragOverFolder.position === 'before'
                            ? 'border-t-2 border-[#88c0d0]'
                            : dragOverFolder.position === 'after'
                            ? 'border-b-2 border-[#88c0d0]'
                            : 'bg-[#4c566a] ring-2 ring-[#88c0d0]'
                          : '';

                        return (
                          <div
                            key={sub.id}
                            draggable={true}
                            onDragStart={(e) => handleFolderDragStart(e, sub.id)}
                            onDragOver={(e) => handleFolderDragOver(e, sub)}
                            onDragLeave={(e) => handleFolderDragLeave(e, sub.id)}
                            onDrop={(e) => handleFolderDrop(e, sub)}
                            onClick={() => handleSelectFolder(sub.id)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({
                                isOpen: true,
                                x: e.clientX,
                                y: e.clientY,
                                type: 'folder',
                                targetFolder: sub,
                                targetNote: null
                              });
                            }}
                            className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors relative ${subDragClass} ${
                              isSubSelected ? 'bg-[#434c5e] text-white font-medium' : 'hover:bg-[#3b4252] text-[#d8dee9]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                              <Folder size={12} className={isSubSelected ? 'text-[#ebcb8b]' : 'text-amber-400/60'} />
                              <span className="truncate">{sub.title}</span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] opacity-60 font-mono mr-1">
                                ({sub.note_count})
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFolderModal({ isOpen: true, mode: 'rename', targetFolder: sub, title: sub.title });
                                }}
                                title="이름 변경"
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-amber-300"
                              >
                                <Edit2 size={10} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFolder(sub);
                                }}
                                title="삭제"
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className="p-2.5 border-t border-[#3b4252] bg-[#292e39]">
            <button
              onClick={() => setIsJoplinModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-[#3b4252] hover:bg-[#434c5e] text-[11px] text-white transition-colors"
            >
              <Database size={13} className="text-[#88c0d0]" />
              <span>Joplin 데이터 가져오기</span>
            </button>
          </div>
        </div>

        {/* RESIZE HANDLE 1: Between Sidebar and Note List */}
        <div
          onMouseDown={() => {
            isDraggingSidebar.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="w-1 bg-[#d8dce2] hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-10"
          title="드래그하여 사이드바 너비 조절"
        />

        {/* COLUMN 2: NOTE LIST (JOPLIN LIGHT THEME, RESIZABLE) */}
        <div 
          style={{ width: `${noteListWidth}px` }} 
          className="bg-white flex flex-col shrink-0 border-r border-[#d8dce2]"
        >
          {/* Note List Header */}
          <div className="h-8 border-b border-[#e5e7eb] px-3 flex items-center justify-between text-xs text-slate-500 bg-[#f8f9fa] select-none">
            <span className="font-semibold text-slate-700 truncate">{currentFolderTitle}</span>
            <span className="text-[11px] font-mono text-slate-400">{notes.length}개</span>
          </div>

          {/* Notes List Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#f1f3f5]">
            {notes.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                {searchQuery ? '일치하는 메모가 없습니다.' : '작성된 메모가 없습니다. [+ 새 메모]를 눌러보세요.'}
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
                    draggable={true}
                    onDragStart={(e) => handleNoteDragStart(e, note.id)}
                    onClick={() => setSelectedNoteId(note.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedNoteId(note.id);
                      setContextMenu({
                        isOpen: true,
                        x: e.clientX,
                        y: e.clientY,
                        type: 'note',
                        targetFolder: null,
                        targetNote: note
                      });
                    }}
                    className={`group p-3 cursor-pointer transition-colors relative ${
                      isSelected 
                        ? 'bg-[#e8f0fe] border-l-[3px] border-[#1a73e8]' 
                        : 'hover:bg-[#f8f9fa] border-l-[3px] border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                        {note.is_pinned === 1 && (
                          <Pin size={11} className="text-blue-600 shrink-0 fill-blue-600" />
                        )}
                        {searchQuery && note.hl_title ? (
                          <h4 
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setNoteRenameModal({ isOpen: true, targetNote: note, title: note.title });
                            }}
                            title="더블클릭 또는 우클릭하여 제목 수정"
                            className={`text-xs font-semibold truncate ${isSelected ? 'text-[#1a73e8]' : 'text-slate-800'}`}
                            dangerouslySetInnerHTML={{ __html: note.hl_title }}
                          />
                        ) : (
                          <h4 
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setNoteRenameModal({ isOpen: true, targetNote: note, title: note.title });
                            }}
                            title="더블클릭 또는 우클릭하여 제목 수정"
                            className={`text-xs font-semibold truncate ${isSelected ? 'text-[#1a73e8]' : 'text-slate-800'}`}
                          >
                            {note.title || '새 메모'}
                          </h4>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNoteRenameModal({ isOpen: true, targetNote: note, title: note.title });
                          }}
                          title="메모 제목 수정"
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-blue-600 rounded transition-opacity"
                        >
                          <Edit2 size={11} />
                        </button>
                        <span className="text-[10px] text-slate-400 shrink-0 font-mono">{dateStr}</span>
                      </div>
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

        {/* RESIZE HANDLE 2: Between Note List and Editor */}
        <div
          onMouseDown={() => {
            isDraggingNoteList.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="w-1 bg-[#d8dce2] hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-10"
          title="드래그하여 메모 목록 너비 조절"
        />

        {/* COLUMN 3: NOTE EDITOR & VIEWER (PURE WHITE JOPLIN) */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
          {activeNote ? (
            <>
              {/* Note Title Input */}
              <div className="pt-3 px-5 pb-2 flex items-center justify-between border-b border-[#e5e7eb] gap-4">
                <input
                  type="text"
                  value={activeNote.title}
                  onChange={e => handleNoteChange({ title: e.target.value })}
                  placeholder="제목 없음"
                  className="w-full text-lg font-bold text-slate-900 placeholder-slate-300 focus:outline-none select-text"
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
              <div className="h-8 border-b border-[#e5e7eb] px-4 flex items-center justify-between bg-[#fafbfc] text-slate-600 text-xs select-none">
                <div className="flex items-center gap-1">
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

                {/* 1-Click Copy Rendered Text Button */}
                <button
                  type="button"
                  onClick={handleCopyPreviewText}
                  title="오른쪽 뷰어 텍스트 전체 복사"
                  className="flex items-center gap-1 px-2 py-0.5 bg-white border border-[#ced4da] rounded hover:bg-[#eef2f6] text-[11px] text-slate-700 transition-colors"
                >
                  <Copy size={11} className="text-blue-600" />
                  <span>{copiedNotice ? '복사 완료!' : '결과 복사'}</span>
                </button>
              </div>

              {/* Editor & Viewer Split Area */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left: Raw Markdown Editor */}
                {(viewMode === 'edit' || viewMode === 'split') && (
                  <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-[#e5e7eb]' : 'w-full'} h-full bg-white`}>
                    <textarea
                      ref={textareaRef}
                      value={activeNote.body}
                      onChange={e => handleNoteChange({ body: e.target.value })}
                      placeholder="마크다운 형식으로 자유롭게 메모를 작성하세요..."
                      className="w-full h-full p-5 bg-white text-slate-800 placeholder-slate-300 font-mono text-[13px] leading-relaxed resize-none focus:outline-none overflow-y-auto select-text"
                    />
                  </div>
                )}

                {/* Right: Rendered HTML Preview with FULL TEXT SELECTION & DRAG-COPY */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                  <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full p-6 overflow-y-auto bg-white select-text cursor-text`}>
                    <div 
                      className="markdown-body max-w-none select-text cursor-text"
                      dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-2 select-none">
              <FileText size={36} className="text-slate-300" />
              <p>선택된 메모가 없습니다. [+ 새 메모]를 눌러 작성해 보세요.</p>
            </div>
          )}
        </div>
      </div>

      {/* Folder Create / Sub-Create / Rename Modal */}
      {folderModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none">
          <form 
            onSubmit={handleFolderSubmit}
            className="w-80 bg-white rounded-lg shadow-xl border border-slate-200 p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-800">
              {folderModal.mode === 'create' && '새 최상위 노트북 만들기'}
              {folderModal.mode === 'create_sub' && `'${folderModal.targetFolder?.title}'의 하위 노트북 만들기`}
              {folderModal.mode === 'rename' && `'${folderModal.targetFolder?.title}' 이름 변경`}
            </h3>
            <input
              type="text"
              autoFocus
              value={folderModal.title}
              onChange={e => setFolderModal(prev => ({ ...prev, title: e.target.value }))}
              placeholder="노트북 이름을 입력하세요"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFolderModal({ isOpen: false, mode: 'create', targetFolder: null, title: '' })}
                className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-500"
              >
                {folderModal.mode === 'rename' ? '수정 완료' : '만들기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Note Rename Modal */}
      {noteRenameModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none">
          <form 
            onSubmit={handleNoteRenameSubmit}
            className="w-80 bg-white rounded-lg shadow-xl border border-slate-200 p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-800">
              메모 제목 수정
            </h3>
            <input
              type="text"
              autoFocus
              value={noteRenameModal.title}
              onChange={e => setNoteRenameModal(prev => ({ ...prev, title: e.target.value }))}
              placeholder="새 메모 제목을 입력하세요"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNoteRenameModal({ isOpen: false, targetNote: null, title: '' })}
                className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-500"
              >
                수정 완료
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Joplin Right-Click Context Menu */}
      {contextMenu.isOpen && (
        <div
          style={{
            left: `${Math.min(contextMenu.x, window.innerWidth - 190)}px`,
            top: `${Math.min(contextMenu.y, window.innerHeight - 220)}px`
          }}
          className="fixed z-50 min-w-[170px] bg-white border border-[#ced4da] rounded shadow-xl py-1 text-xs text-slate-700 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'folder' && contextMenu.targetFolder && (
            <>
              <div className="px-3 py-1 font-semibold text-[11px] text-slate-400 border-b border-slate-100 truncate max-w-[200px]">
                📁 {contextMenu.targetFolder.title}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFolderModal({
                    isOpen: true,
                    mode: 'rename',
                    targetFolder: contextMenu.targetFolder,
                    title: contextMenu.targetFolder!.title
                  });
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8f0fe] hover:text-[#1a73e8] flex items-center gap-2 cursor-pointer"
              >
                <Edit2 size={13} className="text-amber-500" />
                <span>이름 바꾸기 (제목 수정)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFolderModal({
                    isOpen: true,
                    mode: 'create_sub',
                    targetFolder: contextMenu.targetFolder,
                    title: ''
                  });
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8f0fe] hover:text-[#1a73e8] flex items-center gap-2 cursor-pointer"
              >
                <Plus size={13} className="text-blue-500" />
                <span>새 하위 노트북</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleReorderFolder(contextMenu.targetFolder!.id, 'up');
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8f0fe] hover:text-[#1a73e8] flex items-center gap-2 cursor-pointer"
              >
                <ArrowUp size={13} className="text-slate-400" />
                <span>위로 이동</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleReorderFolder(contextMenu.targetFolder!.id, 'down');
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8f0fe] hover:text-[#1a73e8] flex items-center gap-2 cursor-pointer"
              >
                <ArrowDown size={13} className="text-slate-400" />
                <span>아래로 이동</span>
              </button>
              <div className="h-[1px] bg-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  handleDeleteFolder(contextMenu.targetFolder!);
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>노트북 삭제</span>
              </button>
            </>
          )}

          {contextMenu.type === 'note' && contextMenu.targetNote && (
            <>
              <div className="px-3 py-1 font-semibold text-[11px] text-slate-400 border-b border-slate-100 truncate max-w-[200px]">
                📝 {contextMenu.targetNote.title || '새 메모'}
              </div>
              <button
                type="button"
                onClick={() => {
                  setNoteRenameModal({
                    isOpen: true,
                    targetNote: contextMenu.targetNote!,
                    title: contextMenu.targetNote!.title
                  });
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8f0fe] hover:text-[#1a73e8] flex items-center gap-2 cursor-pointer"
              >
                <Edit2 size={13} className="text-amber-500" />
                <span>메모 제목 수정</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleTogglePin(contextMenu.targetNote!.id);
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8f0fe] hover:text-[#1a73e8] flex items-center gap-2 cursor-pointer"
              >
                <Pin size={13} className={contextMenu.targetNote.is_pinned ? 'text-blue-600 fill-blue-600' : 'text-slate-400'} />
                <span>{contextMenu.targetNote.is_pinned ? '상단 고정 해제' : '상단 고정'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDuplicateNote(contextMenu.targetNote!.id);
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#e8f0fe] hover:text-[#1a73e8] flex items-center gap-2 cursor-pointer"
              >
                <Copy size={13} className="text-emerald-500" />
                <span>메모 복제 (복사본)</span>
              </button>
              <div className="h-[1px] bg-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  handleDeleteNote(contextMenu.targetNote!.id);
                  setContextMenu(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>메모 삭제</span>
              </button>
            </>
          )}
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
