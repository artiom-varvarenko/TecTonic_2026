import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// The app's own fonts (copied from static/fonts), so rendering never depends on a font CDN.
loadFont({family: 'Geist', url: staticFile('fonts/geist-latin-wght-normal.woff2'), weight: '100 900'});
loadFont({family: 'Geist Mono', url: staticFile('fonts/geist-mono-latin-wght-normal.woff2'), weight: '100 900'});
loadFont({family: 'Instrument Serif', url: staticFile('fonts/instrument-serif-latin-400-normal.woff2'), weight: '400', style: 'normal'});
loadFont({family: 'Instrument Serif', url: staticFile('fonts/instrument-serif-latin-400-italic.woff2'), weight: '400', style: 'italic'});
