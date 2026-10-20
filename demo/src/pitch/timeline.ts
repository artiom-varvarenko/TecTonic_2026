import manifest from '../narration/manifest.json';
import script from '../narration/script.json';

// The one-minute pitch: five scenes, narrated by the same voice clones as the demo.
export const PITCH_IDS = ['pitch_hook', 'pitch_grade', 'pitch_ask', 'pitch_where', 'pitch_close'] as const;
export type PitchId = (typeof PITCH_IDS)[number];

type CueTiming = {start: number; end: number; words?: [string, number][]};
type Narration = {file: string; durationInFrames: number; cues: Record<string, CueTiming>};
const scenes = manifest.scenes as unknown as Record<PitchId, Narration>;
const texts = script.scenes as unknown as Record<PitchId, {id: string; text: string; text_elevenlabs?: string}[]>;

/** The narration plays this much faster than recorded (pitch preserved) to fit one minute. */
export const TEMPO = 1.1;
export const NARRATION_DELAY = 10;
export const TRANSITION_FRAMES = 14;
const HOLD: Record<PitchId, number> = {pitch_hook: 8, pitch_grade: 10, pitch_ask: 12, pitch_where: 8, pitch_close: 0};
/** Total length of the pitch: exactly one minute at 30 fps; the close takes whatever is left. */
export const PITCH_FRAMES = 1800;

const scaled = (frames: number) => Math.round(frames / TEMPO);

export const narration = (scene: PitchId) => scenes[scene];

const naturalDuration = (scene: PitchId) => NARRATION_DELAY + scaled(scenes[scene].durationInFrames) + HOLD[scene];

export const pitchDuration = (scene: PitchId): number => {
	if (scene !== 'pitch_close') return naturalDuration(scene);
	const before = PITCH_IDS.slice(0, -1).reduce((sum, id) => sum + naturalDuration(id) - TRANSITION_FRAMES, 0);
	return PITCH_FRAMES - before;
};

export const pitchStart = (scene: PitchId) => {
	let start = 0;
	for (const id of PITCH_IDS) {
		if (id === scene) return start;
		start += pitchDuration(id) - TRANSITION_FRAMES;
	}
	return start;
};

/** Scene-relative frame at which a cue starts. */
export const cue = (scene: PitchId, id: string): number => {
	const timing = scenes[scene].cues[id];
	if (!timing) throw new Error(`Unknown cue ${scene}.${id}`);
	return NARRATION_DELAY + scaled(timing.start);
};

/** Scene-relative frame at which a cue ends. */
export const cueEnd = (scene: PitchId, id: string): number => NARRATION_DELAY + scaled(scenes[scene].cues[id].end);

/** Scene-relative frame at which `word` is spoken (the take's Whisper word onsets). */
export const cueWord = (scene: PitchId, id: string, word: string): number => {
	const timing = scenes[scene].cues[id];
	if (!timing) throw new Error(`Unknown cue ${scene}.${id}`);
	const first = word.toLowerCase().replace(/-/g, ' ').match(/[a-z0-9']+/)?.[0];
	const spoken = timing.words?.find(([w]) => w === first);
	if (spoken) return NARRATION_DELAY + scaled(spoken[1]);
	const text = texts[scene].find((c) => c.id === id);
	const said = text?.text_elevenlabs ?? text?.text ?? '';
	const at = said.indexOf(word);
	if (at < 0) throw new Error(`"${word}" not in cue ${scene}.${id}`);
	return NARRATION_DELAY + scaled(Math.round(timing.start + (at / said.length) * (timing.end - timing.start)));
};
