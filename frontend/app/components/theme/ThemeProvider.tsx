"use client";

import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from "react";

export type ThemePreference="dark"|"light"|"system";
type ResolvedTheme="dark"|"light";
type ThemeContextValue={preference:ThemePreference;resolvedTheme:ResolvedTheme;setPreference:(value:ThemePreference)=>void};

export const THEME_STORAGE_KEY="aladdin-theme";
const ThemeContext=createContext<ThemeContextValue|null>(null);
const isPreference=(value:string|null):value is ThemePreference=>value==="dark"||value==="light"||value==="system";
const deviceTheme=():ResolvedTheme=>window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";

function apply(preference:ThemePreference,resolved:ResolvedTheme){
  const root=document.documentElement;
  root.dataset.theme=preference;
  root.dataset.resolvedTheme=resolved;
  root.style.colorScheme=resolved;
}

export function ThemeProvider({children}:{children:ReactNode}){
  const [preference,setStoredPreference]=useState<ThemePreference>("system");
  const [resolvedTheme,setResolvedTheme]=useState<ResolvedTheme>("dark");

  useEffect(()=>{
    const stored=localStorage.getItem(THEME_STORAGE_KEY);
    const initial=isPreference(stored)?stored:"system";
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const sync=()=>{const resolved=initial==="system"?(media.matches?"dark":"light"):initial;setResolvedTheme(resolved);apply(initial,resolved)};
    setStoredPreference(initial);
    sync();
    const onChange=()=>{if((localStorage.getItem(THEME_STORAGE_KEY)||"system")==="system"){const resolved=deviceTheme();setResolvedTheme(resolved);apply("system",resolved)}};
    media.addEventListener("change",onChange);
    return()=>media.removeEventListener("change",onChange);
  },[]);

  const setPreference=useCallback((value:ThemePreference)=>{
    localStorage.setItem(THEME_STORAGE_KEY,value);
    const resolved=value==="system"?deviceTheme():value;
    setStoredPreference(value);
    setResolvedTheme(resolved);
    apply(value,resolved);
  },[]);
  const value=useMemo(()=>({preference,resolvedTheme,setPreference}),[preference,resolvedTheme,setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(){const value=useContext(ThemeContext);if(!value)throw new Error("useTheme must be used inside ThemeProvider");return value}
