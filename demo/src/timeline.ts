import manifest from './narration/manifest.json';
import script from './narration/script.json';

export const SCENE_IDS = [
	'hook',
	'problem',
	'reveal',
	'overview',
	'grading',
	'applicability',
	'triage',
	'routing',
	'voice',
	'verified',
	'teams',
	'ship',
	'team',
	'outro',
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

type CueTiming = {start: number; end: number; words?: [string, number][]};
type SceneNarration = {file: string; durationInFrames: number; cues: Record<string, CueTiming>};
const scenes = manifest.scenes as unknown as Record<SceneId, SceneNarration>;
const texts = script.scenes as Record<SceneId, {id: string; text: string}[]>;

/** Narration starts this many frames into its scene (inside the incoming transition). */
export const NARRATION_DELAY = 14;
export const TRANSITION_FRAMES = 16;

// Minimum length and hold after the narration, per scene: visuals can outlast the voice.
const MIN_FRAMES: Partial<Record<SceneId, number>> = {reveal: 215, team: 250, outro: 260};
const HOLD_FRAMES: Partial<Record<SceneId, number>> = {reveal: 45, verified: 40, ship: 36, team: 60, outro: 90};

export const narration = (scene: SceneId) => scenes[scene];

export const sceneDuration = (scene: SceneId) =>
	Math.max(
		MIN_FRAMES[scene] ?? 0,
		NARRATION_DELAY + scenes[scene].durationInFrames + (HOLD_FRAMES[scene] ?? 28),
	);

export const TOTAL_FRAMES =
	SCENE_IDS.reduce((sum, id) => sum + sceneDuration(id), 0) - (SCENE_IDS.length - 1) * TRANSITION_FRAMES;

/** Scene-relative frame at which a narration cue starts. */
export const cue = (scene: SceneId, id: string): number => {
	const timing = scenes[scene].cues[id];
	if (!timing) throw new Error(`Unknown cue ${scene}.${id}`);
	return NARRATION_DELAY + timing.start;
};

/**
 * Scene-relative frame at which `word` is spoken inside a cue. Imported takes carry exact word
 * onsets (Whisper); otherwise it is estimated from the word's character position, since TTS
 * speaks at a near-constant rate. Good to a few frames either way.
 */
export const cueWord = (scene: SceneId, id: string, word: string): number => {
	const timing = scenes[scene].cues[id];
	const text = texts[scene].find((c) => c.id === id)?.text;
	if (!timing || !text) throw new Error(`Unknown cue ${scene}.${id}`);
	// First word of `word`, normalised the way the take's word list is (lowercase, hyphens split).
	const firstWord = word.toLowerCase().replace(/-/g, ' ').match(/[a-z0-9']+/)?.[0];
	const spoken = timing.words?.find(([w]) => w === firstWord);
	if (spoken) return NARRATION_DELAY + spoken[1];
	const at = text.indexOf(word);
	if (at < 0) throw new Error(`"${word}" not in cue ${scene}.${id}`);
	return NARRATION_DELAY + Math.round(timing.start + (at / text.length) * (timing.end - timing.start));
};

/** Global frame at which a scene starts (for the progress bar). */
export const sceneStart = (scene: SceneId) => {
	let start = 0;
	for (const id of SCENE_IDS) {
		if (id === scene) return start;
		start += sceneDuration(id) - TRANSITION_FRAMES;
	}
	return start;
};
