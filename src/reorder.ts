import { ANY_CHECKBOX, getIndent } from './move-subtree';

export const CHECKED_CHECKBOX = /^(\s*)(?:[-*]|\d+\.)\s+\[[xX]\] /;

export interface LineSource {
	lineCount: number;
	getLine(index: number): string;
}

export interface ReorderPlan {
	groupStart: number;
	groupEnd: number;
	finalText: string;
	destinationLine: number;
	sourceLineAfterMove: number;
	movedLineCount: number;
}

interface CheckboxItem {
	lines: string[];
	checked: boolean;
}

export function planCheckedItemReorder(
	source: LineSource,
	checkedLine: number
): ReorderPlan | null {
	if (checkedLine < 0 || checkedLine >= source.lineCount) return null;

	const lineText = source.getLine(checkedLine);
	if (!CHECKED_CHECKBOX.test(lineText)) return null;

	const indent = getIndent(lineText);
	const { groupStart, groupEnd } = findSiblingGroup(source, checkedLine, indent);
	const items = parseItems(source, groupStart, groupEnd, indent);
	const checkedIndex = items.findIndex((item, index) => {
		const itemStart = groupStart + countItemLines(items, 0, index);
		return itemStart <= checkedLine && checkedLine < itemStart + item.lines.length;
	});

	let insertBeforeIndex = items.length;
	for (let index = items.length - 1; index >= 0; index--) {
		if (items[index]!.checked && index !== checkedIndex) {
			insertBeforeIndex = index;
		} else {
			break;
		}
	}

	const sourceLineOffset = countItemLines(items, 0, checkedIndex);
	const destinationIndex = insertBeforeIndex - 1;
	if (destinationIndex === checkedIndex) return null;

	const movedItem = items.splice(checkedIndex, 1)[0]!;
	items.splice(destinationIndex, 0, movedItem);

	return {
		groupStart,
		groupEnd,
		finalText: items.flatMap(item => item.lines).join('\n'),
		destinationLine: groupStart + countItemLines(items, 0, destinationIndex),
		sourceLineAfterMove: groupStart + sourceLineOffset,
		movedLineCount: movedItem.lines.length,
	};
}

function findSiblingGroup(
	source: LineSource,
	line: number,
	indent: number
): { groupStart: number; groupEnd: number } {
	let groupStart = line;
	while (groupStart > 0) {
		const previousText = source.getLine(groupStart - 1);
		if (getIndent(previousText) < indent || !ANY_CHECKBOX.test(previousText)) break;
		groupStart--;
	}
	if (getIndent(source.getLine(groupStart)) !== indent) groupStart = line;

	let groupEnd = line;
	while (groupEnd + 1 < source.lineCount) {
		const nextText = source.getLine(groupEnd + 1);
		if (getIndent(nextText) < indent || !ANY_CHECKBOX.test(nextText)) break;
		groupEnd++;
	}

	return { groupStart, groupEnd };
}

function parseItems(
	source: LineSource,
	groupStart: number,
	groupEnd: number,
	indent: number
): CheckboxItem[] {
	const items: CheckboxItem[] = [];
	let line = groupStart;

	while (line <= groupEnd) {
		const text = source.getLine(line);
		const lines = [text];
		let childLine = line + 1;
		while (childLine <= groupEnd) {
			const childText = source.getLine(childLine);
			if (getIndent(childText) <= indent) break;
			lines.push(childText);
			childLine++;
		}

		items.push({
			lines,
			checked: CHECKED_CHECKBOX.test(text),
		});
		line = childLine;
	}

	return items;
}

function countItemLines(
	items: readonly CheckboxItem[],
	startIndex: number,
	endIndex: number
): number {
	let count = 0;
	for (let index = startIndex; index < endIndex; index++) {
		count += items[index]!.lines.length;
	}
	return count;
}
