export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

export function jsonOk<T extends Record<string, unknown>>(data?: T, status = 200) {
  return Response.json({ ok: true, ...data }, { status });
}
