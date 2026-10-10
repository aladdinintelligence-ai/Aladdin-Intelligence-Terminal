import {ReactNode} from "react";
export function Badge({children,color="#9b7cff"}:{children:ReactNode;color?:string}){return <span className="badge" style={{color,borderColor:`${color}66`,background:`${color}14`}}>{children}</span>}
