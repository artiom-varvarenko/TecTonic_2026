import {useCurrentFrame, useVideoConfig, spring} from 'remotion';
import {C, FONT, GRADE_BG, GRADES} from '../theme';
import type {Grade} from '../theme';

type Props = {
	/** Frame at which the bars start sweeping in. */
	enterAt: number;
	width: number;
	rowHeight?: number;
	gap?: number;
	stagger?: number;
	/** `hero` = login-page proportions (40–88 %), `app` = answer-card proportions (30–66 %). */
	variant?: 'hero' | 'app';
	/** Static pointer labels ("C 20th of the month"); rows without one are dimmed, as in the app. */
	pointers?: {grade: Grade; label: string; at?: number}[];
	/** Moving pointer at a continuous grade index (0 = A … 6 = G). */
	pointer?: {index: number; label: string; opacity?: number};
	dark?: boolean;
};

const WIDTHS = {hero: [0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.88], app: [0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.66]};

// The EU-energy-label ladder from the app (.ladder / .login-ladder) with the black pointer arrows.
export const Ladder: React.FC<Props> = ({enterAt, width, rowHeight = 36, gap = 7, stagger = 3, variant = 'app', pointers, pointer, dark}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pointed = new Set((pointers ?? []).map((p) => p.grade));
	const notch = rowHeight * 0.46;
	const labelBg = dark ? '#f4f4f1' : C.ink;
	const labelFg = dark ? C.ink : '#fff';
	const label = (text: string, key: string, top: number, left: number, opacity: number) => (
		<div
			key={key}
			style={{
				position: 'absolute',
				left,
				top,
				height: rowHeight,
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				padding: `0 ${rowHeight * 0.36}px 0 ${notch + rowHeight * 0.18}px`,
				background: labelBg,
				color: labelFg,
				fontFamily: FONT,
				fontWeight: 600,
				fontSize: rowHeight * 0.48,
				clipPath: `polygon(${notch}px 0, 100% 0, 100% 100%, ${notch}px 100%, 0 50%)`,
				whiteSpace: 'nowrap',
				opacity,
				fontVariantNumeric: 'tabular-nums',
			}}
		>
			{text}
		</div>
	);
	return (
		<div style={{position: 'relative', width, height: GRADES.length * (rowHeight + gap) - gap, fontFamily: FONT}}>
			{GRADES.map((g, i) => {
				const p = spring({frame: frame - enterAt - i * stagger, fps, config: {damping: 200}});
				const w = width * WIDTHS[variant][i];
				const dim = pointers && pointers.length > 0 && !pointed.has(g) ? 0.32 : 1;
				return (
					<div
						key={g}
						style={{
							position: 'absolute',
							top: i * (rowHeight + gap),
							left: 0,
							height: rowHeight,
							width: w,
							background: GRADE_BG[g],
							clipPath: `polygon(0 0, calc(100% - ${rowHeight * 0.46}px) 0, 100% 50%, calc(100% - ${rowHeight * 0.46}px) 100%, 0 100%)`,
							display: 'flex',
							alignItems: 'center',
							paddingLeft: rowHeight * 0.4,
							color: 'rgba(0,0,0,0.72)',
							fontWeight: 700,
							fontSize: rowHeight * 0.5,
							opacity: p * dim,
							transform: `translateX(${(1 - p) * -18}px)`,
						}}
					>
						{g}
					</div>
				);
			})}
			{(pointers ?? []).map((pt) => {
				const i = GRADES.indexOf(pt.grade);
				const p = spring({frame: frame - (pt.at ?? enterAt + 14), fps, config: {damping: 200}});
				return label(pt.label, pt.grade + pt.label, i * (rowHeight + gap), width * WIDTHS[variant][i] + 14 - (1 - p) * 10, p);
			})}
			{pointer ? label(pointer.label, 'moving', pointer.index * (rowHeight + gap), width * WIDTHS[variant][6] + 16, pointer.opacity ?? 1) : null}
		</div>
	);
};
