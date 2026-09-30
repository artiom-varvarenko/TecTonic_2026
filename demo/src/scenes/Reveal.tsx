import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, SERIF} from '../theme';
import {CLAMP, fadeUp, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {BrandMark} from '../components/Icon';
import {Ladder} from '../components/Ladder';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {cue} from '../timeline';

/** "TrustLabel" in the app's brand weight, letters rising in with a green shine. */
export const Wordmark: React.FC<{delay: number; size?: number}> = ({delay, size = 150}) => {
	const frame = useCurrentFrame();
	const letters = 'TrustLabel'.split('');
	const shine = interpolate(frame, [delay + 30, delay + 70], [-30, 130], CLAMP);
	const mark = useEnter(delay - 4);
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: size * 0.2}}>
			<div style={{transform: `scale(${0.6 + 0.4 * mark})`, opacity: mark}}>
				<BrandMark size={size * 0.78} tile="#f4f4f1" />
			</div>
			<div style={{fontFamily: FONT, fontWeight: 650, fontSize: size, letterSpacing: -size * 0.035, lineHeight: 1, display: 'flex'}}>
				{letters.map((l, i) => {
					const p = useEnter(delay + i * 2);
					return (
						<span
							key={i}
							style={{
								display: 'inline-block',
								...fadeUp(p, size * 0.4),
								backgroundImage: `linear-gradient(100deg, ${C.darkText} 0%, ${C.darkText} ${shine - 12}%, ${GRADE_BG.B} ${shine}%, ${C.darkText} ${shine + 12}%, ${C.darkText} 100%)`,
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
		</div>
	);
};

export const Reveal: React.FC = () => {
	const nameAt = cue('reveal', 'name');
	const taglineAt = cue('reveal', 'tagline');
	const first = useEnter(taglineAt);
	const second = useEnter(taglineAt + 30);
	const sub = useEnter(taglineAt + 70);
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center'}}>
				<SceneNarration scene="reveal" />
				<Sfx at={nameAt} src="whoosh" volume={0.4} />
				<div style={{display: 'flex', alignItems: 'center', gap: 80, marginTop: -90}}>
					<Ladder enterAt={2} width={300} rowHeight={34} gap={6} stagger={3} variant="hero" dark />
					<Wordmark delay={nameAt + 4} size={150} />
				</div>
				<div style={{marginTop: 76, fontFamily: SERIF, fontSize: 70, lineHeight: 1.05, color: C.darkText, textAlign: 'center'}}>
					<span style={{display: 'inline-block', ...fadeUp(first, 24)}}>Search finds it. </span>{' '}
					<span style={{display: 'inline-block', fontStyle: 'italic', color: C.darkMuted, ...fadeUp(second, 24)}}>TrustLabel shows whether you can rely on it.</span>
				</div>
				<div style={{marginTop: 30, fontSize: 28, color: C.darkMuted, ...fadeUp(sub, 16)}}>The trust layer under the search you already use, not another assistant.</div>
			</AbsoluteFill>
		</Stage>
	);
};
