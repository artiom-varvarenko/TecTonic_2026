import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG} from '../theme';
import {BOUNCY, CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {SceneText} from '../components/SceneText';
import {AnswerCard} from '../components/Answer';
import {Ladder} from '../components/Ladder';
import {Typewriter} from '../components/Typewriter';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue, cueWord} from '../timeline';

const AFTER = DATA.after;
const GENERAL = DATA.general_after;
const VERIFIED = AFTER.sources[0];
const LEAK = source(GENERAL, VERIFIED.id);

const ContextBar: React.FC<{label: string; p: number; children?: React.ReactNode}> = ({label, p, children}) => (
	<div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, ...fadeUp(p, 16)}}>
		<span style={{background: '#fff', color: C.navy, borderRadius: 12, padding: '8px 18px', fontSize: 23, fontWeight: 800, flex: 'none'}}>{label}</span>
		<span style={{color: '#fff', fontSize: 24, fontStyle: 'italic', opacity: 0.9, whiteSpace: 'nowrap'}}>{children}</span>
	</div>
);

export const Verified: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		ask: cue('verified', 'intro'),
		answer: cue('verified', 'answer'),
		gradeA: cueWord('verified', 'answer', 'Grade A'),
		scoped: cue('verified', 'scoped'),
		general: cueWord('verified', 'scoped', 'For Belgium'),
	};
	const bar1 = useEnter(at.ask - 6);
	const answer = useEnter(at.answer, SNAPPY);
	const gradePop = useEnter(at.gradeA, BOUNCY);
	const ladder = useEnter(at.gradeA - 10);
	const bar2 = useEnter(at.general - 16);
	const answer2 = useEnter(at.general, SNAPPY);
	const leak = useEnter(at.general + 40);
	const was = interpolate(frame, [at.answer + 20, at.answer + 40], [0, 1], CLAMP);
	const pointer = interpolate(gradePop, [0, 1], [2.5, 0]);
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<SceneNarration scene="verified" />
			<Sfx at={at.gradeA} src="chime" volume={0.55} />
			<Sfx at={at.general} src="pop" volume={0.4} />
			<SceneText
				step="06"
				kicker="Verified answers"
				title="One confirmation becomes an [expiring grade-A] answer."
				body="Only for the context it was verified in: a Van Dam exception never leaks into Belgium, all clients."
			/>
			<div style={{position: 'absolute', left: 820, top: 96, width: 990}}>
				<ContextBar label={AFTER.context.label} p={bar1}>
					<Typewriter text={DATA.question} start={at.ask} cps={45} caret={frame < at.answer} />
				</ContextBar>
				<div style={{display: 'flex', gap: 24, alignItems: 'stretch'}}>
					<div style={{flex: 1, ...fadeUp(answer, 50)}}>
						<AnswerCard answer={AFTER.answer} scale={0.92} style={{transform: `scale(${1 + 0.02 * Math.sin(Math.PI * Math.min(1, gradePop))})`}}>
							<div style={{fontSize: 19, marginTop: 14, color: C.muted, opacity: was}}>
								Before:{' '}
								<span style={{textDecoration: 'line-through'}}>{DATA.before.answer.detail.replace(' for Van Dam Logistics NV (BE).', '')}</span>
							</div>
						</AnswerCard>
					</div>
					<div
						style={{
							width: 250,
							flex: 'none',
							background: 'rgba(255,255,255,0.08)',
							borderRadius: 20,
							padding: '22px 18px',
							...fadeUp(ladder, 30),
						}}
					>
						<Ladder enterAt={at.gradeA - 14} pointer={pointer} pointerLabel={`A · ${VERIFIED.score}`} rowHeight={34} width={214} gap={6} stagger={2} />
						<div style={{color: C.ink, fontSize: 17, marginTop: 14, lineHeight: 1.35}}>Expert-verified, expires {DATA.resolved.resolution.valid_until}</div>
					</div>
				</div>
				<div style={{marginTop: 34}}>
					<ContextBar label={GENERAL.context.label} p={bar2}>
						same question, general context
					</ContextBar>
					<div style={{...fadeUp(answer2, 40)}}>
						<AnswerCard answer={GENERAL.answer} scale={0.8} />
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 14,
							marginTop: 16,
							color: '#fff',
							fontSize: 22,
							...fadeUp(leak, 14),
						}}
					>
						<span style={{background: GRADE_BG.A, color: '#fff', fontWeight: 900, borderRadius: 8, padding: '2px 10px', opacity: 0.45}}>A</span>
						<span style={{opacity: 0.85}}>
							Van Dam's verified answer here: <b style={{color: '#ffb4ab'}}>{LEAK.applicability.text}</b>, not used.
						</span>
					</div>
				</div>
			</div>
		</AbsoluteFill>
	);
};
