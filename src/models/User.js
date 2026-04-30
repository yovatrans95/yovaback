const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'gestionnaire', 'chauffeur'],
      required: true
    },
    nom: {
      type: String,
      required: true,
      trim: true
    },
    prenom: {
      type: String,
      trim: true,
      default: ''
    },
    avatar: {
      type: String,
      default: '👤'
    },
    actif: {
      type: Boolean,
      default: true
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null
    },
    lastLogin: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 10);
};

module.exports = mongoose.model('User', userSchema);
