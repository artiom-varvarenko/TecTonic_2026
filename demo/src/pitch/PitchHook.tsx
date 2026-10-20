import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {C, FONT, SERIF, SHADOW_LG} from '../theme';
import {BOUNCY, CLAMP, fadeUp, popIn, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {Icon} from '../components/Icon';
import {Typewriter} from '../components/Typewriter';
import {Sfx} from '../components/SceneAudio';
import {PITCH, pitchSource} from './data';
import {cue, cueWord, narration, NARRATION_DELAY, TEMPO} from './timeline';
import type {PitchId} from './timeline';

/** One scene's narration, played TEMPO× faster (pitch preserved). */
export const PitchNarration: React.FC<{scene: PitchId}> = ({scene}) => (
	<Sequence from={NARRATION_DELAY} layout="none" name={`Narration · ${scene}`}>
		<Audio src={staticFile(narration(scene).file)} playbackRate={TEMPO} />
	</Sequence>
);

// What a search assistant returns for the question: four values, each from a real source in the seed data.
const ANSWERS = [
	{id: 'POL-BE-031', word: '650'},
	{id: 'POL-NL-018', word: '700'},
	{id: 'POL-BE-044', word: '750'},
	{id: 'TEAMS-5127', word: '800'},
].map((a) => ({...a, source: pitchSource(PITCH.before, a.id)}));

export const PitchHook: React.FC = () => {
	const frame = useCurrentFrame();
	const win = useEnter(2);
	const found = useEnter(cueWord('pitch_hook', 'four', 'finds'), SNAPPY);
	const which = useEnter(cue('pitch_hook', 'which') - 4, BOUNCY);
	const shake = (i: number) => (frame > cue('pitch_hook', 'which') ? Math.sin((frame + i * 7) / 3) * 3 * Math.max(0, 1 - (frame - cue('pitch_hook', 'which')) / 40) : 0);
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center'}}>
				<PitchNarration scene="pitch_hook" />
				{ANSWERS.map((a) => (
					<Sfx key={a.id} at={cueWord('pitch_hook', 'four', a.word)} src="pop" volume={0.35} />
				))}
				<Sfx at={cue('pitch_hook', 'which')} src="alert" volume={0.3} />
				<div style={{marginTop: 120, width: 1560, borderRadius: 24, background: C.surface, boxShadow: SHADOW_LG, overflow: 'hidden', ...fadeUp(win, 40)}}>
					<div style={{height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: `1px solid ${C.line}`, fontSize: 22, fontWeight: 600, color: C.ink}}>
						<span style={{width: 36, height: 36, borderRadius: 10, background: C.accent, color: '#fff', display: 'grid', placeItems: 'center'}}>
							<Icon name="sparkle" size={20} />
						</span>
						Your assistant
						<span style={{fontSize: 17, fontWeight: 500, color: C.muted}}>· searches SharePoint, Teams and Outlook</span>
					</div>
					<div style={{padding: '26px 30px 30px', display: 'flex', flexDirection: 'column', gap: 20}}>
						<div style={{alignSelf: 'flex-end', background: '#e8edfd', color: C.ink, borderRadius: 16, padding: '14px 20px', fontSize: 26}}>
							<Typewriter text={PITCH.question} start={8} cps={34} caret={frame < cueWord('pitch_hook', 'four', 'finds')} />
						</div>
						<div style={{fontSize: 22, color: C.muted, ...fadeUp(found, 10)}}>I found 4 answers in your sources:</div>
						<div style={{display: 'flex', gap: 18}}>
							{ANSWERS.map((a, i) => {
								const p = useEnter(cueWord('pitch_hook', 'four', a.word) - 4, BOUNCY);
								return (
									<div
										key={a.id}
										style={{
											flex: 1,
											borderRadius: 18,
											border: `1px solid ${C.lineStrong}`,
											padding: '24px 24px',
											background: C.surface2,
											...popIn(p, 0.7),
											transform: `scale(${0.7 + 0.3 * Math.min(1, p)}) translateX(${shake(i)}px)`,
										}}
									>
										<div style={{fontFamily: SERIF, fontSize: 84, lineHeight: 1, color: C.ink}}>€{a.source.value}</div>
										<div style={{fontSize: 16, color: C.muted, marginTop: 4}}>per month</div>
										<div style={{fontSize: 21, fontWeight: 600, color: C.ink2, marginTop: 16, lineHeight: 1.3}}>{a.source.title}</div>
										<div style={{fontSize: 17, color: C.muted, marginTop: 6}}>{a.source.source}</div>
									</div>
								);
							})}
						</div>
					</div>
				</div>
				<div style={{marginTop: 54, fontFamily: SERIF, fontSize: 104, color: C.darkText, letterSpacing: -1, ...popIn(which, 0.85)}}>
					Which one is <em style={{color: '#ff9a8f'}}>right?</em>
				</div>
				<div style={{position: 'absolute', bottom: 40, fontSize: 18, color: C.darkFaint, opacity: interpolate(frame, [20, 40], [0, 1], CLAMP)}}>
					Real sources from the TrustLabel demo data · Belgium, 20 October 2026
				</div>
			</AbsoluteFill>
		</Stage>
	);
};
