/**
 * Parses a floor identifier from a unit name string.
 * This handles various formats like 'A-101', 'A101', 'GF-01', 'GF01', and '1405'.
 * @param unitName The name of the unit.
 * @returns The parsed floor identifier as a string, or null if not found.
 */
export const parseFloorFromUnitName = (unitName: string): string | null => {
    if (!unitName) return null;

    // Case 1: Handle formats like 'A-101', 'GF-01', 'Block A-101', 'gma-annex-404'
    // We look for the last dash that is followed by a number (and optional letters)
    let match = unitName.match(/^(.+)-(\d+.*)$/);
    if (match && match[1]) {
        return match[1].trim().toUpperCase();
    }

    // Fallback for Case 1: if there's only one dash and it's not followed by a number as the start of the part
    match = unitName.match(/^(.+?)-/);
    if (match && match[1]) {
        return match[1].trim().toUpperCase();
    }

    // Case 2: Handle formats like 'A101', 'GF101' (letters followed by numbers)
    match = unitName.match(/^([a-zA-Z\s]+)(\d+.*)/);
    if (match && match[1]) {
        return match[1].trim().toUpperCase();
    }

    // Case 3: Handle numeric formats like '1405' -> '14'
    match = unitName.match(/^(\d{3,})$/);
    if (match && match[1] && match[1].length > 2) {
        return match[1].slice(0, -2);
    }

    // Fallback for names that might just be the floor, like 'GMA' if there are no numbers
    // or if the name doesn't fit other patterns (e.g. 'Penthouse')
    if (!/\d/.test(unitName)) {
        return unitName.toUpperCase();
    }

    // Fallback for any other pattern not yet caught e.g. GMA101
    const letterPrefix = unitName.match(/^[A-Za-z]+/);
    if (letterPrefix) {
        return letterPrefix[0].toUpperCase();
    }

    // If all else fails, return null
    return null;
};
