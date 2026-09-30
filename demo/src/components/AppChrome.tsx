import type {CSSProperties, ReactNode} from 'react';
import {C, FONT, MONO, SHADOW, SHADOW_LG} from '../theme';
import {Avatar} from './Card';
import {BrandMark, Icon} from './Icon';

/** A plain browser window around an app screen; the address bar shows where it runs. */
export const BrowserFrame: React.FC<{
	width: number;
	height: number;
	url: string;
	secure?: boolean;
	children: ReactNode;
	style?: CSSProperties;
	urlStyle?: CSSProperties;
}> = ({width, height, url, secure = true, children, style, urlStyle}) => (
	<div style={{width, height, borderRadius: 18, overflow: 'hidden', background: C.bg, boxShadow: SHADOW_LG, display: 'flex', flexDirection: 'column', fontFamily: FONT, ...style}}>
		<div style={{height: 50, flex: 'none', display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px', background: '#e9e9e4', borderBottom: `1px solid ${C.line}`}}>
			<div style={{display: 'flex', gap: 8}}>
				{['#ff5f57', '#febc2e', '#28c840'].map((c) => (
					<span key={c} style={{width: 13, height: 13, borderRadius: '50%', background: c}} />
				))}
			</div>
			<div
				style={{
					flex: 1,
					maxWidth: 760,
					margin: '0 auto',
					height: 32,
					borderRadius: 9,
					background: '#f7f7f4',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 8,
					fontSize: 17,
					color: C.ink2,
					...urlStyle,
				}}
			>
				{secure ? <Icon name="lock" size={16} color={C.muted} stroke={2} /> : null}
				<span style={{whiteSpace: 'nowrap'}}>{url}</span>
			</div>
			<div style={{width: 60}} />
		</div>
		<div style={{flex: 1, position: 'relative', overflow: 'hidden'}}>{children}</div>
	</div>
);

/** The app header (.app-header): brand, Ask / Verification inbox pills, signed-in user. */
export const AppHeader: React.FC<{user: {name: string; title: string}; active?: 'ask' | 'inbox'; inboxCount?: number; s?: number}> = ({
	user,
	active = 'ask',
	inboxCount = 0,
	s = 1,
}) => {
	const nav = (key: 'ask' | 'inbox', icon: 'search' | 'inbox', label: string, count?: number) => (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 8 * s,
				height: 34 * s,
				padding: `0 ${14 * s}px`,
				borderRadius: 9 * s,
				fontSize: 13.5 * s,
				fontWeight: 550,
				color: active === key ? C.ink : C.muted,
				background: active === key ? C.surface : 'transparent',
				boxShadow: active === key ? '0 1px 2px rgba(16,20,28,0.08), 0 0 0 1px rgba(16,20,28,0.04)' : 'none',
			}}
		>
			<Icon name={icon} size={15 * s} />
			{label}
			{count ? (
				<span style={{minWidth: 19 * s, height: 19 * s, padding: `0 ${6 * s}px`, borderRadius: 999, display: 'inline-grid', placeItems: 'center', background: C.ink, color: '#fff', fontFamily: MONO, fontWeight: 600, fontSize: 11 * s}}>
					{count}
				</span>
			) : null}
		</span>
	);
	return (
		<div
			style={{
				height: 64 * s,
				padding: `0 ${28 * s}px`,
				display: 'grid',
				gridTemplateColumns: '1fr auto 1fr',
				alignItems: 'center',
				gap: 16 * s,
				background: 'rgba(245,245,242,0.92)',
				borderBottom: `1px solid ${C.line}`,
				fontFamily: FONT,
				color: C.ink,
			}}
		>
			<div style={{display: 'inline-flex', alignItems: 'center', gap: 10 * s, fontWeight: 650, fontSize: 16.5 * s, letterSpacing: -0.3}}>
				<BrandMark size={26 * s} tile={C.ink} />
				TrustLabel
			</div>
			<div style={{display: 'inline-flex', padding: 3 * s, gap: 2 * s, background: 'rgba(17,19,22,0.055)', borderRadius: 12 * s}}>
				{nav('ask', 'search', 'Ask')}
				{nav('inbox', 'inbox', 'Verification inbox', inboxCount)}
			</div>
			<div style={{justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 10 * s}}>
				<Avatar name={user.name} size={32 * s} />
				<div style={{display: 'flex', flexDirection: 'column', lineHeight: 1.2}}>
					<span style={{fontSize: 13.5 * s, fontWeight: 600}}>{user.name}</span>
					<span style={{fontSize: 12 * s, color: C.muted}}>{user.title}</span>
				</div>
				<Icon name="logout" size={18 * s} color={C.muted} style={{marginLeft: 6 * s}} />
			</div>
		</div>
	);
};

/** The ask card (.ask-card): context select, question field, Ask button and topic chips. */
export const AskBar: React.FC<{context: string; question?: ReactNode; placeholder?: string; topics?: string[]; s?: number; style?: CSSProperties}> = ({
	context,
	question,
	placeholder = "e.g. What's the cut-off for submitting overtime for this month's payroll?",
	topics,
	s = 1,
	style,
}) => (
	<div style={{background: C.surface, borderRadius: 18 * s, boxShadow: SHADOW, padding: 14 * s, fontFamily: FONT, color: C.ink, ...style}}>
		<div style={{display: 'flex', gap: 10 * s}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 10 * s, height: 48 * s, padding: `0 ${14 * s}px`, background: C.sunken, borderRadius: 12 * s, fontSize: 14 * s, fontWeight: 550, whiteSpace: 'nowrap'}}>
				<Icon name="briefcase" size={15 * s} color={C.muted} />
				{context}
				<Icon name="chevronDown" size={15 * s} color={C.muted} />
			</div>
			<div style={{flex: 1, display: 'flex', alignItems: 'center', gap: 12 * s, height: 48 * s, padding: `0 ${16 * s}px`, border: `1px solid ${C.lineStrong}`, borderRadius: 12 * s, fontSize: 15.5 * s, minWidth: 0}}>
				<Icon name="search" size={18 * s} color={C.faint} />
				<span style={{whiteSpace: 'nowrap', overflow: 'hidden', color: question ? C.ink : C.faint}}>{question ?? placeholder}</span>
			</div>
			<div style={{height: 48 * s, padding: `0 ${20 * s}px`, borderRadius: 12 * s, background: C.ink, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14 * s, fontWeight: 550}}>Ask</div>
		</div>
		{topics ? (
			<div style={{display: 'flex', gap: 8 * s, alignItems: 'center', padding: `${12 * s}px ${4 * s}px ${2 * s}px`}}>
				<span style={{color: C.faint, fontSize: 12.5 * s, marginRight: 2 * s}}>Topics</span>
				{topics.map((t) => (
					<span key={t} style={{height: 30 * s, padding: `0 ${12 * s}px`, borderRadius: 999, border: `1px solid ${C.lineStrong}`, display: 'inline-grid', placeItems: 'center', fontSize: 13 * s, color: C.ink2, whiteSpace: 'nowrap'}}>
						{t}
					</span>
				))}
			</div>
		) : null}
	</div>
);
