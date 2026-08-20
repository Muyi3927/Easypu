import { useState, useRef, useEffect } from 'react';
import './Toolbar.css';
import { useEditor } from '../context/EditorContext';
import { useScore } from '../context/ScoreContext';
import { playNote, playChord } from '../utils/audio';
import { getDiatonicChordsForKey, CHORD_PROGRESSION_TEMPLATES, resolveProgressionToChordNames } from '../utils/chord';
import type { Measure, Note } from '../types';

export const Toolbar = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef(false);

  const {
    currentDuration,
    setCurrentDuration,
    isDotted,
    setIsDotted,
    activeTab,
    setActiveTab,
    setEditingLyricsLineIndex,
    setEditingLyricRow,
    editingLyricRow,
    setEditingAnnotationLineIndex,
    setHasLyricsMode
  } = useEditor();

  const {
    score,
    activeMeasureId,
    activeNoteId,
    activeVoice,
    setActiveVoice,
    toggleSecondVoice,
    updateActiveNote,
    setMeasuresPerLine,
    toggleSlurStart,
    toggleSlurEnd,
    insertMeasureAfter,
    insertLine,
    deleteLine,
    insertPage,
    deleteMeasure,
    toggleBreak,
    moveLineUp,
    toggleRepeatStart,
    toggleRepeatEnd,
    toggleEndBarline,
    setNormalBarline,
    setPlayingNoteId,
    addLyricRow,
    deleteLyricRow,
    updateNoteChord,
    applyProgressionToScore,
    clearAllChords,
    setScore
  } = useScore();

  const seekTargetNoteIdRef = useRef<string | null>(null);
  const interruptSleepRef = useRef<(() => void) | null>(null);
  const prevActiveNoteIdRef = useRef<string | null>(activeNoteId);

  // 监听播放中的音符点击跳转 (Seek)
  useEffect(() => {
    // 仅在已处于播放状态下、且 activeNoteId 确实被用户点击改变时才触发跳转
    if (isPlaying && activeNoteId && prevActiveNoteIdRef.current !== activeNoteId) {
      seekTargetNoteIdRef.current = activeNoteId;
      if (interruptSleepRef.current) {
        interruptSleepRef.current();
      }
    }
    prevActiveNoteIdRef.current = activeNoteId;
  }, [activeNoteId, isPlaying]);

  const stopScore = () => {
    playRef.current = false;
    if (interruptSleepRef.current) {
      interruptSleepRef.current();
    }
    setIsPlaying(false);
    setPlayingNoteId(null);
  };

  const playScore = async () => {
    if (isPlaying) return;
    seekTargetNoteIdRef.current = null;
    setIsPlaying(true);
    playRef.current = true;

    // 1. 展平全谱所有小节的音符列表
    const allNotes: Note[] = [];
    score.measures.forEach(m => {
      m.notes.forEach(n => {
        allNotes.push(n);
      });
    });

    if (allNotes.length === 0) {
      setIsPlaying(false);
      playRef.current = false;
      return;
    }

    // 辅助计算单个音符的实际节拍数 (精确计算附点 1.5x)
    const getNoteBeats = (n: Note): number => {
      const dur = n.duration || 1.0;
      if (n.isDotted) {
        if (dur === 1.0 || dur === 0.5 || dur === 0.25 || dur === 0.125 || dur === 0.0625) {
          return dur * 1.5;
        }
      }
      return dur;
    };

    // 分析音符轨道的延音线与同音连音线 (Tie)
    const analyzeTrackTies = (notesList: Note[]) => {
      const isTied = new Array(notesList.length).fill(false);
      const tiedDur = new Array(notesList.length).fill(0);
      let inSlur = false;
      let slurHeadIndex = -1;

      for (let i = 0; i < notesList.length; i++) {
        const note = notesList[i];
        if (note.pitch === -1 && i > 0) isTied[i] = true;
        if (note.slurStart || note.tieStart) { inSlur = true; slurHeadIndex = i; }
        if (inSlur && i > 0 && slurHeadIndex !== -1 && i > slurHeadIndex) {
          const prevNote = notesList[i - 1];
          if (
            note.pitch > 0 &&
            note.pitch === prevNote.pitch &&
            (note.octave || 0) === (prevNote.octave || 0) &&
            (note.accidental || null) === (prevNote.accidental || null)
          ) {
            isTied[i] = true;
          } else if (note.pitch > 0) {
            slurHeadIndex = i;
          }
        }
        if (note.slurEnd || note.tieEnd) { inSlur = false; slurHeadIndex = -1; }
      }

      for (let i = 0; i < notesList.length; i++) {
        if (!isTied[i] && notesList[i].pitch > 0) {
          let totalBeats = getNoteBeats(notesList[i]);
          let j = i + 1;
          while (j < notesList.length && isTied[j]) {
            totalBeats += getNoteBeats(notesList[j]);
            j++;
          }
          tiedDur[i] = totalBeats;
        }
      }
      return { isTied, tiedDur };
    };

    const tempo = score.tempo || 120;
    const beatDurationSecs = 60 / tempo;

    const interruptibleSleep = (ms: number) => {
      return new Promise<void>(resolve => {
        let timer: any = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          interruptSleepRef.current = null;
          resolve();
        };
        interruptSleepRef.current = cleanup;
        timer = setTimeout(cleanup, ms);
      });
    };

    // 展平第一声部音符
    const allVoice1Notes: Note[] = [];
    score.measures.forEach(m => {
      m.notes.forEach(n => allVoice1Notes.push(n));
    });
    const v1Analysis = analyzeTrackTies(allVoice1Notes);

    // 展平第二声部音符 (如果开启了第二声部)
    const allVoice2Notes: Note[] = [];
    if (score.hasSecondVoice) {
      score.measures.forEach(m => {
        (m.secondVoiceNotes || []).forEach(n => allVoice2Notes.push(n));
      });
    }
    const v2Analysis = analyzeTrackTies(allVoice2Notes);

    let currentMi = 0;
    let currentStartBeatInMeasure = 0;

    // 逐个小节进行双轨多复音时间分片播放 (支持点击任意音符即时 Seek 跳转)
    while (currentMi < score.measures.length && playRef.current) {
      // 检查是否有外部点击发起的即时跳转 (Seek)
      if (seekTargetNoteIdRef.current) {
        const targetId = seekTargetNoteIdRef.current;
        seekTargetNoteIdRef.current = null;

        let foundMi = -1;
        let foundStartBeat = 0;

        for (let mi = 0; mi < score.measures.length; mi++) {
          const m = score.measures[mi];
          let t1 = 0;
          for (const n of m.notes) {
            if (n.id === targetId) {
              foundMi = mi;
              foundStartBeat = t1;
              break;
            }
            t1 += getNoteBeats(n);
          }
          if (foundMi !== -1) break;

          if (score.hasSecondVoice && m.secondVoiceNotes) {
            let t2 = 0;
            for (const n of m.secondVoiceNotes) {
              if (n.id === targetId) {
                foundMi = mi;
                foundStartBeat = t2;
                break;
              }
              t2 += getNoteBeats(n);
            }
          }
          if (foundMi !== -1) break;
        }

        if (foundMi !== -1) {
          currentMi = foundMi;
          currentStartBeatInMeasure = foundStartBeat;
        }
      }

      if (currentMi >= score.measures.length || !playRef.current) break;

      const measure = score.measures[currentMi];
      const startBeat = currentStartBeatInMeasure;
      currentStartBeatInMeasure = 0; // 重置为 0，后续小节都从 0 拍开始

      // 检查当前小节是否包含任何可播放的音符或休止符 (pitch !== -2)
      const isNotePlayable = (n: Note) => n.pitch !== -2;
      const measureHasNotes = measure.notes.some(isNotePlayable) || (score.hasSecondVoice && (measure.secondVoiceNotes || []).some(isNotePlayable));

      if (!measureHasNotes) {
        // 检查全谱后续是否还有任何带音符的小节
        const hasMoreNotesLater = score.measures.slice(currentMi + 1).some(m =>
          m.notes.some(isNotePlayable) || (score.hasSecondVoice && (m.secondVoiceNotes || []).some(isNotePlayable))
        );
        if (!hasMoreNotesLater) {
          // 全曲后续无任何音符，立即结束播放
          break;
        } else {
          // 后续还有音符，直接跳过当前纯空白小节，0 延迟进入下一小节
          currentMi++;
          continue;
        }
      }

      // 计算当前小节在全局中的音符起始索引
      let globalV1Idx = 0;
      let globalV2Idx = 0;
      for (let mi = 0; mi < currentMi; mi++) {
        globalV1Idx += score.measures[mi].notes.length;
        if (score.hasSecondVoice) {
          globalV2Idx += (score.measures[mi].secondVoiceNotes || []).length;
        }
      }

      const v1Notes = measure.notes;
      const v2Notes = score.hasSecondVoice ? (measure.secondVoiceNotes || []) : [];

      let t1 = 0;
      const v1Events = v1Notes.map((n, idx) => {
        const start = t1;
        const beats = getNoteBeats(n);
        const gIdx = globalV1Idx + idx;
        t1 += beats;
        return { note: n, start, beats, globalIdx: gIdx, isVoice2: false };
      });

      let t2 = 0;
      const v2Events = v2Notes.map((n, idx) => {
        const start = t2;
        const beats = getNoteBeats(n);
        const gIdx = globalV2Idx + idx;
        t2 += beats;
        return { note: n, start, beats, globalIdx: gIdx, isVoice2: true };
      });

      const measureDurationBeats = Math.max(t1, t2, 1.0);
      const allTimestamps = Array.from(
        new Set([0, ...v1Events.map(e => e.start), ...v2Events.map(e => e.start)])
      ).sort((a, b) => a - b);

      // 仅播放 >= startBeat 的时间切片
      const uniqueTimestamps = allTimestamps.filter(t => t >= startBeat - 0.001);

      let seekInterrupted = false;

      for (let ti = 0; ti < uniqueTimestamps.length && playRef.current; ti++) {
        if (seekTargetNoteIdRef.current) {
          seekInterrupted = true;
          break; // 进入外层循环重新定位到新小节与拍位
        }

        const currT = uniqueTimestamps[ti];
        const nextT = ti < uniqueTimestamps.length - 1 ? uniqueTimestamps[ti + 1] : measureDurationBeats;
        const sliceBeats = nextT - currT;

        const v1Key = score.voice1KeySignature || score.keySignature;
        const v2Key = score.voice2KeySignature || score.keySignature;

        const v1Ev = v1Events.find(e => Math.abs(e.start - currT) < 0.001);
        const v2Ev = v2Events.find(e => Math.abs(e.start - currT) < 0.001);

        const v1HasSound = v1Ev && v1Ev.note.pitch !== -2;
        const v2HasSound = v2Ev && v2Ev.note.pitch !== -2;

        // 如果当前时间切片两个声部都是空白占位符 (-2)
        if (!v1HasSound && !v2HasSound) {
          const hasNotesLaterInMeasure =
            v1Events.some(e => e.start > currT && e.note.pitch !== -2) ||
            v2Events.some(e => e.start > currT && e.note.pitch !== -2);

          if (!hasNotesLaterInMeasure) {
            // 本小节后半段全为空白占位符，直接跳出本小节进入下一小节
            break;
          } else {
            // 跳过当前空白占位符的等待，直接前进到下一个有音符的时间切片
            continue;
          }
        }

        // 1. 声部 1 在当前时间点发音 (主旋律 100% 音量，使用声部 1 调号)
        if (v1HasSound && v1Ev) {
          setPlayingNoteId(v1Ev.note.id);
          if (v1Ev.note.pitch > 0 && !v1Analysis.isTied[v1Ev.globalIdx]) {
            const playDur = v1Analysis.tiedDur[v1Ev.globalIdx] || v1Ev.beats;
            playNote(v1Ev.note.pitch, v1Ev.note.octave, v1Ev.note.accidental, v1Key, playDur, tempo, 1.0);
          }
          // 和弦伴奏 (按拍号与下一个和弦起点精准计算持续时值，4/4拍默认为整小节4拍，遇新和弦自动衔接)
          if (v1Ev.note.chord && score.playAccompaniment !== false) {
            const [topStr, btmStr] = (score.timeSignature || '4/4').split('/');
            const beatsPerMeasure = (parseInt(topStr) || 4) * (4 / (parseInt(btmStr) || 4));
            const nextChordEv = v1Events.find(e => e.start > currT + 0.001 && !!e.note.chord);
            const chordSpanBeats = nextChordEv
              ? (nextChordEv.start - currT)
              : Math.max(beatsPerMeasure - currT, measureDurationBeats - currT, 1.0);
            const chordPlayDur = Math.max(0.3, chordSpanBeats * beatDurationSecs);
            playChord(v1Ev.note.chord, chordPlayDur, 0.38);
          }
        }

        // 2. 声部 2 (副声部/低音声部) 在当前时间点同步发音 (60% 音量柔化衬托，使用声部 2 独立调号)
        if (v2HasSound && v2Ev && v2Ev.note.pitch > 0 && !v2Analysis.isTied[v2Ev.globalIdx]) {
          const playDur2 = v2Analysis.tiedDur[v2Ev.globalIdx] || v2Ev.beats;
          playNote(v2Ev.note.pitch, v2Ev.note.octave, v2Ev.note.accidental, v2Key, playDur2, tempo, 0.6);
        }

        if (sliceBeats > 0.001) {
          await interruptibleSleep(sliceBeats * beatDurationSecs * 1000);
        }
      }

      if (!seekInterrupted) {
        currentMi++;
      }
    }

    setIsPlaying(false);
    playRef.current = false;
    setPlayingNoteId(null);
  };

  let activeNote = null;
  let activeMeasure = null;
  if (activeMeasureId) {
    activeMeasure = score.measures.find(m => m.id === activeMeasureId) || null;
    if (activeMeasure && activeNoteId) {
      activeNote = activeMeasure.notes.find(n => n.id === activeNoteId) || null;
    }
  }

  const DurationIcon = ({ lines }: { lines: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
      <span>1</span>
      {lines > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', width: '100%' }}>
          {Array.from({ length: lines }).map((_, i) => <div key={i} style={{ height: '1.5px', background: 'currentColor', width: '100%' }}></div>)}
        </div>
      )}
    </div>
  );

  const durations = [
    { label: '1/4', value: 1, icon: <DurationIcon lines={0} />, title: '四分音符 (1/4 拍，快捷键: \\)' },
    { label: '1/8 (8)', value: 0.5, icon: <DurationIcon lines={1} />, title: '八分音符 (1/8 拍，快捷键: 8)' },
    { label: '1/16 (9)', value: 0.25, icon: <DurationIcon lines={2} />, title: '十六分音符 (1/16 拍，快捷键: 9)' },
    { label: '1/32', value: 0.125, icon: <DurationIcon lines={3} />, title: '三十二分音符 (1/32 拍)' },
    { label: '1/64', value: 0.0625, icon: <DurationIcon lines={4} />, title: '六十四分音符 (1/64 拍)' },
  ];

  const measureTools = [
    {
      label: '小节线',
      icon: '│',
      action: () => activeMeasureId && setNormalBarline(activeMeasureId)
    },
    {
      label: '重复开始',
      icon: '║:',
      action: () => activeMeasureId && toggleRepeatStart(activeMeasureId)
    },
    {
      label: '重复结束',
      icon: ':║',
      action: () => activeMeasureId && toggleRepeatEnd(activeMeasureId)
    },
    {
      label: '结束',
      icon: '║',
      action: () => activeMeasureId && toggleEndBarline(activeMeasureId)
    },
    {
      label: '插入小节',
      icon: '+',
      action: () => activeMeasureId && insertMeasureAfter(activeMeasureId)
    },
    {
      label: '删除小节',
      icon: '-',
      action: () => activeMeasureId && deleteMeasure(activeMeasureId)
    },
    {
      label: '换行',
      icon: '↵',
      action: () => activeMeasureId && toggleBreak(activeMeasureId)
    },
    {
      label: '上移',
      icon: '↑',
      action: () => activeMeasureId && moveLineUp(activeMeasureId)
    },
    {
      label: '新增一行',
      icon: '+行',
      action: () => insertLine()
    },
    {
      label: '删除一行',
      icon: '-行',
      action: () => deleteLine(activeMeasureId || undefined)
    },
    {
      label: '新增一页',
      icon: '+页',
      action: () => insertPage(8)
    },
    {
      label: score.hasSecondVoice ? '关闭双声部' : '开启双声部',
      icon: '👥',
      action: () => toggleSecondVoice()
    },
    ...(score.hasSecondVoice ? [
      {
        label: activeVoice === 1 ? '切到声部 2' : '切到声部 1',
        icon: activeVoice === 1 ? '声部1' : '声部2',
        action: () => setActiveVoice(activeVoice === 1 ? 2 : 1)
      }
    ] : [])
  ];

  const textTools = [
    {
      label: '歌词',
      icon: '词',
      action: () => {
        setHasLyricsMode(true);
        setActiveTab('text');
        const targetMeasureId = activeMeasureId || (activeNote ? score.measures.find(m => m.notes.some(n => n.id === activeNote.id))?.id : null) || score.measures[0]?.id;
        const lines: Measure[][] = [];
        let curLine: Measure[] = [];
        score.measures.forEach(m => {
          curLine.push(m);
          if (m.isBreak) {
            lines.push(curLine);
            curLine = [];
          }
        });
        if (curLine.length > 0) lines.push(curLine);
        const lineIdx = Math.max(0, lines.findIndex(l => l.some(m => m.id === targetMeasureId)));
        setEditingLyricsLineIndex(lineIdx);
        setEditingLyricRow(0);
      }
    },
    {
      label: '标注',
      icon: '注',
      action: () => {
        setHasLyricsMode(true);
        setActiveTab('text');
        const targetMeasureId = activeMeasureId || (activeNote ? score.measures.find(m => m.notes.some(n => n.id === activeNote.id))?.id : null) || score.measures[0]?.id;
        const lines: Measure[][] = [];
        let curLine: Measure[] = [];
        score.measures.forEach(m => {
          curLine.push(m);
          if (m.isBreak) {
            lines.push(curLine);
            curLine = [];
          }
        });
        if (curLine.length > 0) lines.push(curLine);
        const lineIdx = Math.max(0, lines.findIndex(l => l.some(m => m.id === targetMeasureId)));
        setEditingAnnotationLineIndex(lineIdx);
      }
    },
    {
      label: '增歌词行',
      icon: '+词',
      action: () => {
        setHasLyricsMode(true);
        setActiveTab('text');
        addLyricRow();
      }
    },
    {
      label: '删歌词行',
      icon: '-词',
      action: () => {
        deleteLyricRow(editingLyricRow);
      }
    },
    {
      label: `标注字号 (${score.annotationFont?.fontSize || 24}px)`,
      icon: '字号',
      action: () => {
        const sizes = [16, 20, 24, 28, 32, 36];
        const curSize = score.annotationFont?.fontSize || 24;
        const curIdx = sizes.indexOf(curSize);
        const nextSize = curIdx === -1 ? 24 : sizes[(curIdx + 1) % sizes.length];
        setScore({
          ...score,
          annotationFont: {
            fontFamily: score.annotationFont?.fontFamily || '黑体',
            fontSize: nextSize,
            color: score.annotationFont?.color || '#1e293b'
          }
        });
      }
    }
  ];

  return (
    <div className="toolbar-container">
      <div className="toolbar-tabs">
        <button className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>🎵 音符时值</button>
        <button className={`tab-btn ${activeTab === 'measures' ? 'active' : ''}`} onClick={() => setActiveTab('measures')}>🎼 小节结构</button>
        <button className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`} onClick={() => setActiveTab('text')}>✍️ 歌词与标注</button>
        <button className={`tab-btn ${activeTab === 'chords' ? 'active' : ''}`} onClick={() => setActiveTab('chords')}>🎸 和弦伴奏</button>
        <button 
          className={`play-btn ${isPlaying ? 'playing' : ''}`} 
          onClick={isPlaying ? stopScore : playScore}
          title={isPlaying ? '停止播放当前曲谱' : '播放当前曲谱'}
        >
          {isPlaying ? '⏹ 停止' : '▶ 试听'}
        </button>
      </div>

      <div className="toolbar-content">
        {activeTab === 'notes' && (
          <div className="tools-group">
            <div className="tool-section">
              {durations.map(d => (
                <button 
                  key={d.value}
                  className={`tool-btn ${currentDuration === d.value ? 'active' : ''}`}
                  onClick={() => setCurrentDuration(d.value)}
                  title={d.label}
                >
                  <div className="note-icon">{d.icon}</div>
                  <div className="note-label">{d.label}</div>
                </button>
              ))}
            </div>
            
            <div className="tool-divider"></div>
            
            <div className="tool-section">
              <button className={`tool-btn ${isDotted ? 'active' : ''}`} onClick={() => {
                if (activeNote && activeNote.pitch >= 0) {
                  const newDotted = !activeNote.isDotted;
                  const undottedDur = activeNote.isDotted ? activeNote.duration / 1.5 : activeNote.duration;
                  const newDuration = newDotted ? undottedDur * 1.5 : undottedDur;
                  updateActiveNote({ isDotted: newDotted, duration: newDuration }, false);
                  setIsDotted(false);
                } else {
                  setIsDotted(!isDotted);
                }
              }}>
                <div className="note-icon">·</div>
                <div className="note-label">附点</div>
              </button>
              <button className={`tool-btn`} onClick={() => { if (activeNote) updateActiveNote({ ...activeNote, pitch: 0 }) }}>
                <div className="note-icon">0</div>
                <div className="note-label">休止符</div>
              </button>
              <button className={`tool-btn`} onClick={() => { if (activeNote) updateActiveNote({ ...activeNote, pitch: -1 }) }}>
                <div className="note-icon">-</div>
                <div className="note-label">延音线</div>
              </button>
              <button className={`tool-btn ${activeNote?.slurStart ? 'active' : ''}`} onClick={() => {
                if (activeNote) toggleSlurStart(activeNote.id);
              }}>
                <div className="note-icon">⌒</div>
                <div className="note-label">连音(始)</div>
              </button>
              <button className={`tool-btn ${activeNote?.slurEnd ? 'active' : ''}`} onClick={() => {
                if (activeNote) toggleSlurEnd(activeNote.id);
              }}>
                <div className="note-icon">⌒</div>
                <div className="note-label">连音(终)</div>
              </button>
            </div>

            <div className="tool-divider"></div>

            <div className="tool-section">
              <button className={`tool-btn ${activeNote?.accidental === '#' ? 'active' : ''}`} onClick={() => {
                if (activeNote) updateActiveNote({ ...activeNote, accidental: activeNote.accidental === '#' ? null : '#' }, false);
              }}>
                <div className="note-icon">#</div>
                <div className="note-label">升调</div>
              </button>
              <button className={`tool-btn ${activeNote?.accidental === 'b' ? 'active' : ''}`} onClick={() => {
                if (activeNote) updateActiveNote({ ...activeNote, accidental: activeNote.accidental === 'b' ? null : 'b' }, false);
              }}>
                <div className="note-icon">♭</div>
                <div className="note-label">降调</div>
              </button>
              <button
                className="tool-btn"
                onClick={() => {
                  const sizes = [4, 6, 7.5, 9];
                  const curSize = score.octaveDotSize || 6;
                  const curIdx = sizes.findIndex(s => Math.abs(s - curSize) < 0.4);
                  const nextSize = curIdx === -1 ? 6 : sizes[(curIdx + 1) % sizes.length];
                  setScore({ ...score, octaveDotSize: nextSize });
                }}
                title={`点击循环切换高低音点大小 (当前: ${score.octaveDotSize || 6}px)`}
              >
                <div className="note-icon">·̇</div>
                <div className="note-label">音点({score.octaveDotSize || 6}px)</div>
              </button>
            </div>
          </div>
        )}
        
        {activeTab === 'measures' && (
          <div className="tools-group">
            <div className="tool-section">
              {measureTools.map((tool, index) => (
                <button 
                  key={index}
                  className="tool-btn"
                  onClick={tool.action}
                  title={tool.label}
                >
                  <div className="note-icon">{tool.icon}</div>
                  <div className="note-label">{tool.label}</div>
                </button>
              ))}
            </div>

            <div className="tool-divider"></div>

            <div className="tool-section measure-count-section">
              <div className="measure-count-label">行小节数:</div>
              {[2, 3, 4, 5, 6, 7, 8].map(n => (
                <button
                  key={n}
                  className={`tool-btn measure-count-btn ${score.measuresPerLine === n ? 'active' : ''}`}
                  onClick={() => setMeasuresPerLine(n)}
                  title={`全谱统一重排为每行 ${n} 小节`}
                >
                  <div className="note-icon">{n}</div>
                  <div className="note-label">{n}节/行</div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'text' && (
          <div className="tools-group">
            <div className="tool-section">
              {textTools.map((tool, index) => (
                <button 
                  key={index}
                  className="tool-btn"
                  onClick={tool.action}
                  title={tool.label}
                >
                  <div className="note-icon">{tool.icon}</div>
                  <div className="note-label">{tool.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'chords' && (
          <div className="tools-group chord-tools-group">
            {/* 1. 当前调自然大调和弦预设 */}
            <div className="tool-section chord-presets-section">
              <span className="chord-group-label">{score.keySignature || '1=C'} 调和弦:</span>
              {getDiatonicChordsForKey(score.keySignature).map(c => (
                <button
                  key={c.name}
                  className={`tool-btn chord-preset-btn ${activeNote?.chord === c.name ? 'active' : ''}`}
                  onClick={() => {
                    const targetNoteId = activeNoteId || (activeMeasure && activeMeasure.notes[0]?.id);
                    if (targetNoteId) {
                      updateNoteChord(targetNoteId, activeNote?.chord === c.name ? '' : c.name);
                    }
                    playChord(c.name, 1.2);
                  }}
                  title={`给当前音符添加 ${c.name} 和弦 (${c.degree})`}
                >
                  <div className="note-icon chord-name-glyph">{c.name}</div>
                  <div className="note-label">{c.degree?.split(' ')[0] || c.name}</div>
                </button>
              ))}
            </div>

            <div className="tool-divider"></div>

            {/* 2. 经典和弦进行套路一键套用 */}
            <div className="tool-section chord-templates-section">
              <span className="chord-group-label">一键套用模版:</span>
              {CHORD_PROGRESSION_TEMPLATES.map(tpl => (
                <button
                  key={tpl.name}
                  className="tool-btn chord-tpl-btn"
                  onClick={() => {
                    const resolvedChords = resolveProgressionToChordNames(tpl, score.keySignature);
                    applyProgressionToScore(resolvedChords);
                    if (resolvedChords[0]) playChord(resolvedChords[0], 1.2);
                  }}
                  title={`${tpl.name} (${tpl.description}) - 点击全谱顺次套用`}
                >
                  <div className="note-icon">✨</div>
                  <div className="note-label">{tpl.name.split(' ')[0]}</div>
                </button>
              ))}
            </div>

            <div className="tool-divider"></div>

            {/* 3. 伴奏开关与和弦清理 */}
            <div className="tool-section chord-actions-section">
              <button
                className={`tool-btn ${score.playAccompaniment !== false ? 'active' : ''}`}
                onClick={() => setScore({ ...score, playAccompaniment: score.playAccompaniment === false ? true : false })}
                title="播放时是否同步演奏和弦伴奏"
              >
                <div className="note-icon">🎹</div>
                <div className="note-label">{score.playAccompaniment !== false ? '伴奏:开' : '伴奏:关'}</div>
              </button>

              <button
                className="tool-btn"
                onClick={() => {
                  if (activeNote && activeNote.chord) {
                    updateNoteChord(activeNote.id, '');
                  } else {
                    clearAllChords();
                  }
                }}
                title={activeNote?.chord ? '清除当前音符和弦' : '清空全谱和弦'}
              >
                <div className="note-icon">🗑️</div>
                <div className="note-label">{activeNote?.chord ? '清当前' : '清全部'}</div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
