import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '');

export interface StreamChunk {
  type: 'token' | 'done' | 'error';
  data?: string;
  error?: string;
}

export async function* streamGemini(
  messages: Array<{ role: string; content: string }>,
  model = 'gemini-1.5-flash'
): AsyncGenerator<StreamChunk> {
  const geminiModel = genAI.getGenerativeModel({ model });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];

  const chat = geminiModel.startChat({ history });
  const result = await chat.sendMessageStream(lastMessage.content);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield { type: 'token', data: text };
    }
  }

  yield { type: 'done' };
}

export async function generateGemini(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
