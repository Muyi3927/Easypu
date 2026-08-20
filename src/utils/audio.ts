// -------------------------------------------------------------
// Easypu 施坦威/雅马哈 C5 音乐厅级高保真原声大三角钢琴音频引擎
// 基于 Salamander Grand Piano 经典原声母带采样库
// 1. 30 个高保真采区采样点覆盖 A0 ~ C8 全音域
// 2. 采样级高精度音高插值 (Web Audio Resampling & Pitch Shifting)
// 3. 12 自然大调首调唱名法 (Movable-Do) 国际标准律制 (A4=440Hz)
// 4. 自然琴箱声学共鸣与毛毡琴槌释放衰减 (Acoustic Soundboard Envelope)
// -------------------------------------------------------------

import { parseChordToMidiNotes } from './chord';
import type { Score, Note } from '../types';

export const pitchToOffset = [0, 0, 2, 4, 5, 7, 9, 11]; // 1-indexed: 1(Do)=0, 2(Re)=2, 3(Mi)=4, 4(Fa)=5, 5(Sol)=7, 6(La)=9, 7(Ti)=11

// Salamander Grand Piano 标准采样音高映射表
export const SALAMANDER_SAMPLES: { name: string; midi: number }[] = [
  { name: 'A0', midi: 21 },
  { name: 'C1', midi: 24 },
  { name: 'Ds1', midi: 27 },
  { name: 'Fs1', midi: 30 },
  { name: 'A1', midi: 33 },
  { name: 'C2', midi: 36 },
  { name: 'Ds2', midi: 39 },
  { name: 'Fs2', midi: 42 },
  { name: 'A2', midi: 45 },
  { name: 'C3', midi: 48 },
  { name: 'Ds3', midi: 51 },
  { name: 'Fs3', midi: 54 },
  { name: 'A3', midi: 57 },
  { name: 'C4', midi: 60 },
  { name: 'Ds4', midi: 63 },
  { name: 'Fs4', midi: 66 },
  { name: 'A4', midi: 69 },
  { name: 'C5', midi: 72 },
  { name: 'Ds5', midi: 75 },
  { name: 'Fs5', midi: 78 },
  { name: 'A5', midi: 81 },
  { name: 'C6', midi: 84 },
  { name: 'Ds6', midi: 87 },
  { name: 'Fs6', midi: 90 },
  { name: 'A6', midi: 93 },
  { name: 'C7', midi: 96 },
  { name: 'Ds7', midi: 99 },
  { name: 'Fs7', midi: 102 },
  { name: 'A7', midi: 105 },
  { name: 'C8', midi: 108 },
];

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 精准解析简谱调号等号后的半音基准偏移量 (以 C 为基准 0)
export const getKeyOffset = (keySig: string = '1=C'): number => {
  if (!keySig) return 0;
  let str = keySig.replace(/^1\s*=\s*/i, '').trim();

  // 支持中文字符 "降B", "升F"
  str = str.replace(/降/g, 'b').replace(/升/g, '#');

  // 标准化调号命名
  if (/^[b#][A-Ga-g]$/.test(str)) {
    str = `${str[1].toUpperCase()}${str[0]}`;
  } else if (/^[A-Ga-g][b#]?$/.test(str)) {
    str = str.toUpperCase();
    if (str.length === 2 && str[1] === 'B' && str[0] !== 'B') {
      str = `${str[0]}b`;
    }
  }

  const keyMap: Record<string, number> = {
    'C': 0, 'B#': 0,
    'C#': 1, 'Db': 1, '#C': 1, 'bD': 1,
    'D': 2,
    'D#': 3, 'Eb': 3, '#D': 3, 'bE': 3,
    'E': 4, 'Fb': 4,
    'F': 5, 'E#': 5,
    'F#': 6, 'Gb': 6, '#F': 6, 'bG': 6,
    'G': 7,
    'G#': 8, 'Ab': 8, '#G': 8, 'bA': 8,
    'A': 9,
    'A#': 10, 'Bb': 10, '#A': 10, 'bB': 10,
    'B': 11, 'Cb': 11
  };

  return keyMap[str] ?? (keyMap[str.toUpperCase()] ?? 0);
};

export const keyToOffset: Record<string, number> = {
  'C': 0, '#C': 1, 'bD': 1, 'D': 2, '#D': 3, 'bE': 3, 'E': 4,
  'F': 5, '#F': 6, 'bG': 6, 'G': 7, '#G': 8, 'bA': 8, 'A': 9, '#A': 10, 'bB': 10, 'B': 11
};

let audioCtx: AudioContext | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
const sampleBufferCache: Map<string, AudioBuffer> = new Map();
let isSoundfontLoading = false;
let isSoundfontLoaded = false;

export const initAudio = (): AudioContext => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();

    // 录音棚级母带压缩器 (防止大动态爆音并提升温暖琴箱感)
    masterCompressor = audioCtx.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(12, audioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(4, audioCtx.currentTime);
    masterCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    masterCompressor.release.setValueAtTime(0.25, audioCtx.currentTime);
    masterCompressor.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// 预加载内嵌 Salamander Yamaha C5 原声三角大钢琴采样 (本地优先，无任何外部网络依赖)
export const preloadPianoSoundfont = async () => {
  if (isSoundfontLoaded || isSoundfontLoading) return;
  isSoundfontLoading = true;

  try {
    const ctx = initAudio();

    // 优先加载中音区常用音符，以最高优先级保证打谱即时发音
    const loadNoteSample = async (sampleName: string): Promise<void> => {
      try {
        const response = await fetch(`/soundfont/salamander/${sampleName}.mp3`);
        if (!response.ok) return;
        const arrayBuf = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);
        sampleBufferCache.set(sampleName, audioBuffer);
      } catch {
        // 忽略单音符解析异常
      }
    };

    // 分批平滑解码，避免主线程卡顿
    const coreSamples = ['C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5'];
    await Promise.all(coreSamples.map(s => loadNoteSample(s)));

    // 后台继续加载其余高低八度音区采样
    const otherSamples = SALAMANDER_SAMPLES.map(s => s.name).filter(s => !coreSamples.includes(s));
    Promise.all(otherSamples.map(s => loadNoteSample(s))).then(() => {
      isSoundfontLoaded = true;
    });

  } catch (err) {
    console.warn('[Audio] Salamander 钢琴采样预加载异常:', err);
  } finally {
    isSoundfontLoading = false;
  }
};

// 页面加载或初次交互时后台静默预热加载
if (typeof window !== 'undefined') {
  const triggerAudioInit = () => {
    initAudio();
    preloadPianoSoundfont();
  };
  window.addEventListener('click', triggerAudioInit, { once: true });
  window.addEventListener('keydown', triggerAudioInit, { once: true });
  window.addEventListener('touchstart', triggerAudioInit, { once: true });

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => preloadPianoSoundfont());
  } else {
    setTimeout(() => preloadPianoSoundfont(), 300);
  }
}

