import { downloadCSV, cn } from './utils';

// Mock the Blob constructor
const mockBlob = jest.fn();
(global as any).Blob = mockBlob;

// Mocking the DOM environment for URL and document
const mockCreateObjectURL = jest.fn(() => 'mock-url');
if (typeof window.URL.createObjectURL === 'undefined') {
  Object.defineProperty(window.URL, 'createObjectURL', { value: mockCreateObjectURL });
}

const mockLink = {
  click: jest.fn(),
  setAttribute: jest.fn(),
  style: { visibility: '' },
  download: '', // The presence of this property is checked in the function
};
const mockAppendChild = jest.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
const mockRemoveChild = jest.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
jest.spyOn(document, 'createElement').mockImplementation(() => mockLink as any);


describe('Utility Functions', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockBlob.mockClear();
    });

    describe('downloadCSV', () => {
        it('should create a CSV blob and trigger a download', () => {
            const data = [{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Smith' }];
            const filename = 'test.csv';

            downloadCSV(data, filename);
            
            // Check that a Blob was created
            expect(mockBlob).toHaveBeenCalledWith(
                ['id,name\n1,John Doe\n2,Jane Smith'],
                { type: 'text/csv;charset=utf-8;' }
            );

            // Check that the link was created and configured
            expect(document.createElement).toHaveBeenCalledWith('a');
            expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'mock-url');
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', filename);
            
            // Check that the link was appended, clicked, and removed
            expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
            expect(mockLink.click).toHaveBeenCalled();
            expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);
        });

        it('should handle special characters correctly', () => {
            const data = [{ description: 'A value with, a comma', notes: 'A "quote" inside' }];
            downloadCSV(data, 'special.csv');
            
            expect(mockBlob).toHaveBeenCalledWith(
                ['description,notes\n"A value with, a comma","A ""quote"" inside"'],
                { type: 'text/csv;charset=utf-8;' }
            );
        });

        it('should not do anything if data is empty', () => {
            downloadCSV([], 'empty.csv');
            expect(mockBlob).not.toHaveBeenCalled();
        });
    });
    
    // Simple test for cn just to ensure it's functioning as expected
    describe('cn', () => {
        it('should merge tailwind classes correctly', () => {
            expect(cn('p-4', 'p-2', 'bg-red-500')).toBe('p-2 bg-red-500');
            expect(cn('text-lg', { 'font-bold': true, 'font-normal': false })).toBe('text-lg font-bold');
        });
    });
});
