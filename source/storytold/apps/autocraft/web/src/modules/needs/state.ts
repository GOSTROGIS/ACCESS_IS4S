import { useQuery } from "../../api/client";

/** Counts for the tabs and the stopped rows; one cache entry for the toolbar, the badge and the Stopped tab. */
export const useSummary = () => useQuery("needs:summary", (api) => api.needs({}));
