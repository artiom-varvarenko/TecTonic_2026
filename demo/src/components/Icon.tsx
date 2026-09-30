import {createElement} from 'react';
import type {CSSProperties} from 'react';
import {GRADE_BG} from '../theme';

// Stroke icons from static/app.js (ICONS), plus a few for the new scenes drawn in the same style.
// Plain data, not JSX: module-level JSX would run before Remotion defines the React global.
const PATHS = {
	search: [['circle', {cx: 11, cy: 11, r: 7}], ['path', {d: 'm20 20-3.5-3.5'}]],
	arrowRight: [['path', {d: 'M5 12h14'}], ['path', {d: 'm13 6 6 6-6 6'}]],
	check: [['path', {d: 'm5 12.5 4.5 4.5L19 7.5'}]],
	clock: [['circle', {cx: 12, cy: 12, r: 9}], ['path', {d: 'M12 7v5l3 2'}]],
	alert: [
		['path', {d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'}],
		['path', {d: 'M12 9v4'}],
		['path', {d: 'M12 17h.01'}],
	],
	mic: [['rect', {x: 9, y: 3, width: 6, height: 11, rx: 3}], ['path', {d: 'M5 11a7 7 0 0 0 14 0'}], ['path', {d: 'M12 18v3'}]],
	logout: [['path', {d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'}], ['path', {d: 'm16 17 5-5-5-5'}], ['path', {d: 'M21 12H9'}]],
	chevronDown: [['path', {d: 'm6 9 6 6 6-6'}]],
	arrowLeft: [['path', {d: 'M19 12H5'}], ['path', {d: 'm11 18-6-6 6-6'}]],
	shield: [['path', {d: 'M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6z'}], ['path', {d: 'm9 12 2 2 4-4'}]],
	layers: [['path', {d: 'm12 3 9 5-9 5-9-5z'}], ['path', {d: 'm3 13 9 5 9-5'}]],
	flag: [['path', {d: 'M5 21V4'}], ['path', {d: 'M5 4h12l-2.5 4L17 12H5'}]],
	link: [
		['path', {d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'}],
		['path', {d: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'}],
	],
	copy: [['rect', {x: 9, y: 9, width: 11, height: 11, rx: 2}], ['path', {d: 'M5 15V6a2 2 0 0 1 2-2h9'}]],
	message: [['path', {d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'}]],
	user: [['circle', {cx: 12, cy: 8, r: 4}], ['path', {d: 'M4 21a8 8 0 0 1 16 0'}]],
	calendar: [['rect', {x: 3, y: 4, width: 18, height: 17, rx: 2}], ['path', {d: 'M16 2v4M8 2v4M3 10h18'}]],
	briefcase: [['rect', {x: 3, y: 7, width: 18, height: 13, rx: 2}], ['path', {d: 'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18'}]],
	inbox: [
		['path', {d: 'M22 12h-6l-2 3h-4l-2-3H2'}],
		['path', {d: 'M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z'}],
	],
	lock: [['rect', {x: 4.5, y: 10.5, width: 15, height: 10.5, rx: 2}], ['path', {d: 'M8 10.5V7.5a4 4 0 0 1 8 0v3'}]],
	key: [['circle', {cx: 8, cy: 15, r: 4}], ['path', {d: 'm10.8 12.2 8.7-8.7M16.5 6.5l2.5 2.5M14 9l2 2'}]],
	globe: [['circle', {cx: 12, cy: 12, r: 9}], ['path', {d: 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'}]],
	terminal: [['rect', {x: 3, y: 4, width: 18, height: 16, rx: 2.5}], ['path', {d: 'm7.5 9.5 3 2.5-3 2.5M13 15h4'}]],
	sparkle: [['path', {d: 'M12 3.5 13.9 10 20.5 12l-6.6 2L12 20.5 10.1 14 3.5 12l6.6-2z'}]],
	wave: [['path', {d: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0'}]],
} satisfies Record<string, [string, Record<string, string | number>][]>;

export type IconName = keyof typeof PATHS;

export const Icon: React.FC<{name: IconName; size?: number; color?: string; stroke?: number; style?: CSSProperties}> = ({
	name,
	size = 22,
	color = 'currentColor',
	stroke = 1.75,
	style,
}) => (
	<svg
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke={color}
		strokeWidth={stroke}
		strokeLinecap="round"
		strokeLinejoin="round"
		style={{flex: 'none', ...style}}
	>
		{PATHS[name].map(([tag, attrs], i) => createElement(tag, {key: i, ...attrs}))}
	</svg>
);

/** Four arrows of the EU energy label (A, C, E, G) on a rounded tile, as in the app header. */
export const BrandMark: React.FC<{size?: number; tile?: string}> = ({size = 36, tile = 'currentColor'}) => (
	<svg viewBox="0 0 28 28" width={size} height={size} style={{flex: 'none'}}>
		<rect width="28" height="28" rx="8" fill={tile} />
		{(
			[
				[GRADE_BG.A, 9],
				[GRADE_BG.C, 12],
				[GRADE_BG.E, 15],
				[GRADE_BG.G, 18],
			] as const
		).map(([fill, w], i) => {
			const y = 6.5 + i * 4;
			const x = 5;
			return <polygon key={fill} fill={fill} points={`${x},${y} ${x + w - 2.5},${y} ${x + w},${y + 1.5} ${x + w - 2.5},${y + 3} ${x},${y + 3}`} />;
		})}
	</svg>
);

/** The Google "G" used on the app's "Continue with Google" button. */
export const GoogleMark: React.FC<{size?: number}> = ({size = 24}) => (
	<svg viewBox="0 0 48 48" width={size} height={size} style={{flex: 'none'}}>
		<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
		<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
		<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
		<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
	</svg>
);
