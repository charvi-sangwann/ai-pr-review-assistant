async function login(username, password) {
  const user = await authenticate(username, password);

  if (!user) {
    throw new Error("Invalid credentials");
  }

  return user;
}
