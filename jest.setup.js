'use strict';

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    return {
      text: jest.fn(),
      setFontSize: jest.fn(),
      setFont: jest.fn(),
      setDrawColor: jest.fn(),
      line: jest.fn(),
      save: jest.fn(),
      setTextColor: jest.fn(),
      lastAutoTable: { finalY: 0 },
    };
  }),
}));

jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: jest.fn(),
}));
