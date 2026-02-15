import { generateMaintenanceResponseDraft, MaintenanceRequestInput } from './automated-maintenance-response-drafts';
import { ai } from '@/ai/genkit';

// Mock the AI instance
jest.mock('@/ai/genkit', () => ({
    ai: {
        defineFlow: jest.fn((config, fn) => {
            const flow = (input: any) => fn(input);
            return flow;
        }),
        generate: jest.fn(),
    }
}));

// Mock vertexAI
jest.mock('@genkit-ai/google-genai', () => ({
    vertexAI: {
        model: jest.fn().mockReturnValue('mock-model'),
    }
}));

describe('Maintenance Response AI Flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should generate a response for valid input', async () => {
        const mockOutput = {
            draftResponse: 'Drafted response',
            suggestedActions: 'Suggested actions',
        };
        (ai.generate as jest.Mock).mockResolvedValue({ output: mockOutput });

        const input: MaintenanceRequestInput = {
            tenantName: 'Jane Smith',
            propertyAddress: 'Apt 4B, Hilltop',
            title: 'Blocked Sink',
            description: 'The sink in the main kitchen is blocked and water is not draining.',
            category: 'Plumbing',
            priority: 'Medium',
        };

        const result = await generateMaintenanceResponseDraft(input);

        expect(result).toEqual(mockOutput);
        expect(ai.generate).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining('Jane Smith'),
        }));
    });

    it('should throw error if AI generation fails', async () => {
        (ai.generate as jest.Mock).mockRejectedValue(new Error('AI Generation Error'));

        const input: MaintenanceRequestInput = {
            tenantName: 'Jane Smith',
            propertyAddress: 'Apt 4B, Hilltop',
            title: 'Blocked Sink',
            description: 'The sink in the main kitchen is blocked and water is not draining.',
            category: 'Plumbing',
            priority: 'Medium',
        };

        await expect(generateMaintenanceResponseDraft(input)).rejects.toThrow('AI Generation Error');
    });
});
