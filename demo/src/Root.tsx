import {Composition} from 'remotion';
import {TrustLabelDemo} from './Video';
import {TrustLabelPitch} from './pitch/PitchVideo';
import {PITCH_FRAMES} from './pitch/timeline';
import {FPS, HEIGHT, WIDTH} from './theme';
import {TOTAL_FRAMES} from './timeline';

export const RemotionRoot: React.FC = () => (
	<>
		<Composition
			id="TrustLabelDemo"
			component={TrustLabelDemo}
			durationInFrames={TOTAL_FRAMES}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
			defaultProps={{music: true}}
		/>
		<Composition
			id="TrustLabelPitch"
			component={TrustLabelPitch}
			durationInFrames={PITCH_FRAMES}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
			defaultProps={{music: true}}
		/>
	</>
);
