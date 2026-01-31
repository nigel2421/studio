/**
 * Parses a floor identifier from a unit name string.
 * This handles various formats like 'A101', 'GF-01', '1204'.
 * @param unitName The name of the unit.
 * @returns The parsed floor identifier as a string, or null if not found.
 */
export const parseFloorFromUnitName = (unitName: string): string | null => {
  if (!unitName) return null;

  // Case 1: Alphabetic prefix (e.g., A101, B-203, GF-01)
  const alphaPrefixMatch = unitName.match(/^([a-zA-Z]+)/);
  if (alphaPrefixMatch) {
    const block = alphaPrefixMatch[1].toUpperCase();
    const numberPart = unitName.substring(block.length).replace(/[^0-9]/g, '');

    // If there's a number part and it's long enough, extract the floor from it.
    if (numberPart && numberPart.length >= 3) {
      const floorFromNumber = numberPart.slice(0, numberPart.length - 2);
      // Heuristic: If block is just one letter and floor is numeric, prefer the number.
      // This correctly identifies floor '1' from 'A101' instead of 'A'.
      if (block.length === 1 && !isNaN(parseInt(floorFromNumber))) {
        return floorFromNumber;
      }
    }
    // Otherwise, the block itself is the floor identifier (e.g., 'GF' for Ground Floor).
    return block;
  }
  
  // Case 2: Purely numeric with floor encoding (e.g., 1204 -> floor 12)
  const numericMatch = unitName.match(/^(\d+)/);
  if (numericMatch) {
    const numberPart = numericMatch[1];
    if (numberPart.length >= 3) {
      // Assumes last two digits are the unit number on the floor.
      return numberPart.slice(0, numberPart.length - 2);
    }
    // If it's 1 or 2 digits, we assume it IS the floor number.
    return numberPart;
  }

  return null; // No parsable floor found
};
