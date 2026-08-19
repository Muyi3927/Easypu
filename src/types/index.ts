export interface Note {
  id: string;
  pitch: number; // 1-7 for Do-Si, 0 for rest, -1 for placeholder
  octave: number; // -1 for lower dot, 0 for normal, 1 for higher dot
  duration: number; // 1 for quarter, 0.5 for eighth, 0.25 for sixteenth, etc.
  isDotted: boolean;
  accidental: '#' | 'b' | 'n' | null;
  lyric?: string;
  lyrics?: string[];
  tieStart?: boolean;
  tieEnd?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
}

export interface Measure {
  id: string;
  notes: Note[];
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
