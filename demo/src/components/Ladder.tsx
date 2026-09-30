import {useCurrentFrame, useVideoConfig, spring} from 'remotion';
import {FONT, GRADE_BG, GRADE_FG, GRADES} from '../theme';

type Props = {
	/** Frame at which the bars start sweeping in. */
	enterAt: number;
	/** Pointer position as a continuous grade index (0 = A, 6 = G), or null for no pointer. */
	pointer: number | null;
	pointerLabel?: string;
	pointerOpacity?: number;
	rowHeight?: number;
	width?: number;
	gap?: number;
	stagger?: number;
};

// The EU-energy-label ladder from the app (.ladder), with the black pointer arrow.
export const Ladder: React.FC<Props> = ({
	enterAt,
	pointer,
	pointerLabel,
	pointerOpacity = 1,
	rowHeight = 46,
	width = 330,
	gap = 7,
	stagger = 3,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const barMax = pointer === null ? width : width * 0.62;
	return (
		<div style={{position: 'relative', width, height: GRADES.length * (rowHeight + gap) - gap, fontFamily: FONT}}>
			{GRADES.map((g, i) => {
				const p = spring({frame: frame - enterAt - i * stagger, fps, config: {damping: 200}});
				const w = barMax * (0.45 + 0.55 * (i / 6));
				return (
					<div
						key={g}
						style={{
							position: 'absolute',
							top: i * (rowHeight + gap),
							left: 0,
							height: rowHeight,
							width: w * p,
							background: GRADE_BG[g],
							clipPath: `polygon(0 0, calc(100% - ${rowHeight * 0.5}px) 0, 100% 50%, calc(100% - ${rowHeight * 0.5}px) 100%, 0 100%)`,
							display: 'flex',
							alignItems: 'center',
							paddingLeft: rowHeight * 0.3,
							color: GRADE_FG[g],
							fontWeight: 900,
							fontSize: rowHeight * 0.55,
							opacity: p,
						}}
					>
						{g}
					</div>
				);
			})}
			{pointer !== null ? (
				<div
					style={{
						position: 'absolute',
						left: barMax + 18,
						top: pointer * (rowHeight + gap),
						height: rowHeight,
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: `0 ${rowHeight * 0.35}px 0 ${rowHeight * 0.55}px`,
						background: '#111',
						color: '#fff',
						fontWeight: 800,
						fontSize: rowHeight * 0.46,
						clipPath: `polygon(${rowHeight * 0.42}px 0, 100% 0, 100% 100%, ${rowHeight * 0.42}px 100%, 0 50%)`,
						whiteSpace: 'nowrap',
						opacity: pointerOpacity,
						fontVariantNumeric: 'tabular-nums',
					}}
				>
					{pointerLabel}
				</div>
			) : null}
		</div>
	);
};
