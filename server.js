const express = require("express");
const path = require("path");
const session = require("express-session");
const fs = require("fs");
const bcrypt = require("bcrypt");

const app = express();const ADMIN_EMAIL = "admin@test.com";


/* ===== MIDDLEWARE ===== */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "secret123",
    resave: false,
    saveUninitialized: true
  })
);

app.use(express.static(path.join(__dirname, "public")));

/* ===== PAGES ===== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

app.get("/dashboard", (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

/* ===== AUTH ===== */

// Signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.send("Missing fields");

  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  if (users.find(u => u.email === email)) {
    return res.send("Email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

users.push({
  email,
  password: hashedPassword,
  wallet: 0,
  completedTasks: []
});


  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

  // Save signup activity
  const activity = JSON.parse(fs.readFileSync("activity.json", "utf8"));
  activity.push({
    email,
    action: "Signup",
    details: "User registered",
    time: new Date().toLocaleString()
  });
  fs.writeFileSync("activity.json", JSON.stringify(activity, null, 2));

  res.redirect("/login");
});

// Login
app.post("/login", async (req, res) => {

  const { email, password } = req.body;
  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));

  const user = users.find(u => u.email === email);
if (!user) return res.send("Invalid login");

const match = await bcrypt.compare(password, user.password);
if (!match) return res.send("Invalid login");

  req.session.loggedIn = true;
  req.session.userEmail = email;

  // Save login activity
  const activity = JSON.parse(fs.readFileSync("activity.json", "utf8"));
  activity.push({
    email,
    action: "Login",
    details: "User logged in",
    time: new Date().toLocaleString()
  });
  fs.writeFileSync("activity.json", JSON.stringify(activity, null, 2));

  res.redirect("/dashboard");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* ===== APIs ===== */

// Wallet + completed tasks
app.get("/api/wallet", (req, res) => {
  if (!req.session.loggedIn) {
    return res.json({ wallet: 0, completedTasks: [] });
  }

  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  const user = users.find(u => u.email === req.session.userEmail);

  res.json({
    email: user.email,
    wallet: user.wallet,
    completedTasks: user.completedTasks || []
  });
});

// Tasks
app.get("/api/tasks", (req, res) => {
  const tasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));
  res.json(tasks);
});

// Complete task
app.post("/api/complete-task", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/login");

  const taskId = Number(req.body.taskId);

  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  const tasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));

  const userIndex = users.findIndex(
    u => u.email === req.session.userEmail
  );

  if (userIndex === -1) return res.redirect("/dashboard");

  const user = users[userIndex];
  if (!user.completedTasks) user.completedTasks = [];

  const task = tasks.find(t => t.id === taskId);
  if (!task) return res.redirect("/dashboard");

  if (user.completedTasks.includes(taskId)) {
    return res.redirect("/dashboard");
  }

  // Update wallet
  user.wallet += task.reward;
  user.completedTasks.push(taskId);

  users[userIndex] = user;
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

  // Save task activity
  const activityLog = JSON.parse(fs.readFileSync("activity.json", "utf8"));
  activityLog.push({
    email: user.email,
    action: "Task Completed",
    details: task.title + " (+" + task.reward + ")",
    time: new Date().toLocaleString()
  });
  fs.writeFileSync("activity.json", JSON.stringify(activityLog, null, 2));

  res.redirect("/dashboard");
});
// Activity API
app.get("/api/activity", (req, res) => {
  if (!req.session.loggedIn) {
    return res.json([]);
  }

  const activity = JSON.parse(fs.readFileSync("activity.json", "utf8"));

  const userActivity = activity.filter(
    a => a.email === req.session.userEmail
  );

  res.json(userActivity.reverse());
});
app.get("/admin", (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/login");
  }

  if (req.session.userEmail !== ADMIN_EMAIL) {
    return res.send("Access denied. Admin only.");
  }

  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
// Admin: get all users
app.get("/api/admin/users", (req, res) => {
  if (!req.session.loggedIn) {
    return res.status(401).json({ error: "Not logged in" });
  }

  if (req.session.userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Admin only" });
  }

  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));

  const cleanUsers = users.map(u => ({
    email: u.email,
    wallet: u.wallet,
    completedTasks: u.completedTasks ? u.completedTasks.length : 0
  }));

  res.json(cleanUsers);
});
// Admin: get all tasks
app.get("/api/admin/tasks", (req, res) => {
  if (!req.session.loggedIn || req.session.userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Admin only" });
  }

  const tasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));
  res.json(tasks);
});

