import type {CSSProperties, ReactNode} from 'react';
import {C, FONT, MONO, SHADOW} from '../theme';
import {Icon} from './Icon';

/** The app's white card (.card / .ask-card), at video scale. */
export const Card: React.FC<{children: ReactNode; style?: CSSProperties; padding?: number | string; radius?: number; shadow?: string}> = ({
	children,
	style,
	padding = 30,
	radius = 24,
	shadow = SHADOW,
}) => (
	<div style={{background: C.surface, borderRadius: radius, padding, fontFamily: FONT, color: C.ink, boxShadow: shadow, ...style}}>{children}</div>
);

type ReasonKind = 'base' | 'plus' | 'minus' | 'cap' | 'info';

export const reasonKind = (delta: number | null, cap: string | null, text: string): ReasonKind =>
	cap ? 'cap' : delta === null ? 'info' : text.includes(': base') ? 'base' : delta > 0 ? 'plus' : 'minus';

const BADGE: Record<ReasonKind, CSSProperties> = {
	base: {background: C.sunken, color: C.ink2},
	plus: {background: C.posBg, color: C.pos},
	minus: {background: C.negBg, color: C.neg},
	cap: {background: C.ink, color: '#fff'},
	info: {display: 'none'},
};

/** One row of the app's "Why C?" list (.reason): the reason, then its mono badge (+10, −20, cap F). */
export const ReasonRow: React.FC<{delta: number | null; cap: string | null; text: string; size?: number; style?: CSSProperties}> = ({
	delta,
	cap,
	text,
	size = 22,
	style,
}) => {
	const kind = reasonKind(delta, cap, text);
	const label = cap ? `cap ${cap}` : delta === null ? '' : kind === 'base' ? String(delta) : delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
	return (
		<div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, fontSize: size, lineHeight: 1.35, color: kind === 'info' ? C.muted : C.ink2, ...style}}>
			<span style={{fontStyle: kind === 'info' ? 'italic' : 'normal'}}>{text}</span>
			<span style={{flex: 'none', fontFamily: MONO, fontWeight: 600, fontSize: size * 0.9, padding: `${size * 0.22}px ${size * 0.4}px`, borderRadius: 8, whiteSpace: 'nowrap', ...BADGE[kind]}}>
				{label}
			</span>
		</div>
	);
};

export const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join('');

/** The app's neutral avatar (.avatar): warm grey disc with initials. */
export const Avatar: React.FC<{name: string; size?: number; style?: CSSProperties}> = ({name, size = 48, style}) => (
	<div
		style={{
			width: size,
			height: size,
			flex: 'none',
			borderRadius: '50%',
			display: 'grid',
			placeItems: 'center',
			background: 'linear-gradient(145deg, #e7e5df, #d6d3cb)',
			color: C.ink,
			fontFamily: FONT,
			fontSize: size * 0.36,
			fontWeight: 650,
			letterSpacing: 0.3,
			...style,
		}}
	>
		{initials(name)}
	</div>
);

/** Round check / cross markers used for rule checks and applicability axes. */
export const CheckDot: React.FC<{size?: number; ok?: boolean}> = ({size = 30, ok = true}) => (
	<div style={{width: size, height: size, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: ok ? C.posBg : C.negBg, color: ok ? C.pos : C.neg}}>
		{ok ? (
			<Icon name="check" size={size * 0.62} stroke={2.6} />
		) : (
			<svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56}>
				<path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
			</svg>
		)}
	</div>
);
