// src/app/lib/offer-letters/docxTemplate.ts
//
// Standalone DOCX mail-merge engine for the Offer Letter module. Independent
// of the recruitment offers system — no imports from backend/src/app/lib/offers/.
//
// Word frequently splits a single visible {{token}} across multiple internal
// <w:r> runs (usually because of autocorrect/spellcheck boundaries), even
// though it looks like one plain-text token on screen. If left alone, neither
// simple regex extraction nor docxtemplater's own tag matching will see the
// full token. normalizeParagraphRuns() rewrites any paragraph whose
// concatenated text contains a full {{...}} tag into a single run carrying
// that paragraph's plain text (keeping the paragraph's own formatting/
// alignment and the first run's character formatting) so the tag always
// lives inside one <w:t> node. This only touches paragraphs that actually
// contain a placeholder — everything else in the document (including every
// other paragraph, every table, every image, the whole letterhead) is passed
import Docxtemplater from 'docxtemplater';
// through completely untouched.
import PizZip from 'pizzip';

const TAG_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;
const DOCX_PART_NAME = /^word\/(document|header\d*|footer\d*)\.xml$/;

const XML_ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&apos;': "'",
};

function decodeXmlEntities(text: string): string {
	return text.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (m) => XML_ENTITIES[m]);
}

function encodeXmlEntities(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function normalizeParagraphRuns(xml: string): string {
	return xml.replace(/<w:p\b(?=[^>]*>)(?![^>]*\/>)\s*[^>]*>([\s\S]*?)<\/w:p>/g, (fullParagraph, inner: string) => {
		const texts: string[] = [];
		const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
		let match: RegExpExecArray | null;
		while ((match = textRegex.exec(inner))) {
			texts.push(decodeXmlEntities(match[1]));
		}
		const combined = texts.join('');

		if (!/\{\{\s*[\w.]+\s*\}\}/.test(combined)) {
			return fullParagraph;
		}

		const rPrMatch = inner.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
		const rPr = rPrMatch ? rPrMatch[0] : '';
		const pPrMatch = inner.match(/^<w:pPr>[\s\S]*?<\/w:pPr>/);
		const pPr = pPrMatch ? pPrMatch[0] : '';
		const pOpenMatch = fullParagraph.match(/^<w:p\b[^>]*>/);
		const pOpen = pOpenMatch ? pOpenMatch[0] : '<w:p>';

		const escaped = encodeXmlEntities(combined);
		return `${pOpen}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
	});
}

function getTemplatePartNames(zip: PizZip): string[] {
	return Object.keys(zip.files).filter((name) => DOCX_PART_NAME.test(name));
}

/**
 * Detects every {{variable}} placeholder used anywhere in the document body,
 * headers, or footers, in first-appearance order (deduped).
 */
export function extractVariables(fileBuffer: Buffer): string[] {
	const zip = new PizZip(fileBuffer);
	const found = new Set<string>();
	const ordered: string[] = [];

	for (const name of getTemplatePartNames(zip)) {
		const xml = zip.files[name].asText();
		const normalized = normalizeParagraphRuns(xml);

		TAG_PATTERN.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = TAG_PATTERN.exec(normalized))) {
			const key = match[1];
			if (!found.has(key)) {
				found.add(key);
				ordered.push(key);
			}
		}
	}

	return ordered;
}

export class MissingOfferLetterVariableError extends Error {
	constructor(public readonly variable: string) {
		super(`Missing value for variable "${variable}"`);
		this.name = 'MissingOfferLetterVariableError';
	}
}

// docxtemplater treats a dot inside a tag as nested-scope traversal — a tag
// written as {{candidate.fullName}} resolves against data.candidate.fullName,
// not a flat key literally named "candidate.fullName". Every other part of
// this module (extractVariables, the row processors, the stored
// variableValues JSON) works with the dotted string as one flat key, since
// that's the natural shape for a spreadsheet column / form field. This
// converts that flat shape into the nested object docxtemplater expects,
// right before rendering — the flat representation stays canonical
// everywhere else.
function toNestedRenderData(values: Record<string, string>): Record<string, any> {
	const nested: Record<string, any> = {};
	for (const [dottedKey, value] of Object.entries(values)) {
		const parts = dottedKey.split('.');
		let cursor = nested;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (typeof cursor[part] !== 'object' || cursor[part] === null) {
				cursor[part] = {};
			}
			cursor = cursor[part];
		}
		cursor[parts[parts.length - 1]] = value;
	}
	return nested;
}

/**
 * Renders a new .docx from the master template's bytes, substituting only
 * the {{variable}} placeholders — every font, table, image, and letterhead
 * element in the source document is preserved exactly.
 */
export function renderDocx(masterBuffer: Buffer, values: Record<string, string>): Buffer {
	const zip = new PizZip(masterBuffer);

	for (const name of getTemplatePartNames(zip)) {
		const xml = zip.files[name].asText();
		zip.file(name, normalizeParagraphRuns(xml));
	}

	const doc = new Docxtemplater(zip, {
		paragraphLoop: true,
		linebreaks: true,
		delimiters: { start: '{{', end: '}}' },
		nullGetter: (part: { value: string }) => {
			throw new MissingOfferLetterVariableError(part.value);
		},
	});

	doc.render(toNestedRenderData(values));

	return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}
