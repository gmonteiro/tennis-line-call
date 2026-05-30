let audioContext: AudioContext | null = null;
let outBuffer: AudioBuffer | null = null;
let faultBuffer: AudioBuffer | null = null;

async function loadSound(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return audioContext!.decodeAudioData(arrayBuffer);
}

/**
 * Initialize audio system. MUST be called from a user gesture handler (click/touch).
 */
export async function initAudio(): Promise<void> {
  if (audioContext) {
    await audioContext.resume();
    return;
  }

  audioContext = new AudioContext();

  const [out, fault] = await Promise.all([
    loadSound("/sounds/out.mp3"),
    loadSound("/sounds/fault.mp3"),
  ]);

  outBuffer = out;
  faultBuffer = fault;
}

function playBuffer(buffer: AudioBuffer | null): void {
  if (!audioContext || !buffer) return;

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);
}

export function playOut(): void {
  playBuffer(outBuffer);
}

export function playFault(): void {
  playBuffer(faultBuffer);
}

export function isAudioReady(): boolean {
  return audioContext !== null && audioContext.state === "running";
}
