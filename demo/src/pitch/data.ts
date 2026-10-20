import raw from '../data/pitch-data.json';
import type {AskResult, Source} from '../data';

// Real engine output for the "four car policies" case (scripts/capture_pitch_data.py).
type Card = {body: {type: string; text?: string; facts?: {title: string; value: string}[]}[]};
export type PitchData = {
	today: string;
	question: string;
	before: AskResult & {auto_request: {question: string; assignee_name: string; requester_name: string; context_label: string}};
	request_card: Card;
	reply: string;
	resolution: {value: string; note: string; valid_until: string};
	resolved_card: Card;
	after: AskResult;
	pay_question: string;
	pay: {restricted: {message: string; contact: {name: string; title: string}}};
};

export const PITCH = raw as unknown as PitchData;

export const pitchSource = (result: AskResult, id: string): Source => {
	const found = result.sources.find((s) => s.id === id);
	if (!found) throw new Error(`Source ${id} not in pitch data`);
	return found;
};

/** Adaptive Card text with Teams' <at>…</at> mentions turned into plain "@Name". */
export const cardText = (text: string) => text.replace(/<at>(.*?)<\/at>/g, '@$1');
