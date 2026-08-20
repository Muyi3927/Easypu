import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { Toolbar } from '../components/Toolbar';
import { ScoreEditor } from '../components/ScoreEditor';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { useScore, createDefaultScore } from '../context/ScoreContext';
import { useEditor } from '../context/EditorContext';
import { useAuth } from '../context/AuthContext';
import { storageService } from '../services/StorageService';

export const EditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { loadScore } = useScore();
  const { activeTab, isPreviewMode } = useEditor();
  const { currentUser } = useAuth();
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedIdRef.current === id) return;
    loadedIdRef.current = id || null;

    if (id && id !== 'new') {
      const existing = storageService.getScoreById(id, currentUser.id);
      if (existing && existing.scoreData && existing.scoreData.measures && existing.scoreData.measures.length > 0) {
        loadScore(existing.scoreData);
        return;
      }
    }

    const title = searchParams.get('title') || '新建曲谱';
    const newScore = createDefaultScore(title);
    loadScore(newScore);
  }, [id, searchParams, currentUser.id, loadScore]);

  return (
    <Layout
      header={<Header />}
      toolbar={isPreviewMode ? null : <Toolbar />}
      editor={<ScoreEditor />}
      keyboard={!isPreviewMode && activeTab === 'notes' ? <PianoKeyboard /> : null}
    />
  );
};
