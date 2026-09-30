export interface TaskItemState {
	isTask: boolean;
	isChecked: boolean;
}

export function getTaskItemSortOrder(items: readonly TaskItemState[]): number[] | null {
	const unchecked: number[] = [];
	const checked: number[] = [];

	for (let index = 0; index < items.length; index++) {
		const item = items[index]!;
		if (!item.isTask) continue;
		(item.isChecked ? checked : unchecked).push(index);
	}

	if (checked.length === 0 || unchecked.length === 0) return null;
	return [...unchecked, ...checked];
}
