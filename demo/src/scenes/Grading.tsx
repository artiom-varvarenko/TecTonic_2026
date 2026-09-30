import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, gradeFor, MONO} from '../theme';
import {CLAMP, fadeUp, mixColor, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {ReasonRow} from '../components/Card';
import {Pill} from '../components/GradeTile';
import {Icon} from '../components/Icon';
import {Ladder} from '../components/Ladder';
import {SourceCard} from '../components/SourceCard';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue, cueWord} from '../timeline';

const DOC = source(DATA.before, 'DOC-BE-009');

export const Grading: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		base: cue('grading', 'base'),
		owner: cue('grading', 'owner'),
		review: cue('grading', 'review'),
		superseded: cueWord('grading', 'superseded', 'replaced'),
		explained: cueWord('grading', 'intro', 'every point'),
	};
	const card = useEnter(10);
	const base = useEnter(at.base + 4, SNAPPY);
	const owner = useEnter(at.owner + 4, SNAPPY);
	const review = useEnter(at.review + 4, SNAPPY);
	const stamp = useEnter(at.superseded + 10, {damping: 14, stiffness: 220});
	const total = useEnter(at.superseded + 24);
	const panel = useEnter(at.explained);
	const reasonAt = [at.base, at.owner, at.review, at.superseded];
	const deltas = DOC.reasons.map((r) => r.delta ?? 0);
	const shown = Math.round(deltas[0] + deltas[1] * owner + deltas[2] * review);
	const started = frame >= at.base;
	const grade = started ? gradeFor(shown) : null;
	const pointer = 2 + 2 * owner + 1 * review; // C (75) → E (55) → F (40)
	const redReview = interpolate(frame, [at.review, at.review + 10], [0, 1], CLAMP);
	const pill = frame >= at.superseded ? (
		<span style={fadeUp(Math.min(1, stamp * 1.4), 8)}>
			<Pill tone="warn" size={17}>
				{DOC.applicability.text}
			</Pill>
		</span>
	) : (
		<></>
	);
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="grading" />
				{reasonAt.map((f, i) => (
					<Sfx key={i} at={f + 4} src="tick" volume={0.45} />
				))}
				<Sfx at={at.superseded + 10} src="stamp" volume={0.55} />
				<SceneText
					step="01"
					kicker="Trust label per source"
					title="Every source gets an [A–G grade.] Every point is explained."
					body="Rules, not a model, assign each grade: kind of source, owner, review cycle, age, corroboration and conflicts."
				/>
				<div style={{position: 'absolute', left: 790, top: 84, width: 1030, ...fadeUp(card, 60)}}>
					<SourceCard
						source={{...DOC, owner_active: frame < at.owner + 4}}
						grade={grade}
						score={started ? shown : null}
						datedStyle={{color: mixColor('#6c717a', '#b42318', redReview), fontWeight: redReview > 0.5 ? 600 : 400}}
						pill={pill}
					>
						<div style={{display: 'flex', gap: 30, marginTop: 20, alignItems: 'flex-start'}}>
							<div style={{flex: 1, minWidth: 0, opacity: 0.35 + 0.65 * panel}}>
								<div style={{display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 600, color: C.ink2}}>
									Why {grade ?? '?'}? <Icon name="chevronDown" size={18} style={{transform: 'rotate(180deg)'}} />
								</div>
								<div style={{marginTop: 12, padding: '6px 18px', borderRadius: 14, background: C.surface2, border: `1px solid ${C.line}`}}>
									{DOC.reasons.map((r, i) => (
										<Reason key={r.code} at={reasonAt[i]} reason={r} first={i === 0} />
									))}
									<div
										style={{
											display: 'flex',
											justifyContent: 'space-between',
											alignItems: 'baseline',
											padding: '12px 0 10px',
											borderTop: `1px solid ${C.line}`,
											fontSize: 20,
											fontWeight: 600,
											...fadeUp(total, 8),
										}}
									>
										Trust score
										<span style={{fontFamily: MONO, fontWeight: 600, fontSize: 18, background: C.ink, color: '#fff', padding: '4px 8px', borderRadius: 8}}>
											{DOC.score} → {DOC.grade}
										</span>
									</div>
								</div>
							</div>
							<div style={{width: 290, flex: 'none', paddingTop: 40}}>
								<Ladder
									enterAt={30}
									width={210}
									rowHeight={36}
									gap={7}
									pointer={started ? {index: pointer, label: `${gradeFor(shown)} · ${shown}`, opacity: Math.min(1, base * 1.5)} : undefined}
								/>
							</div>
						</div>
					</SourceCard>
					<div
						style={{
							position: 'absolute',
							right: 34,
							top: 106,
							border: `6px solid ${GRADE_BG.F}`,
							color: GRADE_BG.F,
							fontFamily: FONT,
							fontWeight: 700,
							fontSize: 36,
							letterSpacing: 4,
							padding: '4px 20px',
							borderRadius: 12,
							transform: `rotate(-6deg) scale(${2.2 - 1.2 * stamp})`,
							opacity: Math.min(1, stamp * 2),
							background: 'rgba(255,255,255,0.9)',
						}}
					>
						SUPERSEDED
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

const Reason: React.FC<{at: number; reason: (typeof DOC.reasons)[number]; first: boolean}> = ({at, reason, first}) => {
	const p = useEnter(at, SNAPPY);
	return (
		<div style={{padding: '11px 0', borderTop: first ? 'none' : `1px solid ${C.line}`, ...fadeUp(p, 14), transform: `translateX(${(1 - p) * -24}px)`}}>
			<ReasonRow delta={reason.delta} cap={reason.cap} text={reason.text} size={20} />
		</div>
	);
};
