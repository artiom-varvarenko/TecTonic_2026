import {C} from '../theme';
import type {Answer} from '../data';
import {GradeTile} from './GradeTile';

export const BANNERS = {
	use: {text: 'Safe to use', background: C.green, color: '#fff'},
	verify: {text: 'Use with caution — ask for verification', background: C.verify, color: '#2a1a00'},
	ask_expert: {text: "Don't act yet", background: C.red, color: '#fff'},
} as const;

/** The answer card from the app: action banner, headline, detail and competing values. */
export const AnswerCard: React.FC<{answer: Answer; scale?: number; children?: React.ReactNode; style?: React.CSSProperties; bannerText?: string}> = ({
	answer,
	scale = 1,
	children,
	style,
	bannerText,
}) => {
	const banner = BANNERS[answer.action];
	const s = (n: number) => n * scale;
	return (
		<div
			style={{
				background: '#fff',
				borderRadius: s(20),
				overflow: 'hidden',
				boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
				color: C.text,
				...style,
			}}
		>
			<div style={{background: banner.background, color: banner.color, padding: `${s(14)}px ${s(28)}px`, fontWeight: 800, fontSize: s(26)}}>
				{bannerText ?? banner.text}
			</div>
			<div style={{padding: `${s(22)}px ${s(28)}px ${s(26)}px`}}>
				<div style={{display: 'flex', alignItems: 'center', gap: s(18)}}>
					{answer.grade ? <GradeTile grade={answer.grade} size={s(64)} /> : null}
					<div style={{fontSize: s(34), fontWeight: 800, letterSpacing: -0.5}}>{answer.headline}</div>
				</div>
				<div style={{fontSize: s(21), color: C.muted, marginTop: s(12), lineHeight: 1.45}}>{answer.detail}</div>
				{children}
			</div>
		</div>
	);
};
