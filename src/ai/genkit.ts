import {genkit} from 'genkit';
import {vertexAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [vertexAI({location: "us-central1"})],
  model: 'gemini-1.5-flash-latest',
});
