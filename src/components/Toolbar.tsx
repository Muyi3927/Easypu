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

  // 监听播放中的音符点击跳转 (Seek)
  useEffect(() => {
    if (isPlaying && activeNoteId) {
      seekTargetNoteIdRef.current = activeNoteId;
      if (interruptSleepRef.current) {
        interruptSleepRef.current();
      }
    }
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

    // 确定播放起始位置：如果当前选中了具体音符，则从该音符开始播放；否则默认从头开始
    let startIndex = 0;
    if (activeNoteId) {
      const activeIdx = allNotes.findIndex(n => n.id === activeNoteId);
      if (activeIdx !== -1) {
        // 检查选定位置及其后续是否含有可播放音符
        let hasPlayableAfter = false;
        for (let k = activeIdx; k < allNotes.length; k++) {
          if (allNotes[k].pitch !== -2) {
            hasPlayableAfter = true;
            break;
          }
        }
        startIndex = hasPlayableAfter ? activeIdx : 0;
      }
    }

    // 2. 预先分析同音连音线 (Tie)：
    // 在同音连音线跨度内（从 slurStart 到 slurEnd，或 tieStart 到 tieEnd），
    // 若连续后一个音符的音高、八度、升降号与前一音符完全一致，则视为延音连奏：
    // 只在首个音符发音（时值合并延长），后续同音符不重复二次敲击发声。
    const isTiedWithPrev = new Array(allNotes.length).fill(false);
    const totalTiedDuration = new Array(allNotes.length).fill(0);

    let inSlur = false;
    let slurHeadIndex = -1;

    for (let i = 0; i < allNotes.length; i++) {
      const note = allNotes[i];
      if (note.slurStart || note.tieStart) {
        inSlur = true;
        slurHeadIndex = i;
      }

      if (inSlur && i > 0 && slurHeadIndex !== -1 && i > slurHeadIndex) {
        const prevNote = allNotes[i - 1];
        const isSamePitch =
          note.pitch > 0 &&
          note.pitch === prevNote.pitch &&
          (note.octave || 0) === (prevNote.octave || 0) &&
          (note.accidental || null) === (prevNote.accidental || null);

        if (isSamePitch) {
          isTiedWithPrev[i] = true;
        } else {
          // 音高不同则为异音连音线 (Slur)，更新当前的 slurHead
          slurHeadIndex = i;
        }
      }

      if (note.slurEnd || note.tieEnd) {
        inSlur = false;
        slurHeadIndex = -1;
      }
    }

    // 计算每个首发音符的总延音持续时值
    for (let i = 0; i < allNotes.length; i++) {
      if (!isTiedWithPrev[i]) {
        let totalDur = allNotes[i].duration;
        let j = i + 1;
        while (j < allNotes.length && isTiedWithPrev[j]) {
          totalDur += allNotes[j].duration;
          j++;
        }
        totalTiedDuration[i] = totalDur;
      }
    }

    // 3. 逐个音符进行精准节拍高亮与音色播放
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

    let currentIndex = startIndex;
    while (currentIndex < allNotes.length && playRef.current) {
      // 检查是否有外部点击音符发起的即时跳转请求 (Seek)
      if (seekTargetNoteIdRef.current) {
        const targetIdx = allNotes.findIndex(n => n.id === seekTargetNoteIdRef.current);
        seekTargetNoteIdRef.current = null;
        if (targetIdx !== -1) {
          currentIndex = targetIdx;
        }
      }

      if (currentIndex >= allNotes.length || !playRef.current) break;

      const note = allNotes[currentIndex];

      // 没有输入音符的空白占位符（pitch === -2）直接跳过，不暂停、不发声
      if (note.pitch === -2) {
        currentIndex++;
        continue;
      }

      setPlayingNoteId(note.id);

      if (note.pitch > 0 && !isTiedWithPrev[currentIndex]) {
        const playDur = totalTiedDuration[currentIndex] || note.duration;
        playNote(note.pitch, note.octave, note.accidental, score.keySignature, playDur, tempo);
      }

      // 和弦伴奏多复音同步发声 (Polyphonic Accompaniment in sync!)
      if (note.chord && score.playAccompaniment !== false) {
        const chordPlayDur = Math.max(0.6, note.duration * beatDurationSecs * 1.5);
        playChord(note.chord, chordPlayDur);
      }

      await interruptibleSleep(note.duration * beatDurationSecs * 1000);

      // 如果在等待期间被外部跳转打断，不要递增 currentIndex，而是直接进入下一轮循环处理跳转目标
      if (!seekTargetNoteIdRef.current) {
        currentIndex++;
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
