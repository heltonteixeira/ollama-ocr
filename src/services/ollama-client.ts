import { Ollama } from "ollama";

export interface OllamaResponse {
  text: string;
  usedFallback: boolean;
}

let client: Ollama | undefined;

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({
      host: "https://ollama.com",
      headers: {
        Authorization: `Bearer ${process.env.OLLAMA_API_KEY ?? ""}`,
      },
    });
  }
  return client;
}

function isErrorWithKeywords(err: unknown, keywords: string[]): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return keywords.some((kw) => msg.includes(kw));
  }
  return false;
}

const VISION_ERROR_KEYWORDS = ["vision", "image", "multimodal"];
const AUTH_ERROR_KEYWORDS = ["auth", "unauthorized", "forbidden", "api key"];

async function chatWithModel(model: string, prompt: string, base64Image: string): Promise<string> {
  const response = await getClient().chat({
    model,
    messages: [
      {
        role: "user",
        content: prompt,
        images: [base64Image],
      },
    ],
    stream: false,
  });
  return response.message.content;
}

export async function extractTextFromImage(
  base64Image: string,
  model: string,
  prompt: string,
  fallbackModel?: string,
): Promise<OllamaResponse> {
  try {
    return {
      text: await chatWithModel(model, prompt, base64Image),
      usedFallback: false,
    };
  } catch (err) {
    const needsFallback =
      isErrorWithKeywords(err, VISION_ERROR_KEYWORDS) ||
      isErrorWithKeywords(err, AUTH_ERROR_KEYWORDS);

    if (needsFallback && fallbackModel) {
      return {
        text: await chatWithModel(fallbackModel, prompt, base64Image),
        usedFallback: true,
      };
    }

    throw err;
  }
}
