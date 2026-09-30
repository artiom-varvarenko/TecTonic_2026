import type {CSSProperties, ReactNode} from 'react';
import {C, FONT, GRADE_BG, GRADE_FG, GRADES, SERIF, SHADOW_SM} from '../theme';
import type {Grade} from '../theme';
import type {Overview} from '../data';
import {GradeTile, IdChip, StatusBadge, TONE_LINE} from './GradeTile';
import {Icon} from './Icon';
import type {IconName} from './Icon';

// Widgets of the app's trust overview (static/app.js renderDashboard), fed with /api/overview.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const DashHead: React.FC<{context: string; s?: number}> = ({context, s = 1}) => (
	<div style={{display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', fontFamily: FONT, padding: `0 ${2 * s}px`}}>
		<div>
			<div style={{fontFamily: SERIF, fontSize: 30 * s, lineHeight: 1.1, color: C.ink}}>Trust overview</div>
			<div style={{fontSize: 13.5 * s, color: C.muted, marginTop: 2 * s}}>What you can rely on today in {context}.</div>
		</div>
		<span style={{display: 'inline-flex', alignItems: 'center', gap: 8 * s, height: 26 * s, padding: `0 ${11 * s}px`, borderRadius: 999, background: C.surface, boxShadow: SHADOW_SM, fontSize: 12 * s, fontWeight: 600, color: C.ink2}}>
			<span style={{width: 7 * s, height: 7 * s, borderRadius: '50%', background: C.pos}} />
			Live
		</span>
	</div>
);

const Kpi: React.FC<{icon: IconName; label: string; value: string; sub: string; tone?: 'warn' | 'good'; extra?: ReactNode; s: number; style?: CSSProperties}> = ({
	icon,
	label,
	value,
	sub,
	tone,
	extra,
	s,
	style,
}) => (
	<div style={{display: 'flex', flexDirection: 'column', gap: 6 * s, padding: `${16 * s}px ${18 * s}px`, borderRadius: 14 * s, background: C.surface, boxShadow: SHADOW_SM, fontFamily: FONT, minWidth: 0, ...style}}>
		<span style={{display: 'inline-flex', alignItems: 'center', gap: 7 * s, fontSize: 12.5 * s, fontWeight: 550, color: C.muted}}>
			<Icon name={icon} size={15 * s} color={tone === 'warn' ? C.warn : tone === 'good' ? C.pos : undefined} />
			{label}
		</span>
		<span style={{fontFamily: SERIF, fontSize: 40 * s, lineHeight: 1, color: tone === 'warn' ? C.warn : C.ink}}>{value}</span>
		<span style={{fontSize: 12.5 * s, color: C.muted}}>{sub}</span>
		{extra}
	</div>
);

const GradeBar: React.FC<{grades: Record<Grade, number>; s: number}> = ({grades, s}) => (
	<span style={{display: 'flex', gap: 3 * s, height: 18 * s, marginTop: 2 * s}}>
		{GRADES.filter((g) => grades[g]).flatMap((g) =>
			new Array(grades[g]).fill(0).map((_, i) => (
				<span key={`${g}${i}`} style={{flex: '1 1 0', display: 'grid', placeItems: 'center', borderRadius: 5 * s, fontSize: 10.5 * s, fontWeight: 700, background: GRADE_BG[g], color: GRADE_FG[g]}}>
					{i === 0 ? g : ''}
				</span>
			)),
		)}
	</span>
);

/** The four KPI tiles; `glow` rings individual tiles (index) for emphasis. */
export const KpiRow: React.FC<{data: Overview; s?: number; glow?: number[]; tileStyle?: (i: number) => CSSProperties}> = ({data, s = 1, glow = [], tileStyle}) => {
	const h = data.health;
	const r = data.requests;
	const undecided = h.topics - h.safe_topics;
	const ring = (i: number): CSSProperties => ({boxShadow: glow[i] ? `${SHADOW_SM}, 0 0 0 ${3 * s * glow[i]}px ${i === 2 ? '#e39a00' : i === 0 ? C.toneUse : C.accent}` : SHADOW_SM, ...tileStyle?.(i)});
	return (
		<div style={{display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 * s}}>
			<Kpi s={s} icon="shield" label="Safe to use" value={`${h.safe_topics}/${h.topics}`} sub={undecided ? `${plural(undecided, 'topic')} need${undecided === 1 ? 's' : ''} a decision` : 'Every topic has a trusted answer'} tone={undecided ? undefined : 'good'} style={ring(0)} />
			<Kpi s={s} icon="layers" label="Current sources" value={String(h.current)} sub={`${h.in_scope} in scope · ${h.verified} expert-verified`} extra={<GradeBar grades={h.grades} s={s} />} style={ring(1)} />
			<Kpi s={s} icon="flag" label="Knowledge debt" value={String(h.attention)} sub={h.attention ? 'sources need their owner' : 'Nothing overdue or superseded'} tone={h.attention ? 'warn' : 'good'} style={ring(2)} />
			<Kpi s={s} icon="inbox" label="Verifications" value={String(r.awaiting_you + r.sent_open)} sub={`${r.awaiting_you} awaiting you · ${r.sent_open} sent · ${r.resolved} resolved`} style={ring(3)} />
		</div>
	);
};

/** One topic card of the board (.topic-card). */
export const TopicCard: React.FC<{topic: Overview['topics'][number]; s?: number; glow?: number; style?: CSSProperties}> = ({topic: t, s = 1, glow = 0, style}) => {
	const a = t.answer;
	let visual: ReactNode;
	let value: string;
	let detail: string;
	if (a.status === 'conflict') {
		visual = (
			<span style={{display: 'inline-flex', gap: 4 * s}}>
				{a.competing.map((c) => (
					<GradeTile key={c.value} grade={c.best_grade} size={26 * s} />
				))}
			</span>
		);
		value = 'Sources disagree';
		detail = a.competing.map((c) => `${c.value_display} (${c.best_grade})`).join(' vs ');
	} else if (a.status === 'gap') {
		visual = <GradeTile grade={null} size={26 * s} />;
		value = 'No applicable source';
		detail = a.detail;
	} else {
		visual = <GradeTile grade={a.grade} size={26 * s} />;
		value = a.value_display ?? '';
		detail = a.status === 'verified' && a.verified_by ? `Verified by ${a.verified_by.name}` : `${plural(t.current_count, 'current source')} agree${t.current_count === 1 ? 's' : ''}`;
	}
	const tone = TONE_LINE[a.action];
	return (
		<div
			style={{
				position: 'relative',
				overflow: 'hidden',
				display: 'flex',
				flexDirection: 'column',
				gap: 10 * s,
				padding: `${18 * s}px ${18 * s}px ${14 * s}px`,
				borderRadius: 14 * s,
				background: C.surface,
				boxShadow: glow ? `${SHADOW_SM}, 0 0 0 ${3 * s * glow}px ${tone}` : SHADOW_SM,
				fontFamily: FONT,
				color: C.ink,
				minWidth: 0,
				...style,
			}}
		>
			<div style={{position: 'absolute', inset: '0 0 auto', height: 3 * s, background: tone}} />
			<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 * s}}>
				<span style={{fontSize: 13 * s, fontWeight: 600, color: C.ink2, whiteSpace: 'nowrap'}}>{t.topic.label}</span>
				<StatusBadge action={a.action} size={11.5 * s} />
			</div>
			<div style={{display: 'flex', alignItems: 'center', gap: 12 * s, minWidth: 0}}>
				{visual}
				<span style={{fontFamily: SERIF, fontSize: 25 * s, lineHeight: 1.1, whiteSpace: 'nowrap'}}>{value}</span>
			</div>
			<span style={{fontSize: 13 * s, color: C.ink2}}>{detail}</span>
			<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 10 * s, borderTop: `1px solid ${C.line}`, fontSize: 12 * s, color: C.muted}}>
				<span>{t.top_expert ? `Expert: ${t.top_expert.name}` : 'No other expert on file'}</span>
				<span style={{display: 'inline-flex', alignItems: 'center', gap: 5 * s, fontWeight: 550, color: C.ink2}}>
					{plural(t.source_count, 'source')}
					<Icon name="arrowRight" size={13 * s} />
				</span>
			</div>
		</div>
	);
};

