import dotenv from 'dotenv';

dotenv.config();

const whitelist = [
  "https://www.aladdin.pro",
  process.env.FRONTEND_LOCAL,
];

export function corsHandler(origin, callback) {  
  if (!origin) {
    return callback(null, true);
  }
  if (whitelist.includes(origin)) {
    return callback(null, true);
  } else {
    return callback(new Error("Not allowed by CORS"));
  }
}
