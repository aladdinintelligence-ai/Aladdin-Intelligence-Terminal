"use client";

// Server-backed Ask Aladdin sessions for signed-in users. The backend keeps the
// conversation history per account (Mongo `AskConversation`), so a user's
// investigations follow them across devices. Anonymous visitors never call these
// functions: `workspace-storage` serves them from memory instead.
import {apiFetch} from "@/app/lib/api";
import {normaliseInvestigation} from "@/app/services/workspace-local";
import type {InvestigationSession} from "@/app/types/workspace";

const SESSIONS_PATH="/api/ask/sessions";

export async function listRemoteSessions():Promise<InvestigationSession[]>{
  const res=await apiFetch<{data:Partial<InvestigationSession>[]}>(SESSIONS_PATH);
  return (Array.isArray(res.data)?res.data:[]).map(normaliseInvestigation);
}

export async function saveRemoteSession(session:InvestigationSession):Promise<InvestigationSession|null>{
  const res=await apiFetch<{data:Partial<InvestigationSession>}>(SESSIONS_PATH,{method:"POST",body:JSON.stringify(session)});
  return res.data?normaliseInvestigation(res.data):null;
}

export async function deleteRemoteSession(id:string):Promise<void>{
  await apiFetch(`${SESSIONS_PATH}/${encodeURIComponent(id)}`,{method:"DELETE"});
}

export async function duplicateRemoteSession(id:string):Promise<InvestigationSession|null>{
  const res=await apiFetch<{data:Partial<InvestigationSession>}>(`${SESSIONS_PATH}/${encodeURIComponent(id)}/duplicate`,{method:"POST"});
  return res.data?normaliseInvestigation(res.data):null;
}
