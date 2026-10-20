import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, SERIF} from '../theme';
import {CLAMP, fadeUp, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {Ladder} from '../components/Ladder';
import {Sfx} from '../components/SceneAudio';
import {Wordmark} from '../scenes/Reveal';
import {PitchNarration} from './PitchHook';
import {cue, cueWord} from './timeline';

const LINES = [
	{head: 'AI', verb: 'reads.', cue: 'principle', word: 'AI', color: '#7f9cff'},
	{head: 'Rules', verb: 'judge.', cue: 'principle', word: 'Rules', color: GRADE_BG.C},
	{head: 'People', verb: 'verify.', cue: 'humans', word: 'People', color: GRADE_BG.A},
];

export const PitchClose: React.FC = () => {
	const frame = useCurrentFrame();
	const endAt = cue('pitch_close', 'end') - 8;
	const out = interpolate(frame, [endAt - 10, endAt + 4], [1, 0], CLAMP);
	const logo = useEnter(endAt);
	const tagline = useEnter(endAt + 14);
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center'}}>
				<PitchNarration scene="pitch_close" />
				<Sfx at={endAt} src="whoosh" volume={0.35} />
				<div style={{position: 'absolute', display: 'flex', gap: 70, opacity: out, transform: `scale(${0.95 + 0.05 * out})`}}>
					{LINES.map((l) => {
						const p = useEnter(cueWord('pitch_close', l.cue, l.word) - 4);
						return (
							<div key={l.head} style={{fontFamily: SERIF, fontSize: 120, color: C.darkText, whiteSpace: 'nowrap', ...fadeUp(p, 40)}}>
								{l.head} <em style={{color: l.color}}>{l.verb}</em>
							</div>
						);
					})}
				</div>
				<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: logo}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 56}}>
						{frame >= endAt - 4 ? <Ladder enterAt={endAt} width={180} rowHeight={24} gap={5} stagger={1.5} variant="hero" dark /> : <div style={{width: 180}} />}
						<Wordmark delay={endAt + 2} size={124} />
					</div>
					<div style={{marginTop: 46, fontFamily: SERIF, fontSize: 52, color: C.darkText, ...fadeUp(tagline, 16)}}>
						Search finds it. <em style={{color: C.darkMuted}}>TrustLabel shows whether you can rely on it.</em>
					</div>
					<div style={{marginTop: 30, fontSize: 21, color: C.darkFaint, letterSpacing: 2.6, textTransform: 'uppercase', fontWeight: 600, ...fadeUp(tagline, 10)}}>
						Rufina Chyhohidze · Artiom Varvarenko · SD Worx challenge · Tectonic 2026
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};
