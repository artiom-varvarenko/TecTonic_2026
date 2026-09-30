// Colours mirror static/styles.css of the TrustLabel app, so the video looks like the product.
export const C = {
	navy: '#0b1f3a',
	navyDeep: '#050f20',
	navyMid: '#153260',
	accent: '#1f5fbf',
	accentBright: '#6ea8ff',
	bg: '#f3f5f8',
	card: '#ffffff',
	text: '#1b2430',
	muted: '#5d6b7c',
	border: '#dde3ea',
	green: '#0f8a3c',
	amber: '#b86e00',
	red: '#c62828',
	verify: '#f0a000',
	ink: 'rgba(255, 255, 255, 0.74)',
	inkSoft: 'rgba(255, 255, 255, 0.5)',
};

export const GRADES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_BG: Record<Grade, string> = {
	A: '#00A651',
	B: '#4CB848',
	C: '#BFD730',
	D: '#FFF200',
	E: '#FDB913',
	F: '#F37021',
	G: '#ED1C24',
};
export const GRADE_FG: Record<Grade, string> = {
	A: '#ffffff',
	B: '#ffffff',
	C: '#1b2430',
	D: '#1b2430',
	E: '#1b2430',
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

export const FONT = '"Inter", system-ui, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, monospace';
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