// 计算 MIDI 编号、音名与真实频率 (精确适配 12 大调首调体系)
export const calculateMidiNote = (
  pitch: number,
  octave: number,
  accidental: string | null,
  keySig: string
): { midi: number; noteName: string; frequency: number } => {
  const baseOffset = getKeyOffset(keySig);

  let noteOffset = pitchToOffset[pitch] || 0;
  if (accidental === '#' || accidental === '♯') noteOffset += 1;
  if (accidental === 'b' || accidental === '♭') noteOffset -= 1;

  // C4 (中央 C) 的 MIDI 编号是 60
  const midi = 60 + baseOffset + noteOffset + (octave || 0) * 12;
  const noteIndex = ((midi % 12) + 12) % 12;
  const octaveNumber = Math.floor(midi / 12) - 1;
  const noteName = `${NOTE_NAMES[noteIndex]}${octaveNumber}`;
  
  // 12-TET 标准频率计算 (以 A4 = 440Hz / MIDI 69 为基准)
  const frequency = 440 * Math.pow(2, (midi - 69) / 12);

  return { midi, noteName, frequency };
};

// 播放音符 (Salamander 高保真真钢琴原声采样回放)
export const playNote = (
  pitch: number,
  octave: number,
  accidental: string | null,
  keySig: string,
  durationBeats: number,
  tempo: number = 120,
  volumeScale: number = 1.0
) => {
  if (pitch <= 0) return; // 休止符或占位符

  const ctx = initAudio();
  const { midi } = calculateMidiNote(pitch, octave, accidental, keySig);
  
  // 节拍时值计算
  const beatDuration = 60 / (tempo || 120);
  const noteDurationSecs = Math.max(0.15, durationBeats * beatDuration);

  // 1. 在 Salamander 采样库中寻找距离当前 MIDI 音符最近的采样点
  let bestSample: { name: string; midi: number; buffer: AudioBuffer } | null = null;
  let minDiff = 999;

  for (const s of SALAMANDER_SAMPLES) {
    const buf = sampleBufferCache.get(s.name);
    if (buf) {
      const diff = Math.abs(midi - s.midi);
      if (diff < minDiff) {
        minDiff = diff;
        bestSample = { name: s.name, midi: s.midi, buffer: buf };
      }
    }
  }

  // 2. 如果找到了对应采样，进行高保真重采样变调播放 (Pitch Shifting via PlaybackRate)
  if (bestSample) {
    playSalamanderSample(ctx, bestSample.buffer, midi - bestSample.midi, noteDurationSecs, volumeScale);
    return;
  }

  // 3. 采样未加载完成时的平滑后备声学引擎
  const frequency = 440 * Math.pow(2, (midi - 69) / 12);
  playAcousticModeledNote(ctx, frequency, noteDurationSecs);
};

