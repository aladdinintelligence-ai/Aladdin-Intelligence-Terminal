import mongoose from 'mongoose';

export async function connectDB(dbUri) {
  try {
    await mongoose.connect(dbUri);
    console.log(`[DB] Connected to MongoDB`);
  } catch (error) {
    console.error('[DB] Connection error:', error.message);
    process.exit(1);
  }
}
