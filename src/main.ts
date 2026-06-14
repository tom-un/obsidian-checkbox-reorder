import { Plugin, MarkdownRenderChild } from 'obsidian';
import { EditorState, Transaction, TransactionSpec, Text } from '@codemirror/state';

// Support -, *, and numbered list markers
const CHECKED = /^(\s*)(?:[-*]|\d+\.)\s+\[[xX]\] /;
const ANY_CHECKBOX = /^(\s*)(?:[-*]|\d+\.)\s+\[[ xX]\] /;

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
		// Editor mode: transaction filter for atomic undo
		this.registerEditorExtension(
			EditorState.transactionFilter.of((tr: Transaction): TransactionSpec | readonly TransactionSpec[] => {
				if (!tr.docChanged) return tr;
				if (tr.annotation(Transaction.userEvent) === 'checkbox-reorder') return tr;

				const newDoc = tr.newDoc;
				let checkedLineNum: number | null = null;

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

				const result = this.computeReorder(newDoc, checkedLineNum);
				if (!result) return tr;

				const { groupStart, groupEnd, finalText } = result;

				const startDoc = tr.startState.doc;
				const from = startDoc.line(groupStart).from;
				const to = startDoc.line(groupEnd).to;

				return {
					changes: { from, to, insert: finalText },
					annotations: Transaction.userEvent.of('checkbox-reorder'),
				};
			})
		);

		// Reading mode: sort checked items to bottom via DOM manipulation
		this.registerMarkdownPostProcessor((element, context) => {
			context.addChild(new ReadingViewSorter(element));
		});
	}

	private computeReorder(
		doc: Text,
		lineNum: number
	): { groupStart: number; groupEnd: number; finalText: string } | null {
		const lineText = doc.line(lineNum).text;
		const indent = getIndent(lineText);

		const { groupStart, groupEnd } = this.findSiblingGroup(doc, lineNum, indent);

		const items = this.parseItems(doc, groupStart, groupEnd, indent);

		const checkedIdx = items.findIndex((item, idx) => {
			let lineCount = groupStart;
			for (let i = 0; i < idx; i++) {
				lineCount += items[i]!.lines.length;
			}
			return lineCount <= lineNum && lineNum < lineCount + item.lines.length;
		});
		if (checkedIdx === -1) return null;

		let insertBeforeIdx = items.length;
		for (let i = items.length - 1; i >= 0; i--) {
			if (items[i]!.checked && i !== checkedIdx) {
				insertBeforeIdx = i;
			} else {
				break;
			}
		}

		if (checkedIdx >= insertBeforeIdx) return null;

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
				i++;
			}
		}

		return items;
	}
}

// Reading/preview mode: uses MutationObserver to re-sort DOM when checkboxes are toggled
class ReadingViewSorter extends MarkdownRenderChild {
	private observer!: MutationObserver;

	onload() {
		this.observer = new MutationObserver(() => {
			this.observer.disconnect();
			this.sort();
			this.startObserving();
		});
		this.sort();
		this.startObserving();
	}

	onunload() {
		this.observer.disconnect();
	}

	private startObserving() {
		this.observer.observe(this.containerEl, {
			attributes: true,
			attributeFilter: ['class'],
			subtree: true,
		});
	}

	private sort() {
		this.containerEl.querySelectorAll<HTMLElement>('ul.contains-task-list').forEach(list => {
			const items = Array.from(list.children) as HTMLElement[];
			const unchecked = items.filter(li =>
				li.classList.contains('task-list-item') && !li.classList.contains('is-checked')
			);
			const checked = items.filter(li =>
				li.classList.contains('task-list-item') && li.classList.contains('is-checked')
			);

			if (checked.length === 0 || unchecked.length === 0) return;
			for (const li of [...unchecked, ...checked]) list.appendChild(li);
		});
	}
}
