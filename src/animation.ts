export interface GhostVerticalPositions {
	startY: number;
	destinationY: number;
}

export function getGhostVerticalPositions(
	destinationElementTop: number,
	sourceCoordinateTop: number,
	destinationCoordinateTop: number
): GhostVerticalPositions {
	return {
		startY: destinationElementTop - (destinationCoordinateTop - sourceCoordinateTop),
		destinationY: destinationElementTop,
	};
}
