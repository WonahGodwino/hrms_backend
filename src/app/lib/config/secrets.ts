// Signing secrets (SEC-009).
//
// Returns the first of the named environment variables that is set, and throws
// when none is. There is deliberately no built-in default: a default committed
// to the repository would let anyone forge tokens on a server where the
// variable is missing. Call it when the secret is used (not at module load),
// so a build without secrets in its environment still succeeds.
export function requireSecret(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  throw new Error(`${names.join(' or ')} environment variable is not set`)
}
