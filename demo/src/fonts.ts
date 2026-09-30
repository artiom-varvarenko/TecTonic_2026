import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Bundled locally (from @fontsource), so rendering never depends on a font CDN.
for (const weight of ['400', '500', '600', '700', '800', '900']) {
	loadFont({family: 'Inter', url: staticFile(`fonts/inter-latin-${weight}-normal.woff2`), weight});
}
for (const weight of ['500', '700']) {
	loadFont({family: 'JetBrains Mono', url: staticFile(`fonts/jetbrains-mono-latin-${weight}-normal.woff2`), weight});
}
