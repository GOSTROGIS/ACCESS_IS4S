// Real item data for the mockup: when the build has a /real-data.json beside it, the item pages for those items use it.
import { convertReal, type RealExport, type RealPages } from "./realData";

let real: RealPages | null = null;

/** Fetches the export once at startup; a missing file leaves the fake data in place. */
export async function loadRealData(): Promise<void> {
  try {
    const res = await fetch("/real-data.json", { cache: "no-store" });
    if (!res.ok) return;
    real = convertReal((await res.json()) as RealExport);
  } catch {
    real = null;
  }
}

export const realData = (): RealPages | null => real;
