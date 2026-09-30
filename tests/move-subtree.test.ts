import { describe, expect, it } from 'vitest';
import { planCheckboxSubtreeMove } from '../src/move-subtree';

function applyPlan(lines: string[], plan: NonNullable<ReturnType<typeof planCheckboxSubtreeMove>>): string[] {
	return [
		...lines.slice(0, plan.fromLine),
		...plan.replacement.split('\n'),
		...lines.slice(plan.toLine + 1),
	];
}

describe('planCheckboxSubtreeMove', () => {
	it('moves an item down together with all indented descendants', () => {
		const lines = [
			'- [ ] First',
			'  - [ ] First child',
			'    - [ ] First grandchild',
			'- [ ] Second',
			'  - [ ] Second child',
			'- [ ] Third',
		];

		const plan = planCheckboxSubtreeMove(lines, 0, 'down');

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'- [ ] Second',
			'  - [ ] Second child',
			'- [ ] First',
			'  - [ ] First child',
			'    - [ ] First grandchild',
			'- [ ] Third',
		]);
		expect(plan!.cursorLine).toBe(2);
	});

	it('moves an item up together with all indented descendants', () => {
		const lines = [
			'- [ ] First',
			'  - [ ] First child',
			'- [x] Second',
			'  Continued details',
			'  - [ ] Second child',
		];

		const plan = planCheckboxSubtreeMove(lines, 2, 'up');

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'- [x] Second',
			'  Continued details',
			'  - [ ] Second child',
			'- [ ] First',
			'  - [ ] First child',
		]);
		expect(plan!.cursorLine).toBe(0);
	});

	it('moves a nested item only among siblings at its indentation level', () => {
		const lines = [
			'- [ ] Parent',
			'  - [ ] First child',
			'    - [ ] Grandchild',
			'  - [ ] Second child',
			'- [ ] Next parent',
		];

		const plan = planCheckboxSubtreeMove(lines, 3, 'up');

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'- [ ] Parent',
			'  - [ ] Second child',
			'  - [ ] First child',
			'    - [ ] Grandchild',
			'- [ ] Next parent',
		]);
		expect(plan!.cursorLine).toBe(1);
	});

	it('supports unordered and numbered checkbox markers', () => {
		const lines = [
			'* [ ] Star item',
			'1. [X] Numbered item',
		];

		const plan = planCheckboxSubtreeMove(lines, 0, 'down');

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'1. [X] Numbered item',
			'* [ ] Star item',
		]);
	});

	it('does not move the first item up or the last item down', () => {
		const lines = [
			'- [ ] First',
			'- [ ] Last',
		];

		expect(planCheckboxSubtreeMove(lines, 0, 'up')).toBeNull();
		expect(planCheckboxSubtreeMove(lines, 1, 'down')).toBeNull();
	});

	it('does not move a non-checkbox line', () => {
		const lines = [
			'- Regular list item',
			'- [ ] Checkbox item',
		];

		expect(planCheckboxSubtreeMove(lines, 0, 'down')).toBeNull();
	});

	it('does not cross a non-checkbox sibling boundary', () => {
		const lines = [
			'- [ ] First',
			'- Regular list item',
			'- [ ] Second',
		];

		expect(planCheckboxSubtreeMove(lines, 0, 'down')).toBeNull();
		expect(planCheckboxSubtreeMove(lines, 2, 'up')).toBeNull();
	});

	it('does not move a child outside its parent', () => {
		const lines = [
			'- [ ] Parent',
			'  - [ ] Only child',
			'- [ ] Next parent',
		];

		expect(planCheckboxSubtreeMove(lines, 1, 'up')).toBeNull();
		expect(planCheckboxSubtreeMove(lines, 1, 'down')).toBeNull();
	});
});
