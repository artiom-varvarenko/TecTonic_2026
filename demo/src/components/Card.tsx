import {C, FONT} from '../theme';

export const Card: React.FC<{children: React.ReactNode; style?: React.CSSProperties; padding?: number}> = ({children, style, padding = 34}) => (
	<div
		style={{
			background: C.card,
			borderRadius: 22,
			padding,
			fontFamily: FONT,
			color: C.text,
			boxShadow: '0 30px 80px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0,0,0,0.15)',
			...style,
		}}
	>
		{children}
	</div>
);

/** Reason row with the +/−/cap badge from the app's "Why this grade" list. */
export const ReasonRow: React.FC<{delta: number | null; cap: string | null; text: string; style?: React.CSSProperties; size?: number}> = ({
	delta,
	cap,
	text,
	style,
	size = 22,
}) => {
	const kind = cap ? 'cap' : delta === null ? 'info' : text.includes(': base') ? 'base' : delta > 0 ? 'plus' : 'minus';
	const styles = {
		base: {background: '#e6ebf2', color: C.navy},
		plus: {background: '#e3f5e9', color: C.green},
		minus: {background: '#fde7e7', color: C.red},
		cap: {background: '#111', color: '#fff'},
		info: {background: 'transparent', color: C.muted},
	}[kind];
	const label = cap ? `cap ${cap}` : delta === null ? '' : kind === 'base' ? String(delta) : delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
	return (
		<div style={{display: 'flex', alignItems: 'baseline', gap: 16, fontSize: size, lineHeight: 1.35, ...style}}>
			<span
				style={{
					flex: 'none',
					minWidth: size * 3.4,
					textAlign: 'center',
					borderRadius: 8,
					padding: '3px 8px',
					fontWeight: 800,
					fontVariantNumeric: 'tabular-nums',
					...styles,
				}}
			>
				{label}
			</span>
			<span style={{color: kind === 'info' ? C.muted : C.text, fontStyle: kind === 'info' ? 'italic' : 'normal'}}>{text}</span>
		</div>
	);
};

export const Avatar: React.FC<{initials: string; color: string; size?: number; style?: React.CSSProperties}> = ({initials, color, size = 56, style}) => (
	<div
		style={{
			width: size,
			height: size,
			flex: 'none',
			borderRadius: '50%',
			background: color,
			color: '#fff',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			fontFamily: FONT,
			fontWeight: 800,
			fontSize: size * 0.38,
			letterSpacing: 0.5,
			...style,
		}}
	>
		{initials}
	</div>
);

export const CheckIcon: React.FC<{size?: number; color?: string; bg?: string}> = ({size = 30, color = '#fff', bg = C.green}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{flex: 'none'}}>
		<circle cx="12" cy="12" r="12" fill={bg} />
		<path d="M6.5 12.5l3.5 3.5 7.5-8" stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

export const CrossIcon: React.FC<{size?: number; bg?: string}> = ({size = 30, bg = '#9aa5b3'}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{flex: 'none'}}>
		<circle cx="12" cy="12" r="12" fill={bg} />
		<path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
	</svg>
);

export const ArrowIcon: React.FC<{size?: number; color?: string}> = ({size = 28, color = C.muted}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{flex: 'none'}}>
		<path d="M4 12h15M13 6l6 6-6 6" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

export const DocIcon: React.FC<{size?: number; color?: string}> = ({size = 40, color = C.accent}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{flex: 'none'}}>
		<path d="M6 2.5h8l4.5 4.5v14.5H6z" fill="#eaf0f9" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
		<path d="M14 2.5V7h4.5M8.5 11h7M8.5 14h7M8.5 17h4.5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
	</svg>
);

export const SearchIcon: React.FC<{size?: number; color?: string}> = ({size = 32, color = C.muted}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{flex: 'none'}}>
		<circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="2.2" fill="none" />
		<path d="M15.5 15.5L21 21" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
	</svg>
);

export const MicIcon: React.FC<{size?: number; color?: string}> = ({size = 32, color = '#fff'}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{flex: 'none'}}>
		<rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill={color} />
		<path d="M5 11.5a7 7 0 0014 0M12 18.5v3" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
	</svg>
);
