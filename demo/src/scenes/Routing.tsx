import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {BOUNCY, CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {SceneText} from '../components/SceneText';
import {ArrowIcon, Avatar, Card, CheckIcon} from '../components/Card';
import {GradeTile} from '../components/GradeTile';
import {Cursor} from '../components/Cursor';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA} from '../data';
import {cue, cueWord} from '../timeline';

const ELLEN = DATA.before.experts[0];
// Points per reason, as in engine.rank_experts: client team +3, expertise +3, owns evidence +2, same country +1.
const POINTS = [3, 3, 2, 1];

const PANEL_LEFT = 820;
const PANEL_TOP = 110;
const BUTTON = {x: 0, y: 560, w: 360, h: 72};

export const Routing: React.FC = () => {
	const frame = useCurrentFrame();
	const reasonAt = [
		cueWord('routing', 'ellen', 'leads'),
		cueWord('routing', 'ellen', 'knows'),
		cueWord('routing', 'ellen', 'owns'),
		cueWord('routing', 'ellen', 'owns') + 26,
	];
	const marcOut = cueWord('routing', 'intro', 'best-qualified');
	const pieterOut = cue('routing', 'others');
	const clickAt = cueWord('routing', 'click', 'sends') - 4;
	const card = useEnter(8);
	const others = useEnter(20);
	const reasons = reasonAt.map((f) => useEnter(f, SNAPPY));
	const score = Math.round(reasons.reduce((sum, p, i) => sum + POINTS[i] * Math.min(1, p), 0));
	const button = useEnter(pieterOut + 20);
	const pressed = interpolate(frame, [clickAt - 2, clickAt, clickAt + 8], [0, 1, 0], CLAMP);
	const packet = useEnter(clickAt + 6, SNAPPY);
	const sent = frame >= clickAt;
	const btnCenter = {x: PANEL_LEFT + BUTTON.x + BUTTON.w * 0.55, y: PANEL_TOP + BUTTON.y + BUTTON.h * 0.55};
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<SceneNarration scene="routing" />
			{reasonAt.map((f, i) => (
				<Sfx key={i} at={f} src="tick" volume={0.4} />
			))}
			<Sfx at={clickAt} src="click" volume={0.7} />
			<Sfx at={clickAt + 8} src="whoosh" volume={0.35} />
			<SceneText
				step="04"
				kicker="Expert routing"
				title="Remaining doubt goes to the [best-qualified] expert."
				body="Ranked on client team, listed expertise, ownership of the evidence and country. Client questions only go to that client's team."
			/>
			<div style={{position: 'absolute', left: PANEL_LEFT, top: PANEL_TOP, width: 990}}>
				<Card padding={32} style={{...fadeUp(card, 50), border: `3px solid ${C.accent}`}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 20}}>
						<Avatar initials="EM" color="#d81b60" size={80} />
						<div style={{flex: 1}}>
							<div style={{fontSize: 34, fontWeight: 800}}>{ELLEN.name}</div>
							<div style={{fontSize: 22, color: C.muted}}>{ELLEN.title}</div>
						</div>
						<div style={{textAlign: 'center'}}>
							<div style={{fontSize: 17, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase'}}>Match</div>
							<div style={{background: C.navy, color: '#fff', borderRadius: 999, padding: '4px 22px', fontSize: 36, fontWeight: 900, fontVariantNumeric: 'tabular-nums'}}>
								{score}
							</div>
						</div>
					</div>
					<div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22}}>
						{ELLEN.reasons.map((r, i) => (
							<div key={r} style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 23, ...fadeUp(reasons[i], 14)}}>
								<span style={{background: '#e3f5e9', color: C.green, fontWeight: 800, borderRadius: 8, padding: '2px 10px', minWidth: 52, textAlign: 'center'}}>+{POINTS[i]}</span>
								{r}
							</div>
						))}
					</div>
				</Card>
				<div style={{display: 'flex', gap: 20, marginTop: 20, ...fadeUp(others, 30)}}>
					<Excluded at={pieterOut} initials="PD" name="Pieter De Smet" title="Payroll Operations Lead BE" reason="Not on the Van Dam team" />
					<Excluded at={marcOut} initials="MP" name="Marc Peeters" title="Payroll Process Owner BE" reason="Left SD Worx on 2025-11-30" />
				</div>
				<div
					style={{
						position: 'absolute',
						left: BUTTON.x,
						top: BUTTON.y,
						width: BUTTON.w,
						height: BUTTON.h,
						borderRadius: 14,
						background: sent ? C.green : C.accent,
						color: '#fff',
						fontSize: 26,
						fontWeight: 800,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 12,
						boxShadow: '0 14px 30px rgba(31,95,191,0.45)',
						transform: `scale(${1 - pressed * 0.06})`,
						...fadeUp(button, 20),
					}}
				>
					{sent ? <CheckIcon size={30} bg="rgba(255,255,255,0.25)" /> : null}
					{sent ? 'Sent to Ellen' : 'Ask Ellen to verify'}
				</div>
				<div style={{position: 'absolute', left: 0, top: 660, width: 990, ...fadeUp(packet, 50), transform: `translateY(${(1 - packet) * 50}px) scale(${0.95 + 0.05 * packet})`}}>
					<div style={{background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.25)', borderRadius: 20, padding: '20px 24px', color: '#fff'}}>
						<div style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, fontWeight: 700, color: C.inkSoft, letterSpacing: 1.5, textTransform: 'uppercase'}}>
							Verification request <ArrowIcon color={C.inkSoft} /> {DATA.request.assignee_name}, pre-packaged
						</div>
						<div style={{display: 'flex', gap: 14, marginTop: 14}}>
							{DATA.request.candidates.map((c) => (
								<div key={c.item_id} style={{flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: '#fff', color: C.text, borderRadius: 12, padding: '10px 14px'}}>
									<GradeTile grade={c.grade} size={42} />
									<div style={{minWidth: 0}}>
										<div style={{fontSize: 22, fontWeight: 800}}>{c.value_display.replace(' of the month', '')}</div>
										<div style={{fontSize: 15, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 230}}>{c.title}</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			<Cursor
				appearAt={pieterOut + 30}
				path={[
					{frame: pieterOut + 30, x: 1700, y: 1000},
					{frame: clickAt - 10, x: btnCenter.x, y: btnCenter.y},
					{frame: clickAt + 30, x: btnCenter.x + 10, y: btnCenter.y + 6},
				]}
				clicks={[clickAt]}
			/>
		</AbsoluteFill>
	);
};

const Excluded: React.FC<{at: number; initials: string; name: string; title: string; reason: string}> = ({at, initials, name, title, reason}) => {
	const p = useEnter(at, BOUNCY);
	const dim = Math.min(1, p);
	return (
		<div
			style={{
				flex: 1,
				background: '#fff',
				borderRadius: 18,
				padding: '18px 20px',
				display: 'flex',
				alignItems: 'center',
				gap: 16,
				opacity: 1 - 0.45 * dim,
				filter: `grayscale(${dim})`,
				position: 'relative',
			}}
		>
			<Avatar initials={initials} color="#546e7a" size={56} />
			<div style={{minWidth: 0}}>
				<div style={{fontSize: 24, fontWeight: 800, color: C.text, textDecoration: dim > 0.5 ? 'line-through' : 'none'}}>{name}</div>
				<div style={{fontSize: 18, color: C.muted}}>{title}</div>
				<div style={{fontSize: 18, fontWeight: 800, color: C.red, marginTop: 4, opacity: dim}}>{reason}</div>
			</div>
		</div>
	);
};

