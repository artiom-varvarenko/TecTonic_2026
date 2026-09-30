import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, MONO} from '../theme';
import {BOUNCY, CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {AskBar} from '../components/AppChrome';
import {VerdictCard} from '../components/Answer';
import {GradeTile, Pill} from '../components/GradeTile';
import {Icon} from '../components/Icon';
import {Typewriter} from '../components/Typewriter';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue, cueWord} from '../timeline';

const AFTER = DATA.after;
const GENERAL = DATA.general_after;
const VERIFIED = AFTER.sources[0];
const LEAK = source(GENERAL, VERIFIED.id);
const BEFORE = DATA.before.answer.competing.map((c) => `${c.value_display.replace(' of the month', '')} (${c.best_grade})`).join(' vs ');

export const Verified: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		ask: cue('verified', 'intro'),
		answer: cue('verified', 'answer'),
		gradeA: cueWord('verified', 'answer', 'Grade A'),
		ellen: cueWord('verified', 'answer', 'Ellen'),
		valid: cueWord('verified', 'answer', 'valid'),
		scoped: cue('verified', 'scoped'),
		general: cueWord('verified', 'scoped', 'For Belgium'),
		still: cueWord('verified', 'scoped', 'still'),
	};
	const bar = useEnter(4);
	const answer = useEnter(at.answer - 4, SNAPPY);
	const gradePop = useEnter(at.gradeA, BOUNCY);
	const byPill = useEnter(at.ellen - 4, SNAPPY);
	const validPill = useEnter(at.valid - 4, SNAPPY);
	const was = interpolate(frame, [at.answer + 30, at.answer + 46], [0, 1], CLAMP);
	const context2 = useEnter(at.general - 20);
	const answer2 = useEnter(at.general, SNAPPY);
	const leak = useEnter(at.still - 6);
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="verified" />
				<Sfx at={at.gradeA} src="chime" volume={0.55} />
				<Sfx at={at.general} src="pop" volume={0.4} />
				<SceneText
					step="06"
					kicker="Verified answers"
					title="One confirmation becomes an [expiring grade-A] answer."
					body="Scoped to the context it was verified in: a Van Dam exception never leaks into Belgium, all clients."
				/>
				<div style={{position: 'absolute', left: 790, top: 124, width: 1030}}>
					<AskBar
						context={AFTER.context.label}
						s={1.2}
						style={fadeUp(bar, 20)}
						question={<Typewriter text={DATA.question} start={at.ask} cps={48} caret={frame < at.answer} />}
					/>
					<div style={{marginTop: 22, ...fadeUp(answer, 50)}}>
						<VerdictCard
							answer={AFTER.answer}
							scale={0.92}
							meta={{topic: AFTER.topic.label, context: AFTER.context.label}}
							style={{transform: `scale(${1 + 0.02 * Math.sin(Math.PI * Math.min(1, gradePop))})`}}
						>
							<div style={{display: 'flex', gap: 10, marginTop: 14}}>
								<span style={fadeUp(byPill, 10)}>
									<Pill tone="applies" size={17}>
										Verified by {AFTER.answer.verified_by?.name}
									</Pill>
								</span>
								<span style={fadeUp(validPill, 10)}>
									<Pill tone="accent" size={17}>
										Expires {DATA.resolved.resolution.valid_until}
									</Pill>
								</span>
							</div>
							<div style={{fontSize: 18, marginTop: 12, color: C.muted, opacity: was}}>
								Before: <span style={{textDecoration: 'line-through'}}>Don't act yet · {BEFORE}</span>
							</div>
						</VerdictCard>
					</div>
					<div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 34, ...fadeUp(context2, 16)}}>
						<span style={{color: C.muted, fontSize: 18, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase'}}>Same question, asked for</span>
						<span style={{display: 'inline-flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', borderRadius: 12, background: C.sunken, fontSize: 20, fontWeight: 550}}>
							<Icon name="briefcase" size={18} color={C.muted} />
							{GENERAL.context.label}
						</span>
					</div>
					<div style={{marginTop: 14, ...fadeUp(answer2, 40)}}>
						<VerdictCard answer={GENERAL.answer} scale={0.78} competing={false} />
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 14,
							marginTop: 16,
							padding: '12px 16px',
							borderRadius: 14,
							background: C.surface,
							border: `1px dashed ${C.lineStrong}`,
							fontSize: 19,
							color: C.ink2,
							...fadeUp(leak, 14),
						}}
					>
						<GradeTile grade="A" size={34} muted />
						<span style={{fontFamily: MONO, fontSize: 16, color: C.muted}}>{VERIFIED.id}</span>
						<span style={{flex: 1}}>
							Van Dam's verified answer: <b style={{fontWeight: 600, color: C.ink}}>{LEAK.applicability.text}</b>
						</span>
						<Pill tone="na" size={16}>
							shown, never used
						</Pill>
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};
