"use client";
import type {FormEvent,KeyboardEvent} from "react";
import {ArrowUp} from "lucide-react";

export function AskComposer({value,onChange,onSubmit,busy,context}:{value:string;onChange:(value:string)=>void;onSubmit:()=>void;busy:boolean;context:string}){
 const canSend=Boolean(value.trim())&&!busy;
 function submit(event?:FormEvent){event?.preventDefault();if(canSend)onSubmit()}
 function keyDown(event:KeyboardEvent<HTMLTextAreaElement>){if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();submit()}}
 return <form className="askComposer compactComposer" onSubmit={submit}><textarea rows={1} value={value} onChange={event=>onChange(event.target.value)} onKeyDown={keyDown} placeholder="Ask Aladdin…" aria-label="Ask Aladdin question" disabled={busy}/><button className="composerSend" type="submit" disabled={!canSend} aria-label="Send question"><ArrowUp/></button><small>{context}</small></form>;
}
