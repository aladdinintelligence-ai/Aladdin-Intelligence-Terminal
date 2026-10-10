import {redirect} from "next/navigation";export default async function Token({params}:{params:Promise<{id:string}>}){const {id}=await params;redirect(`/live/${id}`)}
