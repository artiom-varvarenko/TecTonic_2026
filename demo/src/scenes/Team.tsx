import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {C, FONT, GRADE_BG, GRADES} from '../theme';
import {BOUNCY, fadeUp, useEnter} from '../anim';
import {AnimatedTitle} from '../components/SceneText';
import {SceneNarration} from '../components/SceneAudio';
import team from '../team.json';

type Member = {name: string; role: string; photo: string | null};
const MEMBERS = team.members as Member[];
const PALETTE = ['#1f5fbf', '#d81b60', '#00897b', '#7c4dff', '#ef6c00', '#546e7a'];

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join('');

export const Team: React.FC = () => {
	const frame = useCurrentFrame();
	const sub = useEnter(24);
	const size = MEMBERS.length > 4 ? 220 : 260;
	return (
		<AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center'}}>
			<SceneNarration scene="team" />
			<div style={{marginTop: -40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18}}>
				<AnimatedTitle text={team.title} delay={4} size={72} align="center" />
				<div style={{fontSize: 30, color: C.ink, ...fadeUp(sub, 16)}}>{team.subtitle}</div>
			</div>
			<div style={{display: 'flex', gap: MEMBERS.length > 4 ? 50 : 90, marginTop: 90, justifyContent: 'center'}}>
				{MEMBERS.map((m, i) => {
					const p = useEnter(30 + i * 8, BOUNCY);
					const ring = `conic-gradient(from ${frame * 1.5 + i * 60}deg, ${GRADES.map((g) => GRADE_BG[g]).join(', ')}, ${GRADE_BG.A})`;
					return (
						<div key={`${m.name}-${i}`} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, width: size + 60, ...fadeUp(p, 60)}}>
							<div style={{width: size, height: size, borderRadius: '50%', background: ring, padding: 7, transform: `scale(${0.7 + 0.3 * p})`}}>
								<div style={{width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `6px solid ${C.navy}`, background: PALETTE[i % PALETTE.length]}}>
									{m.photo ? (
										<Img src={staticFile(`team/${m.photo}`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
									) : (
										<div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.34, fontWeight: 800}}>
											{initials(m.name)}
										</div>
									)}
								</div>
							</div>
							<div style={{textAlign: 'center'}}>
								<div style={{color: '#fff', fontSize: 34, fontWeight: 800}}>{m.name}</div>
								{m.role ? <div style={{color: C.ink, fontSize: 24, marginTop: 6}}>{m.role}</div> : null}
							</div>
						</div>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
