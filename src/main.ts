import { Editor, Plugin, MarkdownRenderChild } from 'obsidian';
import { EditorState, Transaction, TransactionSpec, StateEffect, EditorSelection } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { getGhostVerticalPositions } from './animation';
import { planCheckboxSubtreeMove } from './move-subtree';
import { getTaskItemSortOrder } from './reading-sort';
import { CHECKED_CHECKBOX, planCheckedItemReorder } from './reorder';
import type { MoveDirection, MovePlan } from './move-subtree';

const MOVE_SUBTREE_EVENT = 'move-checkbox-subtree';

// Carries animation metadata through the transaction
interface AnimationInfo {
	destLineNumber: number;   // 1-based line in new doc where item landed
	sourceLineNumber: number; // 1-based line in new doc that NOW occupies source's old position
	linesMoved: number;       // how many lines the item spans
}

const animationEffect = StateEffect.define<AnimationInfo>();

export default class CheckboxReorderPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: 'move-checkbox-item-up',
			name: 'Move TODO item up with sub-items',
			editorCheckCallback: (checking, editor) => {
				const plan = this.getMovePlan(editor, 'up');
				if (!plan) return false;
				if (!checking) this.applyMovePlan(editor, plan);
				return true;
			},
		});

		this.addCommand({
			id: 'move-checkbox-item-down',
			name: 'Move TODO item down with sub-items',
			editorCheckCallback: (checking, editor) => {
				const plan = this.getMovePlan(editor, 'down');
				if (!plan) return false;
				if (!checking) this.applyMovePlan(editor, plan);
				return true;
			},
		});

		// Editor mode: transaction filter for atomic undo
		this.registerEditorExtension([
			EditorState.transactionFilter.of((tr: Transaction): TransactionSpec | readonly TransactionSpec[] => {
				if (!tr.docChanged) return tr;
				const userEvent = tr.annotation(Transaction.userEvent);
				if (userEvent === 'checkbox-reorder' || userEvent === MOVE_SUBTREE_EVENT) return tr;

				const newDoc = tr.newDoc;
				let checkedLineNum: number | null = null;

				tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
					if (checkedLineNum !== null) return;

					const startLine = newDoc.lineAt(fromB).number;
					const endLine = newDoc.lineAt(toB).number;

					for (let num = startLine; num <= endLine; num++) {
						if (CHECKED_CHECKBOX.test(newDoc.line(num).text)) {
							checkedLineNum = num;
							return;
						}
					}
				});

				if (checkedLineNum === null) return tr;

				const result = planCheckedItemReorder({
					lineCount: newDoc.lines,
					getLine: index => newDoc.line(index + 1).text,
				}, checkedLineNum - 1);
				if (!result) return tr;

				const { groupStart, groupEnd, finalText, movedLineCount } = result;

				const startDoc = tr.startState.doc;
				const from = startDoc.line(groupStart + 1).from;
				const to = startDoc.line(groupEnd + 1).to;

				// Compute cursor position within finalText at the line that now
				// occupies the clicked row's position (to prevent scroll jump)
				let cursorOffset = 0;
				const lines = finalText.split('\n');
				const targetLineIdx = result.sourceLineAfterMove - groupStart;
				for (let i = 0; i < targetLineIdx && i < lines.length; i++) {
					cursorOffset += lines[i]!.length + 1;
				}

				return {
					changes: { from, to, insert: finalText },
					selection: EditorSelection.cursor(from + cursorOffset),
					annotations: Transaction.userEvent.of('checkbox-reorder'),
					effects: animationEffect.of({
						destLineNumber: result.destinationLine + 1,
						sourceLineNumber: result.sourceLineAfterMove + 1,
						linesMoved: movedLineCount,
					}),
				};
			}),
			// ViewPlugin to perform the animation after DOM update
			ViewPlugin.fromClass(class {
				suppressScroll: boolean = false;
				savedScrollTop: number = 0;

				constructor(private view: EditorView) {
					this.view.scrollDOM.addEventListener('scroll', this.onScroll);
				}

				destroy() {
					this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
				}

				onScroll = () => {
					if (this.suppressScroll) {
						this.view.scrollDOM.scrollTop = this.savedScrollTop;
						this.suppressScroll = false;
					}
				};

				update(update: ViewUpdate) {
					for (const tr of update.transactions) {
						for (const effect of tr.effects) {
							if (effect.is(animationEffect)) {
								// Save scroll and suppress any upcoming scroll event
								this.savedScrollTop = this.view.scrollDOM.scrollTop;
								this.suppressScroll = true;
								// Also force restore after a frame in case no scroll event fires
								window.requestAnimationFrame(() => {
									if (this.suppressScroll) {
										this.view.scrollDOM.scrollTop = this.savedScrollTop;
										this.suppressScroll = false;
									}
								});
								this.animate(update.view, effect.value);
							}
						}
					}
				}

				animate = (view: EditorView, info: AnimationInfo) => {
					window.requestAnimationFrame(() => {
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

						// Find the actual line DOM elements and get their bounding rects
						const lineEls: HTMLElement[] = [];
						for (let i = 0; i < linesMoved; i++) {
							const lineNum = destLineNumber + i;
							if (lineNum > view.state.doc.lines) break;
							const line = view.state.doc.line(lineNum);
							const domInfo = view.domAtPos(line.from);
							let lineEl: HTMLElement | null = domInfo.node.nodeType === 1
								? (domInfo.node as HTMLElement)
								: domInfo.node.parentElement;
							while (lineEl && !lineEl.classList.contains('cm-line')) {
								lineEl = lineEl.parentElement;
							}
							if (lineEl) lineEls.push(lineEl);
						}

						if (lineEls.length === 0) return;

						// Use the first line element's actual rect as the reference position
						const firstRect = lineEls[0]!.getBoundingClientRect();
						const { startY, destinationY } = getGhostVerticalPositions(
							firstRect.top,
							srcCoords.top,
							destCoords.top
						);

						const doc = view.dom.ownerDocument;

						// Create ghost container positioned at the source's old location
						const ghost = doc.createElement('div');
						ghost.setCssStyles({
							position: 'fixed',
							top: `${startY}px`,
							left: `${firstRect.left}px`,
							pointerEvents: 'none',
							zIndex: '1000',
							opacity: '0.5',
							transition: 'top 500ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 200ms ease-out 400ms',
						});

						// Clone each line, preserving its horizontal offset relative to the first
						for (const el of lineEls) {
							const rect = el.getBoundingClientRect();
							const clone = el.cloneNode(true) as HTMLElement;
							const offsetX = rect.left - firstRect.left;
							clone.setCssStyles({
								position: 'relative',
								left: `${offsetX}px`,
								width: `${rect.width}px`,
								height: `${rect.height}px`,
								margin: '0',
								padding: getComputedStyle(el).padding,
							});
							ghost.appendChild(clone);
						}

						doc.body.appendChild(ghost);

						// Force reflow then animate to destination
						void ghost.offsetHeight;
						ghost.setCssStyles({ top: `${destinationY}px`, opacity: '0' });

						window.setTimeout(() => ghost.remove(), 700);
					});
				};
			}),
		]);

		// Reading mode: sort checked items to bottom via DOM manipulation
		this.registerMarkdownPostProcessor((element, context) => {
			context.addChild(new ReadingViewSorter(element));
		});
	}

	private getMovePlan(this: void, editor: Editor, direction: MoveDirection): MovePlan | null {
		const lines: string[] = [];
		for (let line = 0; line < editor.lineCount(); line++) {
			lines.push(editor.getLine(line));
		}
		return planCheckboxSubtreeMove(lines, editor.getCursor().line, direction);
	}

	private applyMovePlan(this: void, editor: Editor, plan: MovePlan) {
		const cursor = editor.getCursor();
		editor.transaction({
			changes: [{
				from: { line: plan.fromLine, ch: 0 },
				to: { line: plan.toLine, ch: editor.getLine(plan.toLine).length },
				text: plan.replacement,
			}],
			selection: {
				from: {
					line: plan.cursorLine,
					ch: Math.min(cursor.ch, editor.getLine(cursor.line).length),
				},
			},
		}, MOVE_SUBTREE_EVENT);
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
			const order = getTaskItemSortOrder(items.map(item => ({
				isTask: item.classList.contains('task-list-item'),
				isChecked: item.classList.contains('is-checked'),
			})));

			if (!order) return;
			for (const index of order) list.appendChild(items[index]!);
		});
	}
}
