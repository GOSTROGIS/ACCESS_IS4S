// The one assignment rule: a stage assigns AutoCraft's account when its work on an item starts (claimForWork); the planner decides
// the unassign, once the item is off the path to merge (waits on a person, a stage gave up), so someone else may pick it up. Pure.
import type { Action, AssignFacts } from "./plan.ts";

/** Plan states that wait on a person: work of ours in them is no longer in flight. */
export const WAITS_ON_PERSON: ReadonlySet<string> = new Set(["needs-decision", "declined", "changes-requested", "held-duplicate", "held-backlog", "backlog", "duplicate", "opus-hold"]);

/** AutoCraft's own work on the item that is still moving: not closed, not held, not waiting on a person's answer. */
export const inFlightNow = (f: { inFlight?: boolean; mergeHeld?: boolean }, state: string): boolean => !!f.inFlight && !f.mergeHeld && !WAITS_ON_PERSON.has(state);

/** True for an action that is not `unassign`: that one is bookkeeping, not work due, and leaves a plan's wait text and "has work" tests as they are. */
export const isWork = (a: Action): boolean => a.kind !== "unassign";

/** The `unassign` action for an open item that is off the path to merge: only our own assignment, only while we are the sole assignee. Assigning is done by the stage that starts work (src/github/claim.ts claimForWork). */
export function unassignActions(a: AssignFacts, open: boolean, release: boolean): Action[] {
  return open && release && a.ours && a.login !== null && a.assignees.length === 1 && a.assignees[0] === a.login ? [{ kind: "unassign", head: null }] : [];
}
