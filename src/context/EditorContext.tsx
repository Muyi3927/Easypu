import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Measure } from '../types';

interface EditorContextType {
  currentDuration: number; // 1 (quarter), 0.5 (eighth), etc.
  setCurrentDuration: (d: number) => void;
  isDotted: boolean;
  setIsDotted: (v: boolean) => void;
  activeTab: 'notes' | 'measures' | 'text';
  setActiveTab: (tab: 'notes' | 'measures' | 'text') => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (v: boolean) => void;
  selectedMeasureIds: string[];
  setSelectedMeasureIds: React.Dispatch<React.SetStateAction<string[]>>;
  copiedMeasures: Measure[] | null;
  setCopiedMeasures: (m: Measure[] | null) => void;
  editingLyricNoteId: string | null;
  setEditingLyricNoteId: (id: string | null) => void;
  editingLyricsLineIndex: number | null;
  setEditingLyricsLineIndex: (idx: number | null) => void;
  editingLyricRow: number;
  setEditingLyricRow: (row: number) => void;
  editingAnnotationLineIndex: number | null;
  setEditingAnnotationLineIndex: (idx: number | null) => void;
  hasLyricsMode: boolean;
  setHasLyricsMode: (v: boolean) => void;
  isPreviewMode: boolean;
  setIsPreviewMode: (v: boolean) => void;
  previewZoom: number;
  setPreviewZoom: (z: number) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const [currentDuration, setCurrentDuration] = useState(1);
  const [isDotted, setIsDotted] = useState(false);
  const [activeTab, setActiveTab] = useState<'notes' | 'measures' | 'text'>('notes');
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMeasureIds, setSelectedMeasureIds] = useState<string[]>([]);
  const [copiedMeasures, setCopiedMeasures] = useState<Measure[] | null>(null);
  const [editingLyricNoteId, setEditingLyricNoteId] = useState<string | null>(null);
  const [editingLyricsLineIndex, setEditingLyricsLineIndex] = useState<number | null>(null);
  const [editingLyricRow, setEditingLyricRow] = useState<number>(0);
  const [editingAnnotationLineIndex, setEditingAnnotationLineIndex] = useState<number | null>(null);
  const [hasLyricsMode, setHasLyricsMode] = useState<boolean>(false);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(1.0);

  return (
    <EditorContext.Provider
      value={{
        currentDuration,
        setCurrentDuration,
        isDotted,
        setIsDotted,
        activeTab,
        setActiveTab,
        isMultiSelectMode,
        setIsMultiSelectMode,
        selectedMeasureIds,
        setSelectedMeasureIds,
        copiedMeasures,
        setCopiedMeasures,
        editingLyricNoteId,
        setEditingLyricNoteId,
        editingLyricsLineIndex,
        setEditingLyricsLineIndex,
        editingLyricRow,
        setEditingLyricRow,
        editingAnnotationLineIndex,
        setEditingAnnotationLineIndex,
        hasLyricsMode,
        setHasLyricsMode,
        isPreviewMode,
        setIsPreviewMode,
        previewZoom,
        setPreviewZoom
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};
