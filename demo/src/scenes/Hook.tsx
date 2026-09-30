import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {BOUNCY, CLAMP, fadeUp, useEnter} from '../anim';
import {AnimatedTitle} from '../components/SceneText';
import {Avatar, Card} from '../components/Card';
import {Typewriter} from '../components/Typewriter';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {cue} from '../timeline';

const MESSAGE = "Hi Lotte, what's the cut-off for submitting overtime this month? Our team leads need to know today.";

export const Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const arrive = cue('hook', 'intro') + 22;
	const card = useEnter(arrive, BOUNCY);
	const clock = useEnter(0);
	const ping = interpolate(frame, [arrive, arrive + 36], [0, 1], CLAMP);
	const urgentPulse = 1 + 0.06 * Math.max(0, Math.sin((frame - arrive) / 5)) * (frame > arrive + 20 ? 1 : 0);
	return (
		<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center'}}>
			<SceneNarration scene="hook" />
			<Sfx at={arrive} src="alert" volume={0.4} />
			<div style={{marginTop: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
				<div style={{color: C.inkSoft, fontSize: 26, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', ...fadeUp(clock, 12)}}>
					Tuesday 30 September · 10:14
				</div>
				<AnimatedTitle text="An [urgent] customer question comes in." delay={cue('hook', 'intro')} size={78} highlight="#ff8a80" align="center" />
			</div>
			<div style={{position: 'absolute', top: 470, left: 460, width: 1000}}>
				{ping > 0 && ping < 1 ? (
					<div
						style={{
							position: 'absolute',
							inset: -40 * ping,
							borderRadius: 22 + 40 * ping,
							border: `4px solid rgba(255,138,128,${0.8 * (1 - ping)})`,
						}}
					/>
				) : null}
				<Card style={{...fadeUp(card, 80), transform: `translateY(${(1 - card) * 80}px) scale(${0.92 + 0.08 * card})`}} padding={40}>
					<div style={{display: 'flex', alignItems: 'center', gap: 20}}>
						<Avatar initials="VD" color="#7c4dff" size={72} />
						<div style={{flex: 1}}>
							<div style={{fontSize: 30, fontWeight: 800}}>Van Dam Logistics NV · HR</div>
							<div style={{fontSize: 22, color: C.muted}}>to Lotte Janssens, Payroll Consultant</div>
						</div>
						<div
							style={{
								background: C.red,
								color: '#fff',
								fontWeight: 800,
								fontSize: 20,
								letterSpacing: 2,
								padding: '8px 16px',
								borderRadius: 999,
								transform: `scale(${urgentPulse})`,
							}}
						>
							URGENT
						</div>
					</div>
					<div style={{fontSize: 36, lineHeight: 1.4, marginTop: 28, minHeight: 100, fontWeight: 500}}>
						<Typewriter text={MESSAGE} start={cue('hook', 'ask') - 12} cps={34} />
					</div>
				</Card>
			</div>
		</AbsoluteFill>
	);
};
