import { GoogleGenAI } from '@google/genai';

interface Env {
    GEMINI_API_KEY: string;
}

// Define PagesFunction if not available globally in this context
type PagesFunction<T> = (context: { request: Request, env: T }) => Promise<Response>;

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { request, env } = context;
        const body = await request.json() as { image: string, mimeType: string, prompt?: string };

        if (!body.image) {
            return new Response(JSON.stringify({ error: "Image data is required" }), { status: 400 });
        }

        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Server Configuration Error: Missing API Key" }), { status: 500 });
        }

        // Initialize the client
        const ai = new GoogleGenAI({ apiKey: apiKey });

        // Prepare inputs
        const modelId = "gemini-2.5-flash-lite"; // User requested specific model
        const promptText = body.prompt || "Analyze this image and extract all relevant information.";

        // Call the API
        const response = await ai.models.generateContent({
            model: modelId,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptText },
                        {
                            inlineData: {
                                mimeType: body.mimeType || "image/png",
                                data: body.image
                            }
                        }
                    ]
                }
            ]
        });

        // Extract text from response
        const resultText = response.candidates?.[0]?.content?.parts?.[0]?.text || "No text result found.";

        return new Response(JSON.stringify({ text: resultText }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return new Response(JSON.stringify({ error: "Failed to process image", details: error.message || String(error) }), { status: 500 });
    }
};
