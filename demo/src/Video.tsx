import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {Fragment} from 'react';
import {Background} from './components/Background';
import {CLAMP} from './anim';
import {GRADE_BG} from './theme';
import {sceneDuration, SCENE_IDS, TOTAL_FRAMES, TRANSITION_FRAMES} from './timeline';
import type {SceneId} from './timeline';
import {Hook} from './scenes/Hook';
import {Problem} from './scenes/Problem';
import {Reveal} from './scenes/Reveal';
import {Grading} from './scenes/Grading';
import {Applicability} from './scenes/Applicability';
import {Triage} from './scenes/Triage';
import {Routing} from './scenes/Routing';
import {Voice} from './scenes/Voice';
import {Verified} from './scenes/Verified';
import {Team} from './scenes/Team';
import {Outro} from './scenes/Outro';
import './fonts';

const SCENES: Record<SceneId, React.FC> = {
	hook: Hook,
	problem: Problem,
	reveal: Reveal,
	grading: Grading,
	applicability: Applicability,
	triage: Triage,
	routing: Routing,
	voice: Voice,
	verified: Verified,
	team: Team,
	outro: Outro,
};

const ProgressBar: React.FC = () => {
	const frame = useCurrentFrame();
	const p = frame / TOTAL_FRAMES;
	return (
		<div style={{position: 'absolute', left: 0, bottom: 0, height: 6, width: `${p * 100}%`, background: `linear-gradient(90deg, ${GRADE_BG.A}, ${GRADE_BG.C}, ${GRADE_BG.E}, ${GRADE_BG.G})`, opacity: 0.8}} />
	);
};

export const TrustLabelDemo: React.FC<{music: boolean}> = ({music}) => {
	return (
		<AbsoluteFill>
			<Background />
			<TransitionSeries>
				{SCENE_IDS.map((id, i) => {
					const Scene = SCENES[id];
					return (
						<Fragment key={id}>
							{i > 0 ? <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_FRAMES})} /> : null}
							<TransitionSeries.Sequence durationInFrames={sceneDuration(id)} name={id}>
								<Scene />
							</TransitionSeries.Sequence>
						</Fragment>
					);
				})}
			</TransitionSeries>
			<ProgressBar />
			{music ? (
				<Audio
					src={staticFile('music/bed.mp3')}
					volume={(f) => interpolate(f, [0, 45, TOTAL_FRAMES - 90, TOTAL_FRAMES], [0, 0.16, 0.16, 0], CLAMP)}
				/>
			) : null}
		</AbsoluteFill>
	);
};
