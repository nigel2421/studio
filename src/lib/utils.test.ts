import { downloadCSV, cn } from './utils';

// Mock the Blob constructor and URL.createObjectURL
const mockBlob = jest.fn();
(global as any).Blob = mockBlob;
const mockCreateObjectURL = jest.fn(() => 'mock-url');
(global as any).URL.createObjectURL = mockCreateObjectURL;

describe('Utility Functions', () => {
  let link: HTMLAnchorElement;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBlob.mockClear();

    // Setup a more robust mock for the anchor element
    link = document.createElement('a');
    jest.spyOn(document, 'createElement').mockReturnValue(link);
    jest.spyOn(document.body, 'appendChild');
    jest.spyOn(document.body, 'removeChild');
    jest.spyOn(link, 'click').mockImplementation(() => {});
  });

  describe('downloadCSV', () => {
    it('should create a CSV blob and trigger a download', () => {
      const data = [{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Smith' }];
      const filename = 'test.csv';

      downloadCSV(data, filename);
      
      expect(mockBlob).toHaveBeenCalledWith(
        ['id,name\n1,John Doe\n2,Jane Smith'],
        { type: 'text/csv;charset=utf-8;' }
      );
      
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(link.href).toContain('mock-url'); // createObjectURL result
      expect(link.download).toBe(filename);
      
      expect(document.body.appendChild).toHaveBeenCalledWith(link);
      expect(link.click).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalledWith(link);
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

  describe('cn', () => {
    it('should merge tailwind classes correctly', () => {
      expect(cn('p-4', 'p-2', 'bg-red-500')).toBe('p-2 bg-red-500');
      expect(cn('text-lg', { 'font-bold': true, 'font-normal': false })).toBe('text-lg font-bold');
    });
  });
});
