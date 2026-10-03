export class RepoError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
