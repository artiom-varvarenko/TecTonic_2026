import {useCurrentFrame, useVideoConfig, spring} from 'remotion';
import {C, FONT, MONO, SERIF} from '../theme';
import {fadeUp, useEnter} from '../anim';
import type {Tone} from './Background';

/**
 * Serif display title (Instrument Serif, as the app's h1s). [Bracketed words] turn italic and take
 * the highlight colour, like "TrustLabel shows whether you can rely on it." on the login page.
 */
export const AnimatedTitle: React.FC<{
	text: string;
	delay: number;
	size?: number;
	tone?: Tone;
	highlight?: string;
	stagger?: number;
	align?: 'left' | 'center';
}> = ({text, delay, size = 76, tone = 'light', highlight, stagger = 2.2, align = 'left'}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const base = tone === 'dark' ? C.darkText : C.ink;
	const hl = highlight ?? (tone === 'dark' ? C.darkMuted : C.muted);
	const tokens: {word: string; hl: boolean}[] = [];
	let open = false;
	for (const raw of text.split(' ')) {
		let word = raw;
		const opens = word.startsWith('[');
		if (opens) word = word.slice(1);
		const closes = word.includes(']');
		word = word.replace(']', '');
		tokens.push({word, hl: open || opens});
		if (opens) open = true;
		if (closes) open = false;
	}
	return (
		<div style={{fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: 1.04, letterSpacing: -size * 0.01, color: base, textAlign: align}}>
			{tokens.map((t, i) => {
				const p = spring({frame: frame - delay - i * stagger, fps, config: {damping: 200}});
				return (
					<span key={i} style={{display: 'inline-block', whiteSpace: 'pre', ...fadeUp(p, size * 0.4), color: t.hl ? hl : base, fontStyle: t.hl ? 'italic' : 'normal'}}>
						{t.word}
						{i < tokens.length - 1 ? ' ' : ''}
					</span>
				);
			})}
		</div>
	);
};

/** Small step label above a title: "02 · Applicability". */
export const Kicker: React.FC<{step?: string; label: string; delay: number; tone?: Tone}> = ({step, label, delay, tone = 'light'}) => {
	const p = useEnter(delay);
	const dark = tone === 'dark';
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 14, fontFamily: FONT, ...fadeUp(p, 14)}}>
			{step ? (
				<span
					style={{
						fontFamily: MONO,
						fontWeight: 600,
						fontSize: 19,
						color: dark ? C.ink : '#fff',
						background: dark ? C.darkText : C.ink,
						borderRadius: 8,
						padding: '4px 10px',
					}}
				>
					{step}
				</span>
			) : null}
			<span style={{fontWeight: 600, fontSize: 21, letterSpacing: 2.2, textTransform: 'uppercase', color: dark ? C.darkMuted : C.muted}}>{label}</span>
		</div>
	);
};

/** Left-hand explanatory column of the product scenes. */
export const SceneText: React.FC<{
	step?: string;
	kicker: string;
	title: string;
	body: string;
	delay?: number;
	bodyDelay?: number;
	tone?: Tone;
	width?: number;
	size?: number;
}> = ({step, kicker, title, body, delay = 4, bodyDelay, tone = 'light', width = 610, size = 70}) => {
	const bodyP = useEnter(bodyDelay ?? delay + 26);
	return (
		<div style={{position: 'absolute', left: 110, top: 0, bottom: 0, width, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28}}>
			<Kicker step={step} label={kicker} delay={delay} tone={tone} />
			<AnimatedTitle text={title} delay={delay + 6} size={size} tone={tone} />
			<div style={{fontFamily: FONT, fontSize: 26, lineHeight: 1.5, color: tone === 'dark' ? C.darkMuted : C.ink2, ...fadeUp(bodyP, 20)}}>{body}</div>
		</div>
	);
};
