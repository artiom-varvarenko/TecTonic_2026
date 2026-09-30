// Render preview stills: node scripts/stills.mjs <frame> [<frame> ...]  →  out/still-<frame>.png
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';

const frames = process.argv.slice(2).map(Number);
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? null;
const composition = await selectComposition({serveUrl, id: 'TrustLabelDemo', browserExecutable});
for (const frame of frames) {
	await renderStill({composition, serveUrl, frame, output: `out/still-${frame}.png`, browserExecutable, scale: 0.5});
	console.log(`out/still-${frame}.png`);
}
