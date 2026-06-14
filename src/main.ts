import { Plugin } from 'obsidian';
import { EditorState, Transaction, TransactionSpec, Text } from '@codemirror/state';

const CHECKED = /^(\s*)- \[[xX]\] /;
const ANY_CHECKBOX = /^(\s*)- \[[ xX]\] /;

interface CheckboxItem {
	lines: string[];
	checked: boolean;
}

function getIndent(text: string): number {
	const match = text.match(/^(\s*)/);
	return match ? match[1]!.length : 0;
}

export default class CheckboxReorderPlugin extends Plugin {
	async onload() {
		this.registerEditorExtension(
			EditorState.transactionFilter.of((tr: Transaction): TransactionSpec | readonly TransactionSpec[] => {
				if (!tr.docChanged) return tr;
				if (tr.annotation(Transaction.userEvent) === 'checkbox-reorder') return tr;

				const newDoc = tr.newDoc;
				let checkedLineNum: number | null = null;

				// Find the line that was just checked
				tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
					if (checkedLineNum !== null) return;

					const startLine = newDoc.lineAt(fromB).number;
					const endLine = newDoc.lineAt(toB).number;

					for (let num = startLine; num <= endLine; num++) {
						if (CHECKED.test(newDoc.line(num).text)) {
							checkedLineNum = num;
							return;
						}
					}
				});

				if (checkedLineNum === null) return tr;

				// Compute the reorder on newDoc (where toggle already happened)
				const result = this.computeReorder(newDoc, checkedLineNum);
				if (!result) return tr;

				const { groupStart, groupEnd, finalText } = result;

				// Since a checkbox toggle [ ] → [x] doesn't change document length,
				// line positions in newDoc are the same as in startDoc.
				// Replace the block in the original doc directly with final text
				// (which includes both the toggle and the reorder).
				const startDoc = tr.startState.doc;
				const from = startDoc.line(groupStart).from;
				const to = startDoc.line(groupEnd).to;

				return {
					changes: { from, to, insert: finalText },
					annotations: Transaction.userEvent.of('checkbox-reorder'),
				};
			})
		);
	}

	private computeReorder(
		doc: Text,
		lineNum: number
	): { groupStart: number; groupEnd: number; finalText: string } | null {
		const lineText = doc.line(lineNum).text;
		const indent = getIndent(lineText);

		const { groupStart, groupEnd } = this.findSiblingGroup(doc, lineNum, indent);

		// Parse into items at this indent level (each with children)
		const items = this.parseItems(doc, groupStart, groupEnd, indent);

		// Find which item was checked
		const checkedIdx = items.findIndex((item, idx) => {
			// The item that contains lineNum
			let lineCount = groupStart;
			for (let i = 0; i < idx; i++) {
				lineCount += items[i]!.lines.length;
			}
			return lineCount <= lineNum && lineNum < lineCount + item.lines.length;
		});
		if (checkedIdx === -1) return null;

		// Find insert position: just before trailing checked items
		let insertBeforeIdx = items.length;
		for (let i = items.length - 1; i >= 0; i--) {
			if (items[i]!.checked && i !== checkedIdx) {
				insertBeforeIdx = i;
			} else {
				break;
			}
		}

		if (checkedIdx >= insertBeforeIdx) return null;

		// Reorder
		const movedItem = items.splice(checkedIdx, 1)[0]!;
		const adjustedInsert = insertBeforeIdx - 1;
		items.splice(adjustedInsert, 0, movedItem);

		const finalText = items.flatMap(item => item.lines).join('\n');

		return { groupStart, groupEnd, finalText };
	}

	private findSiblingGroup(
		doc: Text,
		lineNum: number,
		indent: number
	): { groupStart: number; groupEnd: number } {
		let groupStart = lineNum;
		while (groupStart > 1) {
			const prevText = doc.line(groupStart - 1).text;
			const prevIndent = getIndent(prevText);
			if (prevIndent < indent) break;
			if (!ANY_CHECKBOX.test(prevText)) break;
			groupStart--;
		}

		let groupEnd = lineNum;
		while (groupEnd < doc.lines) {
			const nextText = doc.line(groupEnd + 1).text;
			const nextIndent = getIndent(nextText);
			if (nextIndent < indent) break;
			if (!ANY_CHECKBOX.test(nextText)) break;
			groupEnd++;
		}

		return { groupStart, groupEnd };
	}

	private parseItems(
		doc: Text,
		groupStart: number,
		groupEnd: number,
		indent: number
	): CheckboxItem[] {
		const items: CheckboxItem[] = [];

		let i = groupStart;
		while (i <= groupEnd) {
			const text = doc.line(i).text;
			const lineIndent = getIndent(text);

			if (lineIndent === indent && ANY_CHECKBOX.test(text)) {
				const lines: string[] = [text];
				let j = i + 1;
				while (j <= groupEnd) {
					const childText = doc.line(j).text;
					if (getIndent(childText) <= indent) break;
					lines.push(childText);
					j++;
				}

				items.push({
					lines,
					checked: CHECKED.test(text),
				});
				i = j;
			} else {
				// Shouldn't normally happen, but skip
				i++;
			}
		}

		return items;
	}
}
