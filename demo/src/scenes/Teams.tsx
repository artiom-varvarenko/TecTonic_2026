import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, MONO, SERIF, SHADOW, SHADOW_LG} from '../theme';
import {CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {Avatar} from '../components/Card';
import {GradeTile, StatusBadge} from '../components/GradeTile';
import {BrandMark, Icon} from '../components/Icon';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, LOTTE} from '../data';
import {cue, cueWord} from '../timeline';

const MCP = DATA.mcp;
const RESULT = MCP.after.result;
const ANSWER = RESULT.answer;
const EXPERT = RESULT.experts[0];
const ROWS = RESULT.sources.slice(0, 4);
// The quick-tunnel address in the README when the video was made; each tunnel start gets a new one.
export const MCP_URL = 'https://wage-deputy-practices-represents.trycloudflare.com/mcp';

const WIN = {left: 780, top: 56, width: 1060};

/** Soft highlight behind a phrase while the narrator names it. */
const glowStyle = (g: number) => ({
	borderRadius: 8,
	boxShadow: `0 0 0 ${4 * g}px rgba(91,95,199,${0.22 * g})`,
	background: `rgba(91,95,199,${0.08 * g})`,
});

export const Teams: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		question: 28,
		tool: cueWord('teams', 'mcp', 'MCP'),
		agent: cueWord('teams', 'mcp', 'Teams'),
		grades: cueWord('teams', 'mcp', 'grades'),
		reasons: cueWord('teams', 'mcp', 'reasons'),
		expert: cueWord('teams', 'mcp', 'expert'),
		scope: cue('teams', 'scope'),
		own: cueWord('teams', 'scope', 'own'),
	};
	const win = useEnter(6);
	const question = useEnter(at.question, SNAPPY);
	const tool = useEnter(at.tool, SNAPPY);
	const typing = frame >= at.tool + 20 && frame < at.agent - 20;
	const reply = useEnter(at.agent - 20, SNAPPY);
	const pulse = (from: number, to: number) => interpolate(frame, [from, from + 8, to, to + 12], [0, 1, 1, 0], CLAMP);
	const gGrades = pulse(at.grades, at.reasons - 4);
	const gReasons = pulse(at.reasons, at.expert - 4);
	const gExpert = pulse(at.expert, at.scope + 10);
	const server = useEnter(cueWord('teams', 'mcp', 'server'), SNAPPY);
	const scope = useEnter(at.scope - 6, SNAPPY);
	const own = interpolate(frame, [at.own, at.own + 10], [0, 1], CLAMP);
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="teams" />
				<Sfx at={at.question} src="pop" volume={0.35} />
				<Sfx at={at.tool} src="tick" volume={0.4} />
				<Sfx at={at.agent - 20} src="pop" volume={0.4} />
				<Sfx at={at.scope} src="tick" volume={0.4} />
				<SceneText
					step="07"
					kicker="Microsoft Teams · MCP"
					title="Works where people [already chat.]"
					body="TrustLabel is a remote MCP server. A Copilot Studio agent in Teams gets the same grades, reasons and expert routing as the web app."
					width={600}
				/>
				<div
					style={{
						position: 'absolute',
						left: WIN.left,
						top: WIN.top,
						width: WIN.width,
						height: 712,
						borderRadius: 18,
						overflow: 'hidden',
						background: '#f5f5f5',
						boxShadow: SHADOW_LG,
						display: 'flex',
						flexDirection: 'column',
						...fadeUp(win, 50),
					}}
				>
					<div style={{height: 50, flex: 'none', background: C.teams, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', fontSize: 18, fontWeight: 600}}>
						<TeamsMark />
						Microsoft Teams
						<div style={{flex: 1}} />
						<div style={{width: 360, height: 30, borderRadius: 7, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', fontSize: 15, fontWeight: 450, opacity: 0.9}}>
							<Icon name="search" size={15} /> Search
						</div>
						<div style={{flex: 1}} />
						<Avatar name={LOTTE.name} size={30} />
					</div>
					<div style={{height: 64, flex: 'none', background: '#fff', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px'}}>
						<div style={{width: 40, height: 40, borderRadius: '50%', background: C.ink, display: 'grid', placeItems: 'center'}}>
							<BrandMark size={26} tile={C.ink} />
						</div>
						<div style={{lineHeight: 1.2}}>
							<div style={{fontSize: 20, fontWeight: 650, color: C.ink}}>TrustLabel</div>
							<div style={{fontSize: 14, color: C.muted}}>Copilot Studio agent · TrustLabel MCP connected</div>
						</div>
						<div style={{flex: 1}} />
						<span style={{fontSize: 16, fontWeight: 600, color: C.teams, borderBottom: `3px solid ${C.teams}`, padding: '20px 4px 17px'}}>Chat</span>
					</div>
					<div style={{flex: 1, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden'}}>
						<div style={{alignSelf: 'flex-end', maxWidth: 620, ...fadeUp(question, 20)}}>
							<div style={{fontSize: 13, color: C.muted, textAlign: 'right', marginBottom: 4}}>10:52</div>
							<div style={{background: '#e8ebfa', borderRadius: 10, padding: '12px 16px', fontSize: 21, color: C.ink}}>{MCP.question}</div>
						</div>
						<div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: C.muted, ...fadeUp(tool, 12)}}>
							<span style={{display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: '#fff', border: '1px solid #e1e1e1'}}>
								<Icon name="terminal" size={15} color={C.teams} />
								Used a tool:
								<b style={{fontFamily: MONO, fontWeight: 600, color: C.ink}}>ask_trustlabel</b>
								<span style={{fontFamily: MONO, fontSize: 14}}>{'{question, client: "Van Dam"}'}</span>
							</span>
							{typing ? <TypingDots /> : null}
						</div>
						<div style={{display: 'flex', gap: 12, alignItems: 'flex-start', ...fadeUp(reply, 30)}}>
							<div style={{width: 34, height: 34, borderRadius: '50%', background: C.ink, display: 'grid', placeItems: 'center', flex: 'none'}}>
								<BrandMark size={22} tile={C.ink} />
							</div>
							<div style={{flex: 1, minWidth: 0, background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', padding: '16px 20px'}}>
								<div style={{display: 'flex', alignItems: 'center', gap: 16}}>
									<GradeTile grade={ANSWER.grade} size={62} />
									<div>
										<StatusBadge action={ANSWER.action} size={15} />
										<div style={{fontFamily: SERIF, fontSize: 36, lineHeight: 1.05, marginTop: 6, color: C.ink}}>{ANSWER.headline}</div>
									</div>
								</div>
								<div style={{fontSize: 18, color: C.ink2, marginTop: 10, lineHeight: 1.4}}>{ANSWER.detail}</div>
								<div style={{marginTop: 12, borderTop: '1px solid #ececec', paddingTop: 8}}>
									{ROWS.map((s) => (
										<div key={s.id} style={{display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 17.5}}>
											<span style={{padding: 2, ...glowStyle(gGrades)}}>
												<GradeTile grade={s.grade} size={28} />
											</span>
											<span style={{fontFamily: MONO, fontSize: 15.5, color: C.muted, width: 138, flex: 'none'}}>{s.id}</span>
											<span style={{flex: 1, minWidth: 0, padding: '1px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.ink2, ...glowStyle(gReasons)}}>{s.applicability.text}</span>
										</div>
									))}
								</div>
								<div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '6px 8px', fontSize: 17.5, color: C.ink2, ...glowStyle(gExpert)}}>
									<Icon name="user" size={17} color={C.muted} />
									Top expert: <b style={{fontWeight: 600, color: C.ink}}>{EXPERT.name}</b>
									<span style={{color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>· {EXPERT.reasons[0]}</span>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div style={{position: 'absolute', left: WIN.left, top: WIN.top + 736, width: WIN.width, display: 'flex', gap: 18}}>
					<div style={{flex: 1.5, background: C.surface, borderRadius: 18, boxShadow: SHADOW, padding: '16px 20px', ...fadeUp(server, 24)}}>
						<div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase'}}>
							<Icon name="link" size={17} />
							MCP server · POST · Streamable HTTP
						</div>
						<div style={{fontFamily: MONO, fontSize: 15, color: C.ink, marginTop: 8, whiteSpace: 'nowrap'}}>{MCP_URL}</div>
						<div style={{display: 'flex', gap: 8, marginTop: 10}}>
							{MCP.tools.map((t) => (
								<span key={t.name} style={{fontFamily: MONO, fontSize: 14.5, padding: '4px 9px', borderRadius: 7, background: C.sunken, color: C.ink2}}>
									{t.name}
								</span>
							))}
						</div>
					</div>
					<div
						style={{
							flex: 1,
							background: C.surface,
							borderRadius: 18,
							padding: '16px 20px',
							boxShadow: `${SHADOW}, 0 0 0 ${3 * own}px rgba(13,122,69,0.4)`,
							...fadeUp(scope, 24),
						}}
					>
						<div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase'}}>
							<Icon name="key" size={17} />
							Auth · X-API-Key
						</div>
						<div style={{fontSize: 21, fontWeight: 600, color: C.ink, marginTop: 8}}>{LOTTE.name.split(' ')[0]}'s own key and permissions</div>
						<div style={{fontSize: 16, color: C.muted, marginTop: 6}}>SHA-256 hashed · 8 h · revocable</div>
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

/** A simple Teams-like tile: purple rounded square with a white T. */
const TeamsMark: React.FC = () => (
	<div style={{width: 28, height: 28, borderRadius: 7, background: '#fff', color: C.teams, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18}}>T</div>
);

const TypingDots: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<span style={{display: 'inline-flex', gap: 5, padding: '8px 12px', borderRadius: 999, background: '#fff', border: '1px solid #e1e1e1'}}>
			{[0, 1, 2].map((i) => (
				<span key={i} style={{width: 7, height: 7, borderRadius: '50%', background: C.teams, opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame - i * 5) / 5))}} />
			))}
		</span>
	);
};
