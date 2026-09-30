import {useCurrentFrame, useVideoConfig, spring} from 'remotion';
import {C, FONT} from '../theme';
import {fadeUp, useEnter} from '../anim';

/**
 * Title where [bracketed words] are highlighted. Words rise in one after another.
 */
export const AnimatedTitle: React.FC<{text: string; delay: number; size?: number; highlight?: string; stagger?: number; align?: 'left' | 'center'}> = ({
	text,
	delay,
	size = 64,
	highlight = C.accentBright,
	stagger = 2.5,
	align = 'left',
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const tokens: {word: string; hl: boolean}[] = [];
	let hl = false;
	for (const raw of text.split(' ')) {
		let word = raw;
		const opens = word.startsWith('[');
		if (opens) word = word.slice(1);
		const closes = word.includes(']');
		word = word.replace(']', '');
		tokens.push({word, hl: hl || opens});
		if (opens) hl = true;
		if (closes) hl = false;
	}
	return (
		<div
			style={{
				fontFamily: FONT,
				fontSize: size,
				fontWeight: 800,
				lineHeight: 1.12,
				letterSpacing: -size * 0.02,
				color: '#fff',
				textAlign: align,
			}}
		>
			{tokens.map((t, i) => {
				const p = spring({frame: frame - delay - i * stagger, fps, config: {damping: 200}});
				return (
					<span key={i} style={{display: 'inline-block', whiteSpace: 'pre', ...fadeUp(p, size * 0.45), color: t.hl ? highlight : '#fff'}}>
						{t.word}
						{i < tokens.length - 1 ? ' ' : ''}
					</span>
				);
			})}
		</div>
	);
};

export const Kicker: React.FC<{step?: string; label: string; delay: number; color?: string}> = ({step, label, delay, color = C.accentBright}) => {
	const p = useEnter(delay);
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT, ...fadeUp(p, 16)}}>
			{step ? (
				<span
					style={{
						fontWeight: 800,
						fontSize: 22,
						color: C.navy,
						background: color,
						borderRadius: 8,
						padding: '4px 10px',
						fontVariantNumeric: 'tabular-nums',
					}}
				>
					{step}
				</span>
			) : null}
			<span style={{fontWeight: 700, fontSize: 24, letterSpacing: 2.5, textTransform: 'uppercase', color}}>{label}</span>
		</div>
	);
};

/** Left-hand explanatory column used by the product scenes. */
export const SceneText: React.FC<{step: string; kicker: string; title: string; body: string; delay?: number; bodyDelay?: number}> = ({
	step,
	kicker,
	title,
	body,
	delay = 4,
	bodyDelay,
}) => {
	const bodyP = useEnter(bodyDelay ?? delay + 26);
	return (
		<div style={{position: 'absolute', left: 110, top: 0, bottom: 0, width: 640, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30}}>
			<Kicker step={step} label={kicker} delay={delay} />
			<AnimatedTitle text={title} delay={delay + 6} size={62} />
			<div style={{fontFamily: FONT, fontSize: 27, lineHeight: 1.5, color: C.ink, ...fadeUp(bodyP, 20)}}>{body}</div>
		</div>
	);
};
