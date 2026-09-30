import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, SERIF, SHADOW} from '../theme';
import {CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {AppHeader} from '../components/AppChrome';
import {ActivityCard, AttentionCard, DashHead, KpiRow, TopicCard} from '../components/Dashboard';
import {BrandMark, GoogleMark, Icon} from '../components/Icon';
import {Ladder} from '../components/Ladder';
import {Cursor} from '../components/Cursor';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, LOTTE} from '../data';
import {cue, cueWord} from '../timeline';

const BOARD = DATA.overview_before;
const S = 1.5; // login page scale
const A = 1.42; // app scale
const GOOGLE_BTN = {x: 1170, y: 704, w: 540, h: 60};

/** The redesigned login page (static/app.js renderLogin) with the "Continue with Google" button. */
const Login: React.FC<{pressed: number; signing: boolean}> = ({pressed, signing}) => {
	const field = (label: string) => (
		<label style={{display: 'flex', flexDirection: 'column', gap: 6 * S, fontSize: 13 * S, fontWeight: 550, color: C.ink2}}>
			{label}
			<span style={{height: 42 * S, borderRadius: 10 * S, border: `1px solid ${C.lineStrong}`, background: C.surface}} />
		</label>
	);
	return (
		<AbsoluteFill style={{display: 'grid', gridTemplateColumns: '1.05fr 1fr', fontFamily: FONT}}>
			<div
				style={{
					background: `radial-gradient(120% 90% at 0% 0%, ${C.darkRaised} 0%, ${C.dark} 60%), ${C.dark}`,
					color: C.darkText,
					padding: `${44 * S * 0.8}px ${56 * S * 0.8}px`,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
				}}
			>
				<div style={{display: 'inline-flex', alignItems: 'center', gap: 14, fontWeight: 650, fontSize: 26, letterSpacing: -0.4}}>
					<BrandMark size={38} tile="#f4f4f1" />
					TrustLabel
				</div>
				<div style={{maxWidth: 700}}>
					<Ladder enterAt={-30} width={420} rowHeight={30} gap={7} variant="hero" dark />
					<div style={{fontFamily: SERIF, fontSize: 76, lineHeight: 1.02, marginTop: 44}}>
						Search finds it. <em style={{color: C.darkMuted}}>TrustLabel shows whether you can rely on it.</em>
					</div>
					<div style={{marginTop: 24, color: C.darkMuted, fontSize: 23, maxWidth: 620, lineHeight: 1.5}}>
						Every source graded A to G, every grade explained, and every doubt routed to the expert who can settle it.
					</div>
				</div>
				<div style={{color: C.darkFaint, fontSize: 18}}>SD Worx challenge · Tectonic Hackathon 2026</div>
			</div>
			<div style={{background: C.bg, display: 'grid', placeItems: 'center'}}>
				<div style={{width: 360 * S, display: 'flex', flexDirection: 'column', gap: 14 * S, color: C.ink}}>
					<div style={{fontSize: 26 * S, fontWeight: 600, letterSpacing: -0.6}}>Sign in</div>
					<div style={{color: C.muted, marginTop: -8 * S, fontSize: 15 * S}}>Use your TrustLabel demo account.</div>
					{field('Username')}
					{field('Password')}
					<div style={{height: 40 * S, borderRadius: 10 * S, background: C.ink, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14 * S, fontWeight: 550}}>Log in</div>
					<div style={{display: 'flex', alignItems: 'center', gap: 12 * S, color: C.faint, fontSize: 12 * S}}>
						<span style={{flex: 1, height: 1, background: C.line}} />
						or
						<span style={{flex: 1, height: 1, background: C.line}} />
					</div>
					<div
						style={{
							height: 40 * S,
							borderRadius: 10 * S,
							background: pressed > 0 ? C.surface2 : C.surface,
							border: `1px solid ${C.lineStrong}`,
							boxShadow: `0 1px 2px rgba(16,20,28,0.05), 0 0 0 ${4 * pressed}px ${C.ring}`,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 10 * S,
							fontSize: 14 * S,
							fontWeight: 550,
							transform: `scale(${1 - 0.02 * pressed})`,
						}}
					>
						<GoogleMark size={18 * S} />
						{signing ? 'Signing in…' : 'Continue with Google'}
					</div>
					<div style={{color: C.muted, fontSize: 12.5 * S, borderTop: `1px solid ${C.line}`, paddingTop: 14 * S}}>lotte, jonas (consultants) · ellen, pieter, anke (experts)</div>
				</div>
			</div>
		</AbsoluteFill>
	);
};

