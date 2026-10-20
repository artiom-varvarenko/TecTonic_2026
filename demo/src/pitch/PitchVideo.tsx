import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {CLAMP} from '../anim';
import {C, GRADE_BG} from '../theme';
import {PitchAsk} from './PitchAsk';
import {PitchClose} from './PitchClose';
import {PitchGrade} from './PitchGrade';
import {PitchHook} from './PitchHook';
import {PitchWhere} from './PitchWhere';
import {PITCH_FRAMES, PITCH_IDS, pitchDuration, pitchStart, TRANSITION_FRAMES} from './timeline';
import type {PitchId} from './timeline';
import '../fonts';

const SCENES: Record<PitchId, React.FC> = {
	pitch_hook: PitchHook,
	pitch_grade: PitchGrade,
	pitch_ask: PitchAsk,
	pitch_where: PitchWhere,
	pitch_close: PitchClose,
};

const FadeIn: React.FC<{children: React.ReactNode}> = ({children}) => {
	const frame = useCurrentFrame();
	return <AbsoluteFill style={{opacity: interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], CLAMP)}}>{children}</AbsoluteFill>;
};

const ProgressBar: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				bottom: 0,
				height: 5,
				width: `${(frame / PITCH_FRAMES) * 100}%`,
				background: `linear-gradient(90deg, ${GRADE_BG.A}, ${GRADE_BG.C}, ${GRADE_BG.E}, ${GRADE_BG.G})`,
				opacity: 0.85,
			}}
		/>
	);
};

/** The one-minute pitch video: the "four car policies" problem and how TrustLabel settles it. */
export const TrustLabelPitch: React.FC<{music: boolean}> = ({music}) => (
	<AbsoluteFill style={{background: C.dark}}>
		{PITCH_IDS.map((id, i) => {
			const Scene = SCENES[id];
			return (
				<Sequence key={id} from={pitchStart(id)} durationInFrames={pitchDuration(id)} name={id}>
					{i > 0 ? (
						<FadeIn>
							<Scene />
						</FadeIn>
					) : (
						<Scene />
					)}
				</Sequence>
			);
		})}
		<ProgressBar />
		{music ? (
			<Audio
				src={staticFile('music/bed.mp3')}
				volume={(f) => interpolate(f, [0, 30, PITCH_FRAMES - 60, PITCH_FRAMES], [0, 0.12, 0.12, 0], CLAMP)}
			/>
		) : null}
	</AbsoluteFill>
);
