export const keyToOffset: Record<string, number> = {
  'C': 0, '#C': 1, 'bD': 1, 'D': 2, '#D': 3, 'bE': 3, 'E': 4,
  'F': 5, '#F': 6, 'bG': 6, 'G': 7, '#G': 8, 'bA': 8, 'A': 9, '#A': 10, 'bB': 10, 'B': 11
};

export const pitchToOffset = [0, 0, 2, 4, 5, 7, 9, 11]; // 1-indexed, 1=0, 2=2, ...

let audioCtx: AudioContext | null = null;

export const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const playNote = (
  pitch: number, 
  octave: number, 
  accidental: string | null, 
  keySig: string, 
  durationBeats: number, 
  tempo: number = 70
) => {
  if (pitch <= 0) return; // Rest or placeholder

  const ctx = initAudio();
  
  // Parse key signature
  const keyMatch = keySig.match(/1=([#b]?[A-G])/);
  const key = keyMatch ? keyMatch[1] : 'C';
  const baseOffset = keyToOffset[key] || 0;

  // Calculate semitones from C4
  let noteOffset = pitchToOffset[pitch];
  if (accidental === '#') noteOffset += 1;
  if (accidental === 'b') noteOffset -= 1;

  const totalSemitonesFromC4 = baseOffset + noteOffset + octave * 12;
  const semitonesFromA4 = totalSemitonesFromC4 - 9;
  const frequency = 440 * Math.pow(2, semitonesFromA4 / 12);

  // Duration in seconds
  const beatDuration = 60 / tempo;
  const noteDurationSecs = durationBeats * beatDuration;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Create a richer piano-like sound using multiple oscillators
  osc.type = 'sine';
  
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(frequency * 2, ctx.currentTime); // one octave up
  
  const gain2 = ctx.createGain();

  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  osc.connect(gain);
  osc2.connect(gain2);
  gain2.connect(gain);

  // Main envelope
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.02);
  gain.gain.setTargetAtTime(0, ctx.currentTime + 0.1, noteDurationSecs * 0.5); // Better decay curve

  // Harmonic envelope (decays faster)
  gain2.gain.setValueAtTime(0, ctx.currentTime);
  gain2.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
  gain2.gain.setTargetAtTime(0, ctx.currentTime + 0.05, noteDurationSecs * 0.2);

  gain.connect(ctx.destination);

  osc.start();
  osc2.start();
  
  // Give it slightly more time to decay fully to avoid clicks
  osc.stop(ctx.currentTime + noteDurationSecs + 0.5);
  osc2.stop(ctx.currentTime + noteDurationSecs + 0.5);
};
