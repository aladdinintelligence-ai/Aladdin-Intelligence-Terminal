import mongoose from 'mongoose';

const authProviderSchema = new mongoose.Schema({
  provider: { type: String, enum: ['phantom', 'google', 'telegram'], required: true },
  providerId: { type: String, required: true },
}, { _id: false });

const userWalletSchema = new mongoose.Schema({
  publicKey: { type: String, required: true },
  encryptedPrivateKey: { type: String, required: true },
  iv: { type: String, required: true },
  salt: { type: String, required: true },
}, { _id: false });

const userSchema = new mongoose.Schema({
  authProviders: { type: [authProviderSchema], required: true },
  displayName: { type: String, required: true },
  username: { type: String, unique: true, sparse: true },
  email: { type: String, sparse: true },
  avatarUrl: { type: String },
  primaryProfile: {
    type: String,
    enum: ['Trader', 'Analyst', 'Token Creator'],
    default: 'Trader',
  },
  wallet: { type: userWalletSchema },
}, { timestamps: true });

userSchema.index({ 'authProviders.provider': 1, 'authProviders.providerId': 1 });

export const User = mongoose.model('User', userSchema);
