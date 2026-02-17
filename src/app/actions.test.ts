import { performSendArrearsReminder, performSendServiceChargeInvoice, getMaintenanceResponseDraft, performProcessMoveOuts } from './actions';
import { getTenant, logCommunication, processOverdueNotices } from '@/lib/data';
import { sendCustomEmail } from '@/lib/firebase';
import { generateArrearsServiceChargeInvoicePDF } from '@/lib/pdf-generator';
import { generateMaintenanceResponseDraft, MaintenanceRequestInput } from '@/ai/flows/automated-maintenance-response-drafts';
import { Tenant } from '@/lib/types';

// Mock dependencies
jest.mock('@/lib/data');
jest.mock('@/lib/firebase');
jest.mock('@/lib/pdf-generator');
jest.mock('@/ai/flows/automated-maintenance-response-drafts');

describe('Server Actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('performSendArrearsReminder', () => {
        it('should send reminder if tenant has due balance', async () => {
            const mockTenant: Tenant = {
                id: 't1',
                name: 'John Doe',
                email: 'john@example.com',
                dueBalance: 5000,
            } as Tenant;
            (getTenant as unknown as jest.Mock).mockResolvedValue(mockTenant);
            (sendCustomEmail as unknown as jest.Mock).mockResolvedValue({ success: true, data: {} });

            const result = await performSendArrearsReminder('t1', 'admin1');

            expect(result.success).toBe(true);
            expect(sendCustomEmail).toHaveBeenCalledWith(expect.objectContaining({
                recipients: ['john@example.com'],
                subject: expect.stringContaining('Outstanding Account Balance'),
            }));
            expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
                status: 'sent',
                relatedTenantId: 't1',
            }));
        });

        it('should return error if tenant not found', async () => {
            (getTenant as unknown as jest.Mock).mockResolvedValue(null);

            const result = await performSendArrearsReminder('t1', 'admin1');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Tenant not found.');
        });

        it('should return error if tenant has no balance', async () => {
            (getTenant as unknown as jest.Mock).mockResolvedValue({ id: 't1', dueBalance: 0 });

            const result = await performSendArrearsReminder('t1', 'admin1');

            expect(result.success).toBe(false);
            expect(result.error).toBe('This resident has no outstanding balance.');
        });
    });

    describe('performSendServiceChargeInvoice', () => {
        it('should generate PDF and send email', async () => {
            const mockOwner = { name: 'Owner 1', email: 'owner@example.com' };
            const mockInvoice = {
                month: 'Jan 2026',
                items: [{ description: 'Service Charge', amount: 3000 }],
                totalDue: 3000,
            };
            (generateArrearsServiceChargeInvoicePDF as unknown as jest.Mock).mockReturnValue('mock-pdf-base64');
            (sendCustomEmail as unknown as jest.Mock).mockResolvedValue({ success: true, data: {} });

            const result = await performSendServiceChargeInvoice(
                'o1',
                'owner@example.com',
                'Owner 1',
                mockInvoice,
                mockOwner as any
            );

            expect(result.success).toBe(true);
            expect(generateArrearsServiceChargeInvoicePDF as unknown as jest.Mock).toHaveBeenCalled();
            expect(sendCustomEmail as unknown as jest.Mock).toHaveBeenCalledWith(expect.objectContaining({
                attachment: expect.objectContaining({
                    content: 'mock-pdf-base64',
                    filename: expect.stringContaining('Jan_2026.pdf'),
                }),
            }));
        });
    });

    describe('getMaintenanceResponseDraft', () => {
        it('should return AI draft on success', async () => {
            const mockInput: MaintenanceRequestInput = {
                tenantName: 'John',
                propertyAddress: '123 St',
                title: 'Leaking tap',
                description: 'The tap in the kitchen is leaking.',
                category: 'Plumbing',
                priority: 'High',
            };
            const mockOutput = { draftResponse: 'Hello John...', suggestedActions: 'Call plumber' };
            (generateMaintenanceResponseDraft as unknown as jest.Mock).mockResolvedValue(mockOutput);

            const result = await getMaintenanceResponseDraft(mockInput);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockOutput);
        });

        it('should handle AI errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            (generateMaintenanceResponseDraft as unknown as jest.Mock).mockRejectedValue(new Error('AI Busy'));

            const result = await getMaintenanceResponseDraft({} as any);

            expect(result.success).toBe(false);
            expect(result.error).toBe('AI Busy');
            consoleSpy.mockRestore();
        });
    });

    describe('performProcessMoveOuts', () => {
        it('should return a success message when notices are processed', async () => {
            (processOverdueNotices as jest.Mock).mockResolvedValue({ processedCount: 2, errorCount: 0 });

            const result = await performProcessMoveOuts('admin-id');

            expect(result.success).toBe(true);
            expect(result.data).toEqual({ message: 'Successfully processed 2 move-out notices.' });
            expect(processOverdueNotices).toHaveBeenCalledWith('admin-id');
        });

        it('should return a different success message when no notices are processed', async () => {
            (processOverdueNotices as jest.Mock).mockResolvedValue({ processedCount: 0, errorCount: 0 });

            const result = await performProcessMoveOuts('admin-id');

            expect(result.success).toBe(true);
            expect(result.data).toEqual({ message: 'No overdue move-out notices to process.' });
        });

        it('should return error message when processing fails with an exception', async () => {
            (processOverdueNotices as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

            const result = await performProcessMoveOuts('admin-id');

            expect(result.success).toBe(false);
            expect(result.error).toBe('DB connection failed');
        });
        
        it('should return an error message when some notices fail to process', async () => {
            (processOverdueNotices as jest.Mock).mockResolvedValue({ processedCount: 1, errorCount: 1 });
        
            const result = await performProcessMoveOuts('editor123');
        
            expect(result.success).toBe(false);
            expect(result.error).toBe('Processed 1 notices, but 1 failed.');
        });
    });
});
