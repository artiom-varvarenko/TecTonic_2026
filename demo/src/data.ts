import raw from './data/demo-data.json';
import type {Grade} from './theme';

// Real API responses from the TrustLabel engine (see scripts/capture_demo_data.py).
export type Reason = {code: string; text: string; delta: number | null; cap: string | null};
export type Source = {
	id: string;
	kind: string;
	kind_label: string;
	title: string;
	source: string;
	author_name: string | null;
	owner_name: string | null;
	owner_active: boolean;
	created_on: string;
	last_reviewed_on: string | null;
	statement: string;
	quote: string;
	value: string;
	value_display: string;
	status: string;
	applicability: {code: string; text: string};
	score: number;
	grade: Grade;
	reasons: Reason[];
};
export type Competing = {value: string; value_display: string; best_grade: Grade; item_ids: string[]};
export type Answer = {
	status: string;
	action: 'use' | 'verify' | 'ask_expert';
	headline: string;
	detail: string;
	value: string | null;
	value_display: string | null;
	grade: Grade | null;
	competing: Competing[];
	verified_by: {id: string; name: string; title: string} | null;
};
export type Expert = {id: string; name: string; title: string; country: string; score: number; reasons: string[]};
export type AskResult = {
	topic: {id: string; label: string};
	context: {key: string; label: string; country: string; client_id: string | null};
	answer: Answer;
	sources: Source[];
	experts: Expert[];
};
export type Candidate = {value: string; value_display: string; item_id: string; title: string; grade: Grade};
export type DemoData = {
	today: string;
	question: string;
	before: AskResult;
	general_before: AskResult;
	after: AskResult;
	general_after: AskResult;
	request: {candidates: Candidate[]; assignee_name: string; requester_name: string; context_label: string};
	voice: {transcript: string; suggestion: {value: string; value_display: string; valid_until: string; quote: string}};
	resolved: {resolution: {value: string; value_display: string; valid_until: string}};
};

export const DATA = raw as unknown as DemoData;

export const source = (result: AskResult, id: string): Source => {
	const found = result.sources.find((s) => s.id === id);
	if (!found) throw new Error(`Source ${id} not in demo data`);
	return found;
};