// Admin: add task
app.post("/api/admin/tasks/add", (req, res) => {
  if (!req.session.loggedIn || req.session.userEmail !== ADMIN_EMAIL) {
    return res.status(403).send("Admin only");
  }

  const { title, reward } = req.body;
  if (!title || !reward) return res.send("Missing data");

  const tasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));

  const newTask = {
    id: Date.now(),
    title,
    reward: Number(reward)
  };

  tasks.push(newTask);
  fs.writeFileSync("tasks.json", JSON.stringify(tasks, null, 2));

  res.redirect("/admin");
});

// Admin: delete task
app.post("/api/admin/tasks/delete", (req, res) => {
  if (!req.session.loggedIn || req.session.userEmail !== ADMIN_EMAIL) {
    return res.status(403).send("Admin only");
  }

  const taskId = Number(req.body.taskId);
  const tasks = JSON.parse(fs.readFileSync("tasks.json", "utf8"));

  const updated = tasks.filter(t => t.id !== taskId);
  fs.writeFileSync("tasks.json", JSON.stringify(updated, null, 2));

  res.redirect("/admin");
});
// Admin: update user wallet
app.post("/api/admin/update-wallet", (req, res) => {
  if (!req.session.loggedIn || req.session.userEmail !== ADMIN_EMAIL) {
    return res.status(403).send("Admin only");
  }

  const { email, amount } = req.body;
  if (!email || !amount) return res.send("Missing data");

  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));

  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex === -1) return res.send("User not found");

  users[userIndex].wallet += Number(amount);

  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

  // Save activity
  const activity = JSON.parse(fs.readFileSync("activity.json", "utf8"));
  activity.push({
    email,
    action: "Admin Wallet Update",
    details: "Wallet changed by " + amount,
    time: new Date().toLocaleString()
  });
  fs.writeFileSync("activity.json", JSON.stringify(activity, null, 2));

  res.redirect("/admin");
});
// User: request withdrawal
app.post("/api/withdraw", (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/login");
  }

  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) {
    return res.send("Invalid amount");
  }

  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  const withdrawals = JSON.parse(fs.readFileSync("withdrawals.json", "utf8"));

  const userIndex = users.findIndex(
    u => u.email === req.session.userEmail
  );

  if (userIndex === -1) {
    return res.redirect("/dashboard");
  }

  const user = users[userIndex];

  if (user.wallet < amount) {
    return res.send("Insufficient balance");
  }

  withdrawals.push({
    email: user.email,
    amount,
    status: "pending",
    time: new Date().toLocaleString()
  });

  fs.writeFileSync(
    "withdrawals.json",
    JSON.stringify(withdrawals, null, 2)
  );

  // Save activity
  const activity = JSON.parse(fs.readFileSync("activity.json", "utf8"));
  activity.push({
    email: user.email,
    action: "Withdraw Requested",
    details: "Requested " + amount,
    time: new Date().toLocaleString()
  });
  fs.writeFileSync("activity.json", JSON.stringify(activity, null, 2));

  res.redirect("/dashboard");
});
// Admin: approve / reject withdrawal
app.post("/api/admin/withdrawals/update", (req, res) => {
  if (!req.session.loggedIn || req.session.userEmail !== ADMIN_EMAIL) {
    return res.status(403).send("Admin only");
  }

  const { index, action } = req.body;

  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  const withdrawals = JSON.parse(fs.readFileSync("withdrawals.json", "utf8"));

  const wd = withdrawals[index];
  if (!wd || wd.status !== "pending") {
    return res.redirect("/admin");
  }

  if (action === "approve") {
    const userIndex = users.findIndex(u => u.email === wd.email);
    if (userIndex !== -1 && users[userIndex].wallet >= wd.amount) {
      users[userIndex].wallet -= wd.amount;
      wd.status = "approved";
    }
  }

  if (action === "reject") {
    wd.status = "rejected";
  }

  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  fs.writeFileSync("withdrawals.json", JSON.stringify(withdrawals, null, 2));

  res.redirect("/admin");
});

/* ===== START SERVER ===== */
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
