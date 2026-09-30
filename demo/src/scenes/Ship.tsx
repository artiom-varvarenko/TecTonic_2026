import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, MONO} from '../theme';
import {BOUNCY, CLAMP, fadeUp, popIn, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {SceneText} from '../components/SceneText';
import {CheckDot} from '../components/Card';
import {Icon} from '../components/Icon';
import type {IconName} from '../components/Icon';
import {Typewriter} from '../components/Typewriter';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {cue, cueWord} from '../timeline';
import {MCP_URL} from './Teams';

const HOST = MCP_URL.replace(/\/mcp$/, '');
const RUN = 'TRUSTLABEL_COOKIE_SECURE=1 TRUSTLABEL_BEHIND_PROXY=1 uv run --env-file .env main.py';
const TUNNEL = 'cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000';

// The measures named in the narration, as listed under "Security" in the README.
const MEASURES: {word: string; icon: IconName; head: string; body: string}[] = [
	{word: 'Hashed', icon: 'key', head: 'Hashed passwords & keys', body: 'scrypt passwords, SHA-256 Teams keys'},
	{word: 'server', icon: 'lock', head: 'Server-side sessions', body: 'HttpOnly, SameSite=Strict, revoked on logout'},
	{word: 'rate', icon: 'clock', head: 'Rate limits', body: 'Logins, MCP calls and the AI budget'},
	{word: 'strict', icon: 'shield', head: 'Strict CSP', body: "script-src 'self', no inline code, no framing"},
];

export const Ship: React.FC = () => {
	const frame = useCurrentFrame();
	const at = {
		run: 8,
		tunnel: cueWord('ship', 'deploy', 'public') - 6,
		created: cueWord('ship', 'deploy', 'Cloudflare'),
		aikido: cueWord('ship', 'aikido', 'Aikido'),
		check: cueWord('ship', 'aikido', 'check'),
		measures: cue('ship', 'measures'),
	};
	const term = useEnter(4);
	const line = (f: number) => (frame >= f ? 1 : 0);
	const url = useEnter(at.created + 8, BOUNCY);
	const panel = useEnter(at.aikido - 12, SNAPPY);
	const passed = useEnter(at.check, BOUNCY);
	const measureAt = MEASURES.map((m) => cueWord('ship', 'measures', m.word) - 4);
	const cursorOn = Math.floor(frame / 15) % 2 === 0;
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="ship" />
				<Sfx at={at.created + 8} src="chime" volume={0.4} />
				<Sfx at={at.check} src="pop" volume={0.45} />
				{measureAt.map((f, i) => (
					<Sfx key={i} at={f} src="tick" volume={0.4} />
				))}
				<SceneText
					step="08"
					kicker="Deployment & security"
					title="Public HTTPS, and [Aikido-clean.]"
					body="Served over a Cloudflare Tunnel with secure cookies, and every Aikido security check passing."
					tone="dark"
					width={600}
				/>
				<div style={{position: 'absolute', left: 790, top: 176, width: 1030}}>
					<div style={{borderRadius: 18, overflow: 'hidden', background: '#07080a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 30px 80px -30px rgba(0,0,0,0.8)', ...fadeUp(term, 40)}}>
						<div style={{height: 42, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: '#15171b', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
							{['#ff5f57', '#febc2e', '#28c840'].map((c) => (
								<span key={c} style={{width: 12, height: 12, borderRadius: '50%', background: c}} />
							))}
							<span style={{flex: 1, textAlign: 'center', fontFamily: MONO, fontSize: 15, color: C.darkFaint, marginRight: 60}}>~/TecTonic_2026 — zsh</span>
						</div>
						<div style={{padding: '18px 22px', fontFamily: MONO, fontSize: 17.5, lineHeight: 1.65, color: '#d7dae0', height: 252}}>
							<div>
								<span style={{color: '#5ee29a'}}>$ </span>
								<Typewriter text={RUN} start={at.run} cps={70} caret={false} />
							</div>
							<div style={{color: C.darkFaint, opacity: line(at.run + 26)}}>INFO: Uvicorn running on http://127.0.0.1:8000</div>
							<div style={{opacity: line(at.tunnel - 2)}}>
								<span style={{color: '#5ee29a'}}>$ </span>
								<Typewriter text={TUNNEL} start={at.tunnel} cps={70} caret={false} />
							</div>
							<div style={{color: C.darkFaint, opacity: line(at.tunnel + 30)}}>INF Requesting new quick Tunnel on trycloudflare.com...</div>
							<div style={{color: C.darkFaint, opacity: line(at.created)}}>INF Your quick Tunnel has been created! Visit it at:</div>
							<div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, ...popIn(url, 0.8), transformOrigin: 'left center'}}>
								<span style={{display: 'inline-flex', alignItems: 'center', gap: 10, padding: '4px 12px', borderRadius: 8, background: 'rgba(94,226,154,0.12)', color: '#5ee29a', fontWeight: 600}}>
									<Icon name="lock" size={17} stroke={2.2} />
									{HOST}
								</span>
								<span style={{display: 'inline-block', width: 10, height: 20, background: '#d7dae0', opacity: cursorOn ? 0.8 : 0}} />
							</div>
						</div>
					</div>
					<div
						style={{
							marginTop: 24,
							borderRadius: 20,
							padding: '20px 24px',
							background: C.surface,
							color: C.ink,
							display: 'flex',
							alignItems: 'center',
							gap: 18,
							boxShadow: '0 30px 80px -30px rgba(0,0,0,0.8)',
							...fadeUp(panel, 30),
						}}
					>
						<div style={{width: 58, height: 58, borderRadius: 14, background: C.ink, color: '#fff', display: 'grid', placeItems: 'center'}}>
							<Icon name="shield" size={32} stroke={2} />
						</div>
						<div style={{flex: 1}}>
							<div style={{fontSize: 15, fontWeight: 600, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase'}}>Aikido Security · TrustLabel repository</div>
							<div style={{fontSize: 30, fontWeight: 650, letterSpacing: -0.5, marginTop: 2}}>All security checks passed</div>
						</div>
						<div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, background: C.posBg, color: C.pos, fontSize: 21, fontWeight: 600, ...popIn(passed, 0.4)}}>
							<Icon name="check" size={22} stroke={2.6} />0 open issues
						</div>
					</div>
					<div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16}}>
						{MEASURES.map((m, i) => (
							<Measure key={m.head} at={measureAt[i]} icon={m.icon} head={m.head} body={m.body} />
						))}
					</div>
				</div>
			</AbsoluteFill>
		</Stage>
	);
};

