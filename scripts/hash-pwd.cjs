// Generate a bcrypt hash for the new admin user.
const bcrypt = require("bcryptjs");
const pwd = process.argv[2] || "Ayanalidar@110";
const hash = bcrypt.hashSync(pwd, 12);
console.log("HASH:", hash);
console.log("VERIFY:", bcrypt.compareSync(pwd, hash));