export const Overview: React.FC = () => {
	const frame = useCurrentFrame();
	const clickAt = cueWord('overview', 'signin', 'Google') - 2;
	const appAt = clickAt + 24;
	const safeAt = cueWord('overview', 'board', 'safe') - 4;
	const decisionAt = cueWord('overview', 'board', 'decision') - 6;
	const debtAt = cueWord('overview', 'board', 'handbook') - 4;
	const pressed = interpolate(frame, [clickAt - 2, clickAt, clickAt + 10], [0, 1, 0], CLAMP);
	const loginOut = interpolate(frame, [appAt - 6, appAt + 10], [1, 0], CLAMP);
	const app = useEnter(appAt, SNAPPY);
	const note = useEnter(clickAt + 4);
	const kpis = useEnter(appAt + 10);
	const topics = useEnter(appAt + 18);
	const lower = useEnter(appAt + 26);
	const glowAt = (at: number, until = 9999) => interpolate(frame, [at, at + 10, until, until + 12], [0, 1, 1, 0], CLAMP);
	const safe = glowAt(safeAt, decisionAt - 4);
	const decide = glowAt(decisionAt, debtAt - 4);
	const debt = glowAt(debtAt);
	const btn = {x: GOOGLE_BTN.x + GOOGLE_BTN.w * 0.5, y: GOOGLE_BTN.y + GOOGLE_BTN.h * 0.55};
	return (
		<Stage tone="light">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="overview" />
				<Sfx at={clickAt} src="click" volume={0.6} />
				<Sfx at={appAt} src="whoosh" volume={0.3} />
				{[safeAt, decisionAt, debtAt].map((f) => (
					<Sfx key={f} at={f + 2} src="tick" volume={0.35} />
				))}
				{loginOut > 0 ? (
					<AbsoluteFill style={{opacity: loginOut, transform: `scale(${1 + 0.03 * (1 - loginOut)})`}}>
						<Login pressed={pressed} signing={frame >= clickAt + 6} />
						<div
							style={{
								position: 'absolute',
								left: GOOGLE_BTN.x - 20,
								top: GOOGLE_BTN.y + 150,
								width: GOOGLE_BTN.w + 40,
								display: 'flex',
								justifyContent: 'center',
								...fadeUp(note, 12),
							}}
						>
							<span style={{display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, background: C.ink, color: '#fff', fontSize: 19, fontWeight: 550, boxShadow: SHADOW}}>
								<Icon name="shield" size={20} color="#5ee29a" />
								OpenID Connect · PKCE · allow-listed accounts only
							</span>
						</div>
					</AbsoluteFill>
				) : null}
				{frame >= appAt - 6 ? (
					<AbsoluteFill style={{opacity: app, transform: `translateY(${(1 - app) * 24}px)`}}>
						<AppHeader user={LOTTE} s={A} />
						<div style={{position: 'absolute', left: 108, top: 64 * A + 34, width: 1704, display: 'flex', flexDirection: 'column', gap: 16 * A}}>
							<DashHead context={BOARD.context.label} s={A} />
							<div style={fadeUp(kpis, 20)}>
								<KpiRow data={BOARD} s={A} glow={[safe, 0, debt, 0]} />
							</div>
							<div style={{display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 * A, ...fadeUp(topics, 20)}}>
								{BOARD.topics.map((t) => (
									<TopicCard key={t.topic.id} topic={t} s={A} glow={t.answer.action === 'use' ? safe : decide} />
								))}
							</div>
							<div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 14 * A, alignItems: 'start', ...fadeUp(lower, 20)}}>
								<AttentionCard data={BOARD} s={A} glow={debt} />
								<ActivityCard data={BOARD} s={A} />
							</div>
						</div>
					</AbsoluteFill>
				) : null}
				<Cursor
					appearAt={cue('overview', 'signin') - 4}
					path={[
						{frame: cue('overview', 'signin') - 4, x: 1560, y: 1010},
						{frame: clickAt - 8, x: btn.x, y: btn.y},
						{frame: appAt - 8, x: btn.x + 8, y: btn.y + 6},
					]}
					clicks={[clickAt]}
					hideAfter={appAt - 4}
				/>
			</AbsoluteFill>
		</Stage>
	);
};
