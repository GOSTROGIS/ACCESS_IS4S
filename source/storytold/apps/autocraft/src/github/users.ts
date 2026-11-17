import { AppError, call, GITHUB_API } from "./app.ts";

/** The numeric id of a GitHub user, read without authentication. Null when there is no such user; throws when GitHub can't answer. */
export async function githubUserId(login: string, base: string = GITHUB_API): Promise<number | null> {
  try {
    const j = (await call(base, `/users/${encodeURIComponent(login)}`, null)) as { id?: unknown; type?: unknown };
    if (typeof j.id !== "number") throw new AppError("GitHub gave no user id");
    return j.id;
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}
