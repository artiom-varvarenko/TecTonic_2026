import {Audio, Sequence, staticFile} from 'remotion';
import {narration, NARRATION_DELAY} from '../timeline';
import type {SceneId} from '../timeline';

export const SceneNarration: React.FC<{scene: SceneId}> = ({scene}) => (
	<Sequence from={NARRATION_DELAY} layout="none" name={`Narration · ${scene}`}>
		<Audio src={staticFile(narration(scene).file)} />
	</Sequence>
);

/** One-shot sound effect at a scene-relative frame. */
export const Sfx: React.FC<{at: number; src: 'click' | 'pop' | 'whoosh' | 'chime' | 'alert' | 'tick' | 'stamp'; volume?: number}> = ({at, src, volume = 0.5}) => (
	<Sequence from={Math.max(0, Math.round(at))} layout="none" name={`Sfx · ${src}`}>
		<Audio src={staticFile(`sfx/${src}.wav`)} volume={volume} />
	</Sequence>
);
