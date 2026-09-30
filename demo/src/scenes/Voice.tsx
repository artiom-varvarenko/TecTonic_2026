import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {BOUNCY, CLAMP, fadeUp, popIn, SNAPPY, useEnter} from '../anim';
import {SceneText} from '../components/SceneText';
import {Card, CheckIcon, MicIcon} from '../components/Card';
import {Waveform} from '../components/Waveform';
import {Typewriter} from '../components/Typewriter';
import {Cursor} from '../components/Cursor';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA} from '../data';
import {cue, cueWord} from '../timeline';

const TRANSCRIPT = DATA.voice.transcript;
const QUOTE = DATA.voice.suggestion.quote;
const SUGGESTION = DATA.voice.suggestion;
const STEPS = [
	{who: 'ElevenLabs Scribe', what: 'transcribes'},
	{who: 'OpenAI', what: 'extracts'},
	{who: 'Rules', what: 'validate'},
	{who: 'Ellen', what: 'confirms'},
];
const CHECKS = [
	{text: 'Quote appears verbatim in the transcript', word: 'really is'},
	{text: `Quote states the value (${SUGGESTION.value})`, word: 'states'},
	{text: `${SUGGESTION.value} is a valid day of the month`, word: 'value.'},
	{text: 'Valid until is within 2 years', word: 'value.'},
];

const PANEL_LEFT = 800;
const PANEL_TOP = 80;

