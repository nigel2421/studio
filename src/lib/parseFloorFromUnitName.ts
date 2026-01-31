/**
 * Parses a floor identifier from a unit name string.
 * This handles various formats like 'A-101', 'A101', 'GF-01', 'GF01', and '1405'.
 * @param unitName The name of the unit.
 * @returns The parsed floor identifier as a string, or null if not found.
 */
export const parseFloorFromUnitName = (unitName: string): string | null => {
    if (!unitName) return null;

    // Handles 'A-101' -> 'A', 'GF-01' -> 'GF'
    const hyphenMatch = unitName.match(/^([A-Za-z0-9]+)-/);
    if (hyphenMatch) {
        return hyphenMatch[1].toUpperCase();
    }

    // Handles 'A101' -> 'A', 'GF01' -> 'GF'
    const alphaPrefixMatch = unitName.match(/^([A-Za-z]+)\d+/);
    if (alphaPrefixMatch) {
        return alphaPrefixMatch[1].toUpperCase();
    }

    // Handles '1405' -> '14' (for purely numeric names with 3+ digits)
    const numericMatch = unitName.match(/^(\d{3,})/);
    if (numericMatch) {
        const numPart = numericMatch[1];
        return numPart.substring(0, numPart.length - 2);
    }

    return null; // No floor pattern detected
};
