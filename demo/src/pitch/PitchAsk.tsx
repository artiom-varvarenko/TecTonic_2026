import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FONT, MONO, SHADOW_LG} from '../theme';
import {BOUNCY, fadeUp, popIn, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {AnimatedTitle} from '../components/SceneText';
import {Avatar} from '../components/Card';
import {VerdictCard} from '../components/Answer';
import {Pill} from '../components/GradeTile';
import {BrandMark, Icon} from '../components/Icon';
import {Typewriter} from '../components/Typewriter';
import {Sfx} from '../components/SceneAudio';
import {cardText, PITCH} from './data';
import {PitchNarration} from './PitchHook';
import {cue, cueWord} from './timeline';

const REQUEST = PITCH.before.auto_request;
const CARD = PITCH.request_card.body;
const LEAD = cardText(CARD[1].text ?? '');
const FACTS = (CARD[2].facts ?? []).filter((f) => f.title !== 'Question');
const REPLY_LINE = cardText(CARD[3]?.text ?? '');
const AFTER = PITCH.after;
const BEFORE = PITCH.before;
const RESOLUTION = PITCH.resolution;
// The bot's answer in the channel, worded as trustlabel/app.py words it.
const CONFIRM = `Verified: ${AFTER.topic.label} for ${AFTER.context.label} is ${AFTER.answer.value_display} (grade ${AFTER.answer.grade}), valid until ${RESOLUTION.valid_until}.`;

export const PitchAsk: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		owner: cueWord('pitch_ask', 'conflict', 'owner'),
		reply: cue('pitch_ask', 'teams'),
		line: cueWord('pitch_ask', 'teams', 'line'),
		verified: cueWord('pitch_ask', 'verified', '750') - 6,
	};
	const win = useEnter(4);
	const before = useEnter(8, SNAPPY);
	const asked = useEnter(at.owner - 10, SNAPPY);
	const card = useEnter(at.owner, SNAPPY);
	const reply = useEnter(at.reply - 6, SNAPPY);
	const confirm = useEnter(at.line + 6, SNAPPY);
	const answer = useEnter(at.verified, BOUNCY);
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<PitchNarration scene="pitch_ask" />
				<Sfx at={at.owner} src="pop" volume={0.4} />
				<Sfx at={at.line + 6} src="tick" volume={0.4} />
				<Sfx at={at.verified} src="chime" volume={0.5} />
				<div style={{position: 'absolute', left: 110, top: 64}}>
					<AnimatedTitle text="Still in doubt? TrustLabel [asks the owner.]" delay={2} size={64} />
				</div>
				<div style={{position: 'absolute', left: 110, top: 176, width: 930, height: 760, borderRadius: 20, overflow: 'hidden', background: '#f5f5f5', boxShadow: SHADOW_LG, display: 'flex', flexDirection: 'column', ...fadeUp(win, 40)}}>
					<div style={{height: 50, flex: 'none', background: C.teams, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', fontSize: 18, fontWeight: 600}}>
						<span style={{width: 28, height: 28, borderRadius: 7, background: '#fff', color: C.teams, display: 'grid', placeItems: 'center', fontWeight: 800}}>T</span>
						Microsoft Teams
						<span style={{fontWeight: 450, opacity: 0.85}}>· Sofie Verhaegen</span>
					</div>
					<div style={{flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14}}>
						<div style={{alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: '#e8edfd', color: C.accent, fontSize: 16, fontWeight: 600, ...fadeUp(asked, 10)}}>
							<Icon name="sparkle" size={16} />
							"Don't act yet" for {REQUEST.requester_name}, so TrustLabel asked the owner itself
						</div>
						<Message who="Workflows" avatar={<BotMark />} p={card}>
							<div style={{fontSize: 19, fontWeight: 700, color: C.ink}}>{cardText(CARD[0].text ?? '')}</div>
							<div style={{fontSize: 18, color: C.ink2, marginTop: 6, lineHeight: 1.4}}>
								<Mentions text={LEAD} />
							</div>
							<div style={{display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 14px', marginTop: 10, fontSize: 16.5, lineHeight: 1.35}}>
								{FACTS.map((f) => (
									<Fact key={f.title} title={f.title} value={f.value} />
								))}
							</div>
							<div style={{fontSize: 15, color: C.muted, marginTop: 10}}>{REPLY_LINE}</div>
						</Message>
						<Message who="Sofie Verhaegen" avatar={<Avatar name="Sofie Verhaegen" size={38} />} p={reply}>
							<div style={{fontSize: 19, color: C.ink}}>
								<Typewriter
									text={PITCH.reply}
									start={at.reply}
									cps={34}
									caret={frame < at.line + 6}
									render={(v) => (
										<>
											<b style={{color: C.teams}}>{v.slice(0, 11)}</b>
											<span style={{fontFamily: MONO, fontWeight: 600}}>{v.slice(11, 19)}</span>
											{v.slice(19)}
										</>
									)}
								/>
							</div>
						</Message>
						<Message who="TrustLabel" avatar={<BotMark />} p={confirm}>
							<div style={{fontSize: 18, color: C.ink2, lineHeight: 1.4}}>{CONFIRM}</div>
						</Message>
					</div>
				</div>
				<div style={{position: 'absolute', left: 1080, top: 300, width: 740, opacity: 1 - Math.min(1, answer * 1.5), transform: `translateY(${-30 * answer}px)`}}>
					<div style={{fontSize: 18, fontWeight: 600, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 14}}>What {REQUEST.requester_name} saw</div>
					<div style={fadeUp(before, 30)}>
						<VerdictCard answer={BEFORE.answer} scale={0.72} competing={false} />
					</div>
				</div>
				<div style={{position: 'absolute', left: 1080, top: 300, width: 740}}>
					<div style={{fontSize: 18, fontWeight: 600, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 14, ...fadeUp(answer, 10)}}>Everyone who asks now gets</div>
					<div style={popIn(answer, 0.85)}>
						<VerdictCard answer={AFTER.answer} scale={0.8}>
							<div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14}}>
								<Pill tone="applies" size={16}>
									Verified by {AFTER.answer.verified_by?.name}
								</Pill>
								<Pill tone="accent" size={16}>
									Valid until {RESOLUTION.valid_until}
								</Pill>
							</div>
							<div style={{fontSize: 16, color: C.muted, marginTop: 10}}>Note: {RESOLUTION.note}</div>
						</VerdictCard>
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

const BotMark: React.FC = () => (
	<div style={{width: 38, height: 38, borderRadius: '50%', background: C.ink, display: 'grid', placeItems: 'center', flex: 'none'}}>
		<BrandMark size={24} tile={C.ink} />
	</div>
);

const Message: React.FC<{who: string; avatar: React.ReactNode; p: number; children: React.ReactNode}> = ({who, avatar, p, children}) => (
	<div style={{display: 'flex', gap: 12, alignItems: 'flex-start', ...fadeUp(p, 24)}}>
		{avatar}
		<div style={{flex: 1, minWidth: 0}}>
			<div style={{fontSize: 14, color: C.muted, marginBottom: 4}}>{who}</div>
			<div style={{background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', padding: '14px 18px'}}>{children}</div>
		</div>
	</div>
);

const Fact: React.FC<{title: string; value: string}> = ({title, value}) => (
	<>
		<span style={{fontWeight: 600, color: C.ink}}>{title}</span>
		<span style={{color: C.ink2}}>{value}</span>
	</>
);

/** Bolds "@Name" mentions, as Teams renders them. */
const Mentions: React.FC<{text: string}> = ({text}) => {
	const m = text.match(/^@([^,]+),(.*)$/);
	if (!m) return <>{text}</>;
	return (
		<>
			<b style={{color: C.teams}}>@{m[1]}</b>,{m[2]}
		</>
	);
};
