import type {CSSProperties, ReactNode} from 'react';
import {C, FONT, MONO, SERIF, SHADOW} from '../theme';
import type {Source} from '../data';
import {GradeTile, IdChip, Pill} from './GradeTile';
import {Icon} from './Icon';

const MUTED = new Set(['not_applicable', 'overridden']);

export const pillTone = (code: string) => (code === 'applies' ? 'applies' : code === 'superseded' || code === 'overridden' ? 'warn' : 'na');

/**
 * The app's source card (.source-card): grade tile, kind + id, title, origin, score, owner/date
 * meta with the applicability pill, statement and serif quote, then "Why X?".
 * `score`/`grade` can be overridden to animate a live grading; `children` replaces the collapsed "Why".
 */
export const SourceCard: React.FC<{
	source: Source;
	scale?: number;
	grade?: Source['grade'] | null;
	score?: number | null;
	ownerNote?: ReactNode;
	datedStyle?: CSSProperties;
	ownerStyle?: CSSProperties;
	pill?: ReactNode;
	children?: ReactNode;
	style?: CSSProperties;
	showQuote?: boolean;
}> = ({source: s, scale = 1, grade, score, ownerNote, datedStyle, ownerStyle, pill, children, style, showQuote = true}) => {
	const z = (n: number) => n * scale;
	const muted = MUTED.has(s.status);
	const shownGrade = grade === undefined ? s.grade : grade;
	const shownScore = score === undefined ? s.score : score;
	let owner: ReactNode;
	if (s.kind === 'teams_message') owner = <><Icon name="message" size={z(18)} />Posted by {s.author_name}</>;
	else if (s.owner_active) owner = <><Icon name="user" size={z(18)} />Owner: {s.owner_name}</>;
	else owner = <><Icon name="alert" size={z(18)} />No active owner</>;
	const dated = s.kind === 'teams_message' ? `Posted ${s.created_on}` : s.last_reviewed_on ? `Last reviewed ${s.last_reviewed_on}` : `Created ${s.created_on}`;
	return (
		<div
			style={{
				background: muted ? C.surface2 : C.surface,
				borderRadius: z(22),
				padding: `${z(26)}px ${z(30)}px`,
				boxShadow: SHADOW,
				fontFamily: FONT,
				color: C.ink,
				...style,
			}}
		>
			<div style={{display: 'flex', gap: z(20), alignItems: 'flex-start'}}>
				<GradeTile grade={shownGrade} size={z(76)} muted={muted} />
				<div style={{flex: 1, minWidth: 0}}>
					<div style={{display: 'flex', alignItems: 'center', gap: z(12), fontSize: z(18), fontWeight: 550, color: C.muted}}>
						{s.kind_label}
						<IdChip size={z(16)}>{s.id}</IdChip>
					</div>
					<div style={{fontSize: z(28), fontWeight: 600, letterSpacing: -0.4, marginTop: z(6), color: muted ? C.muted : C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
						{s.title}
					</div>
					<div style={{fontSize: z(18), color: C.muted, marginTop: z(2)}}>{s.source}</div>
				</div>
				<div style={{textAlign: 'right', fontFamily: MONO, fontWeight: 600, fontSize: z(24), color: C.ink2, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums'}}>
					{shownScore ?? '—'}
					<div style={{fontFamily: FONT, fontWeight: 450, fontSize: z(14), color: C.faint}}>score</div>
				</div>
			</div>
			<div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: `${z(10)}px ${z(22)}px`, marginTop: z(18), fontSize: z(18), color: C.muted}}>
				<span style={{display: 'inline-flex', alignItems: 'center', gap: z(8), ...(s.owner_active || s.kind === 'teams_message' ? {} : {color: C.neg, fontWeight: 600}), ...ownerStyle}}>
					{owner}
					{ownerNote}
				</span>
				<span style={{display: 'inline-flex', alignItems: 'center', gap: z(8), ...datedStyle}}>
					<Icon name="calendar" size={z(18)} />
					{dated}
				</span>
				{pill ?? <Pill tone={pillTone(s.applicability.code)} size={z(17)}>{s.applicability.text}</Pill>}
			</div>
			<div style={{fontWeight: 550, fontSize: z(22), marginTop: z(18), color: muted ? C.muted : C.ink, letterSpacing: -0.1}}>{s.statement}</div>
			{showQuote ? (
				<div
					style={{
						margin: `${z(10)}px 0 0`,
						padding: `${z(2)}px 0 ${z(2)}px ${z(18)}px`,
						borderLeft: `2px solid ${C.lineStrong}`,
						fontFamily: SERIF,
						fontStyle: 'italic',
						fontSize: z(27),
						lineHeight: 1.3,
						color: C.ink2,
						opacity: muted ? 0.7 : 1,
					}}
				>
					{s.quote}
				</div>
			) : null}
			{children ?? (
				<div style={{display: 'inline-flex', alignItems: 'center', gap: z(8), marginTop: z(16), fontSize: z(19), fontWeight: 600, color: C.ink2}}>
					Why {shownGrade ?? '?'}? <Icon name="chevronDown" size={z(18)} />
				</div>
			)}
		</div>
	);
};
