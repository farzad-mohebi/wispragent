export type TemplateId = 'as-is' | 'email' | 'grammar' | 'bullets' | 'casual' | 'meeting' | 'custom';

export interface FormattingTemplate {
  id: TemplateId;
  name: string;
  description: string;
  systemPrompt: string;
}

export const FORMATTING_TEMPLATES: FormattingTemplate[] = [
  {
    id: 'as-is',
    name: 'As Dictated',
    description: 'Verbatim transcription with basic grammar cleaning.',
    systemPrompt: 'You are a clean-up assistant. Output the input text verbatim, only correcting egregious spelling mistakes, run-on sentences, or punctuation. Do not rephrase or summarize.'
  },
  {
    id: 'grammar',
    name: 'Grammar & Clarity',
    description: 'Fix spelling, grammar, and improve readability.',
    systemPrompt: 'You are a grammar and speech enhancement assistant. Clean up the provided speech transcript: correct spelling, grammar, punctuation, remove filler words ("um", "uh", "like"), and make the sentence structure elegant. Retain the exact style, tone, and content of the user\'s original dictation.'
  },
  {
    id: 'email',
    name: 'Professional Email',
    description: 'Draft a polite, structured business email.',
    systemPrompt: 'You are a professional business writer. Convert the spoken thoughts/transcript into a well-structured, clear, and polite professional email. Include a placeholder for the Subject Line at the top, a proper greeting, clear paragraphs, and a professional sign-off. Keep the tone respectful and action-oriented.'
  },
  {
    id: 'bullets',
    name: 'Bullet Points',
    description: 'Extract key points in a concise list.',
    systemPrompt: 'You are an executive assistant. Extract the core ideas, arguments, and action items from the provided transcript and present them as a clean, structured bulleted list. Use bold headers for categories if appropriate, and keep bullet points concise.'
  },
  {
    id: 'casual',
    name: 'Casual Message',
    description: 'Friendly tone for Slack, Teams, or chat.',
    systemPrompt: 'You are a friendly workplace communicator. Rewrite the spoken words to make them natural, direct, and casual. Perfect for quick chat messages (e.g. Slack, WhatsApp, Teams). Avoid overly formal language, but keep it clear and friendly.'
  },
  {
    id: 'meeting',
    name: 'Meeting Minutes',
    description: 'Structure as meeting summary and action items.',
    systemPrompt: 'You are a meeting transcription assistant. Summarize the dictation as structured meeting notes. Highlight the main topics discussed, decisions made, and explicitly extract any action items, Assignees (if mentioned), or deadlines.'
  }
];

export interface AISettings {
  provider: 'gemini' | 'openai' | 'openrouter' | 'none';
  apiKey: string;
  customPrompt: string;
  openRouterModel?: string;
}

/**
 * Basic offline local formatter that cleans up text when no API key is available.
 */
function localFallbackFormat(text: string, templateId: TemplateId, customPrompt?: string, appMode: 'transcribe' | 'explain' = 'transcribe'): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (appMode === 'explain') {
    const prefix = `[Local Offline Explain Mode]\n\n`;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('put a title') || lower.startsWith('make a title')) {
      const title = trimmed.replace(/^(put|make) a title/i, '').trim();
      return `${prefix}<h1>${title}</h1>`;
    }
    if (lower.startsWith('start bullet point') || lower.startsWith('add bullet point')) {
      const item = trimmed.replace(/^(start|add) bullet point/i, '').replace(/^is/i, '').trim();
      return `${prefix}<ul><li>${item}</li></ul>`;
    }
    return `${prefix}<p>${trimmed}</p>`;
  }

  // Basic capitalization of first letter of sentences
  let processed = trimmed
    .replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase())
    .replace(/\b(i)\b/g, 'I');

  if (processed.length > 0 && !/[.!?]$/.test(processed)) {
    processed += '.';
  }

  const prefix = `[Local Offline Mode - ${FORMATTING_TEMPLATES.find(t => t.id === templateId)?.name || 'Custom'}]\n\n`;

  switch (templateId) {
    case 'email':
      return `${prefix}Subject: Draft Email\n\nDear recipient,\n\n${processed}\n\nBest regards,\n[Your Name]`;
    case 'bullets':
      return `${prefix}` + processed
        .split(/[.!?]+\s+/)
        .filter(Boolean)
        .map(sentence => `• ${sentence}`)
        .join('\n');
    case 'meeting':
      return `${prefix}# Meeting Summary\n\n- ${processed}\n\n## Action Items\n- [ ] Review transcript detail`;
    case 'custom':
      return `${prefix}Custom Instructions applied locally:\n"${customPrompt || ''}"\n\n${processed}`;
    default:
      return processed;
  }
}

/**
 * Invokes the chosen LLM API to format the transcript.
 */
