import { createContext, useContext } from "react";
import type { User } from "../api/types";

export const UserContext = createContext<User | null>(null);
export function useUser(): User {
  const u = useContext(UserContext);
  if (!u) throw new Error("UserContext missing");
  return u;
}
