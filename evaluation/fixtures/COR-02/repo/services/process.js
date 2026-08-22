function processUsers(users) {
  for (const user of users) {
    saveUser(user);
    return true;
  }
}
