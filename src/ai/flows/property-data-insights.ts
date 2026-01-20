'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { vertexAI } from '@genkit-ai/google-genai';

const PropertyInsightsInputSchema = z.object({
    propertyName: z.string().describe('The name of the property being analyzed.'),
    waterReadings: z.array(z.object({
        unitName: z.string(),
        consumption: z.number(),
        date: z.string(),
    })).describe('Historical water consumption data for the property.'),
    maintenanceRequests: z.array(z.object({
        details: z.string(),
        urgency: z.string(),
        status: z.string(),
        date: z.string(),
    })).describe('Historical maintenance requests for the property.'),
});

export type PropertyInsightsInput = z.infer<typeof PropertyInsightsInputSchema>;

const PropertyInsightsOutputSchema = z.object({
    summary: z.string().describe('A high-level summary of the property health and efficiency.'),
    anomalies: z.array(z.object({
        type: z.enum(['Leak Detection', 'High Consumption', 'Repetitive Issue', 'Urgent Maintenance']),
        description: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
        affectedUnits: z.array(z.string()),
    })).describe('Specific issues or patterns detected in the data.'),
    recommendations: z.array(z.object({
        title: z.string(),
        action: z.string(),
        benefit: z.string(),
    })).describe('Actionable steps to improve efficiency or living conditions.'),
});

export type PropertyInsightsOutput = z.infer<typeof PropertyInsightsOutputSchema>;

const propertyInsightsPrompt = ai.definePrompt({
    name: 'propertyInsightsPrompt',
    input: { schema: PropertyInsightsInputSchema },
    output: { schema: PropertyInsightsOutputSchema },
    prompt: `You are an expert AI Property Consultant. Analyze the following data for the development "{{{propertyName}}}" and provide management with strategic insights.

Data Provided:
- Water Consumption history: {{{json waterReadings}}}
- Maintenance requests history: {{{json maintenanceRequests}}}

Your goal:
1. Detect potential leaks (unusually high consumption compared to patterns).
2. Identify repetitive maintenance issues that might indicate structural problems or need for bulk repairs.
3. Suggest cost-saving measures (e.g., water-saving fixtures).
4. Recommend ways to improve resident well-being based on maintenance patterns.

Be specific and actionable.`,
});

const propertyInsightsFlow = ai.defineFlow(
    {
        name: 'propertyInsightsFlow',
        inputSchema: PropertyInsightsInputSchema,
        outputSchema: PropertyInsightsOutputSchema,
    },
    async input => {
        const { output } = await propertyInsightsPrompt(input, {
            model: vertexAI.model('gemini-1.5-flash-001'),
        });
        return output!;
    }
);

export async function generatePropertyInsights(input: PropertyInsightsInput): Promise<PropertyInsightsOutput> {
    return propertyInsightsFlow(input);
}