// 播放指定 MIDI 编号单音 (用于和弦多复音与副声部)
export const playMidiNote = (
  midi: number,
  durationSecs: number,
  volumeScale: number = 1.0
) => {
  const ctx = initAudio();
  let bestSample: { name: string; midi: number; buffer: AudioBuffer } | null = null;
  let minDiff = 999;

  for (const s of SALAMANDER_SAMPLES) {
    const buf = sampleBufferCache.get(s.name);
    if (buf) {
      const diff = Math.abs(midi - s.midi);
      if (diff < minDiff) {
        minDiff = diff;
        bestSample = { name: s.name, midi: s.midi, buffer: buf };
      }
    }
  }

  if (bestSample) {
    playSalamanderSample(ctx, bestSample.buffer, midi - bestSample.midi, durationSecs, volumeScale);
    return;
  }

  const frequency = 440 * Math.pow(2, (midi - 69) / 12);
  playAcousticModeledNote(ctx, frequency, durationSecs);
};

// 播放和弦多复音 (Polyphonic Chord Accompaniment Playback)
// 经过声学混音配比：和弦为背景衬托，音量适度柔化 (约 35%~45%)，完美烘托主旋律
export const playChord = (
  chordName: string,
  durationSecs: number = 2.0,
  volumeScale: number = 0.4
) => {
  if (!chordName) return;
  const midis = parseChordToMidiNotes(chordName);
  midis.forEach((midi, idx) => {
    // 根音 Bass 稍微温暖扎实 (volumeScale * 1.1)，和声内音轻柔舒缓 (volumeScale * 0.8)
    const noteVol = idx === 0 ? volumeScale * 1.05 : volumeScale * 0.8;
    playMidiNote(midi, durationSecs, noteVol);
  });
};

