import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG} from '../theme';
import {CLAMP, fadeUp, useEnter} from '../anim';
import {Ladder} from '../components/Ladder';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {cue} from '../timeline';

export const Wordmark: React.FC<{delay: number; size?: number}> = ({delay, size = 150}) => {
	const frame = useCurrentFrame();
	const letters = 'TrustLabel'.split('');
	const shine = interpolate(frame, [delay + 30, delay + 70], [-30, 130], CLAMP);
	return (
		<div
			style={{
				fontFamily: FONT,
				fontWeight: 900,
				fontSize: size,
				letterSpacing: -size * 0.035,
				lineHeight: 1,
				display: 'flex',
				position: 'relative',
			}}
		>
			{letters.map((l, i) => {
				const p = useEnter(delay + i * 2);
				return (
					<span
						key={i}
						style={{
							display: 'inline-block',
							...fadeUp(p, size * 0.4),
							backgroundImage: `linear-gradient(100deg, #fff 0%, #fff ${shine - 12}%, ${GRADE_BG.B} ${shine}%, #fff ${shine + 12}%, #fff 100%)`,
							backgroundSize: `${letters.length * 100}% 100%`,
							backgroundPosition: `${(i / (letters.length - 1)) * 100}% 0`,
							WebkitBackgroundClip: 'text',
							color: 'transparent',
						}}
					>
						{l}
					</span>
				);
			})}
		</div>
	);
};

export const Reveal: React.FC = () => {
	const nameAt = cue('reveal', 'name');
	const taglineAt = cue('reveal', 'tagline');
	const tagline = useEnter(taglineAt);
	const sub = useEnter(taglineAt + 60);
	return (
		<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center'}}>
			<SceneNarration scene="reveal" />
			<Sfx at={nameAt} src="whoosh" volume={0.4} />
			<div style={{display: 'flex', alignItems: 'center', gap: 64, marginTop: -60}}>
				<Ladder enterAt={2} pointer={null} rowHeight={38} width={190} gap={6} stagger={3} />
				<Wordmark delay={nameAt + 4} />
			</div>
			<div style={{marginTop: 70, fontSize: 46, fontWeight: 700, color: '#fff', ...fadeUp(tagline, 24)}}>
				Search finds it. <span style={{color: GRADE_BG.A}}>TrustLabel shows whether you can rely on it.</span>
			</div>
			<div style={{marginTop: 22, fontSize: 28, color: C.ink, ...fadeUp(sub, 16)}}>The trust layer under the search you already use, not another assistant.</div>
		</AbsoluteFill>
	);
};
