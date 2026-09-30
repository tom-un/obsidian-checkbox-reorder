import { describe, expect, it } from 'vitest';
import { getGhostVerticalPositions } from '../src/animation';

describe('getGhostVerticalPositions', () => {
	it('calculates the original position for a downward move', () => {
		expect(getGhostVerticalPositions(300, 100, 300)).toEqual({
			startY: 100,
			destinationY: 300,
		});
	});

	it('calculates the original position for an upward move', () => {
		expect(getGhostVerticalPositions(100, 300, 100)).toEqual({
			startY: 300,
			destinationY: 100,
		});
	});

	it('keeps a stationary item at its rendered position', () => {
		expect(getGhostVerticalPositions(125, 125, 125)).toEqual({
			startY: 125,
			destinationY: 125,
		});
	});
});
