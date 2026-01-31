
import { parseFloorFromUnitName } from './parseFloorFromUnitName';

describe('parseFloorFromUnitName', () => {
    // Test cases for format: 'A-101', 'GF-01'
    test('should handle dash-separated formats', () => {
        expect(parseFloorFromUnitName('A-101')).toBe('A');
        expect(parseFloorFromUnitName('GF-01')).toBe('GF');
        expect(parseFloorFromUnitName('Block C - 303')).toBe('BLOCK C');
    });

    // Test cases for format: 'A101', 'GMA101'
    test('should handle letter-prefix formats without separators', () => {
        expect(parseFloorFromUnitName('A101')).toBe('A');
        expect(parseFloorFromUnitName('GMA202')).toBe('GMA');
    });

    // Test cases for numeric format: '1405' -> '14'
    test('should handle purely numeric formats', () => {
        expect(parseFloorFromUnitName('1405')).toBe('14');
        expect(parseFloorFromUnitName('301')).toBe('3');
        expect(parseFloorFromUnitName('1212')).toBe('12');
        expect(parseFloorFromUnitName('99')).toBe(null); // Should be at least 3 digits
    });

    // Test cases for names without numbers
    test('should handle non-numeric names as the floor itself', () => {
        expect(parseFloorFromUnitName('Penthouse')).toBe('PENTHOUSE');
        expect(parseFloorFromUnitName('Maisonette')).toBe('MAISONETTE');
    });

    // Edge cases
    test('should handle edge cases gracefully', () => {
        expect(parseFloorFromUnitName('')).toBe(null);
        expect(parseFloorFromUnitName('12')).toBe(null); // Too short for numeric rule
        expect(parseFloorFromUnitName('A')).toBe('A');
    });
    
    // Mixed cases
    test('should handle mixed and complex cases', () => {
        expect(parseFloorFromUnitName('gma-annex-404')).toBe('GMA-ANNEX');
        expect(parseFloorFromUnitName('block a 101')).toBe('BLOCK A');
    });
});
