import {C, FONT, GRADE_BG, GRADE_FG} from '../theme';
import type {Grade} from '../theme';

export const GradeTile: React.FC<{grade: Grade | null; size?: number; style?: React.CSSProperties; muted?: boolean}> = ({
	grade,
	size = 56,
	style,
	muted,
}) => (
	<div
		style={{
			width: size,
			height: size,
			flex: 'none',
			borderRadius: size * 0.2,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			fontFamily: FONT,
			fontWeight: 900,
			fontSize: size * 0.56,
			background: muted || !grade ? '#b8bfc9' : GRADE_BG[grade],
			color: muted || !grade ? '#fff' : GRADE_FG[grade],
			boxShadow: grade && !muted ? `0 ${size * 0.08}px ${size * 0.3}px ${GRADE_BG[grade]}55` : 'none',
			...style,
		}}
	>
		{grade ?? '?'}
	</div>
);

export const Pill: React.FC<{tone: 'applies' | 'na' | 'warn' | 'red' | 'blue'; children: React.ReactNode; size?: number; style?: React.CSSProperties}> = ({
	tone,
	children,
	size = 18,
	style,
}) => {
	const tones = {
		applies: {background: '#e3f5e9', color: C.green},
		na: {background: '#eceff3', color: C.muted},
		warn: {background: '#fdebd9', color: '#b45309'},
		red: {background: '#fde7e7', color: C.red},
		blue: {background: '#eaf0f9', color: C.accent},
	};
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 8,
				borderRadius: 999,
				padding: `${size * 0.25}px ${size * 0.75}px`,
				fontSize: size,
				fontWeight: 700,
				whiteSpace: 'nowrap',
				...tones[tone],
				...style,
			}}
		>
			{children}
		</span>
	);
};
