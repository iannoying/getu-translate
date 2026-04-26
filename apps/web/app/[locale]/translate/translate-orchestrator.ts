export type ColumnTask = {
  modelId: string
  run: (signal: AbortSignal) => Promise<{ text: string }>
}

export type ColumnSuccess = { modelId: string; text: string }
export type ColumnFailure = { modelId: string; error: { code: string; message?: string } }
export type ColumnResult = ColumnSuccess | ColumnFailure

export async function runColumnTranslations(
  tasks: ColumnTask[],
  signal: AbortSignal,
): Promise<ColumnResult[]> {
  return Promise.all(
    tasks.map(async (task): Promise<ColumnResult> => {
      try {
        const out = await task.run(signal)
        return { modelId: task.modelId, ...out }
      } catch (e) {
        const err = e as { name?: string; message?: string; code?: string }
        if (err?.name === "AbortError" || signal.aborted) {
          return { modelId: task.modelId, error: { code: "ABORTED" } }
        }
        return {
          modelId: task.modelId,
          error: { code: err?.code ?? "UNKNOWN", message: err?.message },
        }
      }
    }),
  )
}
