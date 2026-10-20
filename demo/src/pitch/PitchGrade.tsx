import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, MONO, SERIF, SHADOW} from '../theme';
import {BOUNCY, CLAMP, fadeUp, popIn, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {GradeTile, Pill} from '../components/GradeTile';
import {Sfx} from '../components/SceneAudio';
import type {Source} from '../data';
import {PITCH, pitchSource} from './data';
import {PitchNarration} from './PitchHook';
import {cueWord} from './timeline';

const B = PITCH.before;
// Rows top to bottom; `out` marks the sources the narration rules out, at the word that names them.
const ROWS: {id: string; out?: {cue: string; word: string}}[] = [
	{id: 'POL-BE-031', out: {cue: 'old', word: 'superseded'}},
	{id: 'POL-NL-018', out: {cue: 'nl', word: "doesn't"}},
	{id: 'MEET-BE-0924', out: {cue: 'townhall', word: 'only'}},
	{id: 'POL-BE-044'},
	{id: 'FAQ-BE-012'},
	{id: 'TEAMS-5127'},
];

const pillFor = (s: Source) => (s.applicability.code === 'applies' ? 'applies' : s.applicability.code === 'superseded' ? 'neg' : s.applicability.code === 'not_yet_effective' ? 'warn' : 'na');

/** Pill text without the trailing source name and dates. */
const short = (text: string) => text.replace(/ — Belgium.*$/, '');

export const PitchGrade: React.FC = () => {
	const frame = useCurrentFrame();
	const gradesAt = cueWord('pitch_grade', 'grade', 'grade');
	const card = useEnter(6);
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<PitchNarration scene="pitch_grade" />
				<Sfx at={gradesAt} src="tick" volume={0.4} />
				{ROWS.filter((r) => r.out).map((r) => (
					<Sfx key={r.id} at={cueWord('pitch_grade', r.out!.cue, r.out!.word)} src="pop" volume={0.35} />
				))}
				<SceneText
					kicker="TrustLabel"
					title="Not another assistant. The [trust layer] underneath."
					body="Rules, not a model, grade every source from A to G, and every grade comes with its reasons."
					width={600}
					size={66}
				/>
				<div style={{position: 'absolute', left: 790, top: 196, width: 1030, background: C.surface, borderRadius: 26, boxShadow: SHADOW, padding: '22px 26px', ...fadeUp(card, 50)}}>
					<div style={{display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 600, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase', padding: '0 4px 12px'}}>
						<span>Company car lease budget · {B.context.label}</span>
						<span>{B.sources.length} sources</span>
					</div>
					{ROWS.map((r, i) => {
						const s = pitchSource(B, r.id);
						const enter = useEnter(10 + i * 5, SNAPPY);
						const grade = useEnter(gradesAt + i * 4, BOUNCY);
						const outAt = r.out ? cueWord('pitch_grade', r.out.cue, r.out.word) : 1e6;
						const out = interpolate(frame, [outAt, outAt + 10], [0, 1], CLAMP);
						return (
							<div
								key={r.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 18,
									padding: '12px 6px',
									borderTop: i ? `1px solid ${C.line}` : 'none',
									opacity: 1 - 0.45 * out,
									...fadeUp(enter, 16),
								}}
							>
								<div style={popIn(grade, 0.3)}>
									<GradeTile grade={grade > 0.05 ? s.grade : null} size={52} />
								</div>
								<div style={{width: 120, flex: 'none', fontFamily: SERIF, fontSize: 40, color: C.ink, textDecoration: out > 0.5 ? 'line-through' : 'none'}}>€{s.value}</div>
								<div style={{flex: 1, minWidth: 0}}>
									<div style={{fontSize: 20, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{s.title}</div>
									<div style={{fontSize: 15, color: C.muted, marginTop: 2}}>
										<span style={{fontFamily: MONO}}>{s.id}</span> · {s.source}
									</div>
								</div>
								<div style={{flex: 'none', opacity: r.out ? out : grade, transform: `scale(${r.out ? 0.9 + 0.1 * out : 1})`}}>
									<Pill tone={pillFor(s)} size={16}>
										{short(s.applicability.code === 'applies' ? (s.reasons.find((x) => x.code === 'conflict')?.text ?? 'Applies') : s.applicability.text)}
									</Pill>
								</div>
							</div>
						);
					})}
				</div>
			</AbsoluteFill>
		</Stage>
	);
};
