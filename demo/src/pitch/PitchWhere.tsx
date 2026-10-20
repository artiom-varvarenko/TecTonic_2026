import {AbsoluteFill} from 'remotion';
import type {ReactNode} from 'react';
import {C, FONT, MONO, SERIF} from '../theme';
import {BOUNCY, fadeUp, popIn, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {AnimatedTitle} from '../components/SceneText';
import {GradeTile, StatusBadge} from '../components/GradeTile';
import {Icon} from '../components/Icon';
import type {IconName} from '../components/Icon';
import {Waveform} from '../components/Waveform';
import {Sfx} from '../components/SceneAudio';
import {DATA} from '../data';
import {PITCH, pitchSource} from './data';
import {PitchNarration} from './PitchHook';
import {cue, cueEnd, cueWord} from './timeline';

const CAR = PITCH.after.answer;
const VAN_DAM = DATA.after;
const TOWN_HALL = pitchSource(PITCH.after, 'MEET-BE-0924');
const PAY = PITCH.pay.restricted;

export const PitchWhere: React.FC = () => {
	const at = {
		teams: cueWord('pitch_where', 'where', 'Teams'),
		outlook: cueWord('pitch_where', 'where', 'Outlook'),
		salesforce: cueWord('pitch_where', 'where', 'Salesforce'),
		meetings: cue('pitch_where', 'scribe'),
		pay: cue('pitch_where', 'pay'),
	};
	const pay = useEnter(at.pay - 8, SNAPPY);
	const refused = useEnter(at.pay + 14, BOUNCY);
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<PitchNarration scene="pitch_where" />
				{[at.teams, at.outlook, at.salesforce, at.meetings].map((f, i) => (
					<Sfx key={i} at={f} src="pop" volume={0.35} />
				))}
				<Sfx at={at.pay + 14} src="stamp" volume={0.35} />
				<div style={{position: 'absolute', left: 110, top: 56}}>
					<AnimatedTitle text="Where people [already work.]" delay={2} size={64} tone="dark" />
				</div>
				<div style={{position: 'absolute', left: 110, top: 160, width: 1700, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22}}>
					<Tile at={at.teams} icon="message" color={C.teams} label="Microsoft Teams" sub="answers and alerts in chat">
						<div style={{display: 'flex', alignItems: 'center', gap: 16}}>
							<GradeTile grade={CAR.grade} size={58} />
							<div>
								<div style={{fontFamily: SERIF, fontSize: 38, color: C.ink, lineHeight: 1.05}}>{CAR.headline}</div>
								<div style={{fontSize: 16, color: C.muted, marginTop: 4}}>
									{PITCH.after.topic.label} · {PITCH.after.context.label}
								</div>
							</div>
						</div>
						<div style={{fontSize: 16, color: C.ink2, marginTop: 12}}>Verified by {CAR.verified_by?.name} · valid until {PITCH.resolution.valid_until}</div>
					</Tile>
					<Tile at={at.outlook} icon="inbox" color="#0f6cbd" label="Outlook add-in" sub="next to the client's email">
						<div style={{fontSize: 16, color: C.muted}}>From HR · Van Dam Logistics: "Overtime cut-off this month?"</div>
						<div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 10}}>
							<GradeTile grade={VAN_DAM.answer.grade} size={50} />
							<div style={{flex: 1, fontFamily: SERIF, fontSize: 32, color: C.ink}}>{VAN_DAM.answer.headline}</div>
							<span style={{display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: 10, background: C.ink, color: '#fff', fontSize: 16, fontWeight: 600}}>
								Reply with this <Icon name="arrowRight" size={16} />
							</span>
						</div>
					</Tile>
					<Tile at={at.salesforce} icon="briefcase" color="#0b5cab" label="Salesforce Service Cloud" sub="internal comment on every new case">
						<div style={{fontFamily: MONO, fontSize: 15.5, lineHeight: 1.55, color: C.ink2}}>
							<div style={{fontWeight: 600, color: C.ink}}>
								TrustLabel · {VAN_DAM.topic.label} · {VAN_DAM.context.label}
							</div>
							<div>
								<StatusBadge action={VAN_DAM.answer.action} size={14} /> {VAN_DAM.answer.value_display} · grade {VAN_DAM.answer.grade}
							</div>
							<div style={{color: C.muted}}>Internal note from TrustLabel. Nothing was sent to the client.</div>
						</div>
					</Tile>
					<Tile at={at.meetings} icon="mic" color={C.ink} label="Meetings & calls" sub="transcribed by ElevenLabs Scribe">
						<div style={{display: 'flex', alignItems: 'center', gap: 16}}>
							<Waveform from={at.meetings} to={cueEnd('pitch_where', 'scribe')} width={190} height={44} bars={22} color={C.accent} />
							<div style={{flex: 1, minWidth: 0}}>
								<div style={{fontSize: 17, fontWeight: 600, color: C.ink}}>{TOWN_HALL.title}</div>
								<div style={{fontSize: 15.5, color: C.ink2, fontStyle: 'italic', marginTop: 2}}>"…{TOWN_HALL.quote}…"</div>
							</div>
							<GradeTile grade={TOWN_HALL.grade} size={46} />
						</div>
						<div style={{fontSize: 15.5, color: C.muted, marginTop: 10}}>Becomes a graded source: {TOWN_HALL.applicability.text.toLowerCase()}</div>
					</Tile>
				</div>
				<div style={{position: 'absolute', left: 110, top: 838, width: 1700, display: 'flex', alignItems: 'center', gap: 22, padding: '22px 28px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', ...fadeUp(pay, 30)}}>
					<div style={{fontSize: 24, color: C.darkText, whiteSpace: 'nowrap'}}>
						<span style={{color: C.darkMuted}}>Asked:</span> "{PITCH.pay_question}"
					</div>
					<Icon name="arrowRight" size={24} color={C.darkMuted} />
					<div style={{flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderRadius: 14, background: C.surface, color: C.ink, ...popIn(refused, 0.85)}}>
						<Icon name="lock" size={24} color={C.neg} stroke={2.2} />
						<div style={{fontSize: 19, lineHeight: 1.35}}>
							{PAY.message} <b style={{fontWeight: 600}}>{PAY.contact.name}</b>, {PAY.contact.title}
						</div>
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

const Tile: React.FC<{at: number; icon: IconName; color: string; label: string; sub: string; children: ReactNode}> = ({at, icon, color, label, sub, children}) => {
	const p = useEnter(at - 6, BOUNCY);
	return (
		<div style={{borderRadius: 22, background: C.surface, padding: '20px 24px', height: 300, boxShadow: '0 30px 80px -30px rgba(0,0,0,0.8)', ...popIn(p, 0.8)}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16}}>
				<span style={{width: 40, height: 40, borderRadius: 11, background: color, color: '#fff', display: 'grid', placeItems: 'center'}}>
					<Icon name={icon} size={21} />
				</span>
				<div>
					<div style={{fontSize: 22, fontWeight: 650, color: C.ink}}>{label}</div>
					<div style={{fontSize: 15, color: C.muted}}>{sub}</div>
				</div>
			</div>
			{children}
		</div>
	);
};
