import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, SHADOW} from '../theme';
import {BOUNCY, CLAMP, fadeUp, popIn, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {CheckDot} from '../components/Card';
import {Pill} from '../components/GradeTile';
import {Icon} from '../components/Icon';
import {SourceCard} from '../components/SourceCard';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cueWord} from '../timeline';

const NL = source(DATA.before, 'DOC-NL-004');

export const Applicability: React.FC = () => {
	const frame = useCurrentFrame();
	const quality = cueWord('applicability', 'nl', 'grade C');
	const notApplies = cueWord('applicability', 'nl', "doesn't apply");
	const ctx = useEnter(8);
	const card = useEnter(18);
	const qualityRow = useEnter(quality - 4, BOUNCY);
	const appliesRow = useEnter(notApplies - 4, BOUNCY);
	const flipped = frame >= notApplies + 6;
	const badge = useEnter(notApplies + 10, BOUNCY);
	const shake = interpolate(frame, [notApplies + 4, notApplies + 8, notApplies + 12, notApplies + 16], [0, -8, 6, 0], CLAMP);
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="applicability" />
				<Sfx at={quality} src="tick" volume={0.4} />
				<Sfx at={notApplies + 4} src="pop" volume={0.45} />
				<SceneText
					step="02"
					kicker="Applicability vs. quality"
					title="A good Dutch procedure is still [not applicable] to a Belgian client."
					body="Every source is checked against the asker's country, client and date, and only then allowed into the answer."
				/>
				<div style={{position: 'absolute', left: 790, top: 150, width: 1030}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, ...fadeUp(ctx, 20)}}>
						<span style={{color: C.muted, fontSize: 21, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase'}}>Asking for</span>
						<span style={{display: 'inline-flex', alignItems: 'center', gap: 12, height: 56, padding: '0 20px', borderRadius: 14, background: C.sunken, fontSize: 23, fontWeight: 550}}>
							<Icon name="briefcase" size={21} color={C.muted} />
							{DATA.before.context.label}
							<Icon name="chevronDown" size={20} color={C.muted} />
						</span>
					</div>
					<div style={{position: 'relative', ...fadeUp(card, 50), transform: `translate(${shake}px, ${(1 - card) * 50}px)`}}>
						<SourceCard
							source={{...NL, status: flipped ? 'not_applicable' : 'effective'}}
							pill={
								flipped ? (
									<Pill tone="na" size={17}>
										{NL.applicability.text}
									</Pill>
								) : (
									<></>
								)
							}
						/>
						<div style={{position: 'absolute', right: 26, top: -22, ...popIn(badge, 0.3)}}>
							<span style={{display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, background: C.ink, color: '#fff', fontSize: 21, fontWeight: 550, boxShadow: SHADOW}}>
								Not applicable · shown, never used
							</span>
						</div>
					</div>
					<div style={{display: 'flex', gap: 22, marginTop: 28}}>
						<Axis p={qualityRow} ok label="Quality" value={`Grade ${NL.grade}: owned, reviewed on time`} />
						<Axis p={appliesRow} ok={false} label="Applies to Van Dam (BE)?" value={NL.applicability.text} />
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

const Axis: React.FC<{p: number; ok: boolean; label: string; value: string}> = ({p, ok, label, value}) => (
	<div
		style={{
			flex: 1,
			background: C.surface,
			borderRadius: 18,
			padding: '20px 22px',
			display: 'flex',
			gap: 16,
			alignItems: 'center',
			boxShadow: `${SHADOW}, inset 0 0 0 2px ${ok ? 'rgba(13,122,69,0.35)' : 'rgba(180,35,24,0.35)'}`,
			...fadeUp(p, 30),
		}}
	>
		<CheckDot size={44} ok={ok} />
		<div>
			<div style={{color: C.muted, fontSize: 17, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase'}}>{label}</div>
			<div style={{color: C.ink, fontSize: 23, fontWeight: 600, marginTop: 4}}>{value}</div>
		</div>
	</div>
);
