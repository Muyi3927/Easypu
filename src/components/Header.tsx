import { useNavigate } from 'react-router-dom';
import './Header.css';
import { useEditor } from '../context/EditorContext';
import { useScore } from '../context/ScoreContext';

import { useParams } from 'react-router-dom';
import { storageService } from '../services/StorageService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

import { useEffect } from 'react';

export const Header = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isPreviewMode, setIsPreviewMode, previewZoom, setPreviewZoom } = useEditor();
  const { score, undo, redo, canUndo, canRedo } = useScore();
  const { currentUser, syncPush } = useAuth();
  const { showToast } = useToast();

  // 同步网页标题为当前乐谱标题
  useEffect(() => {
    const title = (score.title || '').trim();
    document.title = title ? `${title} - Easypu 简谱` : 'Easypu 简谱制作平台';
  }, [score.title]);

  const handlePrint = () => {
    const cleanTitle = (score.title || '').trim() || '无标题简谱';
    // 打印与导出 PDF 时设置 document.title，现代浏览器会自动以此作为默认 PDF 文件名
    document.title = cleanTitle;

    const handleAfterPrint = () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.title = `${cleanTitle} - Easypu 简谱`;
    };
    window.addEventListener('afterprint', handleAfterPrint);

    window.print();
  };

  const handleTogglePreview = () => {
    setIsPreviewMode(!isPreviewMode);
  };

  const handleZoomChange = (newZoom: number) => {
    const clamped = Math.max(0.5, Math.min(2.5, Math.round(newZoom * 10) / 10));
    setPreviewZoom(clamped);
  };

  const handleFitWidth = () => {
    const pageWidth = score.pageWidth || 820;
    const windowWidth = window.innerWidth - 60;
    if (windowWidth > 0 && pageWidth > 0) {
      const ratio = Math.max(0.5, Math.min(2.0, Math.round((windowWidth / pageWidth) * 100) / 100));
      setPreviewZoom(ratio);
    }
  };

  const handleSave = async () => {
    const savedMeta = storageService.saveScore(score, id && id !== 'new' ? id : undefined, null, currentUser.id);
    if (id === 'new') {
      navigate(`/editor/${savedMeta.id}`, { replace: true });
    }

    if (currentUser.id !== 'user_default' && currentUser.isCloudUser) {
      try {
        await syncPush();
        showToast(`《${score.title || '乐谱'}》已保存并同步至云端！`, 'success');
      } catch (err: any) {
        showToast(`《${score.title || '乐谱'}》已保存至本地缓存（云端同步提示: ${err.message || '网络连接异常'}）`, 'info');
      }
    } else {
      showToast(`《${score.title || '乐谱'}》已保存至本地缓存！(免费注册账号可开启多端云同步)`, 'success');
    }
  };

  if (isPreviewMode) {
    return (
      <div className="header-content preview-header">
        <div className="header-left">
          <button
            className="btn btn-outline preview-exit-btn"
            onClick={() => setIsPreviewMode(false)}
            title="退出预览模式，返回继续编辑"
          >
            ← 退出预览 / 继续编辑
          </button>
        </div>

        <div className="logo-center">
          <strong>词谱预览</strong> <span className="preview-title-sub">- {score.title || '无标题'}</span>
        </div>

        <div className="header-actions">
          <div className="preview-zoom-controls">
            <button
              className="zoom-btn"
              onClick={() => handleZoomChange(previewZoom - 0.1)}
              title="缩小 (Ctrl + -)"
              disabled={previewZoom <= 0.5}
            >
              −
            </button>
            <span
              className="zoom-value"
              onClick={() => handleZoomChange(1.0)}
              title="点击重置缩放为 100%"
            >
              {Math.round(previewZoom * 100)}%
            </span>
            <button
              className="zoom-btn"
              onClick={() => handleZoomChange(previewZoom + 0.1)}
              title="放大 (Ctrl + +)"
              disabled={previewZoom >= 2.5}
            >
              +
            </button>
            <button
              className="zoom-preset-btn"
              onClick={() => handleZoomChange(1.0)}
              title="原始大小 100%"
            >
              100%
            </button>
            <button
              className="zoom-preset-btn"
              onClick={handleFitWidth}
              title="适应屏幕宽度"
            >
              适宽
            </button>
          </div>

          <button className="btn btn-primary" onClick={handlePrint} title="导出为 PDF 文件或打印">
            🖨️ 导出 PDF / 打印
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="header-content">
      <div className="header-left">
        <button className="header-icon-btn home-btn" onClick={() => navigate('/')} title="返回工作台">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span className="home-btn-label">工作台</span>
        </button>

        <div className="header-history-group">
          <button
            className={`header-icon-btn action-icon-btn ${!canUndo ? 'disabled' : ''}`}
            disabled={!canUndo}
            onClick={undo}
            title="撤销 (Ctrl+Z)"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </button>
          <button
            className={`header-icon-btn action-icon-btn ${!canRedo ? 'disabled' : ''}`}
            disabled={!canRedo}
            onClick={redo}
            title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>

      <div className="header-center-title">
        <span className="title-music-icon">🎼</span>
        <span className="title-text" title="当前正在编辑的曲谱">
          {score.title || '无标题曲谱'}
        </span>
        <span className="title-key-badge">{score.keySignature || '1=C'} {score.timeSignature || '4/4'}</span>
      </div>

      <div className="header-actions">
        <button className="btn btn-outline" onClick={handleTogglePreview} title="切换预览模式">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>预览</span>
        </button>

        <button className="btn btn-save-cloud" onClick={handleSave} title="保存并同步曲谱">
          <span className="save-pulse-dot"></span>
          <span>保存</span>
        </button>

        <button className="btn btn-primary" onClick={handlePrint} title="导出为 PDF 文件或打印">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          <span>导出 PDF</span>
        </button>
      </div>
    </div>
  );
};
