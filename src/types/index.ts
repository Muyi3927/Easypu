export interface Note {
  id: string;
  pitch: number; // 1-7 for Do-Si, 0 for rest, -1 for placeholder
  octave: number; // -1 for lower dot, 0 for normal, 1 for higher dot
  duration: number; // 1 for quarter, 0.5 for eighth, 0.25 for sixteenth, etc.
  isDotted: boolean;
  accidental: '#' | 'b' | 'n' | null;
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
