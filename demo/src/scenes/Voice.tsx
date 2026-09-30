import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, MONO, SERIF} from '../theme';
import {BOUNCY, CLAMP, fadeUp, popIn, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {Card, CheckDot} from '../components/Card';
import {Icon} from '../components/Icon';
import {Waveform} from '../components/Waveform';
import {Typewriter} from '../components/Typewriter';
import {Cursor} from '../components/Cursor';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA} from '../data';
import {cue, cueWord, narration, NARRATION_DELAY} from '../timeline';

const TRANSCRIPT = DATA.voice.transcript;
const SUGGESTION = DATA.voice.suggestion;
const QUOTE = SUGGESTION.quote;
const STEPS = [
	{who: 'ElevenLabs Scribe', what: 'speech → text'},
	{who: 'OpenAI', what: 'value + quote'},
	{who: 'Rules', what: 'validate'},
	{who: 'Ellen', what: 'confirms'},
];
const CHECKS = [
	{text: 'Quote appears verbatim in the transcript', word: 'really is'},
	{text: `Quote states the value (${SUGGESTION.value})`, word: 'states'},
	{text: `${SUGGESTION.value} is a valid day of the month`, word: 'value.'},
	{text: 'Valid until is within 2 years', word: 'value.'},
];

const PANEL = {left: 780, top: 136, width: 1040};

