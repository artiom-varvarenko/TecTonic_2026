import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, MONO, SERIF, SHADOW, SHADOW_LG, SHADOW_SM} from '../theme';
import {BOUNCY, CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {Avatar, Card} from '../components/Card';
import {GradeTile} from '../components/GradeTile';
import {Icon} from '../components/Icon';
import {Cursor} from '../components/Cursor';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA} from '../data';
import {cue, cueWord} from '../timeline';

const ELLEN = DATA.before.experts[0];
// Points per reason, as in engine.rank_experts: client team +3, expertise +3, owns evidence +2, same country +1.
const POINTS = [3, 3, 2, 1];

const PANEL = {left: 790, top: 168, width: 1030};
const BUTTON = {x: 30, y: 366, w: 970, h: 70};

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
	const sent = frame >= clickAt + 4;
	const packet = useEnter(clickAt + 8, SNAPPY);
	const toast = interpolate(frame, [clickAt + 6, clickAt + 16, clickAt + 110, clickAt + 124], [0, 1, 1, 0], CLAMP);
	const btnCenter = {x: PANEL.left + BUTTON.x + BUTTON.w * 0.5, y: PANEL.top + BUTTON.y + BUTTON.h * 0.55};
	return (
		<Stage tone="light">
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
				<div style={{position: 'absolute', left: PANEL.left, top: PANEL.top, width: PANEL.width}}>
					<Card padding={30} radius={24} style={fadeUp(card, 50)}>
						<div style={{fontSize: 22, fontWeight: 600, letterSpacing: -0.2}}>Who can confirm this</div>
						<div style={{marginTop: 18, border: '1px solid rgba(17,19,22,0.22)', background: C.surface2, borderRadius: 16, padding: 20}}>
							<div style={{display: 'flex', alignItems: 'center', gap: 16}}>
								<Avatar name={ELLEN.name} size={60} />
								<div style={{flex: 1, lineHeight: 1.25}}>
									<div style={{fontSize: 28, fontWeight: 600, letterSpacing: -0.3}}>{ELLEN.name}</div>
									<div style={{fontSize: 20, color: C.muted}}>{ELLEN.title}</div>
								</div>
								<span style={{fontFamily: MONO, fontWeight: 600, fontSize: 26, color: C.ink2, background: C.sunken, borderRadius: 999, padding: '8px 16px', fontVariantNumeric: 'tabular-nums'}}>{score}</span>
							</div>
							<div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16}}>
								{ELLEN.reasons.map((r, i) => (
									<div key={r} style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, color: C.ink2, ...fadeUp(reasons[i], 12)}}>
										<Icon name="check" size={20} color={C.pos} stroke={2.4} />
										<span style={{flex: 1}}>{r}</span>
										<span style={{fontFamily: MONO, fontWeight: 600, fontSize: 17, background: C.posBg, color: C.pos, borderRadius: 7, padding: '3px 8px'}}>+{POINTS[i]}</span>
									</div>
								))}
							</div>
						</div>
						<div style={{height: 96}} />
					</Card>
					<div style={{position: 'absolute', left: BUTTON.x, top: BUTTON.y, width: BUTTON.w, height: BUTTON.h, ...fadeUp(button, 20)}}>
						{sent ? (
							<div style={{height: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', borderRadius: 14, background: C.warnBg, color: C.warn, fontSize: 22, fontWeight: 550}}>
								<Icon name="clock" size={22} />
								Verification requested from {DATA.request.assignee_name} — pending
							</div>
						) : (
							<div
								style={{
									height: '100%',
									borderRadius: 14,
									background: C.ink,
									color: '#fff',
									fontSize: 24,
									fontWeight: 550,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									gap: 12,
									boxShadow: '0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12)',
									transform: `scale(${1 - pressed * 0.03})`,
								}}
							>
								Ask Ellen to verify
								<Icon name="arrowRight" size={22} />
							</div>
						)}
					</div>
					<div style={{display: 'flex', gap: 18, marginTop: 18, ...fadeUp(others, 30)}}>
						<Excluded at={pieterOut} name="Pieter De Smet" title="Payroll Operations Lead BE" reason="Not on the Van Dam team" />
						<Excluded at={marcOut} name="Marc Peeters" title="Payroll Process Owner BE" reason="Left SD Worx on 2025-11-30" />
					</div>
					<div style={{marginTop: 18, ...fadeUp(packet, 40), transform: `translateY(${(1 - packet) * 40}px)`}}>
						<div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 600, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase'}}>
							Request to {DATA.request.assignee_name}, pre-packaged <Icon name="arrowRight" size={18} />
						</div>
						<div style={{display: 'flex', gap: 12, marginTop: 12}}>
							{DATA.request.candidates.map((c) => (
								<div key={c.item_id} style={{flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: C.surface, borderRadius: 14, padding: '12px 14px', boxShadow: SHADOW_SM}}>
									<GradeTile grade={c.grade} size={40} />
									<div style={{minWidth: 0}}>
										<div style={{fontFamily: SERIF, fontSize: 28, lineHeight: 1}}>{c.value_display.replace(' of the month', '')}</div>
										<div style={{fontSize: 15, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240, marginTop: 3}}>{c.title}</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
				<div style={{position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center', opacity: toast, transform: `translateY(${(1 - toast) * 16}px)`}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px 14px 18px', borderRadius: 16, background: '#15171b', color: '#f5f5f2', fontSize: 21, fontWeight: 500, boxShadow: SHADOW_LG}}>
						<Icon name="check" size={22} color="#5ee29a" stroke={2.4} />
						Verification request sent to {DATA.request.assignee_name}.
					</div>
				</div>
				<Cursor
					appearAt={pieterOut + 30}
					path={[
						{frame: pieterOut + 30, x: 1700, y: 1010},
						{frame: clickAt - 10, x: btnCenter.x, y: btnCenter.y},
						{frame: clickAt + 30, x: btnCenter.x + 10, y: btnCenter.y + 6},
					]}
					clicks={[clickAt]}
					hideAfter={clickAt + 50}
				/>
			</AbsoluteFill>
		</Stage>
	);
};

const Excluded: React.FC<{at: number; name: string; title: string; reason: string}> = ({at, name, title, reason}) => {
	const p = useEnter(at, BOUNCY);
	const dim = Math.min(1, p);
	return (
		<div style={{flex: 1, background: C.surface, borderRadius: 18, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: SHADOW, opacity: 1 - 0.35 * dim}}>
			<Avatar name={name} size={50} style={{filter: `grayscale(${dim})`}} />
			<div style={{minWidth: 0}}>
				<div style={{fontSize: 22, fontWeight: 600, color: C.ink, textDecoration: dim > 0.5 ? 'line-through' : 'none'}}>{name}</div>
				<div style={{fontSize: 17, color: C.muted}}>{title}</div>
				<div style={{display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 17, fontWeight: 600, color: C.neg, marginTop: 4, opacity: dim}}>
					<Icon name="alert" size={16} stroke={2.2} />
					{reason}
				</div>
			</div>
		</div>
	);
};
