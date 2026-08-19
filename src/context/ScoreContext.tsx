import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Score, Measure, Note, FontSettings } from '../types';

interface ScoreContextType {
  score: Score;
  setScore: React.Dispatch<React.SetStateAction<Score>>;
  activeMeasureId: string | null;
  setActiveMeasureId: React.Dispatch<React.SetStateAction<string | null>>;
  activeNoteId: string | null;
  setActiveNoteId: React.Dispatch<React.SetStateAction<string | null>>;
  playingNoteId: string | null;
  setPlayingNoteId: React.Dispatch<React.SetStateAction<string | null>>;
  updateActiveNote: (note: Partial<Omit<Note, 'id'>>, advanceCursor?: boolean) => void;
  selectNote: (measureId: string, noteId: string) => void;
  toggleSlurStart: (noteId: string) => void;
  toggleSlurEnd: (noteId: string) => void;
  insertMeasureAfter: (measureId: string) => void;
  insertLine: () => void;
  deleteLine: (targetMeasureId?: string) => void;
  insertPage: (linesCount?: number) => void;
  setMeasuresPerLine: (count: number) => void;
  deleteMeasure: (measureId: string) => void;
  toggleBreak: (measureId: string) => void;
  moveLineUp: (measureId: string) => void;
  toggleRepeatStart: (measureId: string) => void;
  toggleRepeatEnd: (measureId: string) => void;
  toggleEndBarline: (measureId: string) => void;
  setNormalBarline: (measureId: string) => void;
  pasteMeasures: (targetMeasureId: string, copiedMeasures: Measure[]) => void;
  updateNoteLyric: (noteId: string, lyric: string, rowIndex?: number) => void;
  updateLineAnnotation: (measureId: string, annotation: string, rowIndex?: number) => void;
  updateLineLyrics: (measureIdsInLine: string[], rawText: string, rowIndex?: number) => void;
  shiftLineLyricsRight: (measureIdsInLine: string[], startNoteId: string, rowIndex?: number) => void;
  shiftLineLyricsLeft: (measureIdsInLine: string[], startNoteId: string, rowIndex?: number) => void;
  pasteLyricsAtNote: (startNoteId: string, rawText: string, rowIndex?: number) => void;
  addLyricRow: () => void;
  deleteLyricRow: (rowIndex: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const generatePlaceholderMeasure = (timeSignature: string = '4/4'): Measure => {
  const timeSigParts = timeSignature.split('/');
  const beatsCount = parseInt(timeSigParts[0]) || 4;
  const beatValue = parseInt(timeSigParts[1]) || 4;
  const singleBeatDur = 4 / beatValue;

  return {
    id: uuidv4(),
    notes: Array.from({ length: beatsCount }).map(() => ({
      id: uuidv4(),
      pitch: -2, // -2 means placeholder
      octave: 0,
      duration: singleBeatDur,
      isDotted: false,
      accidental: null
    }))
  };
};

const defaultFont: FontSettings = {
  fontFamily: '思源黑体',
  fontSize: 32,
  color: '#101010',
};

export const isPunctuationChar = (char: string) => {
  return /^[，。！？；：、“”‘’（）《》……——～,\.!?;:'"()>\-~…]+$/.test(char);
};

export const parseLineLyricsInput = (rawText: string): string[] => {
  const tokens: string[] = [];
  const chars = Array.from(rawText);
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];
    if (ch === ' ') {
      tokens.push('');
      i++;
    } else if (isPunctuationChar(ch)) {
      if (tokens.length > 0 && tokens[tokens.length - 1] !== '') {
        tokens[tokens.length - 1] += ch;
      } else if (i + 1 < chars.length && chars[i + 1] !== ' ') {
        tokens.push(ch + chars[i + 1]);
        i++;
      } else {
        tokens.push(ch);
      }
      i++;
    } else {
      let word = ch;
      while (i + 1 < chars.length && isPunctuationChar(chars[i + 1])) {
        word += chars[i + 1];
        i++;
      }
      tokens.push(word);
      i++;
    }
  }

  return tokens;
};

const initialScore: Score = {
  title: '新建曲谱',
  subtitle: '',
  author: '',
  keySignature: '1=C',
  timeSignature: '4/4',
  tempo: 120,
  showTempo: true,
  measuresPerLine: 6,
  showStartBarline: false,
  baseFontSize: 20,
  // 样式设置
  lineHeight: 0.1,
  showMeasureNumber: false,
  measureNumberStyle: 'none',
  firstLineIndent: false,
  // 字体样式
  titleFont: { fontFamily: '宋体', fontSize: 32, color: '#101010' },
  subtitleFont: { fontFamily: '宋体', fontSize: 16, color: '#101010' },
  noteFont: { fontFamily: 'Times New Roman', fontSize: 36, color: '#101010' },
  lyricFont: { fontFamily: '黑体', fontSize: 36, color: '#101010' },
  chordFont: { ...defaultFont, fontSize: 12 },
  annotationFont: { fontFamily: '黑体', fontSize: 24, color: '#1e293b' },
  // 小节样式
  barlineSize: 2,
  barlineColor: '#3d3d3d',
  octaveDotSize: 6,
  // 页码
  showPageNumber: true,
  pageNumberStyle: '1/2',
  pageNumberFont: { ...defaultFont, fontSize: 12, color: '#999999' },
  pageNumberPosition: 'center',
  // 页面宽度与边距
  pageWidth: 980,
  pageMarginTop: 12,
  pageMarginBottom: 16,
  pageMarginLeft: 12,
  pageMarginRight: 12,
  // 12 measures for 2 lines of 6
  measures: Array.from({ length: 12 }).map((_, i) => ({
    ...generatePlaceholderMeasure(),
    isBreak: (i + 1) % 6 === 0
  }))
};

export const createDefaultScore = (title: string = '新建曲谱', keySignature: string = '1=C', timeSignature: string = '4/4'): Score => {
  const perLine = 6;
  return {
    ...initialScore,
    title,
    keySignature,
    timeSignature,
    measures: Array.from({ length: perLine * 2 }).map((_, i) => ({
      ...generatePlaceholderMeasure(timeSignature),
      isBreak: (i + 1) % perLine === 0
    }))
  };
};

export { initialScore };

const ScoreContext = createContext<ScoreContextType | undefined>(undefined);

export const ScoreProvider = ({ children }: { children: ReactNode }) => {
  const [score, setScore] = useState<Score>(initialScore);
  const [activeMeasureId, setActiveMeasureId] = useState<string | null>(score.measures[0]?.id || null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(score.measures[0]?.notes[0]?.id || null);
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);

  const [past, setPast] = useState<Score[]>([]);
  const [future, setFuture] = useState<Score[]>([]);
  const pastRef = useRef<Score[]>([]);
  const futureRef = useRef<Score[]>([]);

  // Keep a ref to the score so we can read it synchronously in event handlers
  const scoreRef = useRef<Score>(score);
  const activeMeasureIdRef = useRef<string | null>(activeMeasureId);
  const activeNoteIdRef = useRef<string | null>(activeNoteId);

  const applyScoreUpdate = (nextScore: Score, recordHistory: boolean = true) => {
    const current = scoreRef.current;
    if (recordHistory && nextScore !== current) {
      const newPast = [...pastRef.current.slice(-49), current];
      pastRef.current = newPast;
      futureRef.current = [];
      setPast(newPast);
      setFuture([]);
    }
    scoreRef.current = nextScore;
    setScore(nextScore);
  };

  const undo = () => {
    if (pastRef.current.length === 0) return;
    const current = scoreRef.current;
    const previous = pastRef.current[pastRef.current.length - 1];
    const newPast = pastRef.current.slice(0, -1);
    const newFuture = [current, ...futureRef.current.slice(0, 49)];

    pastRef.current = newPast;
    futureRef.current = newFuture;
    scoreRef.current = previous;

    setPast(newPast);
    setFuture(newFuture);
    setScore(previous);

    // Sync active measure/note if needed
    if (previous.measures.length > 0) {
      const measureExists = previous.measures.find(m => m.id === activeMeasureIdRef.current);
      if (measureExists) {
        const noteExists = measureExists.notes.find(n => n.id === activeNoteIdRef.current);
        if (!noteExists && measureExists.notes.length > 0) {
          activeNoteIdRef.current = measureExists.notes[0].id;
          setActiveNoteId(measureExists.notes[0].id);
        }
      } else {
        activeMeasureIdRef.current = previous.measures[0].id;
        setActiveMeasureId(previous.measures[0].id);
        if (previous.measures[0].notes.length > 0) {
          activeNoteIdRef.current = previous.measures[0].notes[0].id;
          setActiveNoteId(previous.measures[0].notes[0].id);
        }
      }
    }
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const current = scoreRef.current;
    const next = futureRef.current[0];
    const newFuture = futureRef.current.slice(1);
    const newPast = [...pastRef.current.slice(-49), current];

    pastRef.current = newPast;
    futureRef.current = newFuture;
    scoreRef.current = next;

    setPast(newPast);
    setFuture(newFuture);
    setScore(next);
  };

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            e.preventDefault();
            redo();
          } else {
            e.preventDefault();
            undo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const adjustMeasureLength = (measure: Measure, currentActiveNoteId?: string, timeSignature?: string): Measure => {
    const timeSig = timeSignature || scoreRef.current.timeSignature || '4/4';
    const timeSigParts = timeSig.split('/');
    const beatsPerMeasure = parseInt(timeSigParts[0]) || 4;
    const beatValue = parseInt(timeSigParts[1]) || 4;
    const targetBeats = beatsPerMeasure * (4 / beatValue);
    const singleBeatDur = 4 / beatValue;

    let currentTotal = measure.notes.reduce((sum, n) => sum + n.duration, 0);
    let newNotes = [...measure.notes];

    // Fill remaining duration with placeholders matching beat subdivisions
    if (currentTotal < targetBeats - 0.001) {
      let remaining = targetBeats - currentTotal;
      while (remaining > 0.001) {
        const dur = remaining >= singleBeatDur ? singleBeatDur : remaining;
        newNotes.push({
          id: uuidv4(),
          pitch: -2,
          octave: 0,
          duration: dur,
          isDotted: false,
          accidental: null,
          tieStart: false,
          slurStart: false,
          slurEnd: false,
        });
        remaining -= dur;
      }
    } else if (currentTotal > targetBeats + 0.001) {
      while (currentTotal > targetBeats + 0.001 && newNotes.length > 0) {
        const lastIdx = newNotes.length - 1;
        const lastNote = newNotes[lastIdx];
        if (lastNote.pitch === -2 && lastNote.id !== currentActiveNoteId) {
          if (currentTotal - lastNote.duration >= targetBeats - 0.001) {
            currentTotal -= lastNote.duration;
            newNotes.pop();
          } else {
            newNotes[lastIdx] = { ...lastNote, duration: lastNote.duration - (currentTotal - targetBeats) };
            currentTotal = targetBeats;
          }
        } else {
          break;
        }
      }
    }

    return { ...measure, notes: newNotes };
  };

  const selectNote = (measureId: string, noteId: string) => {
    activeMeasureIdRef.current = measureId;
    activeNoteIdRef.current = noteId;
    setActiveMeasureId(measureId);
    setActiveNoteId(noteId);
  };

  const updateActiveNote = (noteData: Partial<Omit<Note, 'id'>>, advanceCursor: boolean = true) => {
    let currentMeasureId = activeMeasureIdRef.current;
    let currentNoteId = activeNoteIdRef.current;
    const currentScore = scoreRef.current;

    // 默认回退：如果未选中任何音符，自动默认激活第 1 小节第 1 个音符
    if (!currentMeasureId || !currentNoteId) {
      if (currentScore.measures.length > 0 && currentScore.measures[0].notes.length > 0) {
        currentMeasureId = currentScore.measures[0].id;
        currentNoteId = currentScore.measures[0].notes[0].id;
        activeMeasureIdRef.current = currentMeasureId;
        activeNoteIdRef.current = currentNoteId;
        setActiveMeasureId(currentMeasureId);
        setActiveNoteId(currentNoteId);
      } else {
        return;
      }
    }

    // === Step 1: Compute what the new score will look like ===
    let nextNoteId: string | null = null;
    let nextMeasureId: string | null = null;
    let newMeasures = currentScore.measures;

    newMeasures = currentScore.measures.map(measure => {
      if (measure.id === currentMeasureId) {
        const targetIndex = measure.notes.findIndex(n => n.id === currentNoteId);
        if (targetIndex === -1) return measure;

        const targetNote = measure.notes[targetIndex];
        const oldDuration = targetNote.duration;
        const newDuration = noteData.duration !== undefined ? noteData.duration : oldDuration;

        let newNotes: Note[] = [];

        if (newDuration < oldDuration - 0.001) {
          // Note takes less than old slot (e.g. 1/8 note 0.5 replacing 1.0 slot):
          // The updated note takes newDuration, and the remaining beat duration becomes a placeholder right after!
          const updatedTarget: Note = { ...targetNote, ...noteData, duration: newDuration };
          const remainderPlaceholder: Note = {
            id: uuidv4(),
            pitch: -2,
            octave: 0,
            duration: oldDuration - newDuration,
            isDotted: false,
            accidental: null,
            tieStart: false,
            slurStart: false,
            slurEnd: false,
          };
          newNotes = [
            ...measure.notes.slice(0, targetIndex),
            updatedTarget,
            remainderPlaceholder,
            ...measure.notes.slice(targetIndex + 1)
          ];
          if (advanceCursor) {
            nextNoteId = remainderPlaceholder.id;
            nextMeasureId = currentMeasureId;
          }
        } else if (newDuration > oldDuration + 0.001) {
          // Note takes more than old slot (e.g. dotted 1.5 replacing 1.0 slot):
          // Consume difference from following notes
          let diffToConsume = newDuration - oldDuration;
          const updatedTarget: Note = { ...targetNote, ...noteData, duration: newDuration };
          const followingNotes: Note[] = [];

          for (let fi = targetIndex + 1; fi < measure.notes.length; fi++) {
            const fNote = measure.notes[fi];
            if (diffToConsume > 0.001) {
              if (fNote.duration <= diffToConsume + 0.001) {
                diffToConsume -= fNote.duration;
              } else {
                followingNotes.push({ ...fNote, duration: fNote.duration - diffToConsume });
                diffToConsume = 0;
              }
            } else {
              followingNotes.push(fNote);
            }
          }

          newNotes = [
            ...measure.notes.slice(0, targetIndex),
            updatedTarget,
            ...followingNotes
          ];

          if (advanceCursor) {
            const nextIdxInNew = newNotes.findIndex(n => n.id === updatedTarget.id);
            if (nextIdxInNew !== -1 && nextIdxInNew < newNotes.length - 1) {
              nextNoteId = newNotes[nextIdxInNew + 1].id;
              nextMeasureId = currentMeasureId;
            }
          }
        } else {
          // Same duration
          const updatedTarget: Note = { ...targetNote, ...noteData };
          newNotes = measure.notes.map(n => n.id === currentNoteId ? updatedTarget : n);
          if (advanceCursor) {
            const nextIdxInNew = newNotes.findIndex(n => n.id === updatedTarget.id);
            if (nextIdxInNew !== -1 && nextIdxInNew < newNotes.length - 1) {
              nextNoteId = newNotes[nextIdxInNew + 1].id;
              nextMeasureId = currentMeasureId;
            }
          }
        }

        const adjustedMeasure = adjustMeasureLength({ ...measure, notes: newNotes }, currentNoteId, currentScore.timeSignature);
        return adjustedMeasure;
      }
      return measure;
    });

    if (advanceCursor) {
      if (!nextNoteId) {
        const currentMeasureIndex = currentScore.measures.findIndex(m => m.id === currentMeasureId);
        if (currentMeasureIndex !== -1 && currentMeasureIndex < currentScore.measures.length - 1) {
          nextMeasureId = currentScore.measures[currentMeasureIndex + 1].id;
          nextNoteId = currentScore.measures[currentMeasureIndex + 1].notes[0]?.id || null;
        }
      }
    } else {
      nextNoteId = currentNoteId;
      nextMeasureId = currentMeasureId;
    }

    // === Step 2: Update refs SYNCHRONOUSLY before any async React update ===
    if (nextMeasureId) activeMeasureIdRef.current = nextMeasureId;
    if (nextNoteId) activeNoteIdRef.current = nextNoteId;

    // === Step 3: Commit the computed new score (no re-computation, pure replacement) ===
    const newScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(newScore);

    // === Step 4: Update React state for re-render ===
    if (nextMeasureId) setActiveMeasureId(nextMeasureId);
    if (nextNoteId) setActiveNoteId(nextNoteId);
  };

  const setScoreWrapped: React.Dispatch<React.SetStateAction<Score>> = useCallback((action) => {
    const prev = scoreRef.current;
    const next = typeof action === 'function' ? (action as any)(prev) : action;
    applyScoreUpdate(next);
    if (next.measures && next.measures[0]?.id) {
      const currentActive = next.measures.find((m: Measure) => m.id === activeMeasureIdRef.current);
      if (!currentActive) {
        activeMeasureIdRef.current = next.measures[0].id;
        setActiveMeasureId(next.measures[0].id);
        if (next.measures[0].notes[0]?.id) {
          activeNoteIdRef.current = next.measures[0].notes[0].id;
          setActiveNoteId(next.measures[0].notes[0].id);
        }
      }
    }
  }, []);

  const insertMeasureAfter = (measureId: string) => {
    const currentScore = scoreRef.current;
    const index = currentScore.measures.findIndex(m => m.id === measureId);
    if (index === -1) return;

    const targetMeasure = currentScore.measures[index];
    const hadBreak = targetMeasure.isBreak;

    const newMeasure: Measure = {
      ...generatePlaceholderMeasure(currentScore.timeSignature),
      isBreak: hadBreak // new measure takes over the line break if target was line end
    };

    const newMeasures = currentScore.measures.map((m, i) => {
      if (i === index && hadBreak) {
        // Target measure no longer ends the line since the new measure is on the same line
        return { ...m, isBreak: false };
      }
      return m;
    });

    newMeasures.splice(index + 1, 0, newMeasure);

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);

    activeMeasureIdRef.current = newMeasure.id;
    activeNoteIdRef.current = newMeasure.notes[0]?.id || null;
    setActiveMeasureId(newMeasure.id);
    setActiveNoteId(newMeasure.notes[0]?.id || null);
  };

