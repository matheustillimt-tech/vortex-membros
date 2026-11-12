/**
 * Resumo de um erro para o log, sem dados: nome do erro e, quando houver, o nome da causa, o código
 * (SQLSTATE do Postgres ou código de rede) e a constraint. Nunca a mensagem: a do drizzle traz o SQL
 * e os parâmetros (e-mail, CPF, hash de senha, token de login).
 */
export function safeErrorSummary(err: unknown): string {
  if (!(err instanceof Error)) return "erro desconhecido";
  // O DrizzleQueryError não define `name` (fica "Error"); reconhecido pelos campos query/params.
  const isQueryError = err.name === "Error" && "query" in err && "params" in err;
  const parts = [isQueryError ? "DrizzleQueryError" : (safeWord(err.name) ?? "Error")];
  const cause: unknown = (err as { cause?: unknown }).cause;
  const source = typeof cause === "object" && cause !== null ? (cause as Record<string, unknown>) : (err as unknown as Record<string, unknown>);
  if (source !== (err as unknown)) parts.push(`cause=${cause instanceof Error ? (safeWord(cause.name) ?? "Error") : "object"}`);
  const code = safeWord(source.code);
  if (code) parts.push(`code=${code}`);
  const constraint = safeWord(source.constraint_name) ?? safeWord(source.constraint);
  if (constraint) parts.push(`constraint=${constraint}`);
  return parts.join(" ");
}

/** Só identificadores (letras, dígitos, `_`, `.`); qualquer outra coisa fica de fora. */
function safeWord(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_.]{1,63}$/.test(v) ? v : null;
}
