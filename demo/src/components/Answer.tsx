import type {CSSProperties, ReactNode} from 'react';
import {C, FONT, MONO, SERIF, SHADOW} from '../theme';
import type {Answer} from '../data';
import {GradeTile, StatusBadge, TONE_LINE} from './GradeTile';

const TONE_BG = {use: '#f5fbf7', verify: '#fffaf0', ask_expert: '#fff7f6'} as const;

/**
 * The app's verdict card (.answer-card): tone line, status badge, serif headline, detail,
 * competing answers on the right and the topic/context meta row.
 */
export const VerdictCard: React.FC<{
	answer: Answer;
	scale?: number;
	meta?: {topic: string; context: string; matched?: string[]};
	children?: ReactNode;
	style?: CSSProperties;
	competing?: boolean;
}> = ({answer, scale = 1, meta, children, style, competing = true}) => {
	const s = (n: number) => n * scale;
	const showCompeting = competing && answer.competing.length > 0;
	return (
		<div
			style={{
				position: 'relative',
				overflow: 'hidden',
				borderRadius: s(26),
				boxShadow: SHADOW,
				fontFamily: FONT,
				color: C.ink,
				background: `linear-gradient(180deg, ${TONE_BG[answer.action]} 0%, #fff 55%)`,
				...style,
			}}
		>
			<div style={{position: 'absolute', inset: '0 0 auto', height: s(5), background: TONE_LINE[answer.action]}} />
			<div style={{padding: `${s(34)}px ${s(38)}px ${meta ? 0 : s(32)}px`, display: 'flex', gap: s(34), alignItems: 'flex-start'}}>
				<div style={{flex: 1, minWidth: 0, display: 'flex', gap: s(24), alignItems: 'flex-start'}}>
					{answer.grade ? <GradeTile grade={answer.grade} size={s(96)} /> : null}
					<div style={{minWidth: 0}}>
						<StatusBadge action={answer.action} size={s(19)} />
						<div style={{fontFamily: SERIF, fontSize: s(56), lineHeight: 1.05, letterSpacing: -0.4, marginTop: s(14)}}>{answer.headline}</div>
						<div style={{fontSize: s(22), color: C.ink2, marginTop: s(10), lineHeight: 1.45}}>{answer.detail}</div>
						{children}
					</div>
				</div>
				{showCompeting ? (
					<div style={{width: s(360), flex: 'none', padding: s(8), background: 'rgba(255,255,255,0.8)', border: `1px solid ${C.line}`, borderRadius: s(20)}}>
						<div style={{fontSize: s(16), color: C.faint, fontWeight: 550, padding: `${s(8)}px ${s(14)}px ${s(2)}px`}}>Competing answers</div>
						{answer.competing.map((c, i) => (
							<div
								key={c.value}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: s(14),
									padding: `${s(12)}px ${s(14)}px`,
									borderTop: i ? `1px dashed ${C.lineStrong}` : 'none',
								}}
							>
								<GradeTile grade={c.best_grade} size={s(40)} />
								<div style={{minWidth: 0}}>
									<div style={{fontWeight: 600, fontSize: s(22), letterSpacing: -0.2}}>{c.value_display}</div>
									<div style={{fontFamily: MONO, fontSize: s(16), color: C.muted}}>{c.item_ids.join(', ')}</div>
								</div>
							</div>
						))}
					</div>
				) : null}
			</div>
			{meta ? (
				<div
					style={{
						display: 'flex',
						gap: s(26),
						marginTop: s(30),
						padding: `${s(16)}px ${s(38)}px`,
						borderTop: `1px solid ${C.line}`,
						background: 'rgba(250,250,248,0.7)',
						color: C.muted,
						fontSize: s(18),
						whiteSpace: 'nowrap',
					}}
				>
					<span>
						Topic <b style={{color: C.ink2, fontWeight: 550}}>{meta.topic}</b>
					</span>
					<span>
						Context <b style={{color: C.ink2, fontWeight: 550}}>{meta.context}</b>
					</span>
					{meta.matched?.length ? (
						<span>
							Matched <b style={{color: C.ink2, fontWeight: 550}}>{meta.matched.join(', ')}</b>
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
};
