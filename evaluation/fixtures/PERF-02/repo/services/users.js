async function loadUsers(ids) {
  const users = [];

  for (const id of ids) {
    const user = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    users.push(user);
  }

  return users;
}
