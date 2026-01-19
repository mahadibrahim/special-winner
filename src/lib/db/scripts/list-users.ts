import { getDb } from "../index";
import { users } from "../schema";

async function listUsers() {
  const allUsers = await getDb().select({
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName
  }).from(users);

  console.log("Users in database:");
  allUsers.forEach(u => {
    console.log(`  - ${u.email} (${u.firstName} ${u.lastName})`);
  });
  process.exit(0);
}

listUsers();
