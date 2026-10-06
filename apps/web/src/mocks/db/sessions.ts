// Mock server-side session table: bearer token → sign-in email. In memory only, like
// the token in the browser, so a reload signs everyone out. Unknown tokens resolve to nothing.
const tokenToEmail = new Map<string, string>();

export function openSession(token: string, email: string): void {
  tokenToEmail.set(token, email);
}

/** Email behind an `Authorization: Bearer <token>` header, or undefined if absent or unknown. */
export function emailForAuthorization(header: string | null): string | undefined {
  const token = /^Bearer (\S+)$/.exec(header ?? "")?.[1];
  return token === undefined ? undefined : tokenToEmail.get(token);
}