export const Voice: React.FC = () => {
	const frame = useCurrentFrame();
	const note = narration('voice').cues.note;
	const at = {
		record: cue('voice', 'note') - 10,
		recordEnd: NARRATION_DELAY + note.end + 4,
		transcribe: cue('voice', 'transcribe'),
		extract: cue('voice', 'extract'),
		rules: cue('voice', 'rules'),
		confirm: cue('voice', 'confirm'),
	};
	const stepAt = [at.transcribe, at.extract, at.rules, at.confirm];
	const card = useEnter(6);
	const recording = frame >= at.record && frame < at.recordEnd;
	const seconds = Math.floor(interpolate(frame, [at.record, at.recordEnd], [0, 7], CLAMP));
	const recorder = useEnter(cue('voice', 'intro') + 20);
	const highlight = interpolate(frame, [at.extract + 8, at.extract + 20], [0, 1], CLAMP);
	const fields = useEnter(cueWord('voice', 'extract', 'value'), SNAPPY);
	const quoteField = useEnter(cueWord('voice', 'extract', 'verbatim'), SNAPPY);
	const checkAt = CHECKS.map((c, i) => cueWord('voice', 'rules', c.word) + (i === 3 ? 14 : 0));
	const clickAt = at.confirm + 12;
	const resolved = frame >= clickAt;
	const resolvedPop = useEnter(clickAt, BOUNCY);
	const pressed = interpolate(frame, [clickAt - 2, clickAt, clickAt + 8], [0, 1, 0], CLAMP);
	const confirmBtn = {x: PANEL.left + 928, y: PANEL.top + 706};
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="voice" />
				<Sfx at={at.record - 4} src="click" volume={0.5} />
				{stepAt.slice(0, 3).map((f, i) => (
					<Sfx key={i} at={f} src="pop" volume={0.3} />
				))}
				{checkAt.map((f, i) => (
					<Sfx key={`c${i}`} at={f} src="tick" volume={0.4} />
				))}
				<Sfx at={clickAt} src="click" volume={0.7} />
				<Sfx at={clickAt + 4} src="chime" volume={0.5} />
				<SceneText
					step="05"
					kicker="Verify by voice · ElevenLabs"
					title="Ellen answers with a [voice note.]"
					body="ElevenLabs Scribe turns her voice into text. Nothing a model returns is trusted until the rules have checked it and Ellen has confirmed it."
					width={600}
				/>
				<div style={{position: 'absolute', left: PANEL.left, top: PANEL.top, width: PANEL.width, ...fadeUp(card, 50)}}>
					<Card padding="28px 32px" radius={26}>
						<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 8,
									height: 34,
									padding: '0 14px',
									borderRadius: 999,
									fontSize: 18,
									fontWeight: 600,
									background: resolved ? C.posBg : C.warnBg,
									color: resolved ? C.pos : C.warn,
									transform: `scale(${resolved ? 1 + 0.15 * Math.sin(Math.PI * Math.min(1, resolvedPop)) : 1})`,
								}}
							>
								<span style={{width: 8, height: 8, borderRadius: '50%', background: 'currentColor'}} />
								{resolved ? 'Resolved' : 'Open'}
							</span>
							<span style={{fontSize: 26, fontWeight: 600, letterSpacing: -0.4}}>
								{DATA.request.topic.label} — {DATA.request.context_label}
							</span>
						</div>
						<div style={{fontSize: 18, color: C.muted, marginTop: 8}}>Requested by {DATA.request.requester_name} for Ellen Maes (you) · Sep 30, 2026</div>
						<div style={{marginTop: 14, paddingLeft: 18, borderLeft: `2px solid ${C.lineStrong}`, fontFamily: SERIF, fontStyle: 'italic', fontSize: 30, color: C.ink2}}>“{DATA.question}”</div>

						<div style={{display: 'flex', alignItems: 'center', gap: 20, marginTop: 20, padding: '14px 18px', borderRadius: 16, background: C.surface2, border: `1px solid ${C.line}`, ...fadeUp(recorder, 14)}}>
							<div
								style={{
									height: 52,
									padding: '0 18px',
									borderRadius: 12,
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									fontSize: 19,
									fontWeight: 550,
									background: recording ? '#e5484d' : C.surface,
									color: recording ? '#fff' : C.ink,
									border: `1px solid ${recording ? '#e5484d' : C.lineStrong}`,
									whiteSpace: 'nowrap',
								}}
							>
								{recording ? <span style={{width: 10, height: 10, borderRadius: '50%', background: '#fff', opacity: Math.floor(frame / 15) % 2 ? 1 : 0.3}} /> : <Icon name="mic" size={20} />}
								{recording ? 'Recording…' : 'Answer by voice'}
							</div>
							<Waveform from={at.record + 6} to={at.recordEnd - 4} width={560} height={48} color={recording ? '#e5484d' : C.faint} bars={52} />
							<div style={{fontFamily: MONO, fontSize: 22, fontWeight: 600, color: recording ? '#e5484d' : C.muted}}>0:0{seconds}</div>
						</div>

						<div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 18}}>
							{STEPS.map((s, i) => (
								<Step key={s.who} index={i} at={stepAt[i]} who={s.who} what={s.what} last={i === STEPS.length - 1} />
							))}
						</div>

						<div style={{marginTop: 16, padding: '14px 18px', borderRadius: 14, background: C.surface2, border: `1px solid ${C.line}`, minHeight: 104}}>
							<div style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: C.muted, letterSpacing: 0.4}}>
								<Icon name="wave" size={17} />
								Transcript · ElevenLabs Scribe
							</div>
							<div style={{fontSize: 25, lineHeight: 1.5, color: C.ink2, marginTop: 6}}>
								<Typewriter
									text={TRANSCRIPT}
									start={at.transcribe + 4}
									cps={60}
									caret={frame < at.extract}
									render={(visible) => {
										const i = TRANSCRIPT.indexOf(QUOTE);
										if (visible.length < i + QUOTE.length || highlight === 0) return <>{visible}</>;
										return (
											<>
												{visible.slice(0, i)}
												<mark style={{background: `rgba(255,232,156,${highlight})`, color: C.ink, borderRadius: 5, padding: '1px 5px'}}>{QUOTE}</mark>
												{visible.slice(i + QUOTE.length)}
											</>
										);
									}}
								/>
							</div>
						</div>

						<div style={{display: 'flex', gap: 24, marginTop: 18}}>
							<div style={{flex: '0 0 390px', display: 'flex', flexDirection: 'column', gap: 10}}>
								<Field p={fields} label="value" value={SUGGESTION.value} />
								<Field p={fields} label="valid_until" value={SUGGESTION.valid_until} />
								<Field p={quoteField} label="quote" value={`"${QUOTE}"`} />
							</div>
							<div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 11, justifyContent: 'center'}}>
								{CHECKS.map((c, i) => (
									<Check key={c.text} at={checkAt[i]} text={c.text} />
								))}
							</div>
						</div>

						<div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.line}`}}>
							{resolved ? (
								<div style={{flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: C.posBg, color: C.pos, fontSize: 21, fontWeight: 550, ...popIn(resolvedPop, 0.9)}}>
									<Icon name="check" size={22} stroke={2.4} />
									{SUGGESTION.value_display} · valid until {SUGGESTION.valid_until} · confirmed by Ellen Maes
								</div>
							) : (
								<>
									<span style={{fontSize: 20, color: C.muted, flex: 1, whiteSpace: 'nowrap'}}>
										Prefilled from the voice note: <b style={{color: C.ink, fontWeight: 600}}>{SUGGESTION.value_display}</b>, until {SUGGESTION.valid_until}
									</span>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											height: 52,
											padding: '0 22px',
											borderRadius: 12,
											background: C.ink,
											color: '#fff',
											fontSize: 20,
											fontWeight: 550,
											transform: `scale(${1 - 0.05 * pressed})`,
										}}
									>
										<Icon name="check" size={20} stroke={2.2} />
										Resolve
									</div>
								</>
							)}
						</div>
					</Card>
				</div>
				<Cursor
					appearAt={at.confirm - 30}
					path={[
						{frame: at.confirm - 30, x: 1560, y: 1060},
						{frame: clickAt - 6, x: confirmBtn.x, y: confirmBtn.y},
						{frame: clickAt + 40, x: confirmBtn.x + 10, y: confirmBtn.y + 4},
					]}
					clicks={[clickAt]}
				/>
			</AbsoluteFill>
		</Stage>
	);
};

const Step: React.FC<{index: number; at: number; who: string; what: string; last: boolean}> = ({index, at, who, what, last}) => {
	const p = useEnter(at, SNAPPY);
	const on = p > 0.5;
	return (
		<>
			<div
				style={{
					flex: 1,
					borderRadius: 12,
					padding: '9px 12px',
					background: on ? C.ink : C.sunken,
					color: on ? '#fff' : C.muted,
					transform: `scale(${1 + 0.05 * Math.sin(Math.PI * Math.min(1, p))})`,
				}}
			>
				<div style={{fontSize: 14, fontWeight: 550, opacity: 0.75}}>
					{index + 1} · {what}
				</div>
				<div style={{fontSize: 19, fontWeight: 600, whiteSpace: 'nowrap'}}>{who}</div>
			</div>
			{last ? null : <div style={{width: 14, height: 2, background: on ? C.ink : C.lineStrong, borderRadius: 2}} />}
		</>
	);
};

const Field: React.FC<{p: number; label: string; value: string}> = ({p, label, value}) => (
	<div style={{display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 22, ...fadeUp(p, 12)}}>
		<span style={{fontFamily: MONO, color: C.accent, fontWeight: 500, width: 140, flex: 'none', fontSize: 18}}>{label}</span>
		<span style={{fontWeight: 600, color: C.ink}}>{value}</span>
	</div>
);

const Check: React.FC<{at: number; text: string}> = ({at, text}) => {
	const p = useEnter(at, BOUNCY);
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, fontWeight: 500, color: C.ink2, opacity: Math.min(1, p * 1.5)}}>
			<div style={popIn(p, 0.2)}>
				<CheckDot size={28} />
			</div>
			{text}
		</div>
	);
};
