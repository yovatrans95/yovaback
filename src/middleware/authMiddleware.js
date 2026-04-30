const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function protect(req, res, next) {
  const bearer = req.headers.authorization;
  const token = req.cookies?.token || (bearer && bearer.startsWith('Bearer ') ? bearer.split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized: missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');

    if (!user || !user.actif) {
      return res.status(401).json({ message: 'Not authorized: user not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized: invalid token' });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}

module.exports = { protect, allowRoles };
