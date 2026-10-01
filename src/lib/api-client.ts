export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const data = await response.json()
  if (!response.ok)
    throw new ApiError(
      data.error || 'Something went wrong. Please try again.',
      response.status,
    )
  return data as T
}

export const json = (value: unknown) => JSON.stringify(value)
