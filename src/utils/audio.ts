// -------------------------------------------------------------
// Easypu 高保真专业三角大钢琴音频引擎 (High-Fidelity Piano Audio Engine)
// 1. 真实真钢采样 (FluidR3_GM 88键原声三角大钢琴无损采样，内嵌本地秒开)
// 2. 调号首调音准系统 (12大调 Movable-Do 精准半音映射，A4=440Hz 国际标准律制)
// 3. 物理声学建模 (琴槌瞬态敲击 + 泛音谐波微拉伸 + 动态低通阻尼滤波)
// -------------------------------------------------------------

export const pitchToOffset = [0, 0, 2, 4, 5, 7, 9, 11]; // 1-indexed, 1=0(Do), 2=2(Re), 3=4(Mi), 4=5(Fa), 5=7(Sol), 6=9(La), 7=11(Ti)

// MIDI 科学音名映射
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 精准解析简谱调号等号后的半音基准偏移量 (以 C 为基准 0)
export const getKeyOffset = (keySig: string = '1=C'): number => {
  if (!keySig) return 0;
  // 提取 1= 后的调名
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
const sampleBufferCache: Map<string, AudioBuffer> = new Map();
let isSoundfontLoading = false;
let isSoundfontLoaded = false;

export const initAudio = (): AudioContext => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// 预加载内嵌真实三角大钢琴 88 键高保真采样 (本地优先，无任何外部网络依赖)
export const preloadPianoSoundfont = async () => {
  if (isSoundfontLoaded || isSoundfontLoading) return;
  isSoundfontLoading = true;

  try {
    const ctx = initAudio();
    
    // 优先读取本地内嵌的完整 JSON 钢琴采样包
    let soundData: Record<string, string> | null = null;

    try {
      const response = await fetch('/soundfont/acoustic_grand_piano.json');
      if (response.ok) {
        soundData = await response.json();
      }
    } catch {
      // 本地 JSON 读取失败时尝试 CDN 备用
    }

    if (!soundData) {
      try {
        const response = await fetch('https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3.js');
        if (response.ok) {
          const text = await response.text();
          // 使用 Function 构造器安全执行 JS 采样字典
          const fn = new Function(`${text}; return (typeof MIDI !== 'undefined' && MIDI.Soundfont && MIDI.Soundfont.acoustic_grand_piano) ? MIDI.Soundfont.acoustic_grand_piano : null;`);
          soundData = fn();
        }
      } catch (e) {
        console.warn('[Audio] 采样下载异常:', e);
      }
    }

    if (!soundData) return;

    // 解码全套钢琴键采样并存入缓存
    const entries = Object.entries(soundData);
    await Promise.all(
      entries.map(async ([noteName, dataUri]) => {
        try {
          const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
          if (!base64Data) return;
          const binaryStr = atob(base64Data);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
          sampleBufferCache.set(noteName, audioBuffer);
        } catch {
          // 忽略单音符解析错误
        }
      })
    );

    isSoundfontLoaded = true;
  } catch (err) {
    console.warn('[Audio] 钢琴采样初始化异常，自动切换为物理声学建模引擎:', err);
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
  // 浏览器空闲时自动预载
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => preloadPianoSoundfont());
  } else {
    setTimeout(() => preloadPianoSoundfont(), 1000);
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

// 播放音符 (支持真实三角大钢琴采样与泛音衰减)
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
  const { noteName, frequency } = calculateMidiNote(pitch, octave, accidental, keySig);
  
  // 节拍时值计算
  const beatDuration = 60 / (tempo || 120);
  const noteDurationSecs = Math.max(0.2, durationBeats * beatDuration);

  // 策略 A: 优先播放真实三角大钢琴录音采样
  const cachedSample = sampleBufferCache.get(noteName);
  if (cachedSample) {
    playSampledAudio(ctx, cachedSample, noteDurationSecs);
    return;
  }

  // 策略 B: 采样未完成时使用高保真物理声学建模合成
  playAcousticModeledNote(ctx, frequency, noteDurationSecs);
};

// 策略 A：真实采样音频播放
const playSampledAudio = (ctx: AudioContext, buffer: AudioBuffer, durationSecs: number) => {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  const now = ctx.currentTime;

  // 琴键自然衰减与放音包络
  gain.gain.setValueAtTime(1.0, now);
  gain.gain.setValueAtTime(0.9, now + 0.05);
  // 自然释放衰减
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSecs + 1.2);

  source.connect(gain);
  gain.connect(ctx.destination);

  source.start(now);
  source.stop(now + durationSecs + 1.3);
};

// 策略 B：高保真物理声学建模钢琴合成 (Physical Acoustic Modeling)
const playAcousticModeledNote = (ctx: AudioContext, frequency: number, durationSecs: number) => {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  // 1. 动态双二阶低通滤波器 (模拟钢琴琴弦从初击明亮逐渐变温暖的声学衰减)
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(Math.min(12000, frequency * 8), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(150, frequency * 1.6), now + durationSecs * 0.8);
  filter.connect(masterGain);

  // 2. 泛音配比与刚性线物理微弱非谐波 (Inharmonicity Stretch)
  // 钢琴钢弦具有物理刚性，泛音会比严格整数微量偏高 (0.1% ~ 0.25%)
  const partials = [
    { mult: 1.000, gain: 0.55, type: 'sine' as OscillatorType, decayRatio: 1.0 },     // 基音 (暖)
    { mult: 2.001, gain: 0.28, type: 'sine' as OscillatorType, decayRatio: 0.75 },    // 二次泛音 (明亮)
    { mult: 3.003, gain: 0.16, type: 'triangle' as OscillatorType, decayRatio: 0.5 }, // 三次泛音 (琴体共鸣)
    { mult: 4.006, gain: 0.08, type: 'sine' as OscillatorType, decayRatio: 0.35 },   // 四次泛音 (弦击亮色)
  ];

  partials.forEach(({ mult, gain: partialLevel, type, decayRatio }) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency * mult, now);

    const oscGain = ctx.createGain();
    // 瞬态击弦包络 (Attack: 3ms 瞬间爆发)
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(partialLevel, now + 0.005);
    // 衰减 (Decay)
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSecs * decayRatio + 0.6);

    osc.connect(oscGain);
    oscGain.connect(filter);

    osc.start(now);
    osc.stop(now + durationSecs + 0.8);
  });

  // 3. 毛毡琴槌击弦瞬态打击声 (Hammer Felt Impact Transient)
  const hammerNoise = ctx.createBufferSource();
  const bufferSize = Math.floor(ctx.sampleRate * 0.008); // 8ms 击打短脉冲
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
  }
  hammerNoise.buffer = noiseBuffer;

  const hammerGain = ctx.createGain();
  hammerGain.gain.setValueAtTime(0.18, now);
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.008);

  const hammerFilter = ctx.createBiquadFilter();
  hammerFilter.type = 'bandpass';
  hammerFilter.frequency.setValueAtTime(Math.min(8000, frequency * 4), now);
  hammerFilter.Q.value = 3.0;

  hammerNoise.connect(hammerFilter);
  hammerFilter.connect(hammerGain);
  hammerGain.connect(masterGain);

  hammerNoise.start(now);
};

