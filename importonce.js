const mongoose = require("mongoose");
require("dotenv").config();

const User = require("./src/models/User");
// Si ton fichier User.js est dans /models/User.js, remplace par :
// const User = require("./models/User");

const users = [
  {
    username: "salimbel",
    email: "yovatrans95@gmail.com",
    password: "Salimyovatrans1984++",
    role: "admin",
    nom: "BELAID",
    prenom: "Abdeslem",
    avatar: "👑"
  },
  {
    username: "hamoudbel",
    email: "contact@yovatrans.fr",
    password: "Momoyovatrans1976++",
    role: "gestionnaire",
    nom: "BELAID",
    prenom: "Mohammed",
    avatar: "🧑‍💼"
  },
   {
    username: "rachidbel",
    email: "ad@yovatrans.fr",
    password: "Rachidyovatrans1976++",
    role: "gestionnaire",
    nom: "BELAID",
    prenom: "Rachid",
    avatar: "🧑‍💼"
  },
    {
    username: "Nassimh",
    email: "nsmhadj@gmail.com",
    password: "@Nassim2004!",
    role: "admin",
    nom: "HADJEBAR",
    prenom: "Nassim",
    avatar: "🧑‍💼"
  },
{
    username: "Mohammedat",
    email: "exploitation@yovatrans.fr",
    password: "Mohammedyovatrans2006++",
    role: "admin",
    nom: "TALBI",
    prenom: "Mohammed Amine",
    avatar: "🧑‍💼"
  },
{
    username: "arabia",
    email: "administration@yovatrans.fr",
    password: "Yov@.230621",
    role: "admin",
    nom: "RABIA",
    prenom: "Abd El Halim",
    avatar: "🧑‍💼"
  }
];

async function importUsersOnce() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGO_URI manquant dans le fichier .env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connecté");

    for (const item of users) {
      const username = item.username.toLowerCase().trim();
      const email = item.email?.toLowerCase().trim();

      const existingUser = await User.findOne({
        $or: [
          { username },
          ...(email ? [{ email }] : [])
        ]
      });

      if (existingUser) {
        console.log(`⚠️ Déjà existant, ignoré : ${username}`);
        continue;
      }

      const passwordHash = await User.hashPassword(item.password);

      const created = await User.create({
        username,
        email,
        passwordHash,
        role: item.role,
        nom: item.nom,
        prenom: item.prenom || "",
        avatar: item.avatar || "👤",
        actif: true
      });

      console.log(`✅ Utilisateur créé : ${created.username} (${created.role})`);
    }

    console.log("🎉 Import terminé");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur import users :", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

importUsersOnce();