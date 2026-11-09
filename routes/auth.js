/* =========================================================
   routes/auth.js - register, log in, and "who am I?"
   All addresses here start with /api/auth (see server.js)
   ========================================================= */

const express = require("express");
const {
    users, isUniversityEmail, hashPassword, checkPassword, publicUser, ALLOWED_EMAIL_ENDINGS
} = require("../models/User");
const { createToken, requireAuth } = require("../middleware/auth");

const router = express.Router();


// POST /api/auth/register  { name, email, password }
router.post("/register", async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    // Check everything on the server (the browser checks can be skipped)
    if (!name || name.length > 50) {
        return res.status(400).json({ error: "Please enter your name (max 50 characters)." });
    }
    if (!isUniversityEmail(email)) {
        return res.status(400).json({
            error: "Please use your university email (ending in " + ALLOWED_EMAIL_ENDINGS.join(", ") + ")."
        });
    }
    if (password.length < 6 || password.length > 100) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const newUser = {
        name,
        email,
        passwordHash: await hashPassword(password),
        joined: new Date()
    };

    try {
        const result = await users().insertOne(newUser);
        newUser._id = result.insertedId;
    } catch (error) {
        // 11000 = MongoDB's "duplicate key" error (email already used)
        if (error.code === 11000) {
            return res.status(409).json({ error: "There is already an account with this email. Try logging in." });
        }
        throw error; // any other problem goes to the error handler in server.js
    }

    // 201 = "Created"
    res.status(201).json({ token: createToken(newUser._id), user: publicUser(newUser) });
});


// POST /api/auth/login  { email, password }
router.post("/login", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await users().findOne({ email });

    // Same message for "no such email" and "wrong password",
    // so nobody can use this form to find out who has an account
    if (!user || !(await checkPassword(password, user.passwordHash))) {
        return res.status(401).json({ error: "Email or password is not correct." });
    }

    res.json({ token: createToken(user._id), user: publicUser(user) });
});


// GET /api/auth/me  (needs a token) - returns the logged-in user
router.get("/me", requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
});


module.exports = router;
