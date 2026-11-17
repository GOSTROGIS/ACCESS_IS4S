// Shared pieces now live in ui/ and lib/; these re-exports keep other modules' imports working.
import type { Role } from "../../api/types";

export { Page } from "../../ui/organisms/Page";
export { Block } from "../../ui/molecules/Block";
export { Input as TextInput } from "../../ui/atoms/Input";
export { selectCls } from "../../ui/atoms/Select";
export { ErrorLine } from "../../ui/atoms/ErrorLine";
export { Th as SortTh } from "../../ui/atoms/Th";
export { Pager } from "../../ui/molecules/Pager";
export { ConfirmButton } from "../../ui/molecules/ConfirmButton";
export { useWrite, useUrlState } from "../../lib/hooks";
export { when } from "../../lib/format";

export const ROLE_LABEL: Record<Role, string> = { operator: "Operator", maintainer: "Maintainer", viewer: "Viewer" };
export const ROLES: Role[] = ["operator", "maintainer", "viewer"];
