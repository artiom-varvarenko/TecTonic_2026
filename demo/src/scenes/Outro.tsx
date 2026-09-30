import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG} from '../theme';
import {CLAMP, fadeUp, useEnter} from '../anim';
import {Ladder} from '../components/Ladder';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {Wordmark} from './Reveal';
import {cue, cueWord} from '../timeline';

const PRINCIPLES = [
	{head: 'AI reads.', word: 'AI reads', body: 'Speech-to-text and claim extraction. Every quote is checked verbatim.', color: '#6ea8ff'},
	{head: 'Rules judge.', word: 'Rules', body: 'Deterministic grades. No model ever assigns one or answers a question.', color: GRADE_BG.C},
	{head: 'Humans verify.', word: 'Humans', body: 'Experts confirm. Verified answers expire and stay in their context.', color: GRADE_BG.A},
];

export const Outro: React.FC = () => {
	const frame = useCurrentFrame();
	const endAt = cue('outro', 'end') - 14;
	const out = interpolate(frame, [endAt - 12, endAt + 6], [1, 0], CLAMP);
	const logo = useEnter(endAt);
	const tagline = useEnter(endAt + 26);
	const footer = useEnter(endAt + 46);
	return (
		<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center'}}>
			<SceneNarration scene="outro" />
			<Sfx at={endAt} src="whoosh" volume={0.35} />
			<div style={{display: 'flex', gap: 44, opacity: out, transform: `scale(${0.94 + 0.06 * out})`, position: 'absolute'}}>
				{PRINCIPLES.map((p) => {
					const at = cueWord('outro', 'principle', p.word) - 4;
					const s = useEnter(at);
					const b = useEnter(at + 14);
					return (
						<div key={p.head} style={{width: 520}}>
							<div style={{height: 8, width: 90 * s, background: p.color, borderRadius: 4, marginBottom: 26}} />
							<div style={{fontSize: 72, fontWeight: 900, color: '#fff', letterSpacing: -1.5, whiteSpace: 'nowrap', ...fadeUp(s, 40)}}>{p.head}</div>
							<div style={{fontSize: 27, color: C.ink, lineHeight: 1.45, marginTop: 16, ...fadeUp(b, 20)}}>{p.body}</div>
						</div>
					);
				})}
			</div>
			<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: logo}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 56}}>
					{frame >= endAt - 4 ? <Ladder enterAt={endAt} pointer={null} rowHeight={32} width={160} gap={5} stagger={2} /> : <div style={{width: 160}} />}
					<Wordmark delay={endAt + 4} size={130} />
				</div>
				<div style={{marginTop: 54, fontSize: 42, fontWeight: 700, color: '#fff', ...fadeUp(tagline, 20)}}>
					Search finds it. <span style={{color: GRADE_BG.A}}>TrustLabel shows whether you can rely on it.</span>
				</div>
				<div style={{marginTop: 40, fontSize: 24, color: C.inkSoft, letterSpacing: 3, textTransform: 'uppercase', fontWeight: 700, ...fadeUp(footer, 12)}}>
					SD Worx challenge · Tectonic Hackathon 2026
				</div>
			</div>
		</AbsoluteFill>
	);
};
