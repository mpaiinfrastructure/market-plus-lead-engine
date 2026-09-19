const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const { getProviderConfig } = require('./config');

function parseQualificationResponse(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) {
    return { qualified: false, score: 0, summary: 'No evaluation returned.' };
  }

  const lower = text.toLowerCase();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        return {
          qualified: Boolean(parsed.qualified ?? /yes|likely|worth/.test(lower)),
          score: Number(parsed.score ?? 0),
          summary: parsed.summary || parsed.reason || text.slice(0, 250),
          recommendedTools: Array.isArray(parsed.recommendedTools) ? parsed.recommendedTools : [],
        };
      }
    } catch {
      // fall through to text parsing below
    }
  }

  const scoreMatch = text.match(/score\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  const numericScore = scoreMatch ? Number(scoreMatch[1]) : 0;

  return {
    qualified: /qualified|yes|likely|good fit|strong fit|worth pursuing|accept/i.test(lower),
    score: numericScore || (lower.includes('qualified') || lower.includes('likely') ? 80 : 0),
    summary: text.slice(0, 250),
    recommendedTools: [],
  };
}

async function qualifyLead(lead = {}) {
  const { google, ollama } = getProviderConfig();

  if (!google.apiKey) {
    try {
      const prompt = `Evaluate this business for useful AI automation opportunities. Return only JSON with keys qualified (boolean), score (0-100), summary (short string), and recommendedTools (array of strings). Business: ${lead.name || 'Unknown'}; Domain: ${lead.domain || 'unknown'}; Workflow: ${lead.workflow || 'Recommend useful AI tools'}.`;
      const response = await axios.post(`${ollama.baseUrl}/api/generate`, {
        model: ollama.model,
        prompt,
        stream: false,
        format: 'json',
      }, { timeout: 30000 });
      return { ...parseQualificationResponse(response.data?.response || ''), provider: 'ollama' };
    } catch (error) {
      return {
        qualified: false,
        score: 0,
        summary: `Ollama unavailable at ${ollama.baseUrl}: ${error.message}`,
        dryRun: true,
        provider: 'ollama',
      };
    }
  }

  try {
    const ai = new GoogleGenAI({ apiKey: google.apiKey });
    const prompt = `
      You are evaluating a business in a high-income ZIP code for useful AI automation opportunities.
      Identify the business type from its name, domain, and notes. Look for missing AI infrastructure and recommend the AI tools or workflows that would help this specific business most.
      Return JSON with: { "qualified": true|false, "score": 0-100, "summary": "short reason", "recommendedTools": ["tool or workflow", "tool or workflow"] }

      Business: ${lead.name || 'Unknown'}
      Domain: ${lead.domain || 'unknown'}
      Workflow: ${lead.workflow || 'Recommend the most useful AI tools for this business'}
      Notes: ${lead.notes || 'No additional notes'}
    `;

    const response = await ai.models.generateContent({
      model: google.model,
      contents: prompt,
    });

    const rawText = response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    return parseQualificationResponse(rawText);
  } catch (error) {
    return {
      qualified: false,
      score: 0,
      summary: `Google AI failed: ${error.message}`,
      dryRun: true,
    };
  }
}

module.exports = {
  qualifyLead,
  parseQualificationResponse,
};
