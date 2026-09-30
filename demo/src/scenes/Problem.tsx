import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {BOUNCY, CLAMP, fadeUp, SNAPPY, useEnter} from '../anim';
import {AnimatedTitle} from '../components/SceneText';
import {Avatar, Card, DocIcon, SearchIcon} from '../components/Card';
import {Pill} from '../components/GradeTile';
import {Typewriter} from '../components/Typewriter';
import {SceneNarration, Sfx} from '../components/SceneAudio';
import {DATA, source} from '../data';
import {cue, cueWord} from '../timeline';

const before = DATA.before;
const RESULTS = [
	{item: source(before, 'DOC-BE-017'), tag: 'Updated 14 Aug 2026', tone: 'applies' as const, word: 'recently'},
	{item: source(before, 'DOC-BE-009'), tag: 'Owner left SD Worx', tone: 'red' as const, word: 'owner'},
	{item: source(before, 'DOC-NL-004'), tag: 'Netherlands?', tone: 'warn' as const, word: 'another'},
];
const TEAMS = source(before, 'TEAMS-4411');
const ordinalShort = (v: string) => `${v}${v === '22' ? 'nd' : 'th'}`;

export const Problem: React.FC = () => {
	const frame = useCurrentFrame();
	const searchIn = useEnter(cue('problem', 'search') - 6);
	const teamsAt = cue('problem', 'teams') + 8;
	const teams = useEnter(teamsAt, SNAPPY);
	const stuckAt = cue('problem', 'stuck');
	const stuck = useEnter(stuckAt);
	const firstTitle = interpolate(frame, [stuckAt - 12, stuckAt], [1, 0], CLAMP);
	const dim = 1 - 0.35 * stuck;
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<SceneNarration scene="problem" />
			{RESULTS.map((r) => (
				<Sfx key={r.item.id} at={cueWord('problem', 'docs', r.word) - 4} src="pop" volume={0.35} />
			))}
			<Sfx at={teamsAt} src="alert" volume={0.35} />
			<div style={{position: 'absolute', left: 120, top: 70, width: 1700, height: 90}}>
				<div style={{position: 'absolute', opacity: firstTitle}}>
					<AnimatedTitle text="Search finds [three documents]." delay={cue('problem', 'search')} size={62} />
				</div>
				<div style={{position: 'absolute', opacity: stuck}}>
					<AnimatedTitle text="Found information. [Still can't act with confidence.]" delay={stuckAt} size={62} highlight="#ff8a80" />
				</div>
			</div>
			<div style={{position: 'absolute', left: 120, top: 200, width: 1040, opacity: dim}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 18,
						background: '#fff',
						borderRadius: 18,
						padding: '20px 26px',
						fontSize: 30,
						color: C.text,
						boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
						...fadeUp(searchIn, 20),
					}}
				>
					<SearchIcon size={36} />
					<Typewriter text="overtime cut-off Belgium" start={cue('problem', 'search')} cps={22} />
					<div style={{flex: 1}} />
					<Avatar initials="LJ" color={C.accent} size={48} />
				</div>
				<div style={{display: 'flex', flexDirection: 'column', gap: 20, marginTop: 30}}>
					{RESULTS.map((r) => (
						<ResultCard key={r.item.id} at={cueWord('problem', 'docs', r.word) - 6} {...r} />
					))}
				</div>
			</div>
			<div style={{position: 'absolute', left: 1230, top: 420, width: 570, ...fadeUp(teams, 60), transform: `translateX(${(1 - teams) * 120}px)`}}>
				<div style={{color: C.inkSoft, fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14}}>
					Meanwhile, in {TEAMS.source.replace('Teams · ', 'Teams ')}
				</div>
				<Card padding={28} style={{border: `4px solid ${interpolate(frame, [teamsAt + 20, teamsAt + 30], [0, 1], CLAMP) > 0.5 ? '#ff8a80' : 'transparent'}`}}>
					<div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
						<Avatar initials="JW" color="#00897b" size={54} />
						<div>
							<div style={{fontWeight: 800, fontSize: 24}}>{TEAMS.author_name}</div>
							<div style={{fontSize: 18, color: C.muted}}>Payroll Consultant · 12 Sep</div>
						</div>
					</div>
					<div style={{fontSize: 26, lineHeight: 1.45, marginTop: 16}}>
						Heads-up: for Van Dam Logistics the cut-off is <b style={{background: '#fde7e7', color: C.red, padding: '0 6px', borderRadius: 6}}>the 25th</b>, not the 20th.
						They negotiated an exception in their contract.
					</div>
				</Card>
			</div>
			<ValueCloud at={stuckAt + 10} />
		</AbsoluteFill>
	);
};

const ResultCard: React.FC<{item: (typeof RESULTS)[number]['item']; tag: string; tone: 'applies' | 'red' | 'warn'; at: number}> = ({item, tag, tone, at}) => {
	const p = useEnter(at, SNAPPY);
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 22,
				background: '#fff',
				borderRadius: 18,
				padding: '22px 26px',
				color: C.text,
				boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
				...fadeUp(p, 40),
			}}
		>
			<DocIcon size={52} />
			<div style={{flex: 1, minWidth: 0}}>
				<div style={{fontSize: 25, fontWeight: 800, whiteSpace: 'nowrap'}}>{item.title}</div>
				<div style={{fontSize: 20, color: C.muted, marginTop: 4}}>{item.source}</div>
			</div>
			<Pill tone={tone} size={17}>
				{tag}
			</Pill>
			<div style={{fontSize: 34, fontWeight: 900, color: C.navy, width: 78, textAlign: 'right'}}>{ordinalShort(item.value)}</div>
		</div>
	);
};

// The four different answers bounce up, unresolved.
const ValueCloud: React.FC<{at: number}> = ({at}) => {
	const frame = useCurrentFrame();
	const values = [
		{v: '20th', x: 330, y: 850, c: '#BFD730'},
		{v: '22nd', x: 620, y: 900, c: '#F37021'},
		{v: '15th', x: 910, y: 845, c: '#FDB913'},
		{v: '25th', x: 1200, y: 905, c: '#ff8a80'},
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
							top: val.y - 60 + wobble,
							fontFamily: FONT,
							fontSize: 92,
							fontWeight: 900,
							color: val.c,
							opacity: p,
							transform: `scale(${0.4 + 0.6 * p}) rotate(${(i % 2 ? 1 : -1) * 6}deg)`,
							textShadow: '0 10px 30px rgba(0,0,0,0.45)',
						}}
					>
						{val.v}
						<span style={{color: '#fff', opacity: 0.8}}>?</span>
					</div>
				);
			})}
		</>
	);
};
