import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DB_URI = process.env.DB_URI || 'mongodb://localhost:27017/aladdin-db';

try {
  await mongoose.connect(DB_URI);
  console.log(`Connected to ${DB_URI}`);

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`Found ${collections.length} collections\n`);

  for (const col of collections) {
    const count = await mongoose.connection.db.collection(col.name).countDocuments();
    await mongoose.connection.db.dropCollection(col.name);
    console.log(`  Dropped: ${col.name} (${count} documents)`);
  }

  console.log(`\nDatabase cleared.`);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await mongoose.disconnect();
}
