"use client";
const DB="aladdin-profile",STORE="images",KEY="current-avatar";
export const PROFILE_IMAGE_MAX_BYTES=5*1024*1024;
export interface ProfileImageStore{load():Promise<Blob|null>;save(blob:Blob):Promise<void>;remove():Promise<void>}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(typeof indexedDB==="undefined")return reject(new Error("Browser image storage is unavailable."));const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function transaction(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest){const db=await database();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,mode);action(tx.objectStore(STORE));tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
export const profileImageStore:ProfileImageStore={async load(){try{const db=await database();return await new Promise((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).get(KEY);request.onsuccess=()=>{db.close();resolve(request.result instanceof Blob?request.result:null)};request.onerror=()=>{db.close();reject(request.error)}})}catch{return null}},async save(blob){await transaction("readwrite",store=>store.put(blob,KEY));dispatchEvent(new Event("aladdin-profile-image-change"))},async remove(){await transaction("readwrite",store=>store.delete(KEY));dispatchEvent(new Event("aladdin-profile-image-change"))}};

export async function processProfileImage(file:File):Promise<Blob>{
 if(!file.type.startsWith("image/"))throw new Error("Choose an image file.");
 if(file.size>PROFILE_IMAGE_MAX_BYTES)throw new Error("Choose an image smaller than 5 MB.");
 const bitmap=await createImageBitmap(file),size=Math.min(bitmap.width,bitmap.height),canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;
 const context=canvas.getContext("2d");if(!context)throw new Error("This browser cannot process the image.");context.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);bitmap.close();
 return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("The image could not be processed.")),"image/jpeg",.82));
}
