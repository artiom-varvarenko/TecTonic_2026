import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, SERIF, SHADOW} from '../theme';
import {BOUNCY, CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {Stage} from '../components/Background';
import {AnimatedTitle} from '../components/SceneText';
import {Avatar, Card} from '../components/Card';
import {Pill} from '../components/GradeTile';
import {Icon} from '../components/Icon';
import {Typewriter} from '../components/Typewriter';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue, cueWord} from '../timeline';

const before = DATA.before;
const RESULTS = [
	{item: source(before, 'DOC-BE-017'), tag: 'Updated 14 Aug 2026', tone: 'applies' as const, word: 'recently'},
	{item: source(before, 'DOC-BE-009'), tag: 'Owner left SD Worx', tone: 'neg' as const, word: 'owner'},
	{item: source(before, 'DOC-NL-004'), tag: 'Netherlands?', tone: 'warn' as const, word: 'another'},
];
const TEAMS = source(DATA.after, 'TEAMS-4411');
const ordinalShort = (v: string) => `${v}${v === '22' ? 'nd' : 'th'}`;

const DocGlyph: React.FC = () => (
	<div style={{width: 58, height: 58, flex: 'none', borderRadius: 14, background: C.sunken, display: 'grid', placeItems: 'center'}}>
		<svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke={C.ink2} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
			<path d="M6 2.8h8l4.5 4.5v13.9H6z" />
			<path d="M14 2.8v4.5h4.5M9 12h6M9 15.5h6M9 19h3.5" />
		</svg>
	</div>
);

export const Problem: React.FC = () => {
	const frame = useCurrentFrame();
	const searchIn = useEnter(cue('problem', 'search') - 6);
	const teamsAt = cue('problem', 'teams') + 8;
	const teams = useEnter(teamsAt, SNAPPY);
	const stuckAt = cue('problem', 'stuck');
	const stuck = useEnter(stuckAt);
	const firstTitle = interpolate(frame, [stuckAt - 12, stuckAt], [1, 0], CLAMP);
	const dim = 1 - 0.4 * stuck;
	const flag = interpolate(frame, [teamsAt + 20, teamsAt + 30], [0, 1], CLAMP);
	return (
		<Stage tone="dark">
			<AbsoluteFill style={{fontFamily: FONT}}>
				<SceneNarration scene="problem" />
				{RESULTS.map((r) => (
					<Sfx key={r.item.id} at={cueWord('problem', 'docs', r.word) - 4} src="pop" volume={0.35} />
				))}
				<Sfx at={teamsAt} src="alert" volume={0.35} />
				<div style={{position: 'absolute', left: 120, top: 66, width: 1700, height: 100}}>
					<div style={{position: 'absolute', opacity: firstTitle}}>
						<AnimatedTitle text="Search finds [three documents.]" delay={cue('problem', 'search')} size={76} tone="dark" />
					</div>
					<div style={{position: 'absolute', opacity: stuck}}>
						<AnimatedTitle text="Found information. [Still can't act with confidence.]" delay={stuckAt} size={76} tone="dark" highlight="#ff9a8f" />
					</div>
				</div>
				<div style={{position: 'absolute', left: 120, top: 208, width: 1040, opacity: dim}}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 16,
							background: C.surface,
							borderRadius: 18,
							padding: '20px 24px',
							fontSize: 30,
							color: C.ink,
							boxShadow: SHADOW,
							...fadeUp(searchIn, 20),
						}}
					>
						<Icon name="search" size={32} color={C.faint} />
						<Typewriter text="overtime cut-off Belgium" start={cue('problem', 'search')} cps={22} />
						<div style={{flex: 1}} />
						<Avatar name="Lotte Janssens" size={46} />
					</div>
					<div style={{display: 'flex', flexDirection: 'column', gap: 18, marginTop: 26}}>
						{RESULTS.map((r) => (
							<ResultCard key={r.item.id} at={cueWord('problem', 'docs', r.word) - 6} {...r} />
						))}
					</div>
				</div>
				<div style={{position: 'absolute', left: 1230, top: 430, width: 570, ...fadeUp(teams, 60), transform: `translateX(${(1 - teams) * 120}px)`}}>
					<div style={{color: C.darkMuted, fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14}}>Meanwhile, in Teams · #payroll-be</div>
					<Card padding={28} radius={24} style={{boxShadow: `${SHADOW}, 0 0 0 ${4 * flag}px #ff9a8f`}}>
						<div style={{display: 'flex', gap: 14, alignItems: 'center'}}>
							<div style={{width: 50, height: 50, borderRadius: 13, background: C.teams, color: '#fff', display: 'grid', placeItems: 'center'}}>
								<Icon name="message" size={26} stroke={2} />
							</div>
							<div>
								<div style={{fontWeight: 600, fontSize: 24}}>{TEAMS.author_name}</div>
								<div style={{fontSize: 18, color: C.muted}}>Payroll Consultant · 12 Sep</div>
							</div>
						</div>
						<div style={{fontSize: 26, lineHeight: 1.45, marginTop: 16, color: C.ink2}}>
							Heads-up: for Van Dam Logistics the cut-off is{' '}
							<b style={{background: C.negBg, color: C.neg, padding: '0 6px', borderRadius: 6, fontWeight: 600}}>the 25th</b>, not the 20th. They negotiated an exception
							in their contract.
						</div>
					</Card>
				</div>
				<ValueCloud at={stuckAt + 10} />
			</AbsoluteFill>
		</Stage>
	);
};

