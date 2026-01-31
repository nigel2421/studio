/**
 * Parses a floor identifier from a unit name string.
 * This handles various formats like 'A-101', 'A101', 'GF-01', 'GF01', and '1405'.
 * @param unitName The name of the unit.
 * @returns The parsed floor identifier as a string, or null if not found.
 */
export const parseFloorFromUnitName = (unitName: string): string | null => {
    if (!unitName) return null;
    // Simple logic: returns the first character if it's a letter (e.g., 'A' from 'A101')
    const match = unitName.match(/^[A-Za-z]+/);
    if (match) {
        return match[0].toUpperCase();
    }
    // Tries to get the floor from a numeric name like '1405' -> '14'
    if (/^\d{3,}/.test(unitName)) {
        return unitName.slice(0, -2);
    }
    return null;
};
