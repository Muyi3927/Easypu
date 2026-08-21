import { useEffect, useRef, useState } from 'react';
import './PianoKeyboard.css';
import { useEditor } from '../context/EditorContext';
import { useScore } from '../context/ScoreContext';

import { playNote } from '../utils/audio';

// Define the keys. From Low 2 (-2) to High 2 (2)
const octaves = [-2, -1, 0, 1, 2];
const pitches = [1, 2, 3, 4, 5, 6, 7];

export const PianoKeyboard = () => {
  const { currentDuration, setCurrentDuration, isDotted, setIsDotted } = useEditor();
  const { updateActiveNote, addStackedPitchToActiveNote, score, activeVoice } = useScore();
  const [isStackedMode, setIsStackedMode] = useState(false);
  const keyboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (keyboardRef.current) {
      const el = keyboardRef.current;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    }
  }, []);

  const handleKeyClick = (pitch: number, octave: number, accidental: '#' | null = null) => {
    // Compute final duration: base duration × 1.5 if dotted
    const noteWasDotted = isDotted;
    const finalDuration = noteWasDotted ? currentDuration * 1.5 : currentDuration;
    if (isDotted) {
      setIsDotted(false); // 单次作用，不常亮
    }

    const v1Key = score.voice1KeySignature || score.keySignature;
    const v2Key = score.voice2KeySignature || score.keySignature;
    const activeKeySig = (activeVoice === 2 && score.hasSecondVoice) ? v2Key : v1Key;

    // Play the note
    playNote(pitch, octave, accidental, activeKeySig, finalDuration, score.tempo || 120);

    if (isStackedMode) {
      addStackedPitchToActiveNote(pitch, octave, accidental);
      return;
    }

    updateActiveNote({
      pitch: pitch,
      octave: octave,
      duration: finalDuration,
      isDotted: noteWasDotted,
      accidental: accidental,
    });
  };

  return (
    <div className="piano-container">
      {/* 顶部快捷辅助控制与提示条（不占用琴键横向空间，琴键保持100%占满） */}
      <div className="piano-top-panel">
        <div className="piano-quick-actions">
          <button
            type="button"
            className={`piano-quick-btn duration-btn ${currentDuration === 1 ? 'active' : ''}`}
            onClick={() => setCurrentDuration(1)}
            title="切换为 1/4 四分音符 (快捷键: \\ 或 8切换)"
          >
            <span className="btn-glyph">1/4</span>
            <kbd className="btn-kbd">\</kbd>
          </button>

          <button
            type="button"
            className={`piano-quick-btn duration-btn ${currentDuration === 0.5 ? 'active' : ''}`}
            onClick={() => setCurrentDuration(0.5)}
            title="切换为 1/8 八分音符 (快捷键: 8)"
          >
            <span className="btn-glyph">1/8</span>
            <kbd className="btn-kbd">8</kbd>
          </button>

          <button
            type="button"
            className={`piano-quick-btn duration-btn ${currentDuration === 0.25 ? 'active' : ''}`}
            onClick={() => setCurrentDuration(0.25)}
            title="切换为 1/16 十六分音符 (快捷键: 9)"
          >
            <span className="btn-glyph">1/16</span>
            <kbd className="btn-kbd">9</kbd>
          </button>

          <button
            type="button"
            className={`piano-quick-btn duration-btn ${currentDuration === 0.125 ? 'active' : ''}`}
            onClick={() => setCurrentDuration(0.125)}
            title="切换为 1/32 三十二分音符"
          >
            <span className="btn-glyph">1/32</span>
          </button>

          <button
            type="button"
            className={`piano-quick-btn duration-btn ${currentDuration === 0.0625 ? 'active' : ''}`}
            onClick={() => setCurrentDuration(0.0625)}
            title="切换为 1/64 六十四分音符"
          >
            <span className="btn-glyph">1/64</span>
          </button>

          <button
            type="button"
            className={`piano-quick-btn dot-btn ${isDotted ? 'active' : ''}`}
            onClick={() => setIsDotted(!isDotted)}
            title="附点开关 (快捷键: .)"
          >
            <span className="btn-glyph">·</span>
            <span className="btn-text">附点</span>
            <kbd className="btn-kbd">.</kbd>
          </button>

          <button
            type="button"
            className={`piano-quick-btn stack-btn ${isStackedMode ? 'active' : ''}`}
            onClick={() => setIsStackedMode(!isStackedMode)}
            title="柱式/和音叠置输入开关 (开启后点击琴键在当前音符上垂直叠加和音，快捷键: Shift+1~7)"
          >
            <span className="btn-glyph">🎼</span>
            <span className="btn-text">叠置和音</span>
            <kbd className="btn-kbd">Shift</kbd>
          </button>
        </div>

        <div className="piano-shortcut-hints">
          <span className="hint-pill">🎹 快捷键：</span>
          <span className="hint-item"><kbd>0</kbd> 休止</span>
          <span className="hint-item"><kbd>-</kbd> 延音</span>
          <span className="hint-item"><kbd>1~7</kbd> 音符</span>
          <span className="hint-item"><kbd>Shift+1~7</kbd> 叠音柱式</span>
          <span className="hint-item"><kbd>8</kbd> 1/8</span>
          <span className="hint-item"><kbd>9</kbd> 1/16</span>
          <span className="hint-item"><kbd>[</kbd><kbd>]</kbd> ♭/#</span>
          <span className="hint-item"><kbd>↑</kbd><kbd>↓</kbd> 高低音</span>
          <span className="hint-item"><kbd>⌫</kbd> 删除</span>
        </div>
      </div>

      {/* 100% 满宽钢琴键盘主体 */}
      <div className="piano-keyboard-wrapper">
        <div className="piano-keyboard" ref={keyboardRef}>
          {octaves.map(octave => (
            <div key={octave} className="octave-group">
              {pitches.map(pitch => (
                <div key={`${octave}-${pitch}`} className="piano-key-wrapper">
                  {/* Black keys */}
                  {pitch !== 3 && pitch !== 7 && (
                    <button
                      type="button"
                      className="piano-key black-key"
                      onClick={() => handleKeyClick(pitch, octave, '#')}
                      title={`升号 #${pitch}`}
                    >
                      <span className="key-hint">#{pitch}</span>
                    </button>
                  )}

                  {/* White key */}
                  <button
                    type="button"
                    className="piano-key white-key"
                    onClick={() => handleKeyClick(pitch, octave)}
                    title={`音符 ${pitch}`}
                  >
                    <div className="key-label">
                      {octave > 0 && Array.from({ length: octave }).map((_, i) => <span key={`top-${i}`} className="dot high-dot"></span>)}
                      <span className="number">{pitch}</span>
                      {octave < 0 && Array.from({ length: Math.abs(octave) }).map((_, i) => <span key={`bot-${i}`} className="dot low-dot"></span>)}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
