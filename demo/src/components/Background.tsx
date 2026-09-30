import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, GRADE_BG, GRADES} from '../theme';

// Deep navy stage with a slowly drifting dot grid and a faint energy-label glow.
export const Background: React.FC = () => {
	const frame = useCurrentFrame();
	const drift = (frame * 0.25) % 48;
	return (
		<AbsoluteFill style={{background: `radial-gradient(1400px 900px at 18% 8%, ${C.navyMid} 0%, ${C.navy} 48%, ${C.navyDeep} 100%)`}}>
			<AbsoluteFill
				style={{
					backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1.3px, transparent 1.3px)',
					backgroundSize: '48px 48px',
					backgroundPosition: `${drift}px ${drift}px`,
					maskImage: 'radial-gradient(1200px 800px at 60% 40%, black 20%, transparent 85%)',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					right: -260,
					bottom: -320,
					width: 900,
					height: 900,
					borderRadius: '50%',
					background: `conic-gradient(from ${frame * 0.2}deg, ${GRADES.map((g) => GRADE_BG[g]).join(', ')}, ${GRADE_BG.A})`,
					filter: 'blur(160px)',
					opacity: 0.16,
				}}
			/>
		</AbsoluteFill>
	);
};
