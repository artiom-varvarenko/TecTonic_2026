import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, GRADES} from '../theme';
import {BOUNCY, CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {AnimatedTitle} from '../components/SceneText';
import {initials} from '../components/Card';
import {Icon} from '../components/Icon';
import {Waveform} from '../components/Waveform';
import {SceneNarration} from '../components/SceneAudio';
import {narration, NARRATION_DELAY} from '../timeline';
import team from '../team.json';

type Member = {name: string; role: string; photo: string | null; speaker?: string};
const MEMBERS = team.members as Member[];
const CUES = narration('team').cues;
// Cue ids per narrator: who is talking when (script.json speakers).
const SPEAKS: Record<string, string[]> = {rufina: ['rufina', 'clones'], artiom: ['artiom', 'built']};

const CREDITS = [
	{icon: 'wave' as const, text: 'Narration: our own ElevenLabs voice clones (eleven_v4)'},
	{icon: 'user' as const, text: "Ellen's voice note: an ElevenLabs library voice"},
	{icon: 'mic' as const, text: 'Voice notes transcribed by ElevenLabs Scribe'},
];

export const Team: React.FC = () => {
	const frame = useCurrentFrame();
	const sub = useEnter(24);
	const clonesAt = NARRATION_DELAY + CUES.clones.start;
	const voiceAt = NARRATION_DELAY + (CUES.clones.words?.find(([w]) => w === 'eleven')?.[1] ?? CUES.clones.start + 60);
	const size = MEMBERS.length > 3 ? 220 : 290;
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center'}}>
				<SceneNarration scene="team" />
				<div style={{marginTop: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16}}>
					<AnimatedTitle text={team.title} delay={4} size={84} align="center" tone="dark" />
					<div style={{fontSize: 26, color: C.darkMuted, letterSpacing: 2.4, textTransform: 'uppercase', fontWeight: 600, ...fadeUp(sub, 16)}}>{team.subtitle}</div>
				</div>
				<div style={{display: 'flex', gap: MEMBERS.length > 3 ? 60 : 140, marginTop: 90, justifyContent: 'center'}}>
					{MEMBERS.map((m, i) => {
						const p = useEnter(22 + i * 8, BOUNCY);
						const ranges = (SPEAKS[m.speaker ?? ''] ?? []).map((id) => [NARRATION_DELAY + CUES[id].start, NARRATION_DELAY + CUES[id].end] as const);
						const talking = ranges.some(([a, b]) => frame >= a - 2 && frame <= b + 4);
						const glow = Math.max(0, ...ranges.map(([a, b]) => interpolate(frame, [a - 8, a, b + 4, b + 14], [0, 1, 1, 0], CLAMP)));
						const chip = useEnter(voiceAt + i * 6, SNAPPY);
						const range = ranges.find(([a, b]) => frame >= a - 8 && frame <= b + 14) ?? ranges[0] ?? [0, 0];
						const ring = `conic-gradient(from ${frame * 1.5 + i * 90}deg, ${GRADES.map((g) => GRADE_BG[g]).join(', ')}, ${GRADE_BG.A})`;
						return (
							<div key={`${m.name}-${i}`} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: size + 220, ...fadeUp(p, 60)}}>
								<div
									style={{
										width: size,
										height: size,
										borderRadius: '50%',
										background: ring,
										padding: 6,
										transform: `scale(${(0.7 + 0.3 * p) * (1 + 0.04 * glow)})`,
										boxShadow: `0 0 ${90 * glow}px rgba(94,226,154,${0.35 * glow})`,
									}}
								>
									<div style={{width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `6px solid ${C.dark}`, background: 'linear-gradient(145deg, #2c313a, #1a1d23)'}}>
										{m.photo ? (
											<Img src={staticFile(`team/${m.photo}`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
										) : (
											<div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: C.darkText, fontSize: size * 0.32, fontWeight: 650, letterSpacing: 1}}>
												{initials(m.name)}
											</div>
										)}
									</div>
								</div>
								<div style={{textAlign: 'center'}}>
									<div style={{color: C.darkText, fontSize: 46, fontWeight: 650, letterSpacing: -0.8, whiteSpace: 'nowrap'}}>{m.name}</div>
									{m.role ? <div style={{color: C.darkMuted, fontSize: 24, marginTop: 6}}>{m.role}</div> : null}
								</div>
								<div style={{height: 40, display: 'grid', placeItems: 'center', opacity: 0.25 + 0.75 * glow}}>
									<Waveform from={range[0]} to={talking ? range[1] : -1} width={220} height={36} bars={26} color="#5ee29a" />
								</div>
								<div
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 10,
										padding: '8px 16px',
										borderRadius: 999,
										background: 'rgba(255,255,255,0.07)',
										border: '1px solid rgba(255,255,255,0.12)',
										color: C.darkText,
										fontSize: 19,
										fontWeight: 550,
										...fadeUp(chip, 14),
									}}
								>
									<Icon name="wave" size={18} color="#5ee29a" />
									Voice: ElevenLabs clone
								</div>
							</div>
						);
					})}
				</div>
				<div style={{position: 'absolute', bottom: 110, display: 'flex', gap: 40}}>
					{CREDITS.map((c, i) => (
						<Credit key={c.text} at={clonesAt + 24 + i * 10} icon={c.icon} text={c.text} />
					))}
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

const Credit: React.FC<{at: number; icon: 'wave' | 'user' | 'mic'; text: string}> = ({at, icon, text}) => {
	const p = useEnter(at);
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 21, color: C.darkMuted, ...fadeUp(p, 14)}}>
			<Icon name={icon} size={18} color={C.darkFaint} />
			{text}
		</div>
	);
};
