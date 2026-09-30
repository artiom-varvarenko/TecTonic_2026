import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP} from '../anim';

/** Types `text` from `start` at `cps` characters per second; optional blinking caret. */
export const Typewriter: React.FC<{text: string; start: number; cps?: number; caret?: boolean; render?: (visible: string) => React.ReactNode}> = ({
	text,
	start,
	cps = 32,
	caret = true,
	render,
}) => {
	const frame = useCurrentFrame();
	const count = Math.floor(interpolate(frame, [start, start + (text.length / cps) * 30], [0, text.length], CLAMP));
	const visible = text.slice(0, count);
	const typing = frame >= start && count < text.length;
	const showCaret = caret && frame >= start - 10 && (typing || Math.floor(frame / 15) % 2 === 0);
	return (
		<>
			{render ? render(visible) : visible}
			{caret ? <span style={{display: 'inline-block', width: '0.08em', height: '1.05em', marginLeft: 2, verticalAlign: '-0.15em', background: 'currentColor', opacity: showCaret ? 0.8 : 0}} /> : null}
		</>
	);
};

export const typedEnd = (text: string, start: number, cps = 32) => start + (text.length / cps) * 30;