const ResultCard: React.FC<{item: (typeof RESULTS)[number]['item']; tag: string; tone: 'applies' | 'neg' | 'warn'; at: number}> = ({item, tag, tone, at}) => {
	const p = useEnter(at, SNAPPY);
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 20, background: C.surface, borderRadius: 18, padding: '18px 24px', color: C.ink, boxShadow: SHADOW, ...fadeUp(p, 40)}}>
			<DocGlyph />
			<div style={{flex: 1, minWidth: 0}}>
				<div style={{fontSize: 25, fontWeight: 600, letterSpacing: -0.3, whiteSpace: 'nowrap'}}>{item.title}</div>
				<div style={{fontSize: 19, color: C.muted, marginTop: 3}}>{item.source}</div>
			</div>
			<Pill tone={tone} size={17}>
				{tag}
			</Pill>
			<div style={{fontFamily: SERIF, fontSize: 44, color: C.ink, width: 90, textAlign: 'right'}}>{ordinalShort(item.value)}</div>
		</div>
	);
};

// The four different answers float up, unresolved.
const ValueCloud: React.FC<{at: number}> = ({at}) => {
	const frame = useCurrentFrame();
	const values = [
		{v: '20th', x: 330, y: 860, c: GRADE_BG.C},
		{v: '22nd', x: 620, y: 905, c: GRADE_BG.F},
		{v: '15th', x: 910, y: 850, c: GRADE_BG.E},
		{v: '25th', x: 1200, y: 910, c: '#ff9a8f'},
	];
	return (
		<>
			{values.map((val, i) => {
				const p = useEnter(at + i * 6, BOUNCY);
				const wobble = Math.sin((frame - at) / 7 + i) * 6 * p;
				return (
					<div
						key={val.v}
						style={{
							position: 'absolute',
							left: val.x - 80,
							top: val.y - 70 + wobble,
							fontFamily: SERIF,
							fontStyle: 'italic',
							fontSize: 110,
							color: val.c,
							opacity: p,
							transform: `scale(${0.4 + 0.6 * p}) rotate(${(i % 2 ? 1 : -1) * 6}deg)`,
							textShadow: '0 10px 30px rgba(0,0,0,0.45)',
						}}
					>
						{val.v}
						<span style={{color: C.darkText, opacity: 0.75}}>?</span>
					</div>
				);
			})}
		</>
	);
};
