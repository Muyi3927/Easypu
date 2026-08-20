import { useRef, useState, useEffect, useMemo } from 'react';
import './ScoreEditor.css';
import { useScore, parseLineLyricsInput, generatePlaceholderMeasure } from '../context/ScoreContext';
import { useEditor } from '../context/EditorContext';
import { useAuth } from '../context/AuthContext';
import { playNote } from '../utils/audio';
import type { Note, Measure, FontSettings } from '../types';

const splitCharAndPunct = (text: string) => {
  if (!text) return { charPart: '', punctPart: '' };
  const punctRegex = /^[，。！？；：、“”‘’（）《》……——～,\.!?;:'"()>\-~…]+$/;
  let charPart = '';
  let punctPart = '';
  const chars = Array.from(text);
  for (const ch of chars) {
    if (punctRegex.test(ch)) {
      punctPart += ch;
    } else {
      charPart += ch;
    }
  }
  return { charPart, punctPart };
};

export const ScoreEditor = () => {
  const {
    score,
    setScore,
    activeMeasureId,
    setActiveMeasureId,
    activeNoteId,
    updateActiveNote,
    setMeasuresPerLine,
    insertLine,
    playingNoteId,
    selectNote,
    pasteMeasures,
    updateNoteLyric,
    updateLineAnnotation,
    shiftLineLyricsRight,
    shiftLineLyricsLeft,
    pasteLyricsAtNote,
    addLyricRow,
    deleteLyricRow,
    activeVoice,
    insertPage
  } = useScore();
  const {
    activeTab,
    setActiveTab,
    isMultiSelectMode,
    setIsMultiSelectMode,
    selectedMeasureIds,
    setSelectedMeasureIds,
    copiedMeasures,
    setCopiedMeasures,
    editingLyricRow,
    setEditingLyricRow,
    editingAnnotationLineIndex,
    setEditingAnnotationLineIndex,
    hasLyricsMode,
    isPreviewMode,
    currentDuration,
    setCurrentDuration,
    isDotted,
    setIsDotted,
    previewZoom
  } = useEditor();
  const { isAuthenticated, syncPush } = useAuth();
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeLyricBeatNoteId, setActiveLyricBeatNoteId] = useState<string | null>(null);
  const isComposingRef = useRef(false);
  const pendingOctaveRef = useRef<number>(0);
  const pendingAccidentalRef = useRef<'#' | 'b' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeSettingsTab, setActiveSettingsTab] = useState('notation');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basicInfo: true,
    keyTime: true,
    tempo: false,
    measures: true,
    // 样式模块
    layout: true,
    displayOptions: false,
    fontStyles: false,
    measureStyles: false,
    pageNumber: false,
    pageMargin: false,
  });

  const [pageSvgLines, setPageSvgLines] = useState<Record<number, { id: string, path: string, isSlur: boolean }[]>>({});

  // 切换预览模式时自动回滚到顶部
  useEffect(() => {
    if (isPreviewMode) {
      window.scrollTo({ top: 0, behavior: 'instant' as any });
      const mainContainer = document.querySelector('.layout-main');
      if (mainContainer) {
        mainContainer.scrollTop = 0;
      }
    }
  }, [isPreviewMode]);

  // Calculate svg lines for ties and slurs per page (支持缩放预览与高保真打印导出)
  useEffect(() => {
    const computeLines = () => {
      const flattenedNotes = score.measures.flatMap(m => m.notes);
      const newPageLines: Record<number, { id: string, path: string, isSlur: boolean }[]> = {};

      const pageContentEls = document.querySelectorAll('.a4-page-content');
      if (!pageContentEls || pageContentEls.length === 0) return;

      const zoom = (isPreviewMode && previewZoom && previewZoom > 0) ? previewZoom : 1.0;

      const getPageInfoForEl = (el: HTMLElement) => {
        for (let pIdx = 0; pIdx < pageContentEls.length; pIdx++) {
          if (pageContentEls[pIdx].contains(el)) {
            return { pageIndex: pIdx, pageContentEl: pageContentEls[pIdx] as HTMLElement };
          }
        }
        return null;
      };

      for (let i = 0; i < flattenedNotes.length; i++) {
        const note = flattenedNotes[i];
        if (note.tieStart && i + 1 < flattenedNotes.length) {
          const nextNote = flattenedNotes[i + 1];
          const startEl = document.getElementById(`note-${note.id}`);
          const endEl = document.getElementById(`note-${nextNote.id}`);
          if (startEl && endEl) {
            const startPageInfo = getPageInfoForEl(startEl);
            if (startPageInfo) {
              const pIdx = startPageInfo.pageIndex;
              const pageRect = startPageInfo.pageContentEl.getBoundingClientRect();
              const startRect = startEl.getBoundingClientRect();
              const endRect = endEl.getBoundingClientRect();

              const startCore = startEl.querySelector('.note-core');
              const endCore = endEl.querySelector('.note-core');

              const sx = (startRect.left - pageRect.left) / zoom + (startRect.width / zoom) / 2;
              const ex = (endRect.left - pageRect.left) / zoom + (endRect.width / zoom) / 2;
              const sy = ((startCore ? startCore.getBoundingClientRect().top : startRect.top) - pageRect.top) / zoom + ((startCore ? startCore.getBoundingClientRect().height : startRect.height) / zoom) + 5;
              const ey = ((endCore ? endCore.getBoundingClientRect().top : endRect.top) - pageRect.top) / zoom + ((endCore ? endCore.getBoundingClientRect().height : endRect.height) / zoom) + 5;

              const path = `M ${sx} ${sy} Q ${(sx + ex) / 2} ${sy + 15} ${ex} ${ey}`;
              if (!newPageLines[pIdx]) newPageLines[pIdx] = [];
              newPageLines[pIdx].push({ id: `tie-${note.id}`, path, isSlur: false });
            }
          }
        }

        if (note.slurStart) {
          let endIndex = -1;
          for (let j = i + 1; j < flattenedNotes.length; j++) {
            if (flattenedNotes[j].slurEnd) {
              endIndex = j;
              break;
            }
            if (flattenedNotes[j].slurStart) {
              endIndex = j - 1;
              break;
            }
          }
          if (endIndex === -1 && i + 1 < flattenedNotes.length) {
            endIndex = i + 1;
          }
          if (endIndex > i) {
            const startEl = document.getElementById(`note-${note.id}`);
            const endNote = flattenedNotes[endIndex];
            const endEl = document.getElementById(`note-${endNote.id}`);

            if (startEl && endEl) {
              const startPageInfo = getPageInfoForEl(startEl);
              const endPageInfo = getPageInfoForEl(endEl);

              if (startPageInfo && endPageInfo) {
                const startRect = startEl.getBoundingClientRect();
                const endRect = endEl.getBoundingClientRect();
                const startPageRect = startPageInfo.pageContentEl.getBoundingClientRect();
                const endPageRect = endPageInfo.pageContentEl.getBoundingClientRect();

                const startLineEl = startEl.closest('.score-line');
                const endLineEl = endEl.closest('.score-line');
                const startLineRect = startLineEl ? startLineEl.getBoundingClientRect() : startPageRect;
                const endLineRect = endLineEl ? endLineEl.getBoundingClientRect() : endPageRect;

                const sx = (startRect.left - startPageRect.left) / zoom + (startRect.width / zoom) / 2;
                const sy = (startRect.top - startPageRect.top) / zoom;
                const ex = (endRect.left - endPageRect.left) / zoom + (endRect.width / zoom) / 2;
                const ey = (endRect.top - endPageRect.top) / zoom;

                // 查找该连音线段内所有音符的最大八度以统一定位弧线高度
                let maxOctave = Math.max(0, note.octave || 0, endNote.octave || 0);
                for (let k = i; k <= endIndex; k++) {
                  if (flattenedNotes[k]) {
                    maxOctave = Math.max(maxOctave, flattenedNotes[k].octave || 0);
                  }
                }
                const unifiedTopOffset = 8 + maxOctave * 6;

                const isCrossPage = startPageInfo.pageIndex !== endPageInfo.pageIndex;
                const isCrossLine = isCrossPage || Math.abs(endRect.top - startRect.top) > (startRect.height / zoom) * 1.5;

                if (isCrossLine) {
                  // 第 1 段：起始小节所在行
                  const p1Idx = startPageInfo.pageIndex;
                  const line1Right = (startLineRect.right - startPageRect.left) / zoom - 6;
                  const distance1 = Math.max(line1Right - sx, 25);
                  const curveHeight1 = Math.min(distance1 * 0.16, 16);
                  const startY = sy - unifiedTopOffset;
                  const endY1 = startY - 2;
                  const ctrlX1 = (sx + line1Right) / 2;
                  const ctrlY1 = Math.min(startY, endY1) - curveHeight1;
                  const path1 = `M ${sx} ${startY} Q ${ctrlX1} ${ctrlY1} ${line1Right} ${endY1}`;

                  if (!newPageLines[p1Idx]) newPageLines[p1Idx] = [];
                  newPageLines[p1Idx].push({ id: `slur-${note.id}-1`, path: path1, isSlur: true });

                  // 第 2 段：结束小节所在行
                  const p2Idx = endPageInfo.pageIndex;
                  const line2Left = (endLineRect.left - endPageRect.left) / zoom + 6;
                  const distance2 = Math.max(ex - line2Left, 25);
                  const curveHeight2 = Math.min(distance2 * 0.16, 16);
                  const endY = ey - unifiedTopOffset;
                  const startY2 = endY - 2;
                  const ctrlX2 = (line2Left + ex) / 2;
                  const ctrlY2 = Math.min(startY2, endY) - curveHeight2;
                  const path2 = `M ${line2Left} ${startY2} Q ${ctrlX2} ${ctrlY2} ${ex} ${endY}`;

                  if (!newPageLines[p2Idx]) newPageLines[p2Idx] = [];
                  newPageLines[p2Idx].push({ id: `slur-${note.id}-2`, path: path2, isSlur: true });
                } else {
                  // 同一行内连线
                  const pIdx = startPageInfo.pageIndex;
                  const distance = Math.abs(ex - sx);
                  const curveHeight = Math.min(Math.max(distance * 0.15, 10), 24);
                  const baselineY = Math.min(sy, ey) - unifiedTopOffset;
                  const startY = baselineY;
                  const endY = baselineY;
                  const ctrlY = baselineY - curveHeight;
                  const path = `M ${sx} ${startY} Q ${(sx + ex) / 2} ${ctrlY} ${ex} ${endY}`;

                  if (!newPageLines[pIdx]) newPageLines[pIdx] = [];
                  newPageLines[pIdx].push({ id: `slur-${note.id}`, path, isSlur: true });
                }
              }
            }
          }
        }
      }
      setPageSvgLines(newPageLines);
    };

    const timeoutId = setTimeout(computeLines, 60);
    window.addEventListener('resize', computeLines);
    window.addEventListener('beforeprint', computeLines);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', computeLines);
      window.removeEventListener('beforeprint', computeLines);
    };
  }, [score.measures, score.baseFontSize, score.lineHeight, score.pageMarginTop, score.pageMarginLeft, score.pageMarginRight, score.pageMarginBottom, score.pageWidth, isPreviewMode, previewZoom]);

  // Group measures into lines based on isBreak
  const lines: Measure[][] = [];
  let currentLine: Measure[] = [];
  for (let i = 0; i < score.measures.length; i++) {
    const m = score.measures[i];
    currentLine.push(m);
    if (m.isBreak) {
      lines.push(currentLine);
      currentLine = [];
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  const handleSave = () => {
    setSaveMessage('保存成功！');
    setTimeout(() => {
      setSaveMessage('');
      setShowSettings(false);
    }, 1000);
    // 已登录则静默同步到云端（不阻塞 UI，忽略错误）
    if (isAuthenticated) {
      syncPush().catch(() => {/* 静默失败 */});
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // 新增一行 - 根据设置的小节数添加
  const handleAddLine = () => {
    insertLine();
  };

  // 新增一页 - 根据设置的小节数添加一整页小节（预留底部安全边距）
  const handleAddPage = () => {
    insertPage(8);
  };

  // 更改行小节数时，全谱所有行均更新为该小节数
  const handleMeasuresPerLineChange = (newCount: number) => {
    setMeasuresPerLine(newCount);
  };

  // 更改拍号时，更新空谱或适配各小节拍数
  const handleTimeSignatureChange = (newTimeSig: string) => {
    const updatedMeasures = score.measures.map(m => {
      const isAllPlaceholder = m.notes.every(n => n.pitch === -2);
      if (isAllPlaceholder) {
        return {
          ...generatePlaceholderMeasure(newTimeSig),
          id: m.id,
          isBreak: m.isBreak,
          barlineLeft: m.barlineLeft,
          barlineRight: m.barlineRight,
          lineAnnotation: m.lineAnnotation,
          lineAnnotations: m.lineAnnotations
        };
      }
      return m;
    });

    setScore({
      ...score,
      timeSignature: newTimeSig,
      measures: updatedMeasures
    });

    if (updatedMeasures[0]?.id && updatedMeasures[0]?.notes[0]?.id) {
      selectNote(updatedMeasures[0].id, updatedMeasures[0].notes[0].id);
    }
  };

  const keyOptions = [
    { label: 'C', value: 'C' },
    { label: 'C#', value: '#C' },
    { label: 'Db', value: 'bD' },
    { label: 'D', value: 'D' },
    { label: 'D#', value: '#D' },
    { label: 'Eb', value: 'bE' },
    { label: 'E', value: 'E' },
    { label: 'F', value: 'F' },
    { label: 'F#', value: '#F' },
    { label: 'Gb', value: 'bG' },
    { label: 'G', value: 'G' },
    { label: 'G#', value: '#G' },
    { label: 'Ab', value: 'bA' },
    { label: 'A', value: 'A' },
    { label: 'A#', value: '#A' },
    { label: 'Bb', value: 'bB' },
    { label: 'B', value: 'B' },
  ];

  const timeSignatureOptions = [
    '2/2', '3/2', '2/4', '3/4', '4/4', '5/4', '6/4',
    '3/8', '6/8', '7/8', '9/8', '12/8'
  ];

  const measuresPerLineOptions = [2, 3, 4, 5, 6, 7, 8];
  const fontOptions = ['Times New Roman', 'Arial', '宋体', '黑体', 'Georgia', '楷体'];
  const fontSizeOptions = [24, 32, 36, 48]; // 4档 (从24到48分4档)
  const barlineSizeOptions = [1, 2, 3, 4]; // 4档，映射到1-3em
  const getBarlineSize = (level: number) => 1 + (level - 1) * 0.667; // 1->1, 2->1.667, 3->2.333, 4->3
  const pageNumberStyleOptions = ['1', '1/2', '- 1 -', '第1页'];
  const pageNumberPositionOptions = [
    { label: '左对齐', value: 'left' },
    { label: '居中', value: 'center' },
    { label: '右对齐', value: 'right' },
  ];

  // 解析调号显示
  const getKeyDisplay = () => {
    const key = score.keySignature.replace('1=', '');
    if (key.startsWith('#')) {
      return { accidental: '#', note: key.substring(1) };
    } else if (key.startsWith('b')) {
      return { accidental: 'b', note: key.substring(1) };
    }
    return { accidental: '', note: key };
  };

  // 解析拍号显示
  const getTimeDisplay = () => {
    const parts = score.timeSignature.split('/');
    return { top: parts[0], bottom: parts[1] };
  };

  const keyDisplay = getKeyDisplay();
  const timeDisplay = getTimeDisplay();

  // 获取当前激活的音符
  const activeNote = useMemo(() => {
    if (!activeMeasureId || !activeNoteId) return null;
    const measure = score.measures.find(m => m.id === activeMeasureId);
    return measure?.notes.find(n => n.id === activeNoteId) || null;
  }, [score.measures, activeMeasureId, activeNoteId]);

  // 快捷键支持：0输入休止符，-输入延音线，1-7输入音符(带发音)，.输入附点，上下键升降八度，左右键移动光标
  useEffect(() => {
    const handleScoreKeyDown = (e: KeyboardEvent) => {
      if (isPreviewMode) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // 1. 0 输入休止符
      if (key === '0' || e.code === 'Numpad0') {
        e.preventDefault();
        pendingOctaveRef.current = 0;
        pendingAccidentalRef.current = null;
        const noteWasDotted = isDotted;
        const finalDuration = noteWasDotted ? currentDuration * 1.5 : currentDuration;
        if (isDotted) setIsDotted(false);
        updateActiveNote({ pitch: 0, octave: 0, accidental: null, duration: finalDuration, isDotted: noteWasDotted });
        return;
      }

      // 2. - / _ 输入延音线（增时线）
      if (key === '-' || key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        pendingOctaveRef.current = 0;
        pendingAccidentalRef.current = null;
        const finalDuration = currentDuration;
        updateActiveNote({ pitch: -1, octave: 0, accidental: null, isDotted: false, duration: finalDuration });
        return;
      }

      // 3. 升降音快捷键: [ 降音 (b), ] 升音 (#)
      if (key === '[' || key === '【' || e.code === 'BracketLeft' || key === ']' || key === '】' || e.code === 'BracketRight') {
        e.preventDefault();
        const isFlat = key === '[' || key === '【' || e.code === 'BracketLeft';
        const targetAcc: '#' | 'b' = isFlat ? 'b' : '#';

        if (activeNote && activeNote.pitch > 0) {
          const newAcc = activeNote.accidental === targetAcc ? null : targetAcc;
          updateActiveNote({ accidental: newAcc }, false);
          playNote(activeNote.pitch, activeNote.octave, newAcc, score.keySignature, activeNote.duration, score.tempo || 70);
        } else {
          pendingAccidentalRef.current = pendingAccidentalRef.current === targetAcc ? null : targetAcc;
        }
        return;
      }

      // 4. ↑ 升高八度 / ↓ 降低八度（严格在当前光标位作用，绝不跳回上一位；如需修改上一位按 ← 移动光标）
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        e.preventDefault();
        const isUp = key === 'ArrowUp';

        if (activeNote && activeNote.pitch > 0) {
          // 当前选中的音符有实际音高：直接升降该音符的八度
          const currentOct = activeNote.octave || 0;
          const newOct = isUp ? Math.min(2, currentOct + 1) : Math.max(-2, currentOct - 1);
          updateActiveNote({ octave: newOct }, false);
          playNote(activeNote.pitch, newOct, activeNote.accidental, score.keySignature, activeNote.duration, score.tempo || 70);
          pendingOctaveRef.current = newOct;
        } else {
          // 当前位置为占位符：前置预设当前位置的录入八度（按一下高一+1，连按两下高二+2；向下同理-1, -2）
          if (isUp) {
            pendingOctaveRef.current = pendingOctaveRef.current <= 0 ? 1 : Math.min(2, pendingOctaveRef.current + 1);
          } else {
            pendingOctaveRef.current = pendingOctaveRef.current >= 0 ? -1 : Math.max(-2, pendingOctaveRef.current - 1);
          }
        }
        return;
      }

      // 5. 1~7 输入音符
      let numPitch: number | null = null;
      if (key >= '1' && key <= '7') {
        numPitch = parseInt(key);
      } else if (e.code.startsWith('Numpad')) {
        const num = parseInt(e.code.replace('Numpad', ''));
        if (num >= 1 && num <= 7) numPitch = num;
      }

      if (numPitch !== null) {
        e.preventDefault();
        const noteWasDotted = isDotted;
        const finalDuration = noteWasDotted ? currentDuration * 1.5 : currentDuration;
        if (isDotted) setIsDotted(false);

        const currentOctave = pendingOctaveRef.current !== 0 ? pendingOctaveRef.current : (activeNote?.octave || 0);
        const currentAccidental = pendingAccidentalRef.current !== null ? pendingAccidentalRef.current : (activeNote?.accidental || null);

        // 重置预选状态
        pendingOctaveRef.current = 0;
        pendingAccidentalRef.current = null;

        // 播放键盘敲击发音反馈
        playNote(numPitch, currentOctave, currentAccidental, score.keySignature, finalDuration, score.tempo || 70);

        updateActiveNote({ pitch: numPitch, octave: currentOctave, accidental: currentAccidental, duration: finalDuration, isDotted: noteWasDotted });
        return;
      }

      // 6. . 附点
      if (key === '.' || key === '。' || e.code === 'NumpadDecimal') {
        e.preventDefault();
        if (activeNote && activeNote.pitch >= 0) {
          const newDotted = !activeNote.isDotted;
          const undottedDur = activeNote.isDotted ? activeNote.duration / 1.5 : activeNote.duration;
          const newDuration = newDotted ? undottedDur * 1.5 : undottedDur;
          updateActiveNote({ isDotted: newDotted, duration: newDuration }, false);
          setIsDotted(false);
        } else {
          setIsDotted(!isDotted);
        }
        return;
      }

      // 7. ← 左移光标 / → 右移光标
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        pendingOctaveRef.current = 0;
        pendingAccidentalRef.current = null;
        if (!activeMeasureId || !activeNoteId) return;
        const allNotesList: { measureId: string; noteId: string }[] = [];
        for (const m of score.measures) {
          for (const n of m.notes) {
            allNotesList.push({ measureId: m.id, noteId: n.id });
          }
        }
        const currIdx = allNotesList.findIndex(item => item.noteId === activeNoteId);
        if (currIdx !== -1) {
          e.preventDefault();
          if (key === 'ArrowLeft' && currIdx > 0) {
            const prev = allNotesList[currIdx - 1];
            selectNote(prev.measureId, prev.noteId);
          } else if (key === 'ArrowRight' && currIdx < allNotesList.length - 1) {
            const next = allNotesList[currIdx + 1];
            selectNote(next.measureId, next.noteId);
          }
        }
        return;
      }

      // 8. Backspace / Delete 删除当前音符或回退删除上一音符
      if (key === 'Backspace' || key === 'Delete') {
        pendingOctaveRef.current = 0;
        pendingAccidentalRef.current = null;
        e.preventDefault();
        const allNotesList: { measureId: string; noteId: string; note: Note }[] = [];
        for (const m of score.measures) {
          for (const n of m.notes) {
            allNotesList.push({ measureId: m.id, noteId: n.id, note: n });
          }
        }
        const currIdx = allNotesList.findIndex(item => item.noteId === activeNoteId);
        if (currIdx !== -1) {
          const currentItem = allNotesList[currIdx];
          if (currentItem.note.pitch !== -2) {
            // 当前音符有内容，重置为占位符
            updateActiveNote({ pitch: -2, octave: 0, accidental: null, isDotted: false }, false);
          } else if (currIdx > 0) {
            // 当前音符已是空白占位符，光标回退到上一个音符并将其清空
            const prevItem = allNotesList[currIdx - 1];
            selectNote(prevItem.measureId, prevItem.noteId);
            const prevMeasure = score.measures.find(m => m.id === prevItem.measureId);
            if (prevMeasure) {
              const updatedNotes = prevMeasure.notes.map(n =>
                n.id === prevItem.noteId ? { ...n, pitch: -2, octave: 0, accidental: null, isDotted: false } : n
              );
              setScore(prev => ({
                ...prev,
                measures: prev.measures.map(m => m.id === prevItem.measureId ? { ...m, notes: updatedNotes } : m)
              }));
            }
          }
        }
        return;
      }

      // 8. 快捷键 8 切换为 1/8 音符（八分音符，若已是 1/8 则切回 1/4）
      if (key === '8' || e.code === 'Numpad8') {
        e.preventDefault();
        const targetDuration = currentDuration === 0.5 ? 1.0 : 0.5;
        setCurrentDuration(targetDuration);
        if (activeNote && activeNote.pitch >= -1) {
          const newDur = activeNote.isDotted ? targetDuration * 1.5 : targetDuration;
          updateActiveNote({ duration: newDur }, false);
          if (activeNote.pitch > 0) {
            playNote(activeNote.pitch, activeNote.octave || 0, activeNote.accidental, score.keySignature, newDur, score.tempo || 70);
          }
        }
        return;
      }

      // 9. 快捷键 9 切换为 1/16 音符（十六分音符，若已是 1/16 则切回 1/4）
      if (key === '9' || e.code === 'Numpad9') {
        e.preventDefault();
        const targetDuration = currentDuration === 0.25 ? 1.0 : 0.25;
        setCurrentDuration(targetDuration);
        if (activeNote && activeNote.pitch >= -1) {
          const newDur = activeNote.isDotted ? targetDuration * 1.5 : targetDuration;
          updateActiveNote({ duration: newDur }, false);
          if (activeNote.pitch > 0) {
            playNote(activeNote.pitch, activeNote.octave || 0, activeNote.accidental, score.keySignature, newDur, score.tempo || 70);
          }
        }
        return;
      }

      // 10. 快捷键 \ 或 Alt+4 强制切回 1/4 音符（四分音符，时值 1.0）
      if (key === '\\' || key === '/' || (e.altKey && key === '4')) {
        e.preventDefault();
        setCurrentDuration(1.0);
        if (activeNote && activeNote.pitch >= -1) {
          const newDur = activeNote.isDotted ? 1.5 : 1.0;
          updateActiveNote({ duration: newDur }, false);
          if (activeNote.pitch > 0) {
            playNote(activeNote.pitch, activeNote.octave || 0, activeNote.accidental, score.keySignature, newDur, score.tempo || 70);
          }
        }
        return;
      }
    };
    window.addEventListener('keydown', handleScoreKeyDown);
    return () => window.removeEventListener('keydown', handleScoreKeyDown);
  }, [activeNote, updateActiveNote, isPreviewMode, currentDuration, setCurrentDuration, isDotted, setIsDotted, score.measures, score.keySignature, score.tempo, activeMeasureId, activeNoteId, selectNote, setScore]);

  // 更新字体设置（全面兼容历史无 annotationFont 的乐谱）
  const updateFont = (fontKey: string, field: keyof FontSettings, value: string | number) => {
    setScore(prev => {
      const defaultObj: FontSettings = fontKey === 'annotationFont'
        ? { fontFamily: '黑体', fontSize: 24, color: '#1e293b' }
        : { fontFamily: '黑体', fontSize: 16, color: '#101010' };
      const current = (prev[fontKey as keyof typeof prev] as FontSettings) || defaultObj;
      return {
        ...prev,
        [fontKey]: {
          ...current,
          [field]: value,
        }
      };
    });
  };

  // 计算曲谱当前最大歌词行数
  const maxLyricRows = Math.max(
    1,
    ...score.measures.map(m => {
      const annCount = m.lineAnnotations?.length || (m.lineAnnotation ? 1 : 0);
      const noteLyrCount = m.notes.reduce((max, n) => Math.max(max, n.lyrics?.length || (n.lyric ? 1 : 0)), 0);
      return Math.max(annCount, noteLyrCount);
    })
  );

  const focusLyricBeat = (targetNoteId: string) => {
    setActiveLyricBeatNoteId(targetNoteId);
    setTimeout(() => {
      const el = document.getElementById(`beat-lyric-input-${targetNoteId}`) as HTMLInputElement;
      if (el) {
        el.focus();
        el.select();
      }
    }, 30);
  };

  const handleBeatLyricKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    lineMeasures: Measure[],
    noteId: string,
    rowIndex: number
  ) => {
    if (e.nativeEvent.isComposing || (e as any).isComposing || isComposingRef.current) {
      return;
    }

    const lineNotes = lineMeasures.flatMap(m => m.notes);
    const curIdx = lineNotes.findIndex(n => n.id === noteId);

    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      // 实时推移：打空格，把当前音符后面的所有歌词往后推移一拍！
      const curNote = lineNotes[curIdx];
      const curLyr = (curNote?.lyrics && curNote.lyrics[rowIndex] !== undefined)
        ? curNote.lyrics[rowIndex]
        : (rowIndex === 0 ? (curNote?.lyric || '') : '');

      if (curLyr && curIdx + 1 < lineNotes.length) {
        // 当前音符有字，按空格推移后面的字，当前音符保留原字
        shiftLineLyricsRight(lineMeasures.map(m => m.id), lineNotes[curIdx + 1].id, rowIndex);
        focusLyricBeat(lineNotes[curIdx + 1].id);
      } else {
        // 当前音符为空或空拍，从当前位置向后整体推移
        shiftLineLyricsRight(lineMeasures.map(m => m.id), noteId, rowIndex);
        if (curIdx + 1 < lineNotes.length) {
          focusLyricBeat(lineNotes[curIdx + 1].id);
        }
      }
    } else if (e.key === 'Backspace') {
      const curVal = e.currentTarget.value;
      if (curVal === '' || (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0)) {
        e.preventDefault();
        // 实时拉回：按退格，把后面的歌词往前拉回一拍！
        shiftLineLyricsLeft(lineMeasures.map(m => m.id), noteId, rowIndex);
        if (curIdx > 0) {
          focusLyricBeat(lineNotes[curIdx - 1].id);
        }
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (curIdx !== -1 && curIdx + 1 < lineNotes.length) {
        focusLyricBeat(lineNotes[curIdx + 1].id);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (curIdx > 0) {
        focusLyricBeat(lineNotes[curIdx - 1].id);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (curIdx !== -1 && curIdx + 1 < lineNotes.length) {
        focusLyricBeat(lineNotes[curIdx + 1].id);
      }
    } else if (e.key === 'Escape') {
      setActiveLyricBeatNoteId(null);
    }
  };

  const handleBeatLyricInput = (
    lineMeasures: Measure[],
    noteId: string,
    value: string,
    rowIndex: number,
    fromCompositionEnd: boolean = false
  ) => {
    // 处于拼音选字输入中，先显示当前拼音，待确认后再分发
    if (isComposingRef.current && !fromCompositionEnd) {
      updateNoteLyric(noteId, value, rowIndex);
      return;
    }

    const tokens = parseLineLyricsInput(value);

    // 如果一个输入框中输入了多个词或带空格（如输入"你好"、"你 好"或粘贴一句话）
    if (tokens.length > 1) {
      // 自动把各个字和空格分散到各个节拍框中，绝对不塞在同一个框！
      pasteLyricsAtNote(noteId, value, rowIndex);
      const lineNotes = lineMeasures.flatMap(m => m.notes);
      const curIdx = lineNotes.findIndex(n => n.id === noteId);
      if (curIdx !== -1) {
        const nextIdx = Math.min(lineNotes.length - 1, curIdx + tokens.length);
        focusLyricBeat(lineNotes[nextIdx].id);
      }
      return;
    }

    // 单个字输入
    const singleToken = tokens[0] || '';
    updateNoteLyric(noteId, singleToken, rowIndex);

    if (singleToken.trim().length >= 1) {
      const hasChinese = /[\u4e00-\u9fa5]/.test(singleToken);
      if (hasChinese || fromCompositionEnd) {
        const lineNotes = lineMeasures.flatMap(m => m.notes);
        const curIdx = lineNotes.findIndex(n => n.id === noteId);
        if (curIdx !== -1 && curIdx + 1 < lineNotes.length) {
          focusLyricBeat(lineNotes[curIdx + 1].id);
        }
      }
    }
  };

  // A4 智能动态分页计算：根据歌词行数、行间距、字体大小与页边距动态计算，充分排满A4纸并保持底部安全距离
  const A4_TOTAL_HEIGHT = 1160; // A4 标准等比高度
  
  // 边距换算 (mm -> px, 1mm ≈ 3.78px)
  const topMarginPx = (score.pageMarginTop !== undefined ? score.pageMarginTop : 12) * 3.78;
  const bottomMarginPx = (score.pageMarginBottom !== undefined ? score.pageMarginBottom : 16) * 3.78;
  const footerReservedPx = 40; // 页码区占用高度
  const safetyBottomBuffer = 48; // 预留一行歌词以上的充足安全间隔，绝不压迫或重叠页码

  // 第一页头部总高度估算（标题、副标题、作者、调号、拍号、速度）
  const headerEstimateHeight = 135 + (score.subtitle ? 30 : 0) + (score.titleFont?.fontSize ? Math.max(0, score.titleFont.fontSize - 28) : 0);

  // 后续页面专属底部安全保护（预留至少 120px 充裕空隙，彻底杜绝与页码重叠）
  const otherPageSafetyBuffer = 120;

  // 计算第一页与后续页可用高度
  const page1AvailableHeight = Math.max(350, A4_TOTAL_HEIGHT - topMarginPx - bottomMarginPx - footerReservedPx - safetyBottomBuffer - headerEstimateHeight);
  const otherPageAvailableHeight = Math.max(350, A4_TOTAL_HEIGHT - topMarginPx - bottomMarginPx - footerReservedPx - otherPageSafetyBuffer);

  // 单行高度智能估算函数（精准匹配实际渲染尺寸）
  const estimateLineHeight = (lineMeasures: Measure[], lineIdx: number) => {
    const baseNoteHeight = 48 + (score.baseFontSize ? (score.baseFontSize - 18) * 1.5 : 0); // 音符主体 + 高低音点
    const lineSpacing = 22 + (score.lineHeight || 0.1) * 36; // 行间距 + 下边距
    
    // 统计当前行最大歌词行数
    let maxLyricRowsInLine = 0;
    lineMeasures.forEach(m => {
      m.notes.forEach(n => {
        const rows = n.lyrics?.length || (n.lyric ? 1 : 0);
        if (rows > maxLyricRowsInLine) maxLyricRowsInLine = rows;
      });
    });

    const hasAnnotation = lineMeasures.some(m => !!m.lineAnnotation || (m.lineAnnotations && m.lineAnnotations.length > 0));
    const showLyrics = hasLyricsMode || maxLyricRowsInLine > 0 || hasAnnotation || editingAnnotationLineIndex === lineIdx || activeTab === 'text';
    
    const lyricsHeight = showLyrics ? Math.max(1, maxLyricRowsInLine) * 30 + 6 : 0;
    return baseNoteHeight + lyricsHeight + lineSpacing;
  };

  const pages: { pageIndex: number; lines: { lineIndex: number; measures: Measure[] }[] }[] = [];
  let currentLineIdx = 0;

  // 第一页排版计算
  let p1UsedHeight = 0;
  const page1Lines: { lineIndex: number; measures: Measure[] }[] = [];
  while (currentLineIdx < lines.length) {
    const lHeight = estimateLineHeight(lines[currentLineIdx], currentLineIdx);
    if (page1Lines.length > 0 && p1UsedHeight + lHeight > page1AvailableHeight) {
      break; // 这一行放不下了，进入下一页，严格保护底部边距
    }
    page1Lines.push({ lineIndex: currentLineIdx, measures: lines[currentLineIdx] });
    p1UsedHeight += lHeight;
    currentLineIdx++;
  }
  pages.push({ pageIndex: 0, lines: page1Lines });

  // 后续各页排版计算
  while (currentLineIdx < lines.length) {
    let pUsedHeight = 0;
    const pageLines: { lineIndex: number; measures: Measure[] }[] = [];
    while (currentLineIdx < lines.length) {
      const lHeight = estimateLineHeight(lines[currentLineIdx], currentLineIdx);
      if (pageLines.length > 0 && pUsedHeight + lHeight > otherPageAvailableHeight) {
        break; // 这一行放不下，进入下一页
      }
      pageLines.push({ lineIndex: currentLineIdx, measures: lines[currentLineIdx] });
      pUsedHeight += lHeight;
      currentLineIdx++;
    }
    pages.push({ pageIndex: pages.length, lines: pageLines });
  }

  return (
    <div
      className={`score-editor ${isPreviewMode ? 'preview-mode' : ''}`}
      ref={editorRef}
      style={{
        fontSize: `${score.baseFontSize}px`,
        ...(isPreviewMode && previewZoom !== 1.0 ? {
          transform: `scale(${previewZoom})`,
          transformOrigin: 'top center'
        } : {})
      }}
    >

      {/* 右侧设置面板 */}
      {showSettings && !isPreviewMode && (
        <div className="settings-sidebar">
          <div className="settings-sidebar-header">
            <div className="settings-header-title">
              <span className="settings-header-icon">⚙️</span>
              <h3>乐谱设置</h3>
            </div>
            <button className="settings-close" onClick={() => setShowSettings(false)} title="关闭设置">×</button>
          </div>

          <div className="settings-tabs-container">
            <div className="settings-tabs-pill">
              <button
                className={`settings-pill-btn ${activeSettingsTab === 'notation' ? 'active' : ''}`}
                onClick={() => setActiveSettingsTab('notation')}
              >
                <span>🎵</span> 记谱
              </button>
              <button
                className={`settings-pill-btn ${activeSettingsTab === 'style' ? 'active' : ''}`}
                onClick={() => setActiveSettingsTab('style')}
              >
                <span>🎨</span> 样式
              </button>
            </div>
          </div>

          <div className="settings-sidebar-content">
            {activeSettingsTab === 'notation' && (
              <div className="settings-sections">
                {/* 基本信息 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('basicInfo')}>
                    <span>基本信息</span>
                    <span className={`expand-icon ${expandedSections.basicInfo ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.basicInfo && (
                    <div className="section-content">
                      <div className="form-group">
                        <label>标题</label>
                        <input type="text" value={score.title} onChange={e => setScore({ ...score, title: e.target.value })} placeholder="请输入标题" />
                      </div>
                      <div className="form-group">
                        <label>副标题</label>
                        <input type="text" value={score.subtitle} onChange={e => setScore({ ...score, subtitle: e.target.value })} placeholder="请输入副标题" />
                      </div>
                      <div className="form-group">
                        <label>作词/作曲</label>
                        <input type="text" value={score.author} onChange={e => setScore({ ...score, author: e.target.value })} placeholder="请输入作者" />
                      </div>
                    </div>
                  )}
                </div>

                {/* 调性与拍号 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('keyTime')}>
                    <span>调性与拍号</span>
                    <span className={`expand-icon ${expandedSections.keyTime ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.keyTime && (
                    <div className="section-content">
                      <div className="form-group">
                        <label>调号</label>
                        <div className="key-grid">
                          {keyOptions.map(k => (
                            <button key={k.value} className={`key-btn ${score.keySignature === `1=${k.value}` ? 'active' : ''}`} onClick={() => setScore({ ...score, keySignature: `1=${k.value}` })}>{k.label}</button>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label>拍号</label>
                        <div className="time-grid">
                          {timeSignatureOptions.map(t => (
                            <button key={t} className={`time-btn ${score.timeSignature === t ? 'active' : ''}`} onClick={() => handleTimeSignatureChange(t)}>{t}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 速度 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('tempo')}>
                    <span>速度</span>
                    <span className={`expand-icon ${expandedSections.tempo ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.tempo && (
                    <div className="section-content">
                      <div className="form-group checkbox-group">
                        <label>
                          <input type="checkbox" checked={score.showTempo} onChange={e => setScore({ ...score, showTempo: e.target.checked })} />
                          <span>显示速度标记</span>
                        </label>
                      </div>
                      {score.showTempo && (
                        <div className="form-group">
                          <label>BPM</label>
                          <input type="number" value={score.tempo || 120} onChange={e => setScore({ ...score, tempo: parseInt(e.target.value) || 120 })} min={20} max={300} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 小节 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('measures')}>
                    <span>小节</span>
                    <span className={`expand-icon ${expandedSections.measures ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.measures && (
                    <div className="section-content">
                      <div className="form-group">
                        <label>行小节数 (全谱生效)</label>
                        <select value={score.measuresPerLine} onChange={e => handleMeasuresPerLineChange(parseInt(e.target.value))}>
                          {measuresPerLineOptions.map(n => (
                            <option key={n} value={n}>{n} 小节 / 行</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSettingsTab === 'style' && (
              <div className="settings-sections">
                {/* 排版 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('layout')}>
                    <span>排版</span>
                    <span className={`expand-icon ${expandedSections.layout ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.layout && (
                    <div className="section-content">
                      <div className="form-group">
                        <label>页面宽度</label>
                        <div className="page-width-control">
                          <div className="page-width-slider-row">
                            <input
                              type="range"
                              min="600"
                              max="1400"
                              step="10"
                              value={score.pageWidth || 820}
                              onChange={e => setScore({ ...score, pageWidth: parseInt(e.target.value) || 820 })}
                            />
                            <span className="range-value">{score.pageWidth || 820}px</span>
                          </div>
                          <div className="page-width-presets">
                            {[
                              { label: '紧凑 (720)', value: 720 },
                              { label: 'A4标准 (820)', value: 820 },
                              { label: '宽屏 (980)', value: 980 },
                              { label: '超宽 (1160)', value: 1160 },
                            ].map(preset => (
                              <button
                                key={preset.value}
                                type="button"
                                className={`preset-chip ${score.pageWidth === preset.value ? 'active' : ''}`}
                                onClick={() => setScore({ ...score, pageWidth: preset.value })}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>行间距 (手动滑杆)</label>
                        <div className="page-width-control">
                          <div className="page-width-slider-row">
                            <input
                              type="range"
                              min="0"
                              max="1.5"
                              step="0.05"
                              value={score.lineHeight !== undefined ? score.lineHeight : 0.1}
                              onChange={e => setScore({ ...score, lineHeight: parseFloat(e.target.value) })}
                            />
                            <span className="range-value">{((score.lineHeight !== undefined ? score.lineHeight : 0.1) * 10).toFixed(1)} 档 ({(score.lineHeight || 0.1).toFixed(2)}x)</span>
                          </div>
                          <div className="page-width-presets">
                            {[
                              { label: '极紧凑 (0.0x)', value: 0 },
                              { label: '紧凑 (0.1x)', value: 0.1 },
                              { label: '标准 (0.3x)', value: 0.3 },
                              { label: '舒适 (0.6x)', value: 0.6 },
                              { label: '宽松 (1.0x)', value: 1.0 },
                            ].map(preset => (
                              <button
                                key={preset.value}
                                type="button"
                                className={`preset-chip ${Math.abs((score.lineHeight ?? 0.1) - preset.value) < 0.03 ? 'active' : ''}`}
                                onClick={() => setScore({ ...score, lineHeight: preset.value })}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>上下页边距 (手动滑杆)</label>
                        <div className="page-width-control">
                          <div className="page-width-slider-row">
                            <input
                              type="range"
                              min="0"
                              max="60"
                              step="2"
                              value={score.pageMarginTop !== undefined ? score.pageMarginTop : 12}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setScore({ ...score, pageMarginTop: val, pageMarginBottom: Math.round(val * 1.25) });
                              }}
                            />
                            <span className="range-value">{score.pageMarginTop ?? 12}px</span>
                          </div>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>左右页边距 (手动滑杆)</label>
                        <div className="page-width-control">
                          <div className="page-width-slider-row">
                            <input
                              type="range"
                              min="0"
                              max="50"
                              step="2"
                              value={score.pageMarginLeft !== undefined ? score.pageMarginLeft : 12}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setScore({ ...score, pageMarginLeft: val, pageMarginRight: val });
                              }}
                            />
                            <span className="range-value">{score.pageMarginLeft ?? 12}px</span>
                          </div>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>小节序号</label>
                        <select value={score.measureNumberStyle} onChange={e => setScore({ ...score, measureNumberStyle: e.target.value as 'first' | 'all' | 'none' })}>
                          <option value="first">每行第一小节显示</option>
                          <option value="all">所有小节显示</option>
                          <option value="none">不显示</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* 显示选项 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('displayOptions')}>
                    <span>显示选项</span>
                    <span className={`expand-icon ${expandedSections.displayOptions ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.displayOptions && (
                    <div className="section-content">
                      <div className="form-group checkbox-group">
                        <label>
                          <input type="checkbox" checked={score.showStartBarline} onChange={e => setScore({ ...score, showStartBarline: e.target.checked })} />
                          <span>显示行首小节线</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 字体样式 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('fontStyles')}>
                    <span>字体样式</span>
                    <span className={`expand-icon ${expandedSections.fontStyles ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.fontStyles && (
                    <div className="section-content">
                      {[
                        { key: 'titleFont', label: '标题', defaultVal: { fontFamily: '宋体', fontSize: 32, color: '#101010' } },
                        { key: 'subtitleFont', label: '副标题', defaultVal: { fontFamily: '宋体', fontSize: 16, color: '#101010' } },
                        { key: 'noteFont', label: '音符', defaultVal: { fontFamily: 'Times New Roman', fontSize: 36, color: '#101010' } },
                        { key: 'lyricFont', label: '歌词', defaultVal: { fontFamily: '黑体', fontSize: 36, color: '#101010' } },
                        { key: 'chordFont', label: '和弦', defaultVal: { fontFamily: '思源黑体', fontSize: 12, color: '#101010' } },
                        { key: 'annotationFont', label: '行首标注', defaultVal: { fontFamily: '黑体', fontSize: 24, color: '#1e293b' } },
                      ].map(({ key, label, defaultVal }) => {
                        const fontObj: FontSettings = (score[key as keyof typeof score] as FontSettings) || defaultVal;
                        return (
                          <div key={key} className="font-section">
                            <div className="font-section-header">{label}</div>
                            <div className="form-group">
                              <label>字体</label>
                              <select
                                value={fontObj.fontFamily || defaultVal.fontFamily}
                                onChange={e => updateFont(key, 'fontFamily', e.target.value)}
                              >
                                {fontOptions.map(f => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group">
                              <label>字号 (4档)</label>
                              <div className="font-size-grid">
                                {fontSizeOptions.map(size => (
                                  <button
                                    key={size}
                                    type="button"
                                    className={`font-size-btn ${fontObj.fontSize === size ? 'active' : ''}`}
                                    onClick={() => updateFont(key, 'fontSize', size)}
                                  >
                                    {size}px
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="form-group">
                              <label>文字颜色</label>
                              <div className="color-input">
                                <input
                                  type="color"
                                  value={fontObj.color || defaultVal.color}
                                  onChange={e => updateFont(key, 'color', e.target.value)}
                                />
                                <span>{fontObj.color || defaultVal.color}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 小节样式 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('measureStyles')}>
                    <span>小节样式</span>
                    <span className={`expand-icon ${expandedSections.measureStyles ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.measureStyles && (
                    <div className="section-content">
                      <div className="form-group">
                        <label>小节线大小</label>
                        <div className="slider-track">
                          <input
                            type="range"
                            min="1"
                            max="4"
                            step="1"
                            value={score.barlineSize}
                            onChange={e => setScore({ ...score, barlineSize: parseInt(e.target.value) })}
                          />
                          <div className="slider-marks">
                            {barlineSizeOptions.map(size => (
                              <span key={size} className="mark">{size}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>小节线颜色</label>
                        <div className="color-input">
                          <input
                            type="color"
                            value={score.barlineColor}
                            onChange={e => setScore({ ...score, barlineColor: e.target.value })}
                          />
                          <span>{score.barlineColor}</span>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>高低音点大小 (八度点)</label>
                        <div className="page-width-control">
                          <div className="page-width-slider-row">
                            <input
                              type="range"
                              min="2"
                              max="10"
                              step="0.5"
                              value={score.octaveDotSize || 6}
                              onChange={e => setScore({ ...score, octaveDotSize: parseFloat(e.target.value) || 6 })}
                            />
                            <span className="range-value">{score.octaveDotSize || 6}px</span>
                          </div>
                          <div className="page-width-presets">
                            {[
                              { label: '精细 (4px)', value: 4 },
                              { label: '标准 (6px)', value: 6 },
                              { label: '大号 (7.5px)', value: 7.5 },
                              { label: '特大 (9px)', value: 9 },
                            ].map(preset => (
                              <button
                                key={preset.value}
                                type="button"
                                className={`preset-chip ${Math.abs((score.octaveDotSize || 6) - preset.value) < 0.3 ? 'active' : ''}`}
                                onClick={() => setScore({ ...score, octaveDotSize: preset.value })}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 页码 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('pageNumber')}>
                    <span>页码</span>
                    <span className={`expand-icon ${expandedSections.pageNumber ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.pageNumber && (
                    <div className="section-content">
                      <div className="form-group checkbox-group">
                        <label>
                          <input type="checkbox" checked={score.showPageNumber} onChange={e => setScore({ ...score, showPageNumber: e.target.checked })} />
                          <span>显示页码</span>
                        </label>
                      </div>
                      {score.showPageNumber && (
                        <>
                          <div className="form-group">
                            <label>样式</label>
                            <select value={score.pageNumberStyle} onChange={e => setScore({ ...score, pageNumberStyle: e.target.value })}>
                              {pageNumberStyleOptions.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>字体</label>
                            <select
                              value={score.pageNumberFont.fontFamily}
                              onChange={e => setScore({ ...score, pageNumberFont: { ...score.pageNumberFont, fontFamily: e.target.value } })}
                            >
                              {fontOptions.map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>大小</label>
                            <input
                              type="range"
                              min="8"
                              max="24"
                              value={score.pageNumberFont.fontSize}
                              onChange={e => setScore({ ...score, pageNumberFont: { ...score.pageNumberFont, fontSize: parseInt(e.target.value) } })}
                            />
                            <span className="range-value">{score.pageNumberFont.fontSize}px</span>
                          </div>
                          <div className="form-group">
                            <label>颜色</label>
                            <div className="color-input">
                              <input
                                type="color"
                                value={score.pageNumberFont.color}
                                onChange={e => setScore({ ...score, pageNumberFont: { ...score.pageNumberFont, color: e.target.value } })}
                              />
                              <span>{score.pageNumberFont.color}</span>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>位置</label>
                            <select
                              value={score.pageNumberPosition}
                              onChange={e => setScore({ ...score, pageNumberPosition: e.target.value as 'left' | 'center' | 'right' })}
                            >
                              {pageNumberPositionOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 页面边距 */}
                <div className="settings-section">
                  <button className="section-header" onClick={() => toggleSection('pageMargin')}>
                    <span>页面边距</span>
                    <span className={`expand-icon ${expandedSections.pageMargin ? 'expanded' : ''}`}>▼</span>
                  </button>
                  {expandedSections.pageMargin && (
                    <div className="section-content">
                      <div className="margin-grid">
                        <div className="margin-cell">
                          <label>上</label>
                          <input type="number" value={score.pageMarginTop} onChange={e => setScore({ ...score, pageMarginTop: parseInt(e.target.value) || 0 })} min={0} max={100} />
                        </div>
                        <div className="margin-cell">
                          <label>下</label>
                          <input type="number" value={score.pageMarginBottom} onChange={e => setScore({ ...score, pageMarginBottom: parseInt(e.target.value) || 0 })} min={0} max={100} />
                        </div>
                        <div className="margin-cell">
                          <label>左</label>
                          <input type="number" value={score.pageMarginLeft} onChange={e => setScore({ ...score, pageMarginLeft: parseInt(e.target.value) || 0 })} min={0} max={100} />
                        </div>
                        <div className="margin-cell">
                          <label>右</label>
                          <input type="number" value={score.pageMarginRight} onChange={e => setScore({ ...score, pageMarginRight: parseInt(e.target.value) || 0 })} min={0} max={100} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="settings-sidebar-footer">
            <button className="btn-save" onClick={handleSave}>保存</button>
          </div>
        </div>
      )}

      {/* 保存成功提示 */}
      {saveMessage && (
        <div className="save-toast">{saveMessage}</div>
      )}

      {/* A4 纸张页面循环渲染 */}
      {pages.map((page) => (
        <div key={page.pageIndex} className="a4-page" style={{ maxWidth: `${score.pageWidth || 820}px` }}>
          <div
            className="a4-page-content"
            style={{
              padding: `${score.pageMarginTop}mm ${score.pageMarginRight}mm ${score.pageMarginBottom}mm ${score.pageMarginLeft}mm`
            }}
          >
            <svg className="score-svg-overlay">
              {(pageSvgLines[page.pageIndex] || []).map(line => (
                <path key={line.id} d={line.path} fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" />
              ))}
            </svg>

            {/* 第一页显示乐谱标题与元信息 */}
            {page.pageIndex === 0 && (
              <div className="score-header" onClick={() => !isPreviewMode && setShowSettings(true)}>
                <h1 className="score-title" style={{ fontFamily: score.titleFont.fontFamily, fontSize: `${score.titleFont.fontSize}px`, color: score.titleFont.color }}>{score.title}</h1>
                {score.subtitle && <h2 className="score-subtitle" style={{ fontFamily: score.subtitleFont.fontFamily, fontSize: `${score.subtitleFont.fontSize}px`, color: score.subtitleFont.color }}>{score.subtitle}</h2>}

                <div className="score-meta">
                  <div className="score-meta-left">
                    <span className="score-key-display">
                      <span className="key-prefix">1=</span>
                      <span className="key-note-wrapper">
                        {keyDisplay.accidental && <span className="key-accidental">{keyDisplay.accidental}</span>}
                        <span className="key-note">{keyDisplay.note}</span>
                      </span>
                    </span>
                    <span className="score-time-display">
                      <span className="time-top">{timeDisplay.top}</span>
                      <span className="time-bottom">{timeDisplay.bottom}</span>
                    </span>
                    {score.showTempo && <span className="score-tempo">♩={score.tempo}</span>}
                  </div>
                  <div className="score-meta-right">
                    {score.author && <span className="score-author">{score.author}</span>}
                  </div>
                </div>
              </div>
            )}

            <div className="lines-container" style={{ gap: `${20 + score.lineHeight * 20}px` }}>
              {page.lines.map(({ lineIndex, measures: line }) => {
                const hasLineLyrics = line.some(m => m.notes.some(n => !!n.lyric));
                const hasLineAnnotation = !!line[0]?.lineAnnotation;
                const showLyricsRow = hasLyricsMode || hasLineLyrics || hasLineAnnotation || editingAnnotationLineIndex === lineIndex || activeTab === 'text';

                return (
                  <div key={lineIndex} className="score-line" style={{ marginBottom: `${score.lineHeight * 16}px` }}>
                    {/* 音符与小节线行 */}
                    <div className="score-line-measures">
                      {score.showStartBarline && (
                        <div className="barline start-barline" style={{ fontSize: `${getBarlineSize(score.barlineSize)}em`, color: score.barlineColor }}>|</div>
                      )}

                      {line.map((measure, measureIndex) => {
                        const isSelectedInMeasureMode = activeTab === 'measures' && (
                          selectedMeasureIds.includes(measure.id) || activeMeasureId === measure.id
                        );
                        const isEditingInNoteMode = activeTab === 'notes' && activeMeasureId === measure.id;

                        let measureClassName = 'measure';
                        if (!isPreviewMode && isEditingInNoteMode) {
                          measureClassName += ' in-note-mode';
                        } else if (!isPreviewMode && isSelectedInMeasureMode) {
                          measureClassName += isMultiSelectMode && selectedMeasureIds.includes(measure.id)
                            ? ' multi-selected'
                            : ' active-measure-selected';
                        }

                        const showActionToolbar = !isPreviewMode && activeTab === 'measures' && (
                          (isMultiSelectMode && selectedMeasureIds.length > 0 && selectedMeasureIds[0] === measure.id) ||
                          (!isMultiSelectMode && activeMeasureId === measure.id)
                        );

                        const handleSelectMeasure = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          setActiveTab('measures');
                          if (isMultiSelectMode) {
                            const anchorId = activeMeasureId || (selectedMeasureIds.length > 0 ? selectedMeasureIds[0] : measure.id);
                            const anchorIdx = score.measures.findIndex(m => m.id === anchorId);
                            const clickedIdx = score.measures.findIndex(m => m.id === measure.id);
                            if (anchorIdx !== -1 && clickedIdx !== -1) {
                              const start = Math.min(anchorIdx, clickedIdx);
                              const end = Math.max(anchorIdx, clickedIdx);
                              setSelectedMeasureIds(score.measures.slice(start, end + 1).map(m => m.id));
                            } else {
                              setSelectedMeasureIds([measure.id]);
                            }
                          } else {
                            setActiveMeasureId(measure.id);
                            setSelectedMeasureIds([measure.id]);
                          }
                        };

                        return (
                          <div
                            key={measure.id}
                            className={measureClassName}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('.note-block')) return;
                              handleSelectMeasure(e);
                            }}
                          >
                            {/* 小节操作浮条 */}
                            {showActionToolbar && (
                              <div className="measure-action-toolbar" onClick={e => e.stopPropagation()}>
                                {!isMultiSelectMode ? (
                                  <button
                                    className="measure-action-btn"
                                    onClick={() => {
                                      setIsMultiSelectMode(true);
                                      setSelectedMeasureIds([measure.id]);
                                    }}
                                    title="点击开启多选，再点击其他小节选择区间"
                                  >
                                    多选
                                  </button>
                                ) : (
                                  <>
                                    <span className="measure-action-badge">
                                      已选 {selectedMeasureIds.length} 节
                                    </span>
                                    <button
                                      className="measure-action-btn cancel-btn"
                                      onClick={() => {
                                        setIsMultiSelectMode(false);
                                        setSelectedMeasureIds([]);
                                      }}
                                      title="取消多选"
                                    >
                                      取消
                                    </button>
                                  </>
                                )}
                                <button
                                  className="measure-action-btn"
                                  onClick={() => {
                                    const idsToCopy = isMultiSelectMode && selectedMeasureIds.length > 0
                                      ? selectedMeasureIds
                                      : [measure.id];
                                    const measuresToCopy = score.measures.filter(m => idsToCopy.includes(m.id));
                                    setCopiedMeasures(measuresToCopy);
                                    setSaveMessage(`已复制 ${measuresToCopy.length} 个小节`);
                                    if (isMultiSelectMode) {
                                      setIsMultiSelectMode(false);
                                      setSelectedMeasureIds([]);
                                    }
                                    setTimeout(() => setSaveMessage(''), 1200);
                                  }}
                                  title="复制选中的小节"
                                >
                                  复制
                                </button>
                                <button
                                  className={`measure-action-btn ${!copiedMeasures ? 'disabled' : ''}`}
                                  disabled={!copiedMeasures}
                                  onClick={() => {
                                    if (copiedMeasures && copiedMeasures.length > 0) {
                                      pasteMeasures(measure.id, copiedMeasures);
                                      setSaveMessage(`已粘贴 ${copiedMeasures.length} 个小节`);
                                      setTimeout(() => setSaveMessage(''), 1200);
                                    }
                                  }}
                                  title={copiedMeasures ? `粘贴 ${copiedMeasures.length} 个小节到此处` : '暂无复制内容'}
                                >
                                  粘贴
                                </button>
                              </div>
                            )}

                            {/* 小节序号 */}
                            {(score.measureNumberStyle === 'all' || (score.measureNumberStyle === 'first' && measureIndex === 0)) && (
                              <div className="measure-number" onClick={handleSelectMeasure}>{score.measures.indexOf(measure) + 1}</div>
                            )}

                            {measure.barlineLeft === 'repeat-start' && (
                              <div className="barline repeat-start-barline" onClick={handleSelectMeasure} style={{ color: score.barlineColor }}>
                                <span className="bar-thick"></span>
                                <span className="bar-thin"></span>
                                <span className="repeat-dots">
                                  <span className="dot"></span>
                                  <span className="dot"></span>
                                </span>
                              </div>
                            )}

                              <div className="measure-voices-container">
                                {/* 第一声部 (Voice 1) */}
                                <div className={`measure-voice-row measure-voice-1 ${activeVoice === 1 && !isPreviewMode ? 'active-voice-row' : ''}`}>
                                  {score.hasSecondVoice && (
                                    <span className="voice-prefix-tag" onClick={() => selectNote(measure.id, measure.notes[0]?.id, 1)}>
                                      {score.voice1Name || '1部'}
                                    </span>
                                  )}
                                  <div className="measure-notes">
                                    {(() => {
                                      const notes = measure.notes;
                                      let currentBeatSum = 0;

                                      return notes.map((note) => {
                                        currentBeatSum += note.duration;
                                        const isBeatEnd = Math.abs(currentBeatSum - Math.round(currentBeatSum)) < 0.001;
                                        return (
                                          <NoteBlock
                                            key={note.id}
                                            note={note}
                                            isActive={!isPreviewMode && activeTab === 'notes' && activeNoteId === note.id}
                                            isPlaying={playingNoteId === note.id}
                                            noteFont={score.noteFont}
                                            chordFont={score.chordFont}
                                            showChords={score.showChords}
                                            octaveDotSize={score.octaveDotSize || 6}
                                            isBeatEnd={isBeatEnd}
                                            isPreviewMode={isPreviewMode}
                                            onClick={() => {
                                              selectNote(measure.id, note.id, 1);
                                              if (!isPreviewMode) {
                                                if (activeTab !== 'text' && activeTab !== 'chords') {
                                                  setActiveTab('notes');
                                                }
                                                if (isMultiSelectMode) {
                                                  setIsMultiSelectMode(false);
                                                  setSelectedMeasureIds([]);
                                                }
                                              }
                                            }}
                                          />
                                        );
                                      });
                                    })()}
                                  </div>
                                </div>

                                {/* 第二声部 (Voice 2) */}
                                {score.hasSecondVoice && measure.secondVoiceNotes && (
                                  <div className={`measure-voice-row measure-voice-2 ${activeVoice === 2 && !isPreviewMode ? 'active-voice-row' : ''}`}>
                                    <span className="voice-prefix-tag" onClick={() => selectNote(measure.id, measure.secondVoiceNotes![0]?.id, 2)}>
                                      {score.voice2Name || '2部'}
                                    </span>
                                    <div className="measure-notes">
                                      {(() => {
                                        const notes = measure.secondVoiceNotes;
                                        let currentBeatSum = 0;

                                        return notes.map((note) => {
                                          currentBeatSum += note.duration;
                                          const isBeatEnd = Math.abs(currentBeatSum - Math.round(currentBeatSum)) < 0.001;
                                          return (
                                            <NoteBlock
                                              key={note.id}
                                              note={note}
                                              isActive={!isPreviewMode && activeTab === 'notes' && activeNoteId === note.id}
                                              isPlaying={playingNoteId === note.id}
                                              noteFont={score.noteFont}
                                              chordFont={score.chordFont}
                                              showChords={false}
                                              octaveDotSize={score.octaveDotSize || 6}
                                              isBeatEnd={isBeatEnd}
                                              isPreviewMode={isPreviewMode}
                                              onClick={() => {
                                                selectNote(measure.id, note.id, 2);
                                                if (!isPreviewMode) {
                                                  if (activeTab !== 'text' && activeTab !== 'chords') {
                                                    setActiveTab('notes');
                                                  }
                                                  if (isMultiSelectMode) {
                                                    setIsMultiSelectMode(false);
                                                    setSelectedMeasureIds([]);
                                                  }
                                                }
                                              }}
                                            />
                                          );
                                        });
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            
                            {measure.barlineRight === 'repeat-end' ? (
                              <div className="barline repeat-end-barline" style={{ color: score.barlineColor }}>
                                <span className="repeat-dots">
                                  <span className="dot"></span>
                                  <span className="dot"></span>
                                </span>
                                <span className="bar-thin"></span>
                                <span className="bar-thick"></span>
                              </div>
                            ) : measure.barlineRight === 'end' ? (
                              <div className="barline end-barline" style={{ color: score.barlineColor }}>
                                <span className="end-bar-thin"></span>
                                <span className="end-bar-thick"></span>
                              </div>
                            ) : (
                              <div className="barline" style={{ fontSize: `${getBarlineSize(score.barlineSize)}em`, color: score.barlineColor }}>|</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 歌词行区域 (支持多行歌词与整行文本快速排版) */}
                    {showLyricsRow && (
                      <div className="score-line-lyrics-container">
                        {Array.from({ length: maxLyricRows }).map((_, rowIndex) => {
                          const rowAnnotation = line[0]?.lineAnnotations?.[rowIndex] !== undefined
                            ? line[0].lineAnnotations[rowIndex]
                            : (rowIndex === 0 ? (line[0]?.lineAnnotation || '') : '');
                          const defaultNum = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][rowIndex] || `${rowIndex + 1}.`;

                          return (
                            <div key={`lyric-row-${lineIndex}-${rowIndex}`} className="score-line-lyrics-row">
                              {/* 行首标注 */}
                              <div className="line-annotation-anchor">
                                {!isPreviewMode && editingAnnotationLineIndex === lineIndex && editingLyricRow === rowIndex ? (
                                  <input
                                    className="line-annotation-plain-input"
                                    autoFocus
                                    value={rowAnnotation}
                                    placeholder="标注"
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                      fontFamily: score.annotationFont?.fontFamily || '黑体',
                                      fontSize: `${score.annotationFont?.fontSize || 24}px`,
                                      color: score.annotationFont?.color || '#1e293b'
                                    }}
                                    onChange={e => {
                                      if (line[0]) updateLineAnnotation(line[0].id, e.target.value, rowIndex);
                                    }}
                                    onBlur={() => setEditingAnnotationLineIndex(null)}
                                    onKeyDown={e => {
                                      if (e.nativeEvent.isComposing || (e as any).isComposing) return;
                                      if (e.key === 'Enter' || e.key === 'Escape') {
                                        setEditingAnnotationLineIndex(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <span
                                    className="line-annotation-plain-text"
                                    onClick={e => {
                                      if (isPreviewMode) return;
                                      e.stopPropagation();
                                      setActiveTab('text');
                                      setEditingLyricRow(rowIndex);
                                      setEditingAnnotationLineIndex(lineIndex);
                                    }}
                                    style={{
                                      fontFamily: score.annotationFont?.fontFamily || '黑体',
                                      fontSize: `${score.annotationFont?.fontSize || 24}px`,
                                      color: score.annotationFont?.color || '#1e293b'
                                    }}
                                    title={isPreviewMode ? '' : `点击修改第 ${rowIndex + 1} 段行首标记`}
                                  >
                                    {rowAnnotation || (!isPreviewMode && activeTab === 'text' ? defaultNum : '')}
                                  </span>
                                )}
                              </div>

                              {/* 实时一字一拍对齐歌词行 */}
                              <div className="score-line-lyrics-content">
                                {line.map(measure => (
                                  <div
                                    key={measure.id}
                                    className="measure-lyrics-block"
                                    style={{ flex: measure.notes.reduce((s, n) => s + n.duration, 0) }}
                                  >
                                    {measure.notes.map(note => {
                                      const isFocused = !isPreviewMode && activeLyricBeatNoteId === note.id && editingLyricRow === rowIndex;
                                      const noteLyric = (note.lyrics && note.lyrics[rowIndex] !== undefined)
                                        ? note.lyrics[rowIndex]
                                        : (rowIndex === 0 ? (note.lyric || '') : '');
                                      const { charPart, punctPart } = splitCharAndPunct(noteLyric);

                                      return (
                                        <div
                                          key={note.id}
                                          className={`note-lyric-cell ${isFocused ? 'active-lyric-cell' : ''}`}
                                          style={{ flex: note.duration }}
                                          onClick={(e) => {
                                            if (isPreviewMode) return;
                                            e.stopPropagation();
                                            setActiveTab('text');
                                            setEditingLyricRow(rowIndex);
                                            focusLyricBeat(note.id);
                                          }}
                                        >
                                          {isFocused ? (
                                            <input
                                              id={`beat-lyric-input-${note.id}`}
                                              className="beat-lyric-input"
                                              autoFocus
                                              value={noteLyric}
                                              placeholder=""
                                              onClick={e => e.stopPropagation()}
                                              onPaste={e => {
                                                e.preventDefault();
                                                const text = e.clipboardData.getData('text');
                                                pasteLyricsAtNote(note.id, text, rowIndex);
                                              }}
                                              onCompositionStart={() => { isComposingRef.current = true; }}
                                              onCompositionEnd={(e) => {
                                                isComposingRef.current = false;
                                                handleBeatLyricInput(line, note.id, e.currentTarget.value, rowIndex, true);
                                              }}
                                              onChange={(e) => {
                                                handleBeatLyricInput(line, note.id, e.target.value, rowIndex, false);
                                              }}
                                              onKeyDown={(e) => handleBeatLyricKeyDown(e, line, note.id, rowIndex)}
                                              style={{
                                                fontFamily: score.lyricFont.fontFamily,
                                                fontSize: `${score.lyricFont.fontSize * 0.75}px`,
                                                color: score.lyricFont.color
                                              }}
                                            />
                                          ) : (
                                            <span
                                              className={`beat-lyric-text ${!noteLyric ? 'empty-beat' : ''}`}
                                              style={{
                                                fontFamily: score.lyricFont.fontFamily,
                                                fontSize: `${score.lyricFont.fontSize * 0.75}px`,
                                                color: score.lyricFont.color
                                              }}
                                            >
                                              <span className="beat-char-wrapper">
                                                <span className="beat-char-main">{charPart || (!isPreviewMode && activeTab === 'text' ? ' ' : '')}</span>
                                                {punctPart && <span className="beat-char-punct">{punctPart}</span>}
                                              </span>
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        {/* 多行歌词添加与管理按钮 */}
                        {!isPreviewMode && activeTab === 'text' && (
                          <div className="add-lyric-row-container">
                            <button
                              className="add-lyric-row-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                addLyricRow();
                              }}
                            >
                              + 增加歌词行 (第 {maxLyricRows + 1} 段)
                            </button>
                            {maxLyricRows > 1 && (
                              <button
                                className="delete-lyric-row-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteLyricRow(maxLyricRows - 1);
                                }}
                              >
                                - 删除最后一段歌词
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 新增一行与新增一页按钮 (位于最后一页乐谱末尾) */}
            {!isPreviewMode && page.pageIndex === pages.length - 1 && (
              <div className="add-lines-container">
                <button className="add-line-btn" onClick={handleAddLine} title="在曲谱末尾新增一行小节">
                  + 新增一行
                </button>
                <button className="add-page-btn" onClick={handleAddPage} title="在曲谱末尾新增一整页小节">
                  + 新增一页
                </button>
              </div>
            )}
          </div>

          {/* 底部页码 (放在A4纸最底下) */}
          {score.showPageNumber && (
            <div
              className="a4-page-footer"
              style={{
                textAlign: (score.pageNumberPosition as any) || 'center',
                paddingLeft: `${score.pageMarginLeft || 8}mm`,
                paddingRight: `${score.pageMarginRight || 8}mm`
              }}
            >
              <span
                className="page-number"
                style={{
                  fontFamily: score.pageNumberFont.fontFamily,
                  fontSize: `${score.pageNumberFont.fontSize}px`,
                  color: score.pageNumberFont.color
                }}
              >
                {score.pageNumberStyle === '1/2'
                  ? `${page.pageIndex + 1}/${pages.length}`
                  : score.pageNumberStyle === '1'
                  ? `${page.pageIndex + 1}`
                  : score.pageNumberStyle === '-1-'
                  ? `- ${page.pageIndex + 1} -`
                  : `第 ${page.pageIndex + 1} 页 / 共 ${pages.length} 页`}
              </span>
            </div>
          )}
        </div>
      ))}

      {/* 悬浮排版与间距设置快捷按钮 */}
      {!isPreviewMode && !showSettings && (
        <button
          className={`floating-settings-trigger-btn ${activeTab === 'notes' ? 'with-keyboard' : ''}`}
          onClick={() => {
            setActiveSettingsTab('style');
            setShowSettings(true);
            setExpandedSections(prev => ({ ...prev, layout: true }));
          }}
          title="打开排版与间距滑杆设置"
        >
          <span className="icon">⚙️</span>
          <span className="label">排版与间距滑杆</span>
        </button>
      )}
    </div>
  );
};

const NoteBlock = ({
  note,
  isActive,
  isPlaying,
  noteFont,
  chordFont,
  showChords = true,
  octaveDotSize = 6,
  isBeatEnd,
  isPreviewMode,
  onClick
}: {
  note: Note;
  isActive: boolean;
  isPlaying: boolean;
  noteFont: FontSettings;
  chordFont?: FontSettings;
  showChords?: boolean;
  octaveDotSize?: number;
  isBeatEnd: boolean;
  isPreviewMode?: boolean;
  onClick: () => void;
}) => {
  const isPlaceholder = note.pitch === -2;
  const isExtension = note.pitch === -1;

  return (
    <div
      id={`note-${note.id}`}
      className={`note-block ${isActive && !isPreviewMode ? 'active-note' : ''} ${isPlaying ? 'playing-note' : ''} ${isBeatEnd ? 'beat-end' : ''}`}
      onClick={onClick}
      style={{ flex: note.duration }}
    >
      <div className="note-core">
        {/* 和弦符号显示 (Chord Symbol) - 统一定位在最高层，绝不与连音线/高音点重叠 */}
        {showChords !== false && note.chord && (
          <div
            className="note-chord-badge"
            style={{
              fontFamily: chordFont?.fontFamily || 'Arial, sans-serif',
              fontSize: `${chordFont?.fontSize || 16}px`,
              color: chordFont?.color || '#2563eb',
              bottom: `calc(100% + ${18 + Math.max(0, (note.octave || 0) * 7)}px)`
            }}
          >
            {note.chord}
          </div>
        )}

        {note.accidental && !isPlaceholder && !isExtension && (
          <span className="accidental">
            {note.accidental === '#' ? '♯' : note.accidental === 'b' ? '♭' : note.accidental}
          </span>
        )}

        {note.octave > 0 && note.pitch > 0 && (
          <div className="octave-dots top">
            {Array.from({ length: note.octave }).map((_, i) => (
              <span
                key={i}
                className="dot"
                style={{
                  width: `${octaveDotSize}px`,
                  height: `${octaveDotSize}px`,
                  backgroundColor: noteFont.color || 'currentColor'
                }}
              ></span>
            ))}
          </div>
        )}

        {isPlaceholder ? (
          <span className="pitch placeholder-dash" style={{ color: isPreviewMode ? 'transparent' : 'red', visibility: isPreviewMode ? 'hidden' : 'visible' }}>_</span>
        ) : isExtension ? (
          <span className="pitch extension-dash" style={{ fontFamily: noteFont.fontFamily, fontSize: `${noteFont.fontSize}px`, color: noteFont.color, fontWeight: 'bold' }}>-</span>
        ) : (
          <span className="pitch" style={{ fontFamily: noteFont.fontFamily, fontSize: `${noteFont.fontSize}px`, color: noteFont.color }}>
            {note.pitch === 0 ? '0' : note.pitch}
          </span>
        )}

        {note.isDotted && !isPlaceholder && !isExtension && <span className="duration-dot"></span>}

        {note.octave < 0 && note.pitch > 0 && (
          <div className="octave-dots bottom">
            {Array.from({ length: Math.abs(note.octave) }).map((_, i) => (
              <span
                key={i}
                className="dot"
                style={{
                  width: `${octaveDotSize}px`,
                  height: `${octaveDotSize}px`,
                  backgroundColor: noteFont.color || 'currentColor'
                }}
              ></span>
            ))}
          </div>
        )}

        {/* 减时线下划线：1/8 音符 1 条线，1/16 音符 2 条线，1/32 音符 3 条线，1/64 音符 4 条线 */}
        {!isPlaceholder && !isExtension && note.duration <= 0.75 && (
          <div className="duration-lines">
            <div className="duration-line" style={{ backgroundColor: noteFont.color || '#101010' }}></div>
            {note.duration <= 0.375 && (
              <div className="duration-line" style={{ backgroundColor: noteFont.color || '#101010' }}></div>
            )}
            {note.duration <= 0.1875 && (
              <div className="duration-line" style={{ backgroundColor: noteFont.color || '#101010' }}></div>
            )}
            {note.duration <= 0.09375 && (
              <div className="duration-line" style={{ backgroundColor: noteFont.color || '#101010' }}></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
