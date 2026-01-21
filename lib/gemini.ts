import { GoogleGenAI } from "@google/genai";

export class GeminiEngine {
    private client: GoogleGenAI;

    constructor(apiKey: string) {
        this.client = new GoogleGenAI({ apiKey });
    }

    async generate(prompt: string, model: string = "gemini-2.0-flash-lite"): Promise<string | null> {
        try {
            const response = await this.client.models.generateContent({
                model: model,
                contents: [
                    {
                        parts: [
                            { text: prompt }
                        ]
                    }
                ]
            });

            // In the generated SDK, the response is a plain object conforming to GenerateContentResponse interface
            const candidate = response.candidates?.[0];
            const part = candidate?.content?.parts?.[0];

            if (part && typeof part.text === 'string') {
                return part.text;
            }

            return null;
        } catch (error) {
            console.error("Gemini Engine Error:", error);
            throw error;
        }
    }
}
