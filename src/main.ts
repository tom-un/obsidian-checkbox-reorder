import { Plugin, MarkdownRenderChild } from 'obsidian';
import { EditorState, Transaction, TransactionSpec, Text, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

// Support -, *, and numbered list markers
const CHECKED = /^(\s*)(?:[-*]|\d+\.)\s+\[[xX]\] /;
const ANY_CHECKBOX = /^(\s*)(?:[-*]|\d+\.)\s+\[[ xX]\] /;

interface CheckboxItem {
	lines: string[];
	checked: boolean;
}

// Carries animation metadata through the transaction
interface AnimationInfo {
	destLineNumber: number;   // 1-based line in new doc where item landed
	sourceLineNumber: number; // 1-based line in new doc that NOW occupies source's old position
	linesMoved: number;       // how many lines the item spans
}

const animationEffect = StateEffect.define<AnimationInfo>();

function getIndent(text: string): number {
	const match = text.match(/^(\s*)/);
	return match ? match[1]!.length : 0;
}

export default class CheckboxReorderPlugin extends Plugin {
	async onload() {
		// Editor mode: transaction filter for atomic undo
		this.registerEditorExtension([
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

				const { groupStart, groupEnd, finalText, sourceIdx, destIdx, movedLineCount } = result;

				const startDoc = tr.startState.doc;
				const from = startDoc.line(groupStart).from;
				const to = startDoc.line(groupEnd).to;

				// Calculate which line the moved item lands on in the final doc
				let destLineInDoc = groupStart;
				for (let i = 0; i < destIdx; i++) {
					destLineInDoc += result.itemLineCounts[i]!;
				}

				// In the new doc, the line at sourceLineOffset now occupies
				// where the source item USED to be (items above didn't move)
				const sourceLineInNewDoc = groupStart + result.sourceLineOffset;

				return {
					changes: { from, to, insert: finalText },
					annotations: Transaction.userEvent.of('checkbox-reorder'),
					effects: animationEffect.of({
						destLineNumber: destLineInDoc,
						sourceLineNumber: sourceLineInNewDoc,
						linesMoved: movedLineCount,
					}),
				};
			}),
			// ViewPlugin to perform the animation after DOM update
			ViewPlugin.fromClass(class {
				update(update: ViewUpdate) {
					for (const tr of update.transactions) {
						for (const effect of tr.effects) {
							if (effect.is(animationEffect)) {
								this.animate(update.view, effect.value);
							}
						}
					}
				}

				animate(view: EditorView, info: AnimationInfo) {
					requestAnimationFrame(() => {
						const { destLineNumber, sourceLineNumber, linesMoved } = info;
						if (destLineNumber === sourceLineNumber) return;

						// Source's old position = where sourceLineNumber now sits in the new doc
						const srcLine = view.state.doc.line(sourceLineNumber);
						const srcCoords = view.coordsAtPos(srcLine.from);
						if (!srcCoords) return;

						// Destination position
						const destLine = view.state.doc.line(destLineNumber);
						const destCoords = view.coordsAtPos(destLine.from);
						if (!destCoords) return;

						// Height spans multiple lines if the item has children
						const lastLineNum = Math.min(destLineNumber + linesMoved - 1, view.state.doc.lines);
						const lastLine = view.state.doc.line(lastLineNum);
						const lastCoords = view.coordsAtPos(lastLine.from);
						if (!lastCoords) return;

						const totalHeight = lastCoords.bottom - destCoords.top;
						const contentRect = view.contentDOM.getBoundingClientRect();

						const ghost = document.createElement('div');
						ghost.style.cssText = `
							position: fixed;
							left: ${contentRect.left}px;
							width: ${contentRect.width}px;
							top: ${srcCoords.top}px;
							height: ${totalHeight}px;
							background: var(--text-accent);
							opacity: 0.18;
							border-radius: 4px;
							pointer-events: none;
							z-index: 1000;
							transition: top 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 150ms ease-out 200ms;
						`;

						document.body.appendChild(ghost);

						// Force reflow then animate to destination
						ghost.offsetHeight;
						ghost.style.top = `${destCoords.top}px`;
						ghost.style.opacity = '0';

						setTimeout(() => ghost.remove(), 400);
					});
				}
			}),
		]);

		// Reading mode: sort checked items to bottom via DOM manipulation
		this.registerMarkdownPostProcessor((element, context) => {
			context.addChild(new ReadingViewSorter(element));
		});
	}

	private computeReorder(
		doc: Text,
		lineNum: number
	): {
		groupStart: number;
		groupEnd: number;
		finalText: string;
		sourceIdx: number;
		destIdx: number;
		movedLineCount: number;
		itemLineCounts: number[];
		sourceLineOffset: number;
	} | null {
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

		// Calculate source line offset before mutation
		let sourceLineOffset = 0;
		for (let i = 0; i < checkedIdx; i++) {
			sourceLineOffset += items[i]!.lines.length;
		}

		const movedItem = items.splice(checkedIdx, 1)[0]!;
		const adjustedInsert = insertBeforeIdx - 1;
		items.splice(adjustedInsert, 0, movedItem);

		const finalText = items.flatMap(item => item.lines).join('\n');
		const itemLineCounts = items.map(item => item.lines.length);

		return {
			groupStart,
			groupEnd,
			finalText,
			sourceIdx: checkedIdx,
			destIdx: adjustedInsert,
			movedLineCount: movedItem.lines.length,
			itemLineCounts,
			sourceLineOffset,
		};
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
