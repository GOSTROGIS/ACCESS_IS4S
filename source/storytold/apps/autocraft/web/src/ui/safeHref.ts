import { safeUrl } from "./markdownHtml.ts";

/** An href from API data: the url when it is http(s), mailto, a fragment or a site path; otherwise undefined, so no link target is rendered. */
export const safeHref = (url: string | null | undefined): string | undefined => (url ? safeUrl(url) || undefined : undefined);
