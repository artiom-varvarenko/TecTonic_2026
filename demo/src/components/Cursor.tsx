import {interpolate, useCurrentFrame, Easing} from 'remotion';
import {CLAMP} from '../anim';

type Point = {frame: number; x: number; y: number};

/** Mouse pointer that glides between keyframes and "clicks" at the given frames. */
export const Cursor: React.FC<{path: Point[]; clicks: number[]; appearAt?: number}> = ({path, clicks, appearAt = path[0].frame}) => {
	const frame = useCurrentFrame();
	const frames = path.map((p) => p.frame);
	const ease = {...CLAMP, easing: Easing.bezier(0.45, 0, 0.2, 1)};
	const x = interpolate(frame, frames, path.map((p) => p.x), ease);
	const y = interpolate(frame, frames, path.map((p) => p.y), ease);
	const opacity = interpolate(frame, [appearAt, appearAt + 8], [0, 1], CLAMP);
	const press = clicks.reduce((acc, c) => Math.max(acc, interpolate(frame, [c - 3, c, c + 6], [0, 1, 0], CLAMP)), 0);
	const ripple = clicks.map((c) => interpolate(frame, [c, c + 18], [0, 1], CLAMP)).find((r) => r > 0 && r < 1) ?? 0;
	return (
		<div style={{position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none', zIndex: 50}}>
			{ripple > 0 ? (
				<div
					style={{
						position: 'absolute',
						left: -30 * (0.4 + ripple),
						top: -30 * (0.4 + ripple),
						width: 60 * (0.4 + ripple),
						height: 60 * (0.4 + ripple),
						borderRadius: '50%',
						border: '3px solid rgba(110,168,255,0.9)',
						opacity: 1 - ripple,
					}}
				/>
			) : null}
			<svg width="44" height="44" viewBox="0 0 24 24" style={{transform: `scale(${1 - press * 0.18})`, transformOrigin: '4px 3px', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))'}}>
				<path d="M4 2.5l15 9.2-6.6 1.5 3.9 7.2-3 1.6-3.9-7.3L4.5 19z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
			</svg>
		</div>
	);
};
