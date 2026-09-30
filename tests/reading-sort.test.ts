import { describe, expect, it } from 'vitest';
import { getTaskItemSortOrder } from '../src/reading-sort';

describe('getTaskItemSortOrder', () => {
	it('places unchecked tasks before checked tasks', () => {
		expect(getTaskItemSortOrder([
			{ isTask: true, isChecked: true },
			{ isTask: true, isChecked: false },
			{ isTask: true, isChecked: true },
			{ isTask: true, isChecked: false },
		])).toEqual([1, 3, 0, 2]);
	});

	it('ignores non-task elements while preserving task order', () => {
		expect(getTaskItemSortOrder([
			{ isTask: false, isChecked: false },
			{ isTask: true, isChecked: true },
			{ isTask: false, isChecked: true },
			{ isTask: true, isChecked: false },
		])).toEqual([3, 1]);
	});

	it('does nothing when all tasks have the same state', () => {
		expect(getTaskItemSortOrder([
			{ isTask: true, isChecked: false },
			{ isTask: true, isChecked: false },
		])).toBeNull();
		expect(getTaskItemSortOrder([
			{ isTask: true, isChecked: true },
			{ isTask: true, isChecked: true },
		])).toBeNull();
		expect(getTaskItemSortOrder([
			{ isTask: false, isChecked: false },
		])).toBeNull();
	});
});