export async function formatTranscript(
  text: string,
  templateId: TemplateId,
  settings: AISettings,
  appMode: 'transcribe' | 'explain' = 'transcribe'
): Promise<string> {
  const trimmedText = text.trim();
  if (!trimmedText) return '';

  if (settings.provider === 'none' || !settings.apiKey.trim()) {
    // Delay slightly to simulate AI processing for premium feel
    await new Promise(resolve => setTimeout(resolve, 800));
    return localFallbackFormat(trimmedText, templateId, settings.customPrompt, appMode);
  }

  let systemPrompt = '';
  if (appMode === 'explain') {
    systemPrompt = `You are a voice-driven document formatting assistant. Your job is to parse the user's spoken thoughts which contain a mixture of formatting commands (e.g., "put a title", "make a heading", "start bullet point", "bold this") and actual content.
Convert these spoken instructions into clean HTML representing the requested formatted content.
CRITICAL: Do NOT transcribe the formatting commands literally. Instead, interpret and execute them, outputting ONLY the resulting formatted HTML.
If there are no formatting commands, treat it as a standard paragraph and output a <p> block.

Examples:
- Input: "put a title Project B" -> Output: "<h1>Project B</h1>"
- Input: "start bullet point Joe" -> Output: "<ul><li>Joe</li></ul>"
- Input: "write a paragraph Hello world and then bold the word Hello" -> Output: "<p><strong>Hello</strong> world</p>"
- Input: "make a heading Joe and then add a sub heading Joe is a developer" -> Output: "<h1>Joe</h1><h2>Joe is a developer</h2>"`;
  } else {
    const template = FORMATTING_TEMPLATES.find(t => t.id === templateId);
    systemPrompt = templateId === 'custom' 
      ? settings.customPrompt || 'Rewrite and clean up the text.'
      : template?.systemPrompt || 'Clean up and format this text.';
  }

  // Instruct AI to preserve the original language (e.g. Persian)
  systemPrompt += "\n\nCRITICAL: You must preserve the language of the input transcript. If the input text is in Persian (Farsi), write the refined, formatted output entirely in Persian. Do not translate it to English.";

  if (settings.provider === 'gemini') {
    try {
      const response = await fetch(
        `/api-gemini/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `${systemPrompt}\n\nHere is the transcript to process:\n"${trimmedText}"`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.3,
            }
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `Gemini API returned status ${response.status}`);
      }

      const data = await response.json();
      const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!output) {
        throw new Error('Empty response from Gemini model');
      }
      return output.trim();
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      throw new Error(`Gemini API Error: ${error.message || error}`);
    }
  } else if (settings.provider === 'openai') {
    try {
      const response = await fetch('/api-openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmedText }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `OpenAI API returned status ${response.status}`);
      }

      const data = await response.json();
      const output = data?.choices?.[0]?.message?.content;
      if (!output) {
        throw new Error('Empty response from OpenAI model');
      }
      return output.trim();
    } catch (error: any) {
      console.error('OpenAI API Error:', error);
      throw new Error(`OpenAI API Error: ${error.message || error}`);
    }
  } else if (settings.provider === 'openrouter') {
    try {
      const model = settings.openRouterModel?.trim() || 'google/gemini-2.5-flash';
      const response = await fetch('/api-openrouter/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Wisper Agent'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmedText }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `OpenRouter API returned status ${response.status}`);
      }

      const data = await response.json();
      const output = data?.choices?.[0]?.message?.content;
      if (!output) {
        throw new Error('Empty response from OpenRouter model');
      }
      return output.trim();
    } catch (error: any) {
      console.error('OpenRouter API Error:', error);
      throw new Error(`OpenRouter API Error: ${error.message || error}`);
    }
  }

  return localFallbackFormat(trimmedText, templateId, settings.customPrompt);
}

/**
 * Converts a Blob to a base64 string.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribes audio from a recorded Blob using Gemini or OpenAI Whisper APIs.
 */
export async function transcribeAudio(
  blob: Blob,
  settings: AISettings,
  langCode: string
): Promise<string> {
  if (settings.provider === 'none' || !settings.apiKey.trim()) {
    throw new Error('API Key is required to transcribe audio inside the desktop app. Please configure a Gemini or OpenAI key in Settings.');
  }

  if (settings.provider === 'gemini') {
    const base64Data = await blobToBase64(blob);
    // Determine language hint
    const langName = langCode === 'fa-IR' ? 'Persian (Farsi)' : 'English';

    const response = await fetch(
      `/api-gemini/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/webm',
                    data: base64Data
                  }
                },
                {
                  text: `Please transcribe this audio recording exactly as spoken. The spoken language is ${langName}. Return ONLY the transcription text, without any introductory or concluding remarks, explanations, or quotes. If the audio is silent or contains no speech, return an empty string.`
                }
              ]
            }
          ]
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Gemini transcription failed`);
    }

    const data = await response.json();
    const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!output) {
      throw new Error('Empty response from Gemini transcription');
    }
    return output.trim();
  } else if (settings.provider === 'openai' || settings.provider === 'openrouter') {
    // OpenAI Whisper
    const formData = new FormData();
    const lang = langCode.split('-')[0];
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', lang);

    // Whisper is hosted by OpenAI, even for OpenRouter users it is recommended to use OpenAI API or provide direct Whisper keys.
    // If the provider is OpenRouter, they can use OpenAI credentials or we will target OpenAI endpoint with their key (often keys match if they use OpenAI API compatibility layers, or we just use OpenAI).
    const apiEndpoint = '/api-openai/v1/audio/transcriptions';

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Whisper transcription failed`);
    }

    const data = await response.json();
    return data.text.trim();
  }

  throw new Error('Unsupported transcription provider');
}
