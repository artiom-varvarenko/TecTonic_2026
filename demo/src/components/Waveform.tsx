import {useCurrentFrame} from 'remotion';

/** Pseudo-random voice waveform; bars settle to flat outside [from, to]. */
export const Waveform: React.FC<{from: number; to: number; bars?: number; height?: number; color?: string; width?: number}> = ({
	from,
	to,
	bars = 48,
	height = 64,
	color = '#c62828',
	width = 520,
}) => {
	const frame = useCurrentFrame();
	const active = frame >= from && frame <= to;
	const barW = width / bars;
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: barW * 0.35, height, width}}>
			{new Array(bars).fill(0).map((_, i) => {
				const n = Math.sin(i * 1.7 + frame * 0.55) * Math.sin(i * 0.37 + frame * 0.21) + Math.sin(i * 3.1 - frame * 0.8) * 0.35;
				const envelope = 0.35 + 0.65 * Math.abs(Math.sin(i / bars * Math.PI));
				const h = active ? Math.max(0.12, Math.abs(n) * envelope) : 0.08;
				return <div key={i} style={{width: barW * 0.65, height: height * h, borderRadius: 4, background: color, opacity: active ? 1 : 0.35}} />;
			})}
		</div>
	);
};
