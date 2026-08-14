export const AI_MODEL_CONFIG_HASH = "#/model-config";

export type AiReadinessStatus = "ready" | "missing" | "unavailable";

export async function resolveAiReadiness(
  loadConfig: () => Promise<{ hasKey: boolean }>
): Promise<AiReadinessStatus> {
  try {
    const config = await loadConfig();
    return config.hasKey ? "ready" : "missing";
  } catch {
    return "unavailable";
  }
}

export function openAiModelConfig(): void {
  if (typeof window !== "undefined") {
    window.location.hash = AI_MODEL_CONFIG_HASH;
  }
}
