import { generateTenantStatementPDF } from './pdf-generator';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tenant, Payment, Property, WaterMeterReading } from './types';
import * as financialLogic from './financial-logic';

// Mock the dependencies
jest.mock('jspdf');
jest.mock('jspdf-autotable');

// Mock the financial logic dependency
jest.mock('./financial-logic', () => ({
    generateLedger: jest.fn(),
}));

const mockGenerateLedger = financialLogic.generateLedger as jest.Mock;

describe('PDF Generation', () => {
    const mockJsPDFInstance = {
        text: jest.fn(),
        setFontSize: jest.fn(),
        setFont: jest.fn(),
        setDrawColor: jest.fn(),
        line: jest.fn(),
        save: jest.fn(),
        setTextColor: jest.fn(),
    };
    
    beforeEach(() => {
        jest.clearAllMocks();
        (jsPDF as jest.Mock).mockImplementation(() => mockJsPDFInstance);
    });

    it('generateTenantStatementPDF should generate a PDF with correct ledger data', () => {
        // Arrange
        const mockTenant: Tenant = {
            id: 't1', name: 'John Doe', email: 'j@d.com', phone: '123', idNumber: '123',
            propertyId: 'p1', unitName: 'U1', agent: 'Susan', status: 'active',
            residentType: 'Tenant', dueBalance: 500, accountBalance: 0,
            securityDeposit: 20000, waterDeposit: 5000,
            lease: { rent: 20000, startDate: '2023-01-01', endDate: '2024-01-01', paymentStatus: 'Pending' }
        };
        const mockPayments: Payment[] = [];
        const mockWaterReadings: WaterMeterReading[] = [];
        const mockProperties: Property[] = [{
            id: 'p1', name: 'Test Property', address: '123 Test', type: 'Residential', imageId: '1',
            units: [{ name: 'U1', unitType: 'One Bedroom', status: 'rented', ownership: 'Landlord' }]
        }];
        
        // Mock generateLedger to return predictable data
        mockGenerateLedger.mockImplementation((tenant, payments, properties, waterReadings, owner, asOf, options) => {
            if (options && !options.includeWater) { // Rent ledger
                return {
                    ledger: [
                        { id: 'charge1', date: '2023-01-01', description: 'Rent for Jan', charge: 20000, payment: 0, balance: 20000, forMonth: 'Jan 2023' },
                        { id: 'payment1', date: '2023-01-05', description: 'Payment Received', charge: 0, payment: 20000, balance: 0, forMonth: 'Jan 2023' },
                    ],
                    finalDueBalance: 0,
                    finalAccountBalance: 0,
                };
            }
             if (options && !options.includeRent) { // Water ledger
                return {
                     ledger: [
                        { id: 'water1', date: '2023-01-15', description: 'Water Bill for Jan', charge: 500, payment: 0, balance: 500, forMonth: 'Jan 2023' },
                    ],
                    finalDueBalance: 500,
                    finalAccountBalance: 0,
                }
            }
            return { ledger: [], finalDueBalance: 0, finalAccountBalance: 0 };
        });

        // Act
        generateTenantStatementPDF(mockTenant, mockPayments, mockProperties, mockWaterReadings, 'full');

        // Assert
        expect(jsPDF).toHaveBeenCalled();
        expect(mockJsPDFInstance.text).toHaveBeenCalledWith(expect.stringContaining('John Doe'), expect.any(Number), expect.any(Number));
        expect(mockJsPDFInstance.text).toHaveBeenCalledWith(expect.stringContaining('Unit: U1'), expect.any(Number), expect.any(Number));
        
        // Check that autoTable was called for the rent ledger
        const rentAutoTableCall = (autoTable as jest.Mock).mock.calls.find(call => call[1].head[0].includes('For Month'));
        expect(rentAutoTableCall).toBeDefined();
        expect(rentAutoTableCall[1].body).toHaveLength(2);
        expect(rentAutoTableCall[1].body[0][2]).toBe('Rent for Jan');
        expect(rentAutoTableCall[1].body[1][2]).toBe('Payment Received');
        
        // Check that autoTable was called for the water ledger
        const waterAutoTableCall = (autoTable as jest.Mock).mock.calls.find(call => call[1].head[0].includes('Prior Rd'));
        expect(waterAutoTableCall).toBeDefined();
        expect(waterAutoTableCall[1].body).toHaveLength(1);
        
        expect(mockJsPDFInstance.save).toHaveBeenCalledWith(expect.stringMatching(/statement_john_doe_full_.+\.pdf/));
    });
});
