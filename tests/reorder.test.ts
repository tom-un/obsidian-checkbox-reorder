import { describe, expect, it } from 'vitest';
import {
	CHECKED_CHECKBOX,
	LineSource,
	planCheckedItemReorder,
} from '../src/reorder';

function source(lines: string[]): LineSource {
	return {
		lineCount: lines.length,
		getLine: index => lines[index]!,
	};
}

function applyPlan(lines: string[], plan: NonNullable<ReturnType<typeof planCheckedItemReorder>>): string[] {
	return [
		...lines.slice(0, plan.groupStart),
		...plan.finalText.split('\n'),
		...lines.slice(plan.groupEnd + 1),
	];
}

describe('CHECKED_CHECKBOX', () => {
	it('recognizes supported checked markers and rejects unchecked items', () => {
		expect(CHECKED_CHECKBOX.test('- [x] Dash')).toBe(true);
		expect(CHECKED_CHECKBOX.test('* [X] Star')).toBe(true);
		expect(CHECKED_CHECKBOX.test('12. [x] Numbered')).toBe(true);
		expect(CHECKED_CHECKBOX.test('- [ ] Open')).toBe(false);
	});
});

describe('planCheckedItemReorder', () => {
	it('moves a newly checked item before the trailing checked items', () => {
		const lines = [
			'- [ ] Open first',
			'- [x] Newly checked',
			'- [ ] Open second',
			'- [x] Previously checked first',
			'- [X] Previously checked second',
		];

		const plan = planCheckedItemReorder(source(lines), 1);

		expect(plan).toEqual({
			groupStart: 0,
			groupEnd: 4,
			finalText: [
				'- [ ] Open first',
				'- [ ] Open second',
				'- [x] Newly checked',
				'- [x] Previously checked first',
				'- [X] Previously checked second',
			].join('\n'),
			destinationLine: 2,
			sourceLineAfterMove: 1,
			movedLineCount: 1,
		});
		expect(applyPlan(lines, plan!)).toEqual(plan!.finalText.split('\n'));
	});

	it('moves a parent item together with its descendants', () => {
		const lines = [
			'Before',
			'- [x] Parent',
			'  - [ ] Child',
			'    - [ ] Grandchild',
			'- [ ] Open sibling',
			'- [x] Completed sibling',
			'After',
		];

		const plan = planCheckedItemReorder(source(lines), 1);

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'Before',
			'- [ ] Open sibling',
			'- [x] Parent',
			'  - [ ] Child',
			'    - [ ] Grandchild',
			'- [x] Completed sibling',
			'After',
		]);
		expect(plan!.destinationLine).toBe(2);
		expect(plan!.sourceLineAfterMove).toBe(1);
		expect(plan!.movedLineCount).toBe(3);
	});

	it('reorders a checked child only within its nested sibling group', () => {
		const lines = [
			'- [ ] Parent',
			'  - [x] Newly checked child',
			'    - [ ] Grandchild',
			'  - [ ] Open child',
			'  - [x] Completed child',
			'- [ ] Next parent',
		];

		const plan = planCheckedItemReorder(source(lines), 1);

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'- [ ] Parent',
			'  - [ ] Open child',
			'  - [x] Newly checked child',
			'    - [ ] Grandchild',
			'  - [x] Completed child',
			'- [ ] Next parent',
		]);
	});

	it('keeps a checked descendant with its parent when moving a sibling', () => {
		const lines = [
			'- [ ] Privacy/Security',
			'  - [x] Enable the build pipeline',
			'  - [ ] Figure out the security review process',
			'  - [ ] Email privacy review',
			'  - [ ] Review design',
			'  - [ ] Privacy follow up',
			'  - [ ] Clarify who is doing security',
			'    - [ ] Watch security kickoff',
			'    - [ ] Watch security sync',
			'    - [x] M365 compliance onboarding',
			'      - [x] Front line CELA',
			'      - [x] Autopilot UX spec',
			'  - [x] Rajesh',
			'  - [x] RAI test tenant',
			'- [ ] Next section',
		];

		const plan = planCheckedItemReorder(source(lines), 1);

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'- [ ] Privacy/Security',
			'  - [ ] Figure out the security review process',
			'  - [ ] Email privacy review',
			'  - [ ] Review design',
			'  - [ ] Privacy follow up',
			'  - [ ] Clarify who is doing security',
			'    - [ ] Watch security kickoff',
			'    - [ ] Watch security sync',
			'    - [x] M365 compliance onboarding',
			'      - [x] Front line CELA',
			'      - [x] Autopilot UX spec',
			'  - [x] Enable the build pipeline',
			'  - [x] Rajesh',
			'  - [x] RAI test tenant',
			'- [ ] Next section',
		]);
		expect(plan!.destinationLine).toBe(11);
		expect(plan!.sourceLineAfterMove).toBe(1);
	});

	it('supports star and numbered checkbox markers', () => {
		const lines = [
			'* [x] Star',
			'1. [ ] Numbered',
		];

		const plan = planCheckedItemReorder(source(lines), 0);

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'1. [ ] Numbered',
			'* [x] Star',
		]);
	});

	it('returns null for lines outside the document or without a checked checkbox', () => {
		const lines = ['- [ ] Open', 'Plain text'];
		const lineSource = source(lines);

		expect(planCheckedItemReorder(lineSource, -1)).toBeNull();
		expect(planCheckedItemReorder(lineSource, lines.length)).toBeNull();
		expect(planCheckedItemReorder(lineSource, 0)).toBeNull();
		expect(planCheckedItemReorder(lineSource, 1)).toBeNull();
	});

	it('returns null when the item is already in the trailing checked group', () => {
		const lines = [
			'- [ ] Open',
			'- [x] Completed first',
			'- [x] Completed last',
		];

		expect(planCheckedItemReorder(source(lines), 1)).toBeNull();
		expect(planCheckedItemReorder(source(lines), 2)).toBeNull();
	});

	it('stops a checkbox group at non-checkbox lines', () => {
		const lines = [
			'- [x] Isolated checked',
			'Paragraph',
			'- [ ] Separate open',
		];

		expect(planCheckedItemReorder(source(lines), 0)).toBeNull();
	});

	it('does not absorb a more deeply indented orphan before the current group', () => {
		const lines = [
			'    - [ ] Orphan',
			'  - [x] Checked child',
			'  - [ ] Open child',
		];

		const plan = planCheckedItemReorder(source(lines), 1);

		expect(plan).not.toBeNull();
		expect(applyPlan(lines, plan!)).toEqual([
			'    - [ ] Orphan',
			'  - [ ] Open child',
			'  - [x] Checked child',
		]);
	});
});
