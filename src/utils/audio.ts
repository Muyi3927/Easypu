// -------------------------------------------------------------
// Easypu 施坦威/雅马哈 C5 音乐厅级高保真原声大三角钢琴音频引擎
// 基于 Salamander Grand Piano 经典原声母带采样库
// 1. 30 个高保真采区采样点覆盖 A0 ~ C8 全音域
// 2. 采样级高精度音高插值 (Web Audio Resampling & Pitch Shifting)
// 3. 12 自然大调首调唱名法 (Movable-Do) 国际标准律制 (A4=440Hz)
// 4. 自然琴箱声学共鸣与毛毡琴槌释放衰减 (Acoustic Soundboard Envelope)
// -------------------------------------------------------------

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
  tempo: number = 120
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
    playSalamanderSample(ctx, bestSample.buffer, midi - bestSample.midi, noteDurationSecs);
    return;
  }

  // 3. 采样未加载完成时的平滑后备声学引擎
  const frequency = 440 * Math.pow(2, (midi - 69) / 12);
  playAcousticModeledNote(ctx, frequency, noteDurationSecs);
};

// Salamander Grand Piano 采样播放核心函数 (零断裂、零底噪、丝滑阻尼释放)
const playSalamanderSample = (
  ctx: AudioContext,
  buffer: AudioBuffer,
  semitoneOffset: number,
  durationSecs: number
) => {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // 根据音高半音差值计算精准回放速度 (精确还原音高)
  source.playbackRate.setValueAtTime(Math.pow(2, semitoneOffset / 12), ctx.currentTime);

  const gain = ctx.createGain();
  const now = ctx.currentTime;

  // 1. 击弦启动 (5ms 极速无破音软起动)
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.9, now + 0.005);

  // 2. 持续发声与琴体自然衰减 (Sustain Decay)
  gain.gain.setTargetAtTime(0.4, now + 0.04, 0.8);

  // 3. 离键阻尼释放 (Smooth Damper Release，连续指数衰减，彻底杜绝任何点击滋滋杂音)
  const releaseStart = now + durationSecs;
  gain.gain.setTargetAtTime(0.00001, releaseStart, 0.1);

  source.connect(gain);
  if (masterCompressor) {
    gain.connect(masterCompressor);
  } else {
    gain.connect(ctx.destination);
  }

  source.start(now);
  // 保证音量衰减完全归零后才切断音源
  source.stop(releaseStart + 0.6);
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

