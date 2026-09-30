import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, gradeFor, MONO} from '../theme';
import {CLAMP, fadeUp, mixColor, SNAPPY, useEnter} from '../anim';
import {SceneText} from '../components/SceneText';
import {Card, ReasonRow} from '../components/Card';
import {GradeTile} from '../components/GradeTile';
import {Ladder} from '../components/Ladder';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue, cueWord} from '../timeline';

const DOC = source(DATA.before, 'DOC-BE-009');
const LEGEND = 'A expert-verified · B strong · C fair · D weak · E poor · F outdated · G contradicted';

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
	const stamp = useEnter(at.superseded + 8, {damping: 14, stiffness: 220});
	const reasonAt = [at.base, at.owner, at.review, at.superseded];
	const deltas = DOC.reasons.map((r) => r.delta ?? 0);
	const score = deltas[0] + deltas[1] * owner + deltas[2] * review;
	const shown = Math.round(score);
	const grade = frame < at.base ? null : gradeFor(shown);
	const pointer = 2 + 2 * owner + 1 * review;
	const explained = useEnter(at.explained);
	const redOwner = interpolate(frame, [at.owner, at.owner + 10], [0, 1], CLAMP);
	const redReview = interpolate(frame, [at.review, at.review + 10], [0, 1], CLAMP);
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<SceneNarration scene="grading" />
			{reasonAt.map((f, i) => (
				<Sfx key={i} at={f + 4} src="tick" volume={0.45} />
			))}
			<Sfx at={at.superseded + 8} src="stamp" volume={0.55} />
			<SceneText
				step="01"
				kicker="Trust label per source"
				title="Every source gets an [A–G grade.] Every point is explained."
				body="Rules, not a model, assign each grade: kind of source, owner, review cycle, age, corroboration and conflicts."
			/>
			<div style={{position: 'absolute', left: 820, top: 105, width: 990, ...fadeUp(card, 60)}}>
				<Card padding={38}>
					<div style={{display: 'flex', gap: 26, alignItems: 'flex-start'}}>
						<div style={{transform: `scale(${1 + 0.12 * Math.sin(Math.PI * Math.min(1, base))})`}}>
							<GradeTile grade={grade} size={104} />
						</div>
						<div style={{flex: 1, minWidth: 0}}>
							<div style={{display: 'flex', gap: 14, alignItems: 'center', fontSize: 19, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700}}>
								{DOC.kind_label}
								<span style={{fontFamily: MONO, textTransform: 'none', letterSpacing: 0}}>{DOC.id}</span>
								<span style={{border: `1px solid ${C.border}`, borderRadius: 8, padding: '1px 10px', textTransform: 'none', letterSpacing: 0, fontVariantNumeric: 'tabular-nums'}}>
									score {frame < at.base ? '—' : shown}
								</span>
							</div>
							<div style={{fontSize: 34, fontWeight: 800, marginTop: 6, letterSpacing: -0.4}}>{DOC.title}</div>
							<div style={{fontSize: 21, color: C.muted, marginTop: 2}}>{DOC.source}</div>
						</div>
					</div>
					<div style={{display: 'flex', gap: 34, fontSize: 21, color: C.muted, marginTop: 20}}>
						<span style={{color: mixColor('#5d6b7c', '#c62828', redOwner), fontWeight: redOwner > 0.5 ? 800 : 500}}>
							Owner: {DOC.owner_name}
							{redOwner > 0.5 ? ' (left SD Worx)' : ''}
						</span>
						<span style={{color: mixColor('#5d6b7c', '#c62828', redReview), fontWeight: redReview > 0.5 ? 800 : 500}}>Last reviewed {DOC.last_reviewed_on}</span>
					</div>
					<div style={{fontSize: 24, fontWeight: 700, marginTop: 20}}>{DOC.statement}</div>
					<div style={{borderTop: `1px solid ${C.border}`, margin: '24px 0 20px'}} />
					<div style={{display: 'flex', gap: 30}}>
						<div style={{flex: 1}}>
							<div style={{fontSize: 22, fontWeight: 800, color: C.accent, marginBottom: 16, opacity: 0.4 + 0.6 * explained}}>Why this grade</div>
							<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
								{DOC.reasons.map((r, i) => (
									<Reason key={r.code} at={reasonAt[i]} reason={r} />
								))}
							</div>
						</div>
						<div style={{width: 300, flex: 'none'}}>
							<Ladder
								enterAt={40}
								pointer={frame < at.base ? null : pointer}
								pointerLabel={`${gradeFor(shown)} · ${shown}`}
								pointerOpacity={Math.min(1, base * 1.5)}
								rowHeight={44}
								width={300}
								gap={7}
							/>
						</div>
					</div>
					<div style={{fontSize: 17, color: C.muted, marginTop: 24, height: 24, opacity: explained * (1 - stamp)}}>{LEGEND}</div>
				</Card>
				<div
					style={{
						position: 'absolute',
						right: 44,
						bottom: 20,
						border: `7px solid ${GRADE_BG.F}`,
						color: GRADE_BG.F,
						fontWeight: 900,
						fontSize: 44,
						letterSpacing: 5,
						padding: '4px 22px',
						borderRadius: 12,
						transform: `rotate(-6deg) scale(${2.2 - 1.2 * stamp})`,
						opacity: Math.min(1, stamp * 2),
						background: 'rgba(255,255,255,0.88)',
					}}
				>
					SUPERSEDED
				</div>
			</div>
		</AbsoluteFill>
	);
};

const Reason: React.FC<{at: number; reason: (typeof DOC.reasons)[number]}> = ({at, reason}) => {
	const p = useEnter(at, SNAPPY);
	return <ReasonRow delta={reason.delta} cap={reason.cap} text={reason.text} size={21} style={{...fadeUp(p, 16), transform: `translateX(${(1 - p) * -30}px)`}} />;
};