  const insertLine = () => {
    const currentScore = scoreRef.current;
    const count = currentScore.measuresPerLine || 6;
    const newMeasures: Measure[] = [];
    for (let i = 0; i < count; i++) {
      newMeasures.push({
        ...generatePlaceholderMeasure(currentScore.timeSignature),
        isBreak: i === count - 1 // Last measure of the new line gets isBreak
      });
    }

    // Ensure the last measure of previous score also had isBreak
    const prevMeasures = currentScore.measures.map((m, idx) => {
      if (idx === currentScore.measures.length - 1) {
        return { ...m, isBreak: true };
      }
      return m;
    });

    const nextScore = {
      ...currentScore,
      measures: [...prevMeasures, ...newMeasures]
    };
    applyScoreUpdate(nextScore);

    const firstNew = newMeasures[0];
    if (firstNew) {
      activeMeasureIdRef.current = firstNew.id;
      activeNoteIdRef.current = firstNew.notes[0]?.id || null;
      setActiveMeasureId(firstNew.id);
      setActiveNoteId(firstNew.notes[0]?.id || null);
    }
  };

  const deleteLine = (targetMeasureId?: string) => {
    const currentScore = scoreRef.current;
    if (currentScore.measures.length <= 1) {
      // 只有一节时，重置为单节空小节
      const emptyM = generatePlaceholderMeasure(currentScore.timeSignature);
      const nextScore = { ...currentScore, measures: [emptyM] };
      applyScoreUpdate(nextScore);
      setActiveMeasureId(emptyM.id);
      setActiveNoteId(emptyM.notes[0]?.id || null);
      return;
    }

    const mid = targetMeasureId || activeMeasureIdRef.current || currentScore.measures[0]?.id;
    // 1. 分解当前曲谱的所有行
    const lines: Measure[][] = [];
    let curLine: Measure[] = [];
    currentScore.measures.forEach(m => {
      curLine.push(m);
      if (m.isBreak) {
        lines.push(curLine);
        curLine = [];
      }
    });
    if (curLine.length > 0) lines.push(curLine);

    // 2. 找到目标 mid 所在的行索引
    let targetLineIdx = lines.findIndex(l => l.some(m => m.id === mid));
    if (targetLineIdx === -1) {
      targetLineIdx = lines.length - 1; // 默认删除最后一行
    }

    // 3. 删除该行
    lines.splice(targetLineIdx, 1);

    if (lines.length === 0) {
      // 若全部删空，重置保留一个空白标准行
      const count = currentScore.measuresPerLine || 6;
      const newMeasures: Measure[] = [];
      for (let i = 0; i < count; i++) {
        newMeasures.push({
          ...generatePlaceholderMeasure(currentScore.timeSignature),
          isBreak: i === count - 1
        });
      }
      const nextScore = { ...currentScore, measures: newMeasures };
      applyScoreUpdate(nextScore);
      setActiveMeasureId(newMeasures[0].id);
      setActiveNoteId(newMeasures[0].notes[0]?.id || null);
      return;
    }

    // 4. 重组 measures，并确保每行末尾小节保留 isBreak
    const remainingMeasures: Measure[] = [];
    lines.forEach((l) => {
      l.forEach((m, mIdx) => {
        const isLastInLine = mIdx === l.length - 1;
        remainingMeasures.push({
          ...m,
          isBreak: isLastInLine
        });
      });
    });

    const nextScore = { ...currentScore, measures: remainingMeasures };
    applyScoreUpdate(nextScore);

    // 5. 焦点重置到临近的一行首小节
    const nextLineIdx = Math.min(targetLineIdx, lines.length - 1);
    const focusMeasure = lines[nextLineIdx]?.[0] || remainingMeasures[0];
    if (focusMeasure) {
      activeMeasureIdRef.current = focusMeasure.id;
      activeNoteIdRef.current = focusMeasure.notes[0]?.id || null;
      setActiveMeasureId(focusMeasure.id);
      setActiveNoteId(focusMeasure.notes[0]?.id || null);
    }
  };

