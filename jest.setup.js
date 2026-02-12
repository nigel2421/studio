'use strict';

console.log('jest.setup.js loaded');

jest.mock('jspdf', () => ({
  __esModule: true,
  jsPDF: jest.fn().mockImplementation(() => {
    console.log('jsPDF mock constructor called');
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