const Measure: React.FC<{at: number; icon: IconName; head: string; body: string}> = ({at, icon, head, body}) => {
	const frame = useCurrentFrame();
	const p = useEnter(at, SNAPPY);
	const lit = interpolate(frame, [at, at + 10], [0, 1], CLAMP);
	return (
		<div
			style={{
				borderRadius: 18,
				padding: '18px 20px',
				display: 'flex',
				gap: 16,
				alignItems: 'center',
				background: `rgba(255,255,255,${0.05 + 0.03 * lit})`,
				border: `1px solid rgba(255,255,255,${0.08 + 0.12 * lit})`,
				...fadeUp(p, 24),
			}}
		>
			<div style={{width: 48, height: 48, flex: 'none', borderRadius: 12, background: 'rgba(255,255,255,0.08)', color: C.darkText, display: 'grid', placeItems: 'center'}}>
				<Icon name={icon} size={24} />
			</div>
			<div style={{flex: 1, minWidth: 0}}>
				<div style={{fontSize: 22, fontWeight: 600, color: C.darkText}}>{head}</div>
				<div style={{fontSize: 17, color: C.darkMuted, marginTop: 3}}>{body}</div>
			</div>
			<div style={popIn(Math.min(1, p), 0.3)}>
				<CheckDot size={30} />
			</div>
		</div>
	);
};