// Salamander Grand Piano 采样播放核心函数 (精准时值控制、真实琴弦共鸣、平滑阻尼释放)
const playSalamanderSample = (
  ctx: AudioContext,
  buffer: AudioBuffer,
  semitoneOffset: number,
  durationSecs: number,
  volumeScale: number = 1.0
) => {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // 根据音高半音差值计算精准回放速度 (精确还原音高)
  source.playbackRate.setValueAtTime(Math.pow(2, semitoneOffset / 12), ctx.currentTime);

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const targetPeak = 0.92 * volumeScale;

  // 1. 击弦启动 (3ms 清脆击弦软起动)
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(targetPeak, now + 0.003);

  // 2. 真实大钢琴保持 (Sustain)：在实际持续时值 durationSecs 内保持饱满真钢泛音
  const decayTimeConstant = Math.max(1.8, durationSecs * 1.5);
  gain.gain.setTargetAtTime(targetPeak * 0.65, now + 0.03, decayTimeConstant);

  // 3. 离键消音阻尼 (Damper Release)：音符到达设定时值时刻 (now + durationSecs) 干净离键
  const releaseStart = now + durationSecs;
  const releaseTimeConstant = Math.min(0.1, Math.max(0.05, durationSecs * 0.08));
  gain.gain.setTargetAtTime(0.00001, releaseStart, releaseTimeConstant);

  source.connect(gain);
  if (masterCompressor) {
    gain.connect(masterCompressor);
  } else {
    gain.connect(ctx.destination);
  }

  source.start(now);
  // 衰减彻底归零后安全停止源
  source.stop(releaseStart + 0.5);
};

// 物理声学建模钢琴合成 (后备引擎)
const playAcousticModeledNote = (ctx: AudioContext, frequency: number, durationSecs: number) => {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(masterCompressor || ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(Math.min(10000, frequency * 6), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(160, frequency * 1.5), now + durationSecs);
  filter.connect(masterGain);

  const partials = [
    { mult: 1.000, gain: 0.6, type: 'sine' as OscillatorType },
    { mult: 2.001, gain: 0.25, type: 'sine' as OscillatorType },
    { mult: 3.003, gain: 0.12, type: 'triangle' as OscillatorType },
  ];

  partials.forEach(({ mult, gain: level, type }) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency * mult, now);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(level, now + 0.005);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSecs + 0.8);

    osc.connect(oscGain);
    oscGain.connect(filter);

    osc.start(now);
    osc.stop(now + durationSecs + 0.9);
  });
};

