import { useState, useRef } from 'react';
import './Toolbar.css';
import { useEditor } from '../context/EditorContext';
import { useScore } from '../context/ScoreContext';
import { playNote } from '../utils/audio';
import type { Measure } from '../types';

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
    setScore
  } = useScore();

  const stopScore = () => {
    playRef.current = false;
    setIsPlaying(false);
    setPlayingNoteId(null);
  };

  const playScore = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    playRef.current = true;

    for (const measure of score.measures) {
      if (!playRef.current) break;
      for (const note of measure.notes) {
        if (!playRef.current) break;
        setPlayingNoteId(note.id);
        if (note.pitch > 0) {
          playNote(note.pitch, note.octave, note.accidental, score.keySignature, note.duration, score.tempo || 70);
        }
        const beatDurationSecs = 60 / (score.tempo || 70);
        await new Promise(r => setTimeout(r, note.duration * beatDurationSecs * 1000));
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
    { label: '1/4', value: 1, icon: <DurationIcon lines={0} />, title: '四分音符 (1/4 拍)' },
    { label: '1/8 (8)', value: 0.5, icon: <DurationIcon lines={1} />, title: '八分音符 (1/8 拍，键盘快捷键: 8)' },
    { label: '1/16 (9)', value: 0.25, icon: <DurationIcon lines={2} />, title: '十六分音符 (1/16 拍，键盘快捷键: 9)' },
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
      label: `标注字号 (${score.annotationFont?.fontSize || 14}px)`,
      icon: '字号',
      action: () => {
        const sizes = [12, 14, 16, 18, 20, 24];
        const curSize = score.annotationFont?.fontSize || 14;
        const curIdx = sizes.indexOf(curSize);
        const nextSize = sizes[(curIdx + 1) % sizes.length];
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
      </div>
    </div>
  );
};
