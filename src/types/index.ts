export interface StackedPitch {
  pitch: number; // 1-7
  octave: number; // -2 to 2
  accidental: '#' | 'b' | 'n' | null;
}

export type AccompanimentPattern = 'block' | 'rhythmic' | 'arpeggio' | 'waltz';

export interface Note {
  id: string;
  pitch: number; // 1-7 for Do-Si, 0 for rest, -1 for extension, -2 for placeholder
  octave: number; // -2 to 2
  duration: number; // 1 for quarter, 0.5 for eighth, 0.25 for sixteenth, etc.
  isDotted: boolean;
  accidental: '#' | 'b' | 'n' | null;
  stackedPitches?: StackedPitch[]; // 纵向叠置复音/柱式和弦音（如 1+3+5 垂直柱式）
  lyric?: string;
  lyrics?: string[];
  chord?: string; // 和弦名称，如 'C', 'Am', 'G7'
  tieStart?: boolean;
  tieEnd?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
}

export interface Measure {
  id: string;
  notes: Note[]; // 第一声部 (Voice 1 / 主声部)
  secondVoiceNotes?: Note[]; // 第二声部 (Voice 2 / 副声部，可选)
  isBreak?: boolean; // Force line break after this measure
  barlineLeft?: 'normal' | 'repeat-start' | null;
  barlineRight?: 'normal' | 'repeat-end' | 'end' | 'double' | null;
  lineAnnotation?: string;
  lineAnnotations?: string[];
}

export interface FontSettings {
  fontFamily: string;
  fontSize: number;
  color: string;
}

export interface Score {
  title: string;
  subtitle: string;
  author: string;
  keySignature: string; // e.g., '1=C'
  timeSignature: string; // e.g., '4/4'
  tempo: number; // 速度 BPM
  showTempo: boolean; // 是否显示速度
  measuresPerLine: number;
  showStartBarline: boolean;
  baseFontSize: number;
  // 样式设置
  lineHeight: number; // 行距倍数
  showMeasureNumber: boolean; // 显示小节序号
  measureNumberStyle: 'first' | 'all' | 'none'; // 小节序号样式
  firstLineIndent: boolean; // 首行缩进
  // 字体样式
  titleFont: FontSettings;
  subtitleFont: FontSettings;
  noteFont: FontSettings;
  lyricFont: FontSettings;
  chordFont: FontSettings;
  annotationFont: FontSettings;
  // 小节样式
  barlineSize: number; // 1-6 档位
  barlineColor: string;
  octaveDotSize?: number; // 高低音点大小 (px)
  showChords?: boolean; // 是否显示和弦标记
  playAccompaniment?: boolean; // 播放时是否同步演奏和弦伴奏
  accompanimentPattern?: AccompanimentPattern; // 伴奏织体类型 ('block' | 'rhythmic' | 'arpeggio' | 'waltz')
  hasSecondVoice?: boolean; // 是否开启双声部打谱 (第二声部)
  voice1Name?: string; // 第一声部名称 (如 高音部 / 右手)
  voice2Name?: string; // 第二声部名称 (如 低音部 / 左手)
  voice1KeySignature?: string; // 第一声部独立调号 (默认为 keySignature)
  voice2KeySignature?: string; // 第二声部独立调号 (可独立设为 1=C, 1=G, 1=F, 1=bB 等)
  // 页码
  showPageNumber: boolean;
  pageNumberStyle: string;
  pageNumberFont: FontSettings;
  pageNumberPosition: 'left' | 'center' | 'right';
  // 页面边距与宽度
  pageWidth: number;
  pageMarginTop: number;
  pageMarginBottom: number;
  pageMarginLeft: number;
  pageMarginRight: number;
  measures: Measure[];
}

export interface KeyOptionItem {
  value: string;      // '1=C', '1=G', etc.
  shortName: string;  // 'C', 'G', etc.
  label: string;      // '1=C (自然)', '1=G (1升)', etc.
  desc: string;       // '无升降', '1个升号', etc.
  accidentals: string;// '0', '1♯', '2♯', '1♭', etc.
}

// 音乐理论与简谱中标准的 15 个自然大调 (0~7升号, 1~7降号)
export const STANDARD_15_KEYS: KeyOptionItem[] = [
  // 自然大调 (无升降)
  { value: '1=C', shortName: 'C', label: '1=C (自然)', desc: 'C大调 (无升降)', accidentals: '0' },
  // 7 个常用升号大调 (1~7 升)
  { value: '1=G', shortName: 'G', label: '1=G (1升)', desc: 'G大调 (1个升号 ♯F)', accidentals: '1♯' },
  { value: '1=D', shortName: 'D', label: '1=D (2升)', desc: 'D大调 (2个升号 ♯F ♯C)', accidentals: '2♯' },
  { value: '1=A', shortName: 'A', label: '1=A (3升)', desc: 'A大调 (3个升号 ♯F ♯C ♯G)', accidentals: '3♯' },
  { value: '1=E', shortName: 'E', label: '1=E (4升)', desc: 'E大调 (4个升号 4♯)', accidentals: '4♯' },
  { value: '1=B', shortName: 'B', label: '1=B (5升)', desc: 'B大调 (5个升号 5♯)', accidentals: '5♯' },
  { value: '1=#F', shortName: '#F', label: '1=♯F (6升)', desc: '♯F大调 (6个升号 6♯)', accidentals: '6♯' },
  { value: '1=#C', shortName: '#C', label: '1=♯C (7升)', desc: '♯C大调 (7个升号 7♯)', accidentals: '7♯' },
  // 7 个常用降号大调 (1~7 降)
  { value: '1=F', shortName: 'F', label: '1=F (1降)', desc: 'F大调 (1个降号 ♭B)', accidentals: '1♭' },
  { value: '1=bB', shortName: 'bB', label: '1=♭B (2降)', desc: '♭B大调 (2个降号 ♭B ♭E)', accidentals: '2♭' },
  { value: '1=bE', shortName: 'bE', label: '1=♭E (3降)', desc: '♭E大调 (3个降号 3♭)', accidentals: '3♭' },
  { value: '1=bA', shortName: 'bA', label: '1=♭A (4降)', desc: '♭A大调 (4个降号 4♭)', accidentals: '4♭' },
  { value: '1=bD', shortName: 'bD', label: '1=♭D (5降)', desc: '♭D大调 (5个降号 5♭)', accidentals: '5♭' },
  { value: '1=bG', shortName: 'bG', label: '1=♭G (6降)', desc: '♭G大调 (6个降号 6♭)', accidentals: '6♭' },
  { value: '1=bC', shortName: 'bC', label: '1=♭C (7降)', desc: '♭C大调 (7个降号 7♭)', accidentals: '7♭' },
];
