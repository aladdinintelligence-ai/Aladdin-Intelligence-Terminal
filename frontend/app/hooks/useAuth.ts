"use client";
import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/app/contexts/AuthContext";

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
