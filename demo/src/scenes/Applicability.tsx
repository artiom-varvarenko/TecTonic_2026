import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, MONO} from '../theme';
import {BOUNCY, CLAMP, fadeUp, popIn, useEnter} from '../anim';
import {SceneText} from '../components/SceneText';
import {Card, CheckIcon, CrossIcon, ReasonRow} from '../components/Card';
import {GradeTile, Pill} from '../components/GradeTile';
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
	const mute = interpolate(frame, [notApplies + 6, notApplies + 22], [0, 1], CLAMP);
	const badge = useEnter(notApplies + 10, BOUNCY);
	return (
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
			<div style={{position: 'absolute', left: 820, top: 210, width: 990}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26, ...fadeUp(ctx, 20)}}>
					<span style={{color: C.inkSoft, fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase'}}>Asking for</span>
					<span style={{background: '#fff', color: C.navy, borderRadius: 12, padding: '10px 20px', fontSize: 26, fontWeight: 800}}>
						{DATA.before.context.label}
					</span>
				</div>
				<div style={{position: 'relative', ...fadeUp(card, 50)}}>
					<Card padding={36} style={{filter: `grayscale(${mute * 0.85})`, background: interpolate(mute, [0, 1], [0, 1]) > 0.5 ? '#f7f8fa' : '#fff'}}>
						<div style={{display: 'flex', gap: 24, alignItems: 'flex-start', opacity: 1 - 0.35 * mute}}>
							<GradeTile grade={NL.grade} size={92} />
							<div style={{flex: 1}}>
								<div style={{display: 'flex', gap: 14, fontSize: 19, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700}}>
									{NL.kind_label} <span style={{fontFamily: MONO, textTransform: 'none', letterSpacing: 0}}>{NL.id}</span>
								</div>
								<div style={{fontSize: 32, fontWeight: 800, marginTop: 6}}>{NL.title}</div>
								<div style={{fontSize: 21, color: C.muted}}>
									{NL.source} · owner {NL.owner_name} · reviewed {NL.last_reviewed_on}
								</div>
								<div style={{fontSize: 23, fontWeight: 700, marginTop: 16}}>{NL.statement}</div>
								<ReasonRow delta={NL.reasons[0].delta} cap={null} text={NL.reasons[0].text} style={{marginTop: 14}} />
							</div>
						</div>
					</Card>
					<div style={{position: 'absolute', right: 30, top: -22, ...popIn(badge, 0.3)}}>
						<Pill tone="na" size={24} style={{background: '#39475a', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.35)'}}>
							Not applicable · shown, never used
						</Pill>
					</div>
				</div>
				<div style={{display: 'flex', gap: 24, marginTop: 30}}>
					<Axis p={qualityRow} ok label="Quality" value={`Grade ${NL.grade}: owned, reviewed on time`} />
					<Axis p={appliesRow} ok={false} label="Applies to Van Dam (BE)?" value={NL.applicability.text} />
				</div>
			</div>
		</AbsoluteFill>
	);
};

const Axis: React.FC<{p: number; ok: boolean; label: string; value: string}> = ({p, ok, label, value}) => (
	<div
		style={{
			flex: 1,
			background: 'rgba(255,255,255,0.08)',
			border: `2px solid ${ok ? 'rgba(76,184,72,0.7)' : 'rgba(255,138,128,0.7)'}`,
			borderRadius: 18,
			padding: '20px 24px',
			display: 'flex',
			gap: 18,
			alignItems: 'center',
			...fadeUp(p, 30),
		}}
	>
		{ok ? <CheckIcon size={44} bg="#4CB848" /> : <CrossIcon size={44} bg="#e0584e" />}
		<div>
			<div style={{color: C.inkSoft, fontSize: 19, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase'}}>{label}</div>
			<div style={{color: '#fff', fontSize: 25, fontWeight: 700, marginTop: 4}}>{value}</div>
		</div>
	</div>
);
