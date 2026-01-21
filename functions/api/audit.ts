import { GeminiEngine } from "../../lib/gemini";

interface Env {
    GOOGLE_AI_KEY: string;
}

interface AuditRequest {
    auditData: any[];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const request = context.request;
    const env = context.env;

    try {
        const body = await request.json<AuditRequest>();
        const auditData = body.auditData;
        const metadata = (body as any).metadata; // Extract metadata

        if (!auditData || !Array.isArray(auditData) || auditData.length === 0) {
            return new Response("No audit data provided", { status: 400 });
        }

        if (!env.GOOGLE_AI_KEY) {
            return new Response("Missing API Key", { status: 500 });
        }

        const engine = new GeminiEngine(env.GOOGLE_AI_KEY);

        // Build context from metadata
        let contextInfo = "";
        if (metadata) {
            contextInfo = `\n분석 대상 기간: ${metadata.month || '알 수 없음'}
전체 직원 수 (월간): ${metadata.totalEmployees || auditData.length}명

주차별 직원 수:
${metadata.weeklyStats ? metadata.weeklyStats.map((ws: any) => `- ${ws.week}: ${ws.employeeCount}명`).join('\n') : '정보 없음'}
`;
        }

        const prompt = `
    Analyze the following Pre-Calculated Attendance Summary for labor law compliance issues in South Korea.
    The data contains weekly work hour totals (in Hours) and specific risk factors.
${contextInfo}
    Tasks:
    1. **Key Risks Table**:
       - Iterate through each user.
       - Check 'weeklySummary'.
       - **CRITICAL**: If 'totalHours' > 52: 
         - Type: "위반 (주 52시간 초과)"
         - Detail: "근로기준법상 주 최대 근로시간 52시간을 초과하여 법적 리스크가 있습니다."
       - **CRITICAL**: If 'totalHours' >= 45 and <= 52: 
         - Type: "주의 (고강도 근무)"
         - Detail: "법적 한도 이내이나, 장시간 근무로 인한 피로 누적 관리 및 위반 예방을 위한 선제적 관리가 필요합니다."
       - Add BOTH "위반" and "주의" cases to the "🚨 주요 위반 위험 사례" table.
       - Check 'riskFactors' for any issues and add them.
    
    2. **Detailed Analysis**:
       - Summarize the findings based on the provided data.
       - Do not recalculate numbers; trust the 'totalHours' provided.
       - Use the weekly employee counts provided in the context above for accurate statistics.

    3. **Recommendations**:
       - **ALWAYS** provide at least 3 actionable recommendations.
       - If no violations, suggest improvements like "Encouraging usage of Annual Leave for high performers" or "Flexible work arrangements".

    Data:
    ${JSON.stringify(auditData, null, 2)}
    
    Provide the output in a strict JSON format.
    **IMPORTANT: Return ONLY the JSON object. Do not wrap it in markdown code blocks (\`\`\`json ... \`\`\`).**
    **IMPORTANT: Provide the string content in KOREAN (한국어).**
    **IMPORTANT: Use the totalEmployees count (${metadata?.totalEmployees || auditData.length}) for the summary.totalUsers field.**

    JSON Structure:
    {
      "summary": {
        "totalUsers": number,
        "period": string,
        "status": "안전" | "주의" | "위험",
        "comment": string
      },
      "keyRisks": [
        {
          "name": string,
          "date": string,
          "type": string,
          "detail": string
        }
      ],
      "detailedAnalysis": {
         "over52h": string,
         "restAndConsecutive": string,
         "recordIntegrity": string
      },
      "recommendations": string[]
    }
    `;

        const result = await engine.generate(prompt);

        if (!result) {
            return new Response("Failed to generate audit result", { status: 500 });
        }

        const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();

        return new Response(cleanJson, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
        });

    } catch (error) {
        console.error("Audit Function Error:", error);
        return new Response(`Error executing audit: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
    }
};
