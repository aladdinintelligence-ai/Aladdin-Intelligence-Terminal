import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DB_URI = process.env.DB_URI || 'mongodb://localhost:27017/aladdin-db';

const authProviderSchema = new mongoose.Schema({
  provider: String,
  providerId: String,
}, { _id: false });

const userWalletSchema = new mongoose.Schema({
  publicKey: String,
}, { _id: false });

const userSchema = new mongoose.Schema({
  authProviders: [authProviderSchema],
  displayName: String,
  username: String,
  email: String,
  avatarUrl: String,
  primaryProfile: String,
  wallet: userWalletSchema,
  createdAt: Date,
  updatedAt: Date,
});

const User = mongoose.model('User', userSchema);

try {
  await mongoose.connect(DB_URI);
  console.log(`Connected to ${DB_URI}\n`);

  const users = await User.find({}, {
    authProviders: 1,
    displayName: 1,
    username: 1,
    email: 1,
    avatarUrl: 1,
    primaryProfile: 1,
    wallet: 1,
    createdAt: 1,
    updatedAt: 1,
  }).sort({ createdAt: 1 });

  console.log(`Total users: ${users.length}\n`);

  if (users.length === 0) {
    console.log('No users found.');
  } else {
    users.forEach((u, i) => {
      console.log(`--- User ${i + 1} ---`);
      console.log(`  ID:            ${u._id}`);
      console.log(`  Name:          ${u.displayName}`);
      console.log(`  Username:      @${u.username}`);
      console.log(`  Email:         ${u.email || 'N/A'}`);
      console.log(`  Avatar:        ${u.avatarUrl || 'N/A'}`);
      console.log(`  Role:          ${u.primaryProfile}`);
      console.log(`  Auth Provider: ${u.authProviders?.[0]?.provider || 'N/A'} (${u.authProviders?.[0]?.providerId || 'N/A'})`);
      console.log(`  Wallet:        ${u.wallet?.publicKey || 'Not generated'}`);
      console.log(`  Created:       ${u.createdAt}`);
      console.log(`  Updated:       ${u.updatedAt}`);
      console.log(u);
    });
  }
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await mongoose.disconnect();
}
