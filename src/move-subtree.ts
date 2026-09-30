export const ANY_CHECKBOX = /^(\s*)(?:[-*]|\d+\.)\s+\[[ xX]\] /;

export type MoveDirection = 'up' | 'down';

export interface MovePlan {
	fromLine: number;
	toLine: number;
	replacement: string;
	cursorLine: number;
}

export function getIndent(text: string): number {
	return text.search(/\S|$/);
}

export function planCheckboxSubtreeMove(
	lines: readonly string[],
	currentStart: number,
	direction: MoveDirection
): MovePlan | null {
	const currentText = lines[currentStart];
	if (currentText === undefined || !ANY_CHECKBOX.test(currentText)) return null;

	const indent = getIndent(currentText);
	const currentEnd = findSubtreeEnd(lines, currentStart, indent);

	if (direction === 'up') {
		const previousStart = findPreviousSibling(lines, currentStart, indent);
		if (previousStart === null) return null;

		return {
			fromLine: previousStart,
			toLine: currentEnd,
			replacement: [
				...lines.slice(currentStart, currentEnd + 1),
				...lines.slice(previousStart, currentStart),
			].join('\n'),
			cursorLine: previousStart,
		};
	}

	const nextStart = currentEnd + 1;
	const nextText = lines[nextStart];
	if (nextText === undefined || getIndent(nextText) !== indent || !ANY_CHECKBOX.test(nextText)) {
		return null;
	}

	const nextEnd = findSubtreeEnd(lines, nextStart, indent);
	return {
		fromLine: currentStart,
		toLine: nextEnd,
		replacement: [
			...lines.slice(nextStart, nextEnd + 1),
			...lines.slice(currentStart, currentEnd + 1),
		].join('\n'),
		cursorLine: currentStart + nextEnd - nextStart + 1,
	};
}

function findSubtreeEnd(lines: readonly string[], startLine: number, indent: number): number {
	let endLine = startLine;
	while (endLine + 1 < lines.length) {
		if (getIndent(lines[endLine + 1]!) <= indent) break;
		endLine++;
	}
	return endLine;
}

function findPreviousSibling(
	lines: readonly string[],
	currentStart: number,
	indent: number
): number | null {
	let line = currentStart - 1;
	while (line >= 0 && getIndent(lines[line]!) > indent) {
		line--;
	}

	if (line < 0) return null;
	const text = lines[line]!;
	return getIndent(text) === indent && ANY_CHECKBOX.test(text) ? line : null;
}
