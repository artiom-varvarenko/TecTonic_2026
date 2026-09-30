// Colours and fonts mirror static/styles.css of the TrustLabel app (the redesigned UI), so the video looks like the product.
export const C = {
	bg: '#f5f5f2',
	surface: '#ffffff',
	surface2: '#fafaf8',
	sunken: '#f0f0ec',
	ink: '#111316',
	ink2: '#3a3e45',
	muted: '#6c717a',
	faint: '#a0a4ab',
	line: 'rgba(17, 19, 22, 0.08)',
	lineStrong: 'rgba(17, 19, 22, 0.15)',
	accent: '#2f5bea',
	ring: 'rgba(47, 91, 234, 0.32)',
	pos: '#0d7a45',
	posBg: '#e8f5ee',
	warn: '#945700',
	warnBg: '#fff3dc',
	neg: '#b42318',
	negBg: '#fdecea',
	// Tone lines of the verdict and topic cards.
	toneUse: '#0d7a45',
	toneVerify: '#e39a00',
	toneAsk: '#e5484d',
	// Dark hero, as on the login page (.login-aside).
	dark: '#0e1013',
	darkRaised: '#22262e',
	darkText: '#f4f4f1',
	darkMuted: '#a8acb4',
	darkFaint: '#7d828b',
	teams: '#5b5fc7',
};

export const GRADES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_BG: Record<Grade, string> = {
	A: '#00a651',
	B: '#4cb848',
	C: '#bfd730',
	D: '#fff200',
	E: '#fdb913',
	F: '#f37021',
	G: '#ed1c24',
};
export const GRADE_FG: Record<Grade, string> = {
	A: '#ffffff',
	B: '#ffffff',
	C: '#1c2008',
	D: '#25230a',
	E: '#2a1d00',
	F: '#ffffff',
	G: '#ffffff',
};

// Same thresholds as trustlabel/engine.py (GRADE_THRESHOLDS); used only to label running scores mid-animation.
export const gradeFor = (score: number): Grade => {
	if (score >= 95) return 'A';
	if (score >= 80) return 'B';
	if (score >= 70) return 'C';
	if (score >= 60) return 'D';
	if (score >= 50) return 'E';
	if (score >= 40) return 'F';
	return 'G';
};

// The app's self-hosted fonts (static/fonts, SIL OFL), copied to public/fonts.
export const FONT = '"Geist", ui-sans-serif, system-ui, sans-serif';
export const MONO = '"Geist Mono", ui-monospace, monospace';
export const SERIF = '"Instrument Serif", ui-serif, Georgia, serif';
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;

// Shadows from the app (--shadow-sm / --shadow / --shadow-lg), a touch deeper to read at video scale.
export const SHADOW_SM = '0 1px 2px rgba(16, 20, 28, 0.05), 0 0 0 1px rgba(16, 20, 28, 0.04)';
export const SHADOW = '0 2px 4px rgba(16, 20, 28, 0.04), 0 18px 44px -18px rgba(16, 20, 28, 0.24), 0 0 0 1px rgba(16, 20, 28, 0.05)';
export const SHADOW_LG = '0 36px 90px -30px rgba(16, 20, 28, 0.4), 0 0 0 1px rgba(16, 20, 28, 0.06)';