/** "Knowledge debt": sources that are orphaned, overdue or superseded, with who owns them. */
export const AttentionCard: React.FC<{data: Overview; s?: number; glow?: number; style?: CSSProperties}> = ({data, s = 1, glow = 0, style}) => (
	<div style={{background: C.surface, borderRadius: 14 * s, boxShadow: glow ? `${SHADOW_SM}, 0 0 0 ${3 * s * glow}px #e39a00` : SHADOW_SM, padding: 20 * s, fontFamily: FONT, color: C.ink, ...style}}>
		<div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 14 * s, fontWeight: 600}}>
			Knowledge debt
			<small style={{fontSize: 12 * s, fontWeight: 450, color: C.faint}}>Sources that need their owner</small>
		</div>
		{data.attention.map((a) => (
			<div key={a.id} style={{display: 'flex', gap: 12 * s, padding: `${12 * s}px 0 0`}}>
				<GradeTile grade={a.grade} size={26 * s} />
				<div style={{flex: 1, minWidth: 0}}>
					<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 * s, fontSize: 13.5 * s, fontWeight: 600}}>
						<span>{a.title}</span>
						<IdChip size={11.5 * s}>{a.id}</IdChip>
					</div>
					<div style={{marginTop: 3 * s, fontSize: 12 * s, color: C.muted}}>
						{a.kind_label} · {a.owner_name ? `Owner: ${a.owner_name}` : 'No active owner'}
					</div>
					<div style={{display: 'flex', flexDirection: 'column', gap: 4 * s, marginTop: 8 * s}}>
						{a.issues.map((text) => (
							<div key={text} style={{position: 'relative', paddingLeft: 14 * s, fontSize: 12.5 * s, color: C.ink2}}>
								<span style={{position: 'absolute', left: 2 * s, top: '0.55em', width: 5 * s, height: 5 * s, borderRadius: '50%', background: C.warn}} />
								{text}
							</div>
						))}
					</div>
				</div>
			</div>
		))}
	</div>
);

