import { Ollama } from "ollama";

export interface OllamaResponse {
  text: string;
  usedFallback: boolean;
}

function isVisionUnsupportedError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("vision") || msg.includes("image") || msg.includes("multimodal");
  }
  return false;
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("auth") || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("api key");
  }
  return false;
}

export async function extractTextFromImage(
  base64Image: string,
  model: string,
  prompt: string,
  fallbackModel?: string,
): Promise<OllamaResponse> {
  const client = new Ollama({
    host: "https://ollama.com",
    headers: {
      Authorization: `Bearer ${process.env.OLLAMA_API_KEY ?? ""}`,
    },
  });

  try {
    const response = await client.chat({
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

    return {
      text: response.message.content,
      usedFallback: false,
    };
  } catch (err) {
    const needsFallback = isVisionUnsupportedError(err) || isAuthError(err);

    if (needsFallback && fallbackModel) {
      const response = await client.chat({
        model: fallbackModel,
        messages: [
          {
            role: "user",
            content: prompt,
            images: [base64Image],
          },
        ],
        stream: false,
      });

      return {
        text: response.message.content,
        usedFallback: true,
      };
    }

    throw err;
  }
}
