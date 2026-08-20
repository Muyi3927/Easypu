// -------------------------------------------------------------
// Easypu 和弦解析与智能伴奏生成引擎 (Chord Engine)
// 1. 和弦名称到标准 MIDI 复音解析 (Triads, 7ths, Suspended, Diminished)
// 2. 12 自然大调自动级数和弦生成 (Diatonic Chords: Ⅰ ~ Ⅵ 级)
// 3. 经典和弦进行套路模版 (卡农进行、流行 4536251、流行 1564、民谣 1645 等)
// -------------------------------------------------------------

import { getKeyOffset } from './audio';

export interface ChordDefinition {
  name: string;
  label: string;
  degree?: string;
}

export interface ChordProgressionTemplate {
  name: string;
  description: string;
  degrees: number[];
}

const ROOT_NOTE_OFFSETS: Record<string, number> = {
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

const NOTE_NAME_BY_SEMITONE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 解析和弦名称得到对应的所有 MIDI 音符列表 (默认在 3-4 八度伴奏区)
export const parseChordToMidiNotes = (chordName: string): number[] => {
  if (!chordName) return [];
  const clean = chordName.trim();
  if (!clean) return [];

  // 正则拆分根音与和弦性质
  const match = clean.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!match) return [];

  const rawRoot = match[1];
  const quality = match[2].toLowerCase().trim();

  // 标准化根音
  let rootNormalized = rawRoot[0].toUpperCase();
  if (rawRoot.length > 1) {
    const acc = rawRoot[1] === '#' ? '#' : 'b';
    rootNormalized += acc;
  }

  const rootOffset = ROOT_NOTE_OFFSETS[rootNormalized] ?? 0;
  // 和弦低音基准放在 C3 组 (MIDI 48)
  const baseRootMidi = 48 + rootOffset;

  // 根据和弦性质计算半音音程
  let intervals: number[] = [0, 4, 7]; // 默认大三和弦 (Major)

  if (quality === 'm' || quality === 'min' || quality === '-') {
    // 小三和弦
    intervals = [0, 3, 7];
  } else if (quality === '7' || quality === 'dom7') {
    // 属七和弦
    intervals = [0, 4, 7, 10];
  } else if (quality === 'maj7' || quality === 'm7' || quality === 'Δ7' || quality === 'M7') {
    // 大七和弦 / 小七和弦
    intervals = quality.startsWith('m7') ? [0, 3, 7, 10] : [0, 4, 7, 11];
  } else if (quality === 'm7-5' || quality === 'm7b5' || quality === 'ø') {
    // 半减七和弦
    intervals = [0, 3, 6, 10];
  } else if (quality === 'dim' || quality === 'dim7' || quality === '°') {
    // 减和弦
    intervals = [0, 3, 6, 9];
  } else if (quality === 'aug' || quality === '+') {
    // 增和弦
    intervals = [0, 4, 8];
  } else if (quality === 'sus4' || quality === 'sus') {
    // 挂四和弦
    intervals = [0, 5, 7];
  } else if (quality === 'sus2') {
    // 挂二和弦
    intervals = [0, 2, 7];
  } else if (quality === 'add9' || quality === '2') {
    // 加九和弦
    intervals = [0, 4, 7, 14];
  } else if (quality === '6') {
    // 六和弦
    intervals = [0, 4, 7, 9];
  } else if (quality === 'm6') {
    intervals = [0, 3, 7, 9];
  } else if (quality === '5') {
    // 五和弦 (Power chord)
    intervals = [0, 7, 12];
  }

  // 生成完整复音 (包含一个倍低八度根音 Bass，使真钢伴奏极为深厚饱满)
  const bassMidi = baseRootMidi - 12;
  const chordMidis = intervals.map(iv => baseRootMidi + iv);

  return [bassMidi, ...chordMidis];
};

// 根据当前曲谱调号自动计算该大调对应的 1~7 级自然和弦
export const getDiatonicChordsForKey = (keySig: string = '1=C'): ChordDefinition[] => {
  const tonicOffset = getKeyOffset(keySig);
  // 自然大调音阶级数音程: 0 (Ⅰ), 2 (Ⅱ), 4 (Ⅲ), 5 (Ⅳ), 7 (Ⅴ), 9 (Ⅵ), 11 (Ⅶ)
  const scaleIntervals = [
    { offset: 0, suffix: '', degree: 'Ⅰ (主和弦)' },
    { offset: 2, suffix: 'm', degree: 'Ⅱm' },
    { offset: 4, suffix: 'm', degree: 'Ⅲm' },
    { offset: 5, suffix: '', degree: 'Ⅳ (下属)' },
    { offset: 7, suffix: '', degree: 'Ⅴ (属和弦)' },
    { offset: 7, suffix: '7', degree: 'Ⅴ7 (属七)' },
    { offset: 9, suffix: 'm', degree: 'Ⅵm' },
    { offset: 11, suffix: 'dim', degree: 'Ⅶ°' },
  ];

  return scaleIntervals.map(({ offset, suffix, degree }) => {
    const semitone = (tonicOffset + offset) % 12;
    const rootName = NOTE_NAME_BY_SEMITONE[semitone];
    const name = `${rootName}${suffix}`;
    return {
      name,
      label: name,
      degree
    };
  });
};

// 经典流行/民谣/古典和弦进行模版
export const CHORD_PROGRESSION_TEMPLATES: ChordProgressionTemplate[] = [
  {
    name: '卡农进行 (经典传世)',
    description: '1 - 5 - 6 - 3 - 4 - 1 - 4 - 5',
    degrees: [1, 5, 6, 3, 4, 1, 4, 5]
  },
  {
    name: '流行黄金进行 (4536251)',
    description: '4 - 5 - 3m - 6m - 2m - 5 - 1',
    degrees: [4, 5, 3, 6, 2, 5, 1]
  },
  {
    name: '流行流行进行 (1564)',
    description: '1 - 5 - 6m - 4 (万能流行金曲模版)',
    degrees: [1, 5, 6, 4]
  },
  {
    name: '民谣经典 (1645)',
    description: '1 - 6m - 4 - 5 (《同桌的你》《童年》)',
    degrees: [1, 6, 4, 5]
  },
  {
    name: '伤感抒情 (6415)',
    description: '6m - 4 - 1 - 5 (欧美流行大热套路)',
    degrees: [6, 4, 1, 5]
  },
  {
    name: '爵士进行 (251)',
    description: '2m - 5(7) - 1',
    degrees: [2, 5, 1]
  }
];

// 将级数序列转换为对应调号的具体和弦名称数组
export const resolveProgressionToChordNames = (
  template: ChordProgressionTemplate,
  keySig: string = '1=C'
): string[] => {
  const diatonic = getDiatonicChordsForKey(keySig);
  const diatonicMap: Record<number, string> = {
    1: diatonic[0].name,
    2: diatonic[1].name,
    3: diatonic[2].name,
    4: diatonic[3].name,
    5: diatonic[4].name,
    6: diatonic[6].name,
    7: diatonic[7].name,
  };

  return template.degrees.map(deg => diatonicMap[deg] || diatonic[0].name);
};