  const insertPage = (linesCount: number = 8) => {
    const currentScore = scoreRef.current;
    const count = currentScore.measuresPerLine || 6;
    const newMeasures: Measure[] = [];
    
    for (let l = 0; l < linesCount; l++) {
      for (let i = 0; i < count; i++) {
        newMeasures.push({
          ...generatePlaceholderMeasure(currentScore.timeSignature),
          isBreak: i === count - 1 // 每行末尾小节换行
        });
      }
    }

    // 确保前谱最后一小节也带有换行标记
    const prevMeasures = currentScore.measures.map((m, idx) => {
      if (idx === currentScore.measures.length - 1) {
        return { ...m, isBreak: true };
      }
      return m;
    });

    const nextScore = {
      ...currentScore,
      measures: [...prevMeasures, ...newMeasures]
    };
    applyScoreUpdate(nextScore);

    const firstNew = newMeasures[0];
    if (firstNew) {
      activeMeasureIdRef.current = firstNew.id;
      activeNoteIdRef.current = firstNew.notes[0]?.id || null;
      setActiveMeasureId(firstNew.id);
      setActiveNoteId(firstNew.notes[0]?.id || null);
    }
  };

  const setMeasuresPerLine = (newCount: number) => {
    const currentScore = scoreRef.current;
    
    // 检查是否全为默认占位符小节
    const isAllPlaceholder = currentScore.measures.every(m => 
      m.notes.every(n => n.pitch === -2)
    );

    let newMeasures: Measure[] = [];

    if (isAllPlaceholder) {
      // 默认空谱状态下，直接生成整齐的 2 行，每行恰好 newCount 个小节（共 2*newCount 小节）
      const totalMeasures = newCount * 2;
      newMeasures = Array.from({ length: totalMeasures }).map((_, idx) => ({
        ...generatePlaceholderMeasure(currentScore.timeSignature),
        isBreak: (idx + 1) % newCount === 0
      }));
    } else {
      // 已有谱面内容状态下，将全谱小节整齐重排为每行 newCount 个小节
      newMeasures = currentScore.measures.map((m, idx) => ({
        ...m,
        isBreak: (idx + 1) % newCount === 0 || idx === currentScore.measures.length - 1
      }));
    }

    const nextScore = {
      ...currentScore,
      measuresPerLine: newCount,
      measures: newMeasures
    };
    applyScoreUpdate(nextScore);

    if (newMeasures[0]) {
      const firstNote = newMeasures[0].notes[0];
      if (firstNote) {
        activeMeasureIdRef.current = newMeasures[0].id;
        activeNoteIdRef.current = firstNote.id;
        setActiveMeasureId(newMeasures[0].id);
        setActiveNoteId(firstNote.id);
      }
    }
  };

