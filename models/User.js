/* =========================================================
   User model - one document per registered student
   Shape of a user in the "users" collection:
   {
     _id:          ObjectId (made by MongoDB)
     name:         "Sam Lee"
     email:        "sam@uni.ac.uk"   (unique, lowercase)
     passwordHash: "salt:hash"       (never the real password)
     joined:       Date
   }
   ========================================================= */

const crypto = require("crypto"); // built into Node.js
const { promisify } = require("util");
const { getDb } = require("../db");

// scrypt normally uses a callback; promisify lets us use "await" instead
const scrypt = promisify(crypto.scrypt);

// Emails must end with one of these (same list as the frontend)
const ALLOWED_EMAIL_ENDINGS = [".edu", ".ac.uk", ".ac.ae", ".edu.au"];

// Shortcut to the users collection
function users() {
    return getDb().collection("users");
}

// Checks the email looks like name@something and ends with a university ending.
// This check runs on the SERVER, so nobody can skip it with DevTools.
function isUniversityEmail(email) {
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    return looksLikeEmail && ALLOWED_EMAIL_ENDINGS.some((ending) => email.endsWith(ending));
}

// Turns a password into "salt:hash".
// The salt is random, so two people with the same password get different hashes.
// scrypt is deliberately slow, which makes guessing passwords very slow too.
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(password, salt, 64);
    return salt + ":" + hash.toString("hex");
}

// Checks a typed password against a saved "salt:hash"
async function checkPassword(password, savedHash) {
    const [salt, hashHex] = savedHash.split(":");
    const savedBytes = Buffer.from(hashHex, "hex");
    const typedBytes = await scrypt(password, salt, 64);
    // timingSafeEqual compares in a way that doesn't leak hints through timing
    return crypto.timingSafeEqual(savedBytes, typedBytes);
}

// The user details that are safe to send to the browser (no passwordHash!)
function publicUser(user) {
    return { id: user._id, name: user.name, email: user.email, joined: user.joined };
}

module.exports = {
    users, isUniversityEmail, hashPassword, checkPassword, publicUser, ALLOWED_EMAIL_ENDINGS
};
