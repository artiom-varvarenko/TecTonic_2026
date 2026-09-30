import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG} from '../theme';
import type {Grade} from '../theme';
import {CLAMP, fadeUp, mix, SNAPPY, useEnter} from '../anim';
import {SceneText} from '../components/SceneText';
import {GradeTile} from '../components/GradeTile';
import {AnswerCard} from '../components/Answer';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue} from '../timeline';

const B = DATA.before;
const CHIP_W = 186;
const CHIP_H = 88;
const BUCKET_W = 232;
const BUCKET_GAP = 20;
const BUCKET_Y = 190;

const BUCKETS = [
	{label: 'Other country', color: '#9aa5b3'},
	{label: 'Outdated / superseded', color: GRADE_BG.F},
	{label: 'Client exception, chat only', color: GRADE_BG.E},
	{label: 'True conflict', color: GRADE_BG.G},
];

const short = (v: string) => `${v}${v === '22' ? 'nd' : 'th'}`;

export const Triage: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		country: cue('triage', 'country'),
		outdated: cue('triage', 'outdated'),
		exception: cue('triage', 'exception'),
		verdict: cue('triage', 'verdict'),
	};
	const chips: {id: string; label: string; bucket: number | null; moveAt: number}[] = [
		{id: 'DOC-BE-017', label: 'Procedure BE', bucket: null, moveAt: 0},
		{id: 'FAQ-BE-003', label: 'FAQ BE', bucket: null, moveAt: 0},
		{id: 'TEAMS-4411', label: 'Teams chat', bucket: 2, moveAt: at.exception},
		{id: 'DOC-BE-009', label: 'Old handbook', bucket: 1, moveAt: at.outdated},
		{id: 'DOC-NL-004', label: 'Procedure NL', bucket: 0, moveAt: at.country},
	];
	const buckets = useEnter(at.country - 30);
	const generalRule = useEnter(at.exception + 40);
	const answer = useEnter(at.verdict - 4, SNAPPY);
	const lift = interpolate(answer, [0, 1], [0, -40]);
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<SceneNarration scene="triage" />
			<Sfx at={at.country} src="whoosh" volume={0.3} />
			<Sfx at={at.outdated} src="whoosh" volume={0.3} />
			<Sfx at={at.exception} src="whoosh" volume={0.3} />
			<Sfx at={at.verdict} src="alert" volume={0.35} />
			<SceneText
				step="03"
				kicker="Conflict triage"
				title="Disagreements are [sorted,] not averaged."
				body="Other country, outdated, a client-specific exception or a true conflict. Then a clear verdict: use, use with caution, or don't act yet."
			/>
			<div style={{position: 'absolute', left: 820, top: 110 + lift, width: 990, height: 900}}>
				<div style={{color: C.inkSoft, fontSize: 21, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, ...fadeUp(useEnter(6), 10)}}>
					5 sources on "{B.topic.label}" · {B.context.label}
				</div>
				<div style={{position: 'absolute', left: 2 * (CHIP_W + 16) + 10, top: 58, color: '#8ee38a', fontSize: 24, fontWeight: 800, ...fadeUp(generalRule, 12), display: 'flex', alignItems: 'center', height: CHIP_H}}>
					&larr; Applies: general rule for Belgium
				</div>
				{BUCKETS.map((b, i) => (
					<div
						key={b.label}
						style={{
							position: 'absolute',
							left: i * (BUCKET_W + BUCKET_GAP),
							top: BUCKET_Y,
							width: BUCKET_W,
							height: 178,
							borderRadius: 18,
							border: `2px dashed ${b.color}`,
							background: 'rgba(255,255,255,0.05)',
							...fadeUp(buckets, 30),
						}}
					>
						<div style={{padding: '12px 16px', fontSize: 19, fontWeight: 800, color: b.color, letterSpacing: 0.3}}>{b.label}</div>
						{i === 3 ? (
							<div style={{padding: '18px 16px', fontSize: 20, color: C.inkSoft, fontStyle: 'italic', opacity: interpolate(frame, [at.verdict - 30, at.verdict], [0, 1], CLAMP)}}>
								none this time
							</div>
						) : null}
					</div>
				))}
				{chips.map((chip, i) => {
					const s = source(B, chip.id);
					const p = useEnter(chip.moveAt, SNAPPY);
					const enter = useEnter(10 + i * 4, SNAPPY);
					const x0 = i * (CHIP_W + 16);
					const y0 = 58;
					const x1 = chip.bucket === null ? x0 : chip.bucket * (BUCKET_W + BUCKET_GAP) + (BUCKET_W - CHIP_W) / 2;
					const y1 = BUCKET_Y + 68;
					const t = chip.bucket === null ? 0 : p;
					const highlight = chip.bucket === null ? generalRule : 0;
					return (
						<div
							key={chip.id}
							style={{
								position: 'absolute',
								left: mix(x0, x1, t),
								top: mix(y0, y1, t) - Math.sin(Math.PI * t) * 70,
								width: CHIP_W,
								height: CHIP_H,
								background: '#fff',
								borderRadius: 14,
								display: 'flex',
								alignItems: 'center',
								gap: 12,
								padding: '0 14px',
								boxShadow: `0 12px 30px rgba(0,0,0,0.3), 0 0 0 ${4 * highlight}px #4CB848`,
								transform: `rotate(${Math.sin(Math.PI * t) * 6}deg)`,
								...fadeUp(enter, 30),
							}}
						>
							<GradeTile grade={s.grade as Grade} size={48} />
							<div style={{minWidth: 0}}>
								<div style={{fontSize: 28, fontWeight: 900, color: C.navy, lineHeight: 1.05}}>{short(s.value)}</div>
								<div style={{fontSize: 16, color: C.muted, whiteSpace: 'nowrap'}}>{chip.label}</div>
							</div>
						</div>
					);
				})}
				<div style={{position: 'absolute', top: 420, left: 0, width: 990, ...fadeUp(answer, 80)}}>
					<AnswerCard answer={B.answer} scale={1}>
						<div style={{display: 'flex', gap: 16, marginTop: 20}}>
							{B.answer.competing.map((c) => (
								<div key={c.value} style={{flex: 1, display: 'flex', alignItems: 'center', gap: 14, background: '#f6f8fb', borderRadius: 14, padding: '14px 18px'}}>
									<GradeTile grade={c.best_grade} size={52} />
									<div>
										<div style={{fontSize: 26, fontWeight: 800}}>{c.value_display}</div>
										<div style={{fontSize: 18, color: C.muted}}>
											{c.item_ids.length} source{c.item_ids.length > 1 ? 's' : ''}: {c.item_ids.join(', ')}
										</div>
									</div>
								</div>
							))}
						</div>
						<ActionScale at={at.verdict + 30} />
					</AnswerCard>
				</div>
			</div>
		</AbsoluteFill>
	);
};

const ActionScale: React.FC<{at: number}> = ({at}) => {
	const p = useEnter(at);
	const actions = [
		{label: 'Use', color: C.green},
		{label: 'Use with caution', color: C.verify},
		{label: "Don't act yet", color: C.red},
	];
	return (
		<div style={{display: 'flex', gap: 12, marginTop: 20, alignItems: 'center', ...fadeUp(p, 12)}}>
			<span style={{fontSize: 18, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 6}}>Verdict</span>
			{actions.map((a, i) => (
				<span
					key={a.label}
					style={{
						fontSize: 20,
						fontWeight: 800,
						padding: '6px 16px',
						borderRadius: 999,
						border: `2px solid ${a.color}`,
						background: i === 2 ? a.color : 'transparent',
						color: i === 2 ? '#fff' : a.color,
						opacity: i === 2 ? 1 : 0.55,
						transform: `scale(${i === 2 ? 1 + 0.08 * p : 1})`,
					}}
				>
					{a.label}
				</span>
			))}
		</div>
	);
};
