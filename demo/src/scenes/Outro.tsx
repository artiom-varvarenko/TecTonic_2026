import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, SERIF} from '../theme';
import {CLAMP, fadeUp, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {Ladder} from '../components/Ladder';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {Wordmark} from './Reveal';
import {cue, cueWord} from '../timeline';

const PRINCIPLES = [
	{head: 'AI', verb: 'reads.', cue: 'principle', word: 'AI', body: 'ElevenLabs Scribe and OpenAI turn voice and chat into claims. Every quote is checked verbatim.', color: '#7f9cff'},
	{head: 'Rules', verb: 'judge.', cue: 'principle', word: 'Rules', body: 'Deterministic A–G grades. No model assigns one or answers a question.', color: GRADE_BG.C},
	{head: 'Humans', verb: 'verify.', cue: 'humans', word: 'Humans', body: 'Experts confirm. Verified answers expire and stay in their context.', color: GRADE_BG.A},
];

export const Outro: React.FC = () => {
	const frame = useCurrentFrame();
	const endAt = cue('outro', 'end') - 14;
	const out = interpolate(frame, [endAt - 12, endAt + 6], [1, 0], CLAMP);
	const logo = useEnter(endAt);
	const tagline = useEnter(endAt + 26);
	const footer = useEnter(endAt + 46);
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center'}}>
				<SceneNarration scene="outro" />
				<Sfx at={endAt} src="whoosh" volume={0.35} />
				<div style={{display: 'flex', gap: 60, opacity: out, transform: `scale(${0.94 + 0.06 * out})`, position: 'absolute'}}>
					{PRINCIPLES.map((p) => {
						const at = cueWord('outro', p.cue, p.word) - 4;
						const s = useEnter(at);
						const b = useEnter(at + 14);
						return (
							<div key={p.head} style={{width: 500}}>
								<div style={{height: 6, width: 90 * s, background: p.color, borderRadius: 3, marginBottom: 28}} />
								<div style={{fontFamily: SERIF, fontSize: 104, lineHeight: 1, color: C.darkText, letterSpacing: -1, whiteSpace: 'nowrap', ...fadeUp(s, 40)}}>
									{p.head} <em style={{color: p.color}}>{p.verb}</em>
								</div>
								<div style={{fontSize: 26, color: C.darkMuted, lineHeight: 1.5, marginTop: 20, ...fadeUp(b, 20)}}>{p.body}</div>
							</div>
						);
					})}
				</div>
				<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: logo}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 64}}>
						{frame >= endAt - 4 ? <Ladder enterAt={endAt} width={200} rowHeight={26} gap={6} stagger={2} variant="hero" dark /> : <div style={{width: 200}} />}
						<Wordmark delay={endAt + 4} size={130} />
					</div>
					<div style={{marginTop: 56, fontFamily: SERIF, fontSize: 58, color: C.darkText, ...fadeUp(tagline, 20)}}>
						Search finds it. <em style={{color: C.darkMuted}}>TrustLabel shows whether you can rely on it.</em>
					</div>
					<div style={{marginTop: 40, fontSize: 22, color: C.darkFaint, letterSpacing: 3, textTransform: 'uppercase', fontWeight: 600, ...fadeUp(footer, 12)}}>
						SD Worx challenge · Tectonic Hackathon 2026
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};
