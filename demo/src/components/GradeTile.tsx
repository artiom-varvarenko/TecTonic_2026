import type {CSSProperties, ReactNode} from 'react';
import {C, FONT, GRADE_BG, GRADE_FG} from '../theme';
import type {Grade} from '../theme';
import {Icon} from './Icon';

/** The app's grade tile (.grade-tile): rounded square in the energy-label colour. */
export const GradeTile: React.FC<{grade: Grade | null; size?: number; style?: CSSProperties; muted?: boolean}> = ({grade, size = 64, style, muted}) => (
	<div
		style={{
			width: size,
			height: size,
			flex: 'none',
			borderRadius: size * 0.24,
			display: 'grid',
			placeItems: 'center',
			fontFamily: FONT,
			fontWeight: 700,
			fontSize: size * 0.5,
			letterSpacing: -0.5,
			background: grade ? GRADE_BG[grade] : '#d3d5d9',
			color: grade ? GRADE_FG[grade] : '#fff',
			boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.08)',
			filter: muted ? 'grayscale(1)' : 'none',
			opacity: muted ? 0.45 : 1,
			...style,
		}}
	>
		{grade ?? '–'}
	</div>
);

type PillTone = 'applies' | 'na' | 'warn' | 'neg' | 'accent';
const PILL: Record<PillTone, CSSProperties> = {
	applies: {background: C.posBg, color: C.pos},
	na: {background: C.sunken, color: C.muted},
	warn: {background: C.warnBg, color: C.warn},
	neg: {background: C.negBg, color: C.neg},
	accent: {background: '#e8edfd', color: C.accent},
};

/** Applicability / status pill with a leading dot (.pill). */
export const Pill: React.FC<{tone: PillTone; children: ReactNode; size?: number; dot?: boolean; style?: CSSProperties}> = ({tone, children, size = 19, dot = true, style}) => (
	<span
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: size * 0.5,
			borderRadius: 999,
			padding: `${size * 0.3}px ${size * 0.72}px`,
			fontSize: size,
			fontWeight: 550,
			lineHeight: 1.3,
			whiteSpace: 'nowrap',
			fontFamily: FONT,
			...PILL[tone],
			...style,
		}}
	>
		{dot ? <span style={{width: size * 0.36, height: size * 0.36, borderRadius: '50%', background: 'currentColor', flex: 'none'}} /> : null}
		{children}
	</span>
);

export type Action = 'use' | 'verify' | 'ask_expert';
export const ACTION_LABEL: Record<Action, string> = {use: 'Safe to use', verify: 'Use with caution', ask_expert: "Don't act yet"};
export const TONE_LINE: Record<Action, string> = {use: C.toneUse, verify: C.toneVerify, ask_expert: C.toneAsk};
const STATUS: Record<Action, CSSProperties> = {
	use: {background: C.posBg, color: C.pos},
	verify: {background: C.warnBg, color: C.warn},
	ask_expert: {background: C.negBg, color: C.neg},
};

/** Verdict badge of answer and topic cards (.status): "Safe to use", "Don't act yet". */
export const StatusBadge: React.FC<{action: Action; size?: number; label?: string; style?: CSSProperties}> = ({action, size = 19, label, style}) => (
	<span
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: size * 0.4,
			height: size * 2,
			padding: `0 ${size * 0.62}px 0 ${size * 0.5}px`,
			borderRadius: 999,
			fontFamily: FONT,
			fontSize: size,
			fontWeight: 600,
			whiteSpace: 'nowrap',
			...STATUS[action],
			...style,
		}}
	>
		<Icon name={action === 'use' ? 'check' : 'alert'} size={size * 1.05} stroke={2.2} />
		{label ?? ACTION_LABEL[action]}
	</span>
);

/** Mono id chip of a source (.source-id): DOC-BE-009. */
export const IdChip: React.FC<{children: ReactNode; size?: number; style?: CSSProperties}> = ({children, size = 17, style}) => (
	<span style={{fontFamily: '"Geist Mono", monospace', fontWeight: 500, fontSize: size, color: C.ink2, background: C.sunken, borderRadius: 6, padding: `${size * 0.3}px ${size * 0.45}px`, whiteSpace: 'nowrap', ...style}}>
		{children}
	</span>
);