export const Voice: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		record: cue('voice', 'intro') + 6,
		transcribe: cue('voice', 'transcribe'),
		extract: cue('voice', 'extract'),
		rules: cue('voice', 'rules'),
		confirm: cue('voice', 'confirm'),
	};
	const stepAt = [at.transcribe, at.extract, at.rules, at.confirm];
	const recordEnd = at.transcribe - 4;
	const card = useEnter(6);
	const recording = frame >= at.record && frame < recordEnd;
	const seconds = Math.floor(interpolate(frame, [at.record, recordEnd], [0, 6], CLAMP));
	const highlight = interpolate(frame, [at.extract + 8, at.extract + 20], [0, 1], CLAMP);
	const fields = useEnter(cueWord('voice', 'extract', 'value'), SNAPPY);
	const quoteField = useEnter(cueWord('voice', 'extract', 'verbatim'), SNAPPY);
	const checkAt = CHECKS.map((c, i) => cueWord('voice', 'rules', c.word) + (i === 3 ? 14 : 0));
	const clickAt = at.confirm + 14;
	const resolved = frame >= clickAt;
	const resolvedPop = useEnter(clickAt, BOUNCY);
	const form = useEnter(at.rules + 60);
	const confirmBtn = {x: 1650, y: 780};
	return (
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
				kicker="Verify by voice"
				title="Ellen answers with a [voice note.]"
				body="AI reads, rules judge: nothing a model returns is trusted until the server has checked it and the expert has confirmed it."
			/>
			<div style={{position: 'absolute', left: PANEL_LEFT, top: PANEL_TOP, width: 1010, ...fadeUp(card, 50)}}>
				<Card padding={34}>
					<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
						<div style={{fontSize: 18, fontWeight: 800, color: C.muted, letterSpacing: 1.8, textTransform: 'uppercase'}}>Verification inbox · Ellen Maes</div>
						<div style={{flex: 1}} />
						<span
							style={{
								borderRadius: 999,
								padding: '4px 16px',
								fontSize: 19,
								fontWeight: 800,
								background: resolved ? '#e3f5e9' : '#fff3d6',
								color: resolved ? C.green : C.amber,
								transform: `scale(${resolved ? 1 + 0.15 * Math.sin(Math.PI * Math.min(1, resolvedPop)) : 1})`,
							}}
						>
							{resolved ? 'Resolved' : 'Open'}
						</span>
					</div>
					<div style={{fontSize: 30, fontWeight: 800, marginTop: 8}}>
						{DATA.before.topic.label} · {DATA.request.context_label}
					</div>
					<div style={{fontSize: 21, color: C.muted, fontStyle: 'italic', marginTop: 4}}>
						{DATA.request.requester_name}: "{DATA.question}"
					</div>

					<div style={{display: 'flex', alignItems: 'center', gap: 22, marginTop: 22, background: '#f6f8fb', borderRadius: 16, padding: '14px 20px'}}>
						<div
							style={{
								width: 64,
								height: 64,
								borderRadius: '50%',
								background: recording ? C.red : C.navy,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								boxShadow: recording ? `0 0 0 ${8 + 6 * Math.sin(frame / 4)}px rgba(198,40,40,0.2)` : 'none',
							}}
						>
							<MicIcon size={32} />
						</div>
						<Waveform from={at.record} to={recordEnd} width={640} height={56} color={recording ? C.red : C.navy} bars={56} />
						<div style={{fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: recording ? C.red : C.muted}}>0:0{seconds}</div>
					</div>

					<div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 20}}>
						{STEPS.map((s, i) => (
							<Step key={s.who} index={i} at={stepAt[i]} who={s.who} what={s.what} last={i === STEPS.length - 1} />
						))}
					</div>

					<div style={{marginTop: 18, background: '#f6f8fb', borderRadius: 14, padding: '16px 20px', fontSize: 24, lineHeight: 1.45, minHeight: 104}}>
						<Typewriter
							text={TRANSCRIPT}
							start={at.transcribe + 6}
							cps={48}
							caret={frame < at.extract}
							render={(visible) => {
								const i = TRANSCRIPT.indexOf(QUOTE);
								if (visible.length < i + QUOTE.length || highlight === 0) return <>"{visible}</>;
								return (
									<>
										"{visible.slice(0, i)}
										<mark style={{background: `rgba(255,226,90,${highlight})`, borderRadius: 6, padding: '0 4px', color: 'inherit'}}>{QUOTE}</mark>
										{visible.slice(i + QUOTE.length)}
										{visible.length === TRANSCRIPT.length ? '"' : ''}
									</>
								);
							}}
						/>
					</div>

					<div style={{display: 'flex', gap: 24, marginTop: 20}}>
						<div style={{flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: 10}}>
							<Field p={fields} label="value" value={SUGGESTION.value} />
							<Field p={fields} label="valid_until" value={SUGGESTION.valid_until} />
							<Field p={quoteField} label="quote" value={`"${QUOTE}"`} />
						</div>
						<div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center'}}>
							{CHECKS.map((c, i) => (
								<Check key={c.text} at={checkAt[i]} text={c.text} />
							))}
						</div>
					</div>

					<div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 18, ...fadeUp(form, 10)}}>
						<div style={{width: 30, height: 30, borderRadius: "50%", border: `3px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center"}}><div style={{width: 14, height: 14, borderRadius: "50%", background: C.accent}} /></div>
						<span style={{fontSize: 23, fontWeight: 800, whiteSpace: 'nowrap'}}>{SUGGESTION.value_display}</span>
						<span style={{fontSize: 19, color: C.muted, whiteSpace: 'nowrap'}}>until {SUGGESTION.valid_until} · prefilled from the voice note</span>
						<div style={{flex: 1}} />
						<div
							style={{
								background: resolved ? C.green : C.accent,
								color: '#fff',
								borderRadius: 12,
								padding: '12px 22px',
								fontSize: 22,
								fontWeight: 800,
								transform: `scale(${1 - 0.06 * interpolate(frame, [clickAt - 2, clickAt, clickAt + 8], [0, 1, 0], CLAMP)})`,
							}}
						>
							{resolved ? 'Confirmed' : 'Confirm'}
						</div>
					</div>
				</Card>
			</div>
			<Cursor
				appearAt={at.confirm - 30}
				path={[
					{frame: at.confirm - 30, x: 1500, y: 1060},
					{frame: clickAt - 6, x: confirmBtn.x + 40, y: confirmBtn.y + 10},
					{frame: clickAt + 40, x: confirmBtn.x + 50, y: confirmBtn.y + 14},
				]}
				clicks={[clickAt]}
			/>
		</AbsoluteFill>
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
					padding: '10px 12px',
					background: on ? C.navy : '#eef1f5',
					color: on ? '#fff' : C.muted,
					transform: `scale(${1 + 0.05 * Math.sin(Math.PI * Math.min(1, p))})`,
				}}
			>
				<div style={{fontSize: 15, fontWeight: 700, opacity: 0.75}}>
					{index + 1} · {what}
				</div>
				<div style={{fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap'}}>{who}</div>
			</div>
			{last ? null : <div style={{width: 16, height: 3, background: on ? C.navy : C.border, borderRadius: 2}} />}
		</>
	);
};

const Field: React.FC<{p: number; label: string; value: string}> = ({p, label, value}) => (
	<div style={{display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 21, ...fadeUp(p, 12)}}>
		<span style={{fontFamily: '"JetBrains Mono", monospace', color: C.accent, fontWeight: 700, width: 170, flex: 'none'}}>{label}</span>
		<span style={{fontWeight: 800}}>{value}</span>
	</div>
);

const Check: React.FC<{at: number; text: string}> = ({at, text}) => {
	const p = useEnter(at, BOUNCY);
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, fontWeight: 600, opacity: Math.min(1, p * 1.5)}}>
			<div style={popIn(p, 0.2)}>
				<CheckIcon size={28} />
			</div>
			{text}
		</div>
	);
};
