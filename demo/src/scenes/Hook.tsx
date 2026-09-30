import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {BOUNCY, CLAMP, fadeUp, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {AnimatedTitle} from '../components/SceneText';
import {Avatar, Card} from '../components/Card';
import {Icon} from '../components/Icon';
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
	const pulse = 1 + 0.05 * Math.max(0, Math.sin((frame - arrive) / 5)) * (frame > arrive + 20 ? 1 : 0);
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center'}}>
				<SceneNarration scene="hook" />
				<Sfx at={arrive} src="alert" volume={0.4} />
				<div style={{marginTop: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26}}>
					<div style={{color: C.darkFaint, fontSize: 24, fontWeight: 550, letterSpacing: 3, textTransform: 'uppercase', ...fadeUp(clock, 12)}}>
						Wednesday 30 September · 10:14
					</div>
					<AnimatedTitle text="An [urgent] customer question comes in." delay={cue('hook', 'intro')} size={96} tone="dark" highlight="#ff9a8f" align="center" />
				</div>
				<div style={{position: 'absolute', top: 480, left: 440, width: 1040}}>
					{ping > 0 && ping < 1 ? (
						<div style={{position: 'absolute', inset: -40 * ping, borderRadius: 28 + 40 * ping, border: `3px solid rgba(255,154,143,${0.8 * (1 - ping)})`}} />
					) : null}
					<Card padding={40} radius={28} style={{...fadeUp(card, 80), transform: `translateY(${(1 - card) * 80}px) scale(${0.92 + 0.08 * card})`}}>
						<div style={{display: 'flex', alignItems: 'center', gap: 20}}>
							<Avatar name="Van Dam" size={68} />
							<div style={{flex: 1}}>
								<div style={{fontSize: 30, fontWeight: 600, letterSpacing: -0.4}}>Van Dam Logistics NV · HR</div>
								<div style={{fontSize: 21, color: C.muted, marginTop: 2}}>to Lotte Janssens, Payroll Consultant</div>
							</div>
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 8,
									height: 40,
									padding: '0 16px 0 12px',
									borderRadius: 999,
									background: C.negBg,
									color: C.neg,
									fontSize: 20,
									fontWeight: 600,
									transform: `scale(${pulse})`,
								}}
							>
								<Icon name="alert" size={20} stroke={2.2} />
								Urgent
							</span>
						</div>
						<div style={{fontSize: 36, lineHeight: 1.42, marginTop: 28, minHeight: 104, color: C.ink, letterSpacing: -0.2}}>
							<Typewriter text={MESSAGE} start={cue('hook', 'ask') - 12} cps={34} />
						</div>
					</Card>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};
