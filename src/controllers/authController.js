const User = require('../models/User');
const generateToken = require('../utils/generateToken');

function buildCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

async function login(req, res) {
  const { username, email, password } = req.body;
  const loginValue = (username || email || '').trim().toLowerCase();

  if (!loginValue || !password) {
    return res.status(400).json({ message: 'username/email and password are required' });
  }

  const user = await User.findOne({
    $or: [{ username: loginValue }, { email: loginValue }]
  });

  if (!user || !(await user.comparePassword(password)) || !user.actif) {
    return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect.' });
  }

  const token = generateToken({ userId: user._id, role: user.role });
  user.lastLogin = new Date();
  await user.save();

  res.cookie('token', token, buildCookieOptions());
  return res.json({
    message: 'Login successful',
    token,
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      avatar: user.avatar,
      driverId: user.driverId
    }
  });
}

async function me(req, res) {
  return res.json({ user: req.user });
}

async function logout(req, res) {
  res.clearCookie('token');
  return res.json({ message: 'Logged out' });
}

module.exports = { login, me, logout };
