'use server';
/**
 * @fileOverview An AI agent for generating draft responses to tenant maintenance requests.
 *
 * - generateMaintenanceResponseDraft - A function that generates a draft response to a maintenance request.
 * - MaintenanceRequestInput - The input type for the generateMaintenanceResponseDraft function.
 * - MaintenanceResponseDraftOutput - The return type for the generateMaintenanceResponseDraft function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { vertexAI } from '@genkit-ai/google-genai';

const MaintenanceRequestInputSchema = z.object({
  tenantName: z.string().describe('The name of the tenant making the request.'),
  propertyAddress: z.string().describe('The address of the property.'),
  requestDetails: z.string().describe('Detailed description of the maintenance request.'),
  urgency: z.enum(['high', 'medium', 'low']).describe('The urgency of the request.'),
});
export type MaintenanceRequestInput = z.infer<typeof MaintenanceRequestInputSchema>;

const MaintenanceResponseDraftOutputSchema = z.object({
  draftResponse: z.string().describe('A draft response to the tenant regarding their maintenance request.'),
  suggestedActions: z.string().describe('Suggestions for additional actions, such as contacting outside resources.'),
});
export type MaintenanceResponseDraftOutput = z.infer<typeof MaintenanceResponseDraftOutputSchema>;

export async function generateMaintenanceResponseDraft(input: MaintenanceRequestInput): Promise<MaintenanceResponseDraftOutput> {
  return maintenanceResponseDraftFlow(input);
}

const maintenanceResponseDraftFlow = ai.defineFlow(
  {
    name: 'maintenanceResponseDraftFlow',
    inputSchema: MaintenanceRequestInputSchema,
    outputSchema: MaintenanceResponseDraftOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: vertexAI.model('gemini-2.5-flash-lite'),
      prompt: `You are an experienced property manager. A tenant has submitted a maintenance request, and you need to draft a response.

Tenant Name: ${input.tenantName}
Property Address: ${input.propertyAddress}
Request Details: ${input.requestDetails}
Urgency: ${input.urgency}

Draft a response to the tenant acknowledging their request, providing an estimated timeline for resolution, and any relevant instructions.
Also, suggest any additional actions that might be needed, such as contacting a plumber, electrician, or other outside resource.`,
      output: {
        schema: MaintenanceResponseDraftOutputSchema,
      },
    });
    return output!;
  }
);