const ACT_ICON = {verified: 'check', assigned: 'inbox', requested: 'clock'} as const;

/** "Recent activity": verifications you can see (requests sent, answers verified). */
export const ActivityCard: React.FC<{data: Overview; s?: number; glow?: number; style?: CSSProperties}> = ({data, s = 1, glow = 0, style}) => (
	<div style={{background: C.surface, borderRadius: 14 * s, boxShadow: glow ? `${SHADOW_SM}, 0 0 0 ${3 * s * glow}px ${C.toneUse}` : SHADOW_SM, padding: 20 * s, fontFamily: FONT, color: C.ink, ...style}}>
		<div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 14 * s, fontWeight: 600}}>
			Recent activity
			<small style={{fontSize: 12 * s, fontWeight: 450, color: C.faint}}>Verifications you can see</small>
		</div>
		{data.activity.length === 0 ? (
			<div style={{display: 'flex', alignItems: 'center', gap: 8 * s, marginTop: 12 * s, color: C.muted, fontSize: 13 * s}}>
				<Icon name="clock" size={15 * s} />
				No verifications yet. Confirmed answers appear here for the whole client team.
			</div>
		) : (
			data.activity.map((e, i) => (
				<div key={e.text} style={{display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 10 * s, alignItems: 'start', padding: `${10 * s}px 0`, borderTop: i ? `1px solid ${C.line}` : 'none', fontSize: 13 * s}}>
					<span
						style={{
							display: 'grid',
							placeItems: 'center',
							width: 22 * s,
							height: 22 * s,
							borderRadius: '50%',
							background: e.kind === 'verified' ? C.posBg : e.kind === 'assigned' ? C.warnBg : C.sunken,
							color: e.kind === 'verified' ? C.pos : e.kind === 'assigned' ? C.warn : C.muted,
						}}
					>
						<Icon name={ACT_ICON[e.kind]} size={13 * s} stroke={2.2} />
					</span>
					<span style={{color: C.ink2, paddingTop: 2 * s}}>{e.text}</span>
				</div>
			))
		)}
	</div>
);
