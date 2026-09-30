import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, GRADE_BG, GRADES} from '../theme';

export type Tone = 'light' | 'dark';

/**
 * Scene backdrop in the app's two moods: the warm off-white of the product (`light`) or the
 * graphite of the login hero (`dark`). A slow dot grid keeps both from feeling static.
 */
export const Stage: React.FC<{tone: Tone; children?: React.ReactNode}> = ({tone, children}) => {
	const frame = useCurrentFrame();
	const drift = (frame * 0.2) % 44;
	const dark = tone === 'dark';
	return (
		<AbsoluteFill
			style={{
				background: dark
					? `radial-gradient(120% 90% at 0% 0%, ${C.darkRaised} 0%, ${C.dark} 60%), ${C.dark}`
					: `radial-gradient(1500px 900px at 78% -10%, #ffffff 0%, ${C.bg} 55%, #efefea 100%)`,
			}}
		>
			<AbsoluteFill
				style={{
					backgroundImage: `radial-gradient(${dark ? 'rgba(255,255,255,0.07)' : 'rgba(17,19,22,0.07)'} 1.2px, transparent 1.2px)`,
					backgroundSize: '44px 44px',
					backgroundPosition: `${drift}px ${drift}px`,
					maskImage: 'radial-gradient(1300px 820px at 65% 45%, black 10%, transparent 80%)',
				}}
			/>
			{dark ? (
				<div
					style={{
						position: 'absolute',
						right: -300,
						bottom: -360,
						width: 960,
						height: 960,
						borderRadius: '50%',
						background: `conic-gradient(from ${frame * 0.2}deg, ${GRADES.map((g) => GRADE_BG[g]).join(', ')}, ${GRADE_BG.A})`,
						filter: 'blur(170px)',
						opacity: 0.12,
					}}
				/>
			) : null}
			{children}
		</AbsoluteFill>
	);
};