  const deleteMeasure = (measureId: string) => {
    const currentScore = scoreRef.current;
    if (currentScore.measures.length <= 1) return;

    const index = currentScore.measures.findIndex(m => m.id === measureId);
    if (index === -1) return;

    const isDeletedBreak = currentScore.measures[index].isBreak;
    const newMeasures = currentScore.measures.filter(m => m.id !== measureId);

    // If deleted measure had a line break, transfer it to previous measure
    if (isDeletedBreak && index > 0 && newMeasures[index - 1]) {
      newMeasures[index - 1] = { ...newMeasures[index - 1], isBreak: true };
    }

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);

    if (activeMeasureIdRef.current === measureId) {
      const targetIndex = Math.min(index, newMeasures.length - 1);
      const targetMeasure = newMeasures[targetIndex];
      activeMeasureIdRef.current = targetMeasure.id;
      activeNoteIdRef.current = targetMeasure.notes[0]?.id || null;
      setActiveMeasureId(targetMeasure.id);
      setActiveNoteId(targetMeasure.notes[0]?.id || null);
    }
  };

  const toggleBreak = (measureId: string) => {
    const currentScore = scoreRef.current;
    const index = currentScore.measures.findIndex(m => m.id === measureId);
    if (index === -1) return;

    const isCurrentlyBreak = !!currentScore.measures[index].isBreak;
    const perLine = currentScore.measuresPerLine || 6;

    const newMeasures = currentScore.measures.map((m, i) => {
      if (i === index) {
        return { ...m, isBreak: !isCurrentlyBreak };
      }
      return m;
    });

    if (!isCurrentlyBreak) {
      // User is introducing a line break at `index`.
      // Remove the immediate next downstream break if within perLine distance to prevent short stub lines.
      let nextBreakIndex = -1;
      for (let i = index + 1; i < newMeasures.length; i++) {
        if (newMeasures[i].isBreak) {
          nextBreakIndex = i;
          break;
        }
      }
      if (nextBreakIndex !== -1 && (nextBreakIndex - index) < perLine) {
        newMeasures[nextBreakIndex] = { ...newMeasures[nextBreakIndex], isBreak: false };
      }
    }

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const moveLineUp = (measureId: string) => {
    const currentScore = scoreRef.current;
    // Group into lines based on isBreak
    const lines: Measure[][] = [];
    let currentLine: Measure[] = [];
    for (let i = 0; i < currentScore.measures.length; i++) {
      const m = currentScore.measures[i];
      currentLine.push(m);
      if (m.isBreak) {
        lines.push(currentLine);
        currentLine = [];
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    const lineIndex = lines.findIndex(line => line.some(m => m.id === measureId));
    if (lineIndex <= 0) return; // Cannot move first line up

    const prevLine = lines[lineIndex - 1];
    const prevLineLastMeasure = prevLine[prevLine.length - 1];
    if (!prevLineLastMeasure) return;

    const newMeasures = currentScore.measures.map(m => {
      if (m.id === prevLineLastMeasure.id) {
        return { ...m, isBreak: false };
      }
      return m;
    });

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const toggleRepeatStart = (measureId: string) => {
    const currentScore = scoreRef.current;
    const newMeasures: Measure[] = currentScore.measures.map(measure => {
      if (measure.id === measureId) {
        const nextState: 'repeat-start' | null = measure.barlineLeft === 'repeat-start' ? null : 'repeat-start';
        return { ...measure, barlineLeft: nextState };
      }
      return measure;
    });
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const toggleRepeatEnd = (measureId: string) => {
    const currentScore = scoreRef.current;
    const newMeasures: Measure[] = currentScore.measures.map(measure => {
      if (measure.id === measureId) {
        const nextState: 'repeat-end' | null = measure.barlineRight === 'repeat-end' ? null : 'repeat-end';
        return { ...measure, barlineRight: nextState };
      }
      return measure;
    });
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const toggleEndBarline = (measureId: string) => {
    const currentScore = scoreRef.current;
    const newMeasures: Measure[] = currentScore.measures.map(measure => {
      if (measure.id === measureId) {
        const nextState: 'end' | null = measure.barlineRight === 'end' ? null : 'end';
        return { ...measure, barlineRight: nextState };
      }
      return measure;
    });
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const setNormalBarline = (measureId: string) => {
    const currentScore = scoreRef.current;
    const newMeasures: Measure[] = currentScore.measures.map(measure => {
      if (measure.id === measureId) {
        return { ...measure, barlineLeft: null, barlineRight: null };
      }
      return measure;
    });
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const pasteMeasures = (targetMeasureId: string, copiedMeasures: Measure[]) => {
    if (!copiedMeasures || copiedMeasures.length === 0) return;
    const currentScore = scoreRef.current;
    const startIndex = currentScore.measures.findIndex(m => m.id === targetMeasureId);
    if (startIndex === -1) return;

    const newMeasures = [...currentScore.measures];

    copiedMeasures.forEach((copiedM, offset) => {
      const targetIndex = startIndex + offset;
      const isLastCopied = offset === copiedMeasures.length - 1;
      const originalTargetBreak = targetIndex < newMeasures.length ? newMeasures[targetIndex].isBreak : false;

      const clonedMeasure: Measure = {
        id: uuidv4(),
        notes: copiedM.notes.map(n => ({
          ...n,
          id: uuidv4()
        })),
        // 严格保持复制源的换行格式（例如复制 3 行：7, 8, 7 小节，粘贴后完全保持该 7, 8, 7 换行布局）
        isBreak: copiedM.isBreak !== undefined ? copiedM.isBreak : (isLastCopied ? (originalTargetBreak || false) : false),
        barlineLeft: copiedM.barlineLeft,
        barlineRight: copiedM.barlineRight,
        lineAnnotation: copiedM.lineAnnotation,
        lineAnnotations: copiedM.lineAnnotations ? [...copiedM.lineAnnotations] : undefined
      };

      if (targetIndex < newMeasures.length) {
        newMeasures[targetIndex] = clonedMeasure;
      } else {
        newMeasures.push(clonedMeasure);
      }
    });

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);

    const firstPasted = newMeasures[startIndex];
    if (firstPasted) {
      activeMeasureIdRef.current = firstPasted.id;
      activeNoteIdRef.current = firstPasted.notes[0]?.id || null;
      setActiveMeasureId(firstPasted.id);
      setActiveNoteId(firstPasted.notes[0]?.id || null);
    }
  };

  const toggleSlurStart = (noteId: string) => {
    const currentScore = scoreRef.current;
    const flattenedNotes = currentScore.measures.flatMap(m => m.notes);
    const currentIndex = flattenedNotes.findIndex(n => n.id === noteId);
    if (currentIndex === -1) return;

    const currentNote = flattenedNotes[currentIndex];
    const willEnable = !currentNote.slurStart;

    let targetEndNoteId: string | null = null;
    if (willEnable) {
      // Default: automatically set slurEnd on the immediately next note
      if (currentIndex + 1 < flattenedNotes.length) {
        targetEndNoteId = flattenedNotes[currentIndex + 1].id;
      }
    } else {
      // Find the slurEnd associated with this slurStart
      for (let j = currentIndex + 1; j < flattenedNotes.length; j++) {
        if (flattenedNotes[j].slurEnd) {
          targetEndNoteId = flattenedNotes[j].id;
          break;
        }
        if (flattenedNotes[j].slurStart) {
          break;
        }
      }
    }

    const newMeasures = currentScore.measures.map(measure => ({
      ...measure,
      notes: measure.notes.map(note => {
        if (note.id === noteId) {
          return { ...note, slurStart: willEnable };
        }
        if (targetEndNoteId && note.id === targetEndNoteId) {
          return { ...note, slurEnd: willEnable };
        }
        return note;
      })
    }));

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const toggleSlurEnd = (noteId: string) => {
    const currentScore = scoreRef.current;
    const flattenedNotes = currentScore.measures.flatMap(m => m.notes);
    const currentIndex = flattenedNotes.findIndex(n => n.id === noteId);
    if (currentIndex === -1) return;

    const currentNote = flattenedNotes[currentIndex];
    const willEnable = !currentNote.slurEnd;

    // Collect IDs of old slurEnd notes to clear (between preceding slurStart and this note)
    const oldEndNoteIdsToClear: string[] = [];

    if (willEnable) {
      // Look backward to find the nearest preceding slurStart
      let matchedStartIndex = -1;
      for (let j = currentIndex - 1; j >= 0; j--) {
        if (flattenedNotes[j].slurStart) {
          matchedStartIndex = j;
          break;
        }
      }

      if (matchedStartIndex !== -1) {
        // Clear any previous slurEnd between matchedStartIndex and currentIndex
        for (let k = matchedStartIndex + 1; k < currentIndex; k++) {
          if (flattenedNotes[k].slurEnd) {
            oldEndNoteIdsToClear.push(flattenedNotes[k].id);
          }
        }
      }
    }

    const newMeasures = currentScore.measures.map(measure => ({
      ...measure,
      notes: measure.notes.map(note => {
        if (note.id === noteId) {
          return { ...note, slurEnd: willEnable };
        }
        if (oldEndNoteIdsToClear.includes(note.id)) {
          return { ...note, slurEnd: false };
        }
        return note;
      })
    }));
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const updateNoteLyric = (noteId: string, lyric: string, rowIndex: number = 0) => {
    const currentScore = scoreRef.current;
    const newMeasures = currentScore.measures.map(measure => ({
      ...measure,
      notes: measure.notes.map(note => {
        if (note.id === noteId) {
          const currentLyrics = note.lyrics ? [...note.lyrics] : (note.lyric ? [note.lyric] : []);
          while (currentLyrics.length <= rowIndex) {
            currentLyrics.push('');
          }
          currentLyrics[rowIndex] = lyric;
          return {
            ...note,
            lyric: rowIndex === 0 ? lyric : (note.lyric || currentLyrics[0]),
            lyrics: currentLyrics
          };
        }
        return note;
      })
    }));
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const updateLineAnnotation = (measureId: string, annotation: string, rowIndex: number = 0) => {
    const currentScore = scoreRef.current;
    const newMeasures = currentScore.measures.map(measure => {
      if (measure.id === measureId) {
        const currentAnns = measure.lineAnnotations ? [...measure.lineAnnotations] : (measure.lineAnnotation ? [measure.lineAnnotation] : []);
        while (currentAnns.length <= rowIndex) {
          currentAnns.push('');
        }
        currentAnns[rowIndex] = annotation;
        return {
          ...measure,
          lineAnnotation: rowIndex === 0 ? annotation : (measure.lineAnnotation || currentAnns[0]),
          lineAnnotations: currentAnns
        };
      }
      return measure;
    });
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const updateLineLyrics = (measureIdsInLine: string[], rawText: string, rowIndex: number = 0) => {
    const tokens = parseLineLyricsInput(rawText);

    let tokenIdx = 0;
    const currentScore = scoreRef.current;
    const newMeasures = currentScore.measures.map(m => {
      if (measureIdsInLine.includes(m.id)) {
        return {
          ...m,
          notes: m.notes.map(note => {
            const lyr = tokens[tokenIdx] !== undefined ? tokens[tokenIdx] : '';
            tokenIdx++;
            const currentLyrics = note.lyrics ? [...note.lyrics] : (note.lyric ? [note.lyric] : []);
            while (currentLyrics.length <= rowIndex) {
              currentLyrics.push('');
            }
            currentLyrics[rowIndex] = lyr;
            return {
              ...note,
              lyric: rowIndex === 0 ? lyr : (note.lyric || currentLyrics[0]),
              lyrics: currentLyrics
            };
          })
        };
      }
      return m;
    });

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const addLyricRow = () => {
    const currentScore = scoreRef.current;
    let maxRows = 1;
    currentScore.measures.forEach(m => {
      m.notes.forEach(n => {
        if (n.lyrics && n.lyrics.length > maxRows) maxRows = n.lyrics.length;
        if (n.lyric && maxRows < 1) maxRows = 1;
      });
    });
    const newRowIndex = maxRows;

    const newMeasures = currentScore.measures.map(m => {
      const anns = m.lineAnnotations ? [...m.lineAnnotations] : (m.lineAnnotation ? [m.lineAnnotation] : []);
      while (anns.length <= newRowIndex) {
        const numCircle = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][anns.length] || `${anns.length + 1}.`;
        anns.push(numCircle);
      }
      return {
        ...m,
        lineAnnotations: anns,
        notes: m.notes.map(n => {
          const l = n.lyrics ? [...n.lyrics] : (n.lyric ? [n.lyric] : []);
          while (l.length <= newRowIndex) {
            l.push('');
          }
          return {
            ...n,
            lyrics: l
          };
        })
      };
    });

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  const deleteLyricRow = (rowIndex: number) => {
    const currentScore = scoreRef.current;
    const newMeasures = currentScore.measures.map(m => {
      const anns = m.lineAnnotations ? [...m.lineAnnotations] : (m.lineAnnotation ? [m.lineAnnotation] : []);
      if (anns.length > rowIndex) {
        anns.splice(rowIndex, 1);
      }
      return {
        ...m,
        lineAnnotation: anns[0] || '',
        lineAnnotations: anns,
        notes: m.notes.map(n => {
          const l = n.lyrics ? [...n.lyrics] : (n.lyric ? [n.lyric] : []);
          if (l.length > rowIndex) {
            l.splice(rowIndex, 1);
          }
          return {
            ...n,
            lyric: l[0] || '',
            lyrics: l
          };
        })
      };
    });
    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  // 空格键触发：从当前音符位置开始，整行歌词实时向右推移一拍（空出当前拍）
  const shiftLineLyricsRight = (measureIdsInLine: string[], startNoteId: string, rowIndex: number = 0) => {
    const currentScore = scoreRef.current;
    const lineMeasures = currentScore.measures.filter(m => measureIdsInLine.includes(m.id));
    const lineNotes = lineMeasures.flatMap(m => m.notes);
    const startIdx = lineNotes.findIndex(n => n.id === startNoteId);
    if (startIdx === -1) return;

    const curLyrics = lineNotes.map(n => {
      if (n.lyrics && n.lyrics[rowIndex] !== undefined) return n.lyrics[rowIndex];
      if (rowIndex === 0 && n.lyric) return n.lyric;
      return '';
    });

    const newLyrics = [...curLyrics];
    newLyrics.splice(startIdx, 0, '');
    newLyrics.pop();

    let lyrIdx = 0;
    const newMeasures = currentScore.measures.map(m => {
      if (measureIdsInLine.includes(m.id)) {
        return {
          ...m,
          notes: m.notes.map(note => {
            const lyr = newLyrics[lyrIdx] || '';
            lyrIdx++;
            const l = note.lyrics ? [...note.lyrics] : (note.lyric ? [note.lyric] : []);
            while (l.length <= rowIndex) l.push('');
            l[rowIndex] = lyr;
            return {
              ...note,
              lyric: rowIndex === 0 ? lyr : (note.lyric || l[0]),
              lyrics: l
            };
          })
        };
      }
      return m;
    });

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  // 退格键触发：从当前音符位置开始，整行歌词实时向左拉回一拍
  const shiftLineLyricsLeft = (measureIdsInLine: string[], startNoteId: string, rowIndex: number = 0) => {
    const currentScore = scoreRef.current;
    const lineMeasures = currentScore.measures.filter(m => measureIdsInLine.includes(m.id));
    const lineNotes = lineMeasures.flatMap(m => m.notes);
    const startIdx = lineNotes.findIndex(n => n.id === startNoteId);
    if (startIdx === -1) return;

    const curLyrics = lineNotes.map(n => {
      if (n.lyrics && n.lyrics[rowIndex] !== undefined) return n.lyrics[rowIndex];
      if (rowIndex === 0 && n.lyric) return n.lyric;
      return '';
    });

    const newLyrics = [...curLyrics];
    newLyrics.splice(startIdx, 1);
    newLyrics.push('');

    let lyrIdx = 0;
    const newMeasures = currentScore.measures.map(m => {
      if (measureIdsInLine.includes(m.id)) {
        return {
          ...m,
          notes: m.notes.map(note => {
            const lyr = newLyrics[lyrIdx] || '';
            lyrIdx++;
            const l = note.lyrics ? [...note.lyrics] : (note.lyric ? [note.lyric] : []);
            while (l.length <= rowIndex) l.push('');
            l[rowIndex] = lyr;
            return {
              ...note,
              lyric: rowIndex === 0 ? lyr : (note.lyric || l[0]),
              lyrics: l
            };
          })
        };
      }
      return m;
    });

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  // 粘贴整段文本：从当前音符开始，实时对应各音符列（支持空格空拍与标点吸附）
  const pasteLyricsAtNote = (startNoteId: string, rawText: string, rowIndex: number = 0) => {
    const tokens = parseLineLyricsInput(rawText);
    if (!tokens.length) return;

    const currentScore = scoreRef.current;
    const flattenedNotes = currentScore.measures.flatMap(m => m.notes);
    const startIdx = flattenedNotes.findIndex(n => n.id === startNoteId);
    if (startIdx === -1) return;

    const newMeasures = currentScore.measures.map(m => {
      return {
        ...m,
        notes: m.notes.map(note => {
          const globalIdx = flattenedNotes.findIndex(n => n.id === note.id);
          if (globalIdx >= startIdx && globalIdx < startIdx + tokens.length) {
            const token = tokens[globalIdx - startIdx];
            const l = note.lyrics ? [...note.lyrics] : (note.lyric ? [note.lyric] : []);
            while (l.length <= rowIndex) l.push('');
            l[rowIndex] = token;
            return {
              ...note,
              lyric: rowIndex === 0 ? token : (note.lyric || l[0]),
              lyrics: l
            };
          }
          return note;
        })
      };
    });

    const nextScore = { ...currentScore, measures: newMeasures };
    applyScoreUpdate(nextScore);
  };

  return (
    <ScoreContext.Provider
      value={{
        score,
        setScore: setScoreWrapped,
        activeMeasureId,
        setActiveMeasureId,
        activeNoteId,
        setActiveNoteId,
        playingNoteId,
        setPlayingNoteId,
        updateActiveNote,
        selectNote,
        toggleSlurStart,
        toggleSlurEnd,
        insertMeasureAfter,
        insertLine,
        deleteLine,
        insertPage,
        setMeasuresPerLine,
        deleteMeasure,
        toggleBreak,
        moveLineUp,
        toggleRepeatStart,
        toggleRepeatEnd,
        toggleEndBarline,
        setNormalBarline,
        pasteMeasures,
        updateNoteLyric,
        updateLineAnnotation,
        updateLineLyrics,
        shiftLineLyricsRight,
        shiftLineLyricsLeft,
        pasteLyricsAtNote,
        addLyricRow,
        deleteLyricRow,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0
      }}
    >
      {children}
    </ScoreContext.Provider>
  );
};

export const useScore = () => {
  const context = useContext(ScoreContext);
  if (context === undefined) {
    throw new Error('useScore must be used within a ScoreProvider');
  }
  return context;
};
