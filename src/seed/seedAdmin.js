require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

async function seed() {
  await connectDB();

  const admins = [
    {
      username: 'admin',
      email: 'admin@yovatrans.local',
      password: 'admin123',
      nom: 'Administrateur',
      prenom: '',
      role: 'admin'
    },
    {
      username: 'gestionnaire',
      email: 'gestionnaire@yovatrans.local',
      password: 'gest2026',
      nom: 'Gestionnaire',
      prenom: '',
      role: 'gestionnaire'
    }
  ];

  for (const admin of admins) {
    const existing = await User.findOne({ username: admin.username });
    if (existing) {
      console.log(`User ${admin.username} already exists`);
      continue;
    }

    const passwordHash = await User.hashPassword(admin.password);
    await User.create({
      username: admin.username,
      email: admin.email,
      passwordHash,
      role: admin.role,
      nom: admin.nom,
      prenom: admin.prenom,
      avatar: '👤'
    });

    console.log(`Seeded ${admin.username}`);
  }

  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
