import React, { useState, useEffect } from 'react';
import { RefreshCw, Database, CheckCircle, AlertCircle, Sparkles, X } from 'lucide-react';

interface JoplinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const JoplinModal: React.FC<JoplinModalProps> = ({ isOpen, onClose, onImportComplete }) => {
  const [detectInfo, setDetectInfo] = useState<{ dbPath: string; resDir: string; exists: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ folderCount: number; noteCount: number; resourceCount: number; timeTakenMs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setResult(null);
      fetch('/api/joplin/detect')
        .then(res => res.json())
        .then(data => {
          setDetectInfo(data);
          setLoading(false);
        })
        .catch(err => {
          setError('Joplin 경로 감지 실패: ' + err.message);
          setLoading(false);
        });
    }
  }, [isOpen]);

  const handleImport = async () => {
    if (!detectInfo) return;
    setImporting(true);
    setError(null);

    try {
      const res = await fetch('/api/joplin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dbPath: detectInfo.dbPath,
          resDir: detectInfo.resDir
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '가져오기에 실패했습니다.');
      }

      setResult(data.summary);
      onImportComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Database size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Joplin 데이터 1클릭 마이그레이션</h2>
            <p className="text-xs text-slate-400">기존 5년 치 메모와 이미지를 그대로 가져와 강력한 검색 엔진을 연결합니다.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-blue-500" size={28} />
            <p className="text-sm text-slate-300">로컬 Joplin 설치 경로 및 데이터베이스 확인 중...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {detectInfo?.exists ? (
              <div className="rounded-lg bg-slate-800/80 border border-slate-700/80 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle size={16} />
                  <span>로컬 Joplin 데이터베이스가 자동 감지되었습니다!</span>
                </div>
                <div className="text-xs text-slate-400 break-all space-y-1 font-mono">
                  <p><span className="text-slate-500">DB:</span> {detectInfo.dbPath}</p>
                  <p><span className="text-slate-500">리소스:</span> {detectInfo.resDir}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
                <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={18} />
                <div className="text-xs text-amber-200">
                  기본 위치에서 Joplin 데이터베이스를 찾지 못했습니다. 직접 경로를 확인해 주세요.
                </div>
              </div>
            )}

            <div className="rounded-lg bg-blue-950/30 border border-blue-800/30 p-3 text-xs text-blue-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-blue-200">
                <Sparkles size={14} />
                <span>Momo로 가져온 후 일어나는 일:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-300 pl-1">
                <li>3,000+개 메모가 100% 원본 그대로 보존됩니다.</li>
                <li>한글 특화 <strong>Trigram FTS5</strong> 검색 인덱스가 즉시 생성됩니다.</li>
                <li>첨부된 이미지(스크린샷) 200여 개에 대한 <strong>자동 OCR 텍스트 색인</strong>이 백그라운드에서 동작합니다.</li>
              </ul>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                ⚠️ {error}
              </div>
            )}

            {result && (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs space-y-1">
                <div className="font-bold text-sm text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle size={16} />
                  <span>마이그레이션이 성공적으로 완료되었습니다!</span>
                </div>
                <p>• 폴더: {result.folderCount}개</p>
                <p>• 노트: {result.noteCount.toLocaleString()}개</p>
                <p>• 첨부 리소스: {result.resourceCount}개</p>
                <p>• 소요 시간: {(result.timeTakenMs / 1000).toFixed(2)}초</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={importing || !detectInfo?.exists}
                onClick={handleImport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-blue-600/30"
              >
                {importing ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    <span>데이터 이전 중...</span>
                  </>
                ) : (
                  <>
                    <Database size={14} />
                    <span>지금 1클릭으로 가져오기</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
