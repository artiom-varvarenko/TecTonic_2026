import type {CSSProperties} from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SpringConfig} from 'remotion';

export const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const SMOOTH: Partial<SpringConfig> = {damping: 200};
export const SNAPPY: Partial<SpringConfig> = {damping: 18, stiffness: 180, mass: 0.8};
export const BOUNCY: Partial<SpringConfig> = {damping: 11, stiffness: 160, mass: 0.7};

/** 0 → 1 spring that starts at `delay` (scene-relative frames). */
export const useEnter = (delay: number, config: Partial<SpringConfig> = SMOOTH, durationInFrames?: number) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return spring({frame: frame - delay, fps, config, durationInFrames});
};

/** Linear-eased 0 → 1 between two frames. */
export const useProgress = (from: number, to: number, easing = Easing.inOut(Easing.cubic)) => {
	const frame = useCurrentFrame();
	return interpolate(frame, [from, to], [0, 1], {...CLAMP, easing});
};

export const fadeUp = (p: number, distance = 28): CSSProperties => ({
	opacity: p,
	transform: `translateY(${(1 - p) * distance}px)`,
});

export const fadeIn = (p: number): CSSProperties => ({opacity: p});

export const popIn = (p: number, from = 0.6): CSSProperties => ({
	opacity: Math.min(1, p * 1.6),
	transform: `scale(${from + (1 - from) * p})`,
});

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Blend two #rrggbb colours. */
export const mixColor = (a: string, b: string, t: number) => {
	const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
	const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
	const out = pa.map((v, i) => Math.round(mix(v, pb[i], Math.max(0, Math.min(1, t)))));
	return `rgb(${out.join(',')})`;
};