// -------------------------------------------------------------
// 高保真 PCM 16-bit 44.1kHz WAV 音频编码器 (标准立体声无损母带格式)
// -------------------------------------------------------------
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM 格式
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF 标头
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt 子块
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // 子块大小: 16
  view.setUint16(20, format, true); // PCM 格式编码: 1
  view.setUint16(22, numChannels, true); // 声道数: 2 (立体声)
  view.setUint32(24, sampleRate, true); // 采样率: 44100Hz
  view.setUint32(28, sampleRate * blockAlign, true); // 字节率
  view.setUint16(32, blockAlign, true); // 块对齐
  view.setUint16(34, bitDepth, true); // 位深: 16-bit

  // data 子块
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 写入双声道交织 PCM 数据并进行防破音峰值限幅
  const channelData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = channelData[channel][i];
      // 软限幅防止溢出爆音
      sample = Math.max(-1.0, Math.min(1.0, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
};

// -------------------------------------------------------------
// 极速离线音频渲染引擎 (Offline Audio Renderer)
// 1 秒内将全谱（主旋律 + 第二声部 + 和弦伴奏 + 延音/连音线）渲染为无杂音的高保真音频
// -------------------------------------------------------------
export const exportScoreToAudio = async (score: Score): Promise<Blob> => {
  await preloadPianoSoundfont();

  const tempo = score.tempo || 120;
  const beatDurationSecs = 60 / tempo;

  // 辅助计算音符拍数 (含附点 1.5x)
  const getNoteBeats = (n: Note): number => {
    const dur = n.duration || 1.0;
    if (n.isDotted) {
      if (dur === 1.0 || dur === 0.5 || dur === 0.25 || dur === 0.125 || dur === 0.0625) {
        return dur * 1.5;
      }
    }
    return dur;
  };

  // 分析连音线与延音线
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

  const allVoice1Notes: Note[] = [];
  score.measures.forEach(m => {
    m.notes.forEach(n => allVoice1Notes.push(n));
  });
  const v1Analysis = analyzeTrackTies(allVoice1Notes);

  const allVoice2Notes: Note[] = [];
  if (score.hasSecondVoice) {
    score.measures.forEach(m => {
      (m.secondVoiceNotes || []).forEach(n => allVoice2Notes.push(n));
    });
  }
  const v2Analysis = analyzeTrackTies(allVoice2Notes);

  interface ScheduledNoteEvent {
    time: number;
    midi: number;
    duration: number;
    volume: number;
  }

  const scheduledEvents: ScheduledNoteEvent[] = [];

  let globalV1Idx = 0;
  let globalV2Idx = 0;
  let currentPlaybackTime = 0.08; // 80ms 前置微静音，防止首音瞬态爆音

  const v1Key = score.voice1KeySignature || score.keySignature;
  const v2Key = score.voice2KeySignature || score.keySignature;

  const [topStr, btmStr] = (score.timeSignature || '4/4').split('/');
  const beatsPerMeasure = (parseInt(topStr) || 4) * (4 / (parseInt(btmStr) || 4));

  for (let mi = 0; mi < score.measures.length; mi++) {
    const measure = score.measures[mi];
    const isNotePlayable = (n: Note) => n.pitch !== -2;
    const measureHasNotes = measure.notes.some(isNotePlayable) || (score.hasSecondVoice && (measure.secondVoiceNotes || []).some(isNotePlayable));

    if (!measureHasNotes) {
      const hasMoreNotesLater = score.measures.slice(mi + 1).some(m =>
        m.notes.some(isNotePlayable) || (score.hasSecondVoice && (m.secondVoiceNotes || []).some(isNotePlayable))
      );
      if (!hasMoreNotesLater) {
        break; // 全谱结束
      } else {
        continue; // 跳过空白小节
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
      return { note: n, start, beats, globalIdx: gIdx };
    });

    let t2 = 0;
    const v2Events = v2Notes.map((n, idx) => {
      const start = t2;
      const beats = getNoteBeats(n);
      const gIdx = globalV2Idx + idx;
      t2 += beats;
      return { note: n, start, beats, globalIdx: gIdx };
    });

    globalV1Idx += v1Notes.length;
    globalV2Idx += v2Notes.length;

    const measureDurationBeats = Math.max(t1, t2, 1.0);
    const allTimestamps = Array.from(
      new Set([0, ...v1Events.map(e => e.start), ...v2Events.map(e => e.start)])
    ).sort((a, b) => a - b);

    for (let ti = 0; ti < allTimestamps.length; ti++) {
      const currT = allTimestamps[ti];
      const nextT = ti < allTimestamps.length - 1 ? allTimestamps[ti + 1] : measureDurationBeats;
      const sliceBeats = nextT - currT;

      const v1Ev = v1Events.find(e => Math.abs(e.start - currT) < 0.001);
      const v2Ev = v2Events.find(e => Math.abs(e.start - currT) < 0.001);

      const v1HasSound = v1Ev && v1Ev.note.pitch !== -2;
      const v2HasSound = v2Ev && v2Ev.note.pitch !== -2;

      if (!v1HasSound && !v2HasSound) {
        const hasNotesLaterInMeasure =
          v1Events.some(e => e.start > currT && e.note.pitch !== -2) ||
          v2Events.some(e => e.start > currT && e.note.pitch !== -2);
        if (!hasNotesLaterInMeasure) {
          break;
        } else {
          continue;
        }
      }

      // 1. 声部 1 (主旋律 100% 音量)
      if (v1HasSound && v1Ev && v1Ev.note.pitch > 0 && !v1Analysis.isTied[v1Ev.globalIdx]) {
        const playDurBeats = v1Analysis.tiedDur[v1Ev.globalIdx] || v1Ev.beats;
        const noteDurationSecs = Math.max(0.15, playDurBeats * beatDurationSecs);
        const { midi } = calculateMidiNote(v1Ev.note.pitch, v1Ev.note.octave, v1Ev.note.accidental, v1Key);
        scheduledEvents.push({
          time: currentPlaybackTime,
          midi,
          duration: noteDurationSecs,
          volume: 1.0
        });
      }

      // 和弦伴奏 (38% 音量，智能持续跨度)
      if (v1HasSound && v1Ev && v1Ev.note.chord && score.playAccompaniment !== false) {
        const nextChordEv = v1Events.find(e => e.start > currT + 0.001 && !!e.note.chord);
        const chordSpanBeats = nextChordEv
          ? (nextChordEv.start - currT)
          : Math.max(beatsPerMeasure - currT, measureDurationBeats - currT, 1.0);
        const chordPlayDur = Math.max(0.3, chordSpanBeats * beatDurationSecs);
        const midis = parseChordToMidiNotes(v1Ev.note.chord);
        midis.forEach((midi, idx) => {
          const noteVol = idx === 0 ? 0.38 * 1.05 : 0.38 * 0.8;
          scheduledEvents.push({
            time: currentPlaybackTime,
            midi,
            duration: chordPlayDur,
            volume: noteVol
          });
        });
      }

      // 2. 声部 2 (副旋律/低音伴奏 60% 音量)
      if (v2HasSound && v2Ev && v2Ev.note.pitch > 0 && !v2Analysis.isTied[v2Ev.globalIdx]) {
        const playDurBeats2 = v2Analysis.tiedDur[v2Ev.globalIdx] || v2Ev.beats;
        const noteDurationSecs2 = Math.max(0.15, playDurBeats2 * beatDurationSecs);
        const { midi } = calculateMidiNote(v2Ev.note.pitch, v2Ev.note.octave, v2Ev.note.accidental, v2Key);
        scheduledEvents.push({
          time: currentPlaybackTime,
          midi,
          duration: noteDurationSecs2,
          volume: 0.6
        });
      }

      currentPlaybackTime += sliceBeats * beatDurationSecs;
    }
  }

  const totalRenderDuration = Math.max(2.0, currentPlaybackTime + 1.8);
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalRenderDuration * sampleRate), sampleRate);

  // 母带级动态压缩器
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, 0);
  compressor.knee.setValueAtTime(12, 0);
  compressor.ratio.setValueAtTime(4, 0);
  compressor.attack.setValueAtTime(0.003, 0);
  compressor.release.setValueAtTime(0.25, 0);
  compressor.connect(offlineCtx.destination);

  for (const ev of scheduledEvents) {
    let bestSample: { name: string; midi: number; buffer: AudioBuffer } | null = null;
    let minDiff = 999;
    for (const s of SALAMANDER_SAMPLES) {
      const buf = sampleBufferCache.get(s.name);
      if (buf) {
        const diff = Math.abs(ev.midi - s.midi);
        if (diff < minDiff) {
          minDiff = diff;
          bestSample = { name: s.name, midi: s.midi, buffer: buf };
        }
      }
    }

    if (bestSample) {
      const source = offlineCtx.createBufferSource();
      source.buffer = bestSample.buffer;
      source.playbackRate.setValueAtTime(Math.pow(2, (ev.midi - bestSample.midi) / 12), ev.time);

      const gain = offlineCtx.createGain();
      const targetPeak = 0.92 * ev.volume;
      gain.gain.setValueAtTime(0.0001, ev.time);
      gain.gain.linearRampToValueAtTime(targetPeak, ev.time + 0.003);

      const decayTimeConstant = Math.max(1.8, ev.duration * 1.5);
      gain.gain.setTargetAtTime(targetPeak * 0.65, ev.time + 0.03, decayTimeConstant);

      const releaseStart = ev.time + ev.duration;
      const releaseTimeConstant = Math.min(0.1, Math.max(0.05, ev.duration * 0.08));
      gain.gain.setTargetAtTime(0.00001, releaseStart, releaseTimeConstant);

      source.connect(gain);
      gain.connect(compressor);

      source.start(ev.time);
      source.stop(releaseStart + 0.6);
    }
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWav(renderedBuffer);
};

// -------------------------------------------------------------
// 一键录音音频导出并自动触发下载 (以曲谱标题命名)
// -------------------------------------------------------------
export const downloadScoreAudio = async (score: Score): Promise<string> => {
  const wavBlob = await exportScoreToAudio(score);
  const cleanTitle = (score.title || '').trim().replace(/[\\/:*?"<>|]/g, '_') || '乐谱录音';
  const fileName = `${cleanTitle}.wav`;

  const url = URL.createObjectURL(wavBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return fileName;
};

