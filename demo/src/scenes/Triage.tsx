import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, SERIF, SHADOW, SHADOW_SM} from '../theme';
import type {Grade} from '../theme';
import {CLAMP, fadeUp, mix, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {GradeTile} from '../components/GradeTile';
import {VerdictCard} from '../components/Answer';
import {Icon} from '../components/Icon';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue} from '../timeline';

const B = DATA.before;
const CHIP_W = 186;
const CHIP_H = 88;
const BUCKET_W = 234;
const BUCKET_GAP = 18;
const BUCKET_Y = 176;

const BUCKETS = [
	{label: 'Other country', color: C.muted},
	{label: 'Outdated / superseded', color: '#d35d12'},
	{label: 'Client exception, chat only', color: C.warn},
	{label: 'True conflict', color: C.neg},
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
	const head = useEnter(6);
	const buckets = useEnter(at.country - 30);
	const generalRule = useEnter(at.exception + 40);
	const answer = useEnter(at.verdict - 4, SNAPPY);
	const lift = interpolate(answer, [0, 1], [0, -36]);
	return (
		<Stage tone="light">
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
				<div style={{position: 'absolute', left: 790, top: 226 + lift, width: 1030, height: 900}}>
					<div style={{color: C.muted, fontSize: 20, fontWeight: 600, letterSpacing: 1.8, textTransform: 'uppercase', ...fadeUp(head, 10)}}>
						5 sources on "{B.topic.label}" · {B.context.label}
					</div>
					<div
						style={{
							position: 'absolute',
							left: 2 * (CHIP_W + 16) + 8,
							top: 50,
							height: CHIP_H,
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							color: C.pos,
							fontSize: 22,
							fontWeight: 600,
							...fadeUp(generalRule, 12),
						}}
					>
						<Icon name="arrowLeft" size={22} stroke={2.2} />
						Applies: general rule for Belgium
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
								background: 'rgba(255,255,255,0.55)',
								...fadeUp(buckets, 30),
							}}
						>
							<div style={{padding: '12px 16px', fontSize: 18, fontWeight: 600, color: b.color}}>{b.label}</div>
							{i === 3 ? (
								<div style={{padding: '18px 16px', fontSize: 20, color: C.faint, fontStyle: 'italic', opacity: interpolate(frame, [at.verdict - 30, at.verdict], [0, 1], CLAMP)}}>
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
						const y0 = 50;
						const x1 = chip.bucket === null ? x0 : chip.bucket * (BUCKET_W + BUCKET_GAP) + (BUCKET_W - CHIP_W) / 2;
						const y1 = BUCKET_Y + 70;
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
									background: C.surface,
									borderRadius: 16,
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: '0 14px',
									boxShadow: `${t > 0 && t < 1 ? SHADOW : SHADOW_SM}, 0 0 0 ${3 * highlight}px ${GRADE_BG.B}`,
									transform: `rotate(${Math.sin(Math.PI * t) * 6}deg)`,
									...fadeUp(enter, 30),
								}}
							>
								<GradeTile grade={s.grade as Grade} size={46} />
								<div style={{minWidth: 0}}>
									<div style={{fontFamily: SERIF, fontSize: 34, lineHeight: 1, color: C.ink}}>{short(s.value)}</div>
									<div style={{fontSize: 15, color: C.muted, whiteSpace: 'nowrap', marginTop: 3}}>{chip.label}</div>
								</div>
							</div>
						);
					})}
					<div style={{position: 'absolute', top: 400, left: 0, width: 1030, ...fadeUp(answer, 80)}}>
						<VerdictCard answer={B.answer} scale={0.84}>
							<ActionScale at={at.verdict + 30} />
						</VerdictCard>
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

const ActionScale: React.FC<{at: number}> = ({at}) => {
	const p = useEnter(at);
	const actions = [
		{label: 'Use', color: C.pos, bg: C.posBg},
		{label: 'Use with caution', color: C.warn, bg: C.warnBg},
		{label: "Don't act yet", color: C.neg, bg: C.negBg},
	];
	return (
		<div style={{display: 'flex', gap: 10, marginTop: 18, alignItems: 'center', ...fadeUp(p, 12)}}>
			<span style={{fontSize: 16, color: C.muted, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', marginRight: 6}}>Verdict</span>
			{actions.map((a, i) => (
				<span
					key={a.label}
					style={{
						fontSize: 18,
						fontWeight: 600,
						padding: '6px 14px',
						borderRadius: 999,
						background: i === 2 ? a.color : a.bg,
						color: i === 2 ? '#fff' : a.color,
						opacity: i === 2 ? 1 : 0.6,
						transform: `scale(${i === 2 ? 1 + 0.08 * p : 1})`,
					}}
				>
					{a.label}
				</span>
			))}
		</div>
	);
};
