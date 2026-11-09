/* =========================================================
   middleware/auth.js - login tokens (JWT)======= */

const crypto = require("crypto");
const { ObjectId } = require("mongodb");
const { users } = require("../models/User");

const TOKEN_LIFETIME = 7 * 24 * 60 * 60; // 7 days, in seconds

// Text -> base64url (a URL-safe version of base64)
function toBase64Url(text) {
    return Buffer.from(text).toString("base64url");
}

// Makes the signature for some text using our secret
function sign(text) {
    return crypto.createHmac("sha256", process.env.JWT_SECRET).update(text).digest("base64url");
}

// Creates a token for a user, sent to the browser after login/register
function createToken(userId) {
    const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = toBase64Url(JSON.stringify({
        sub: String(userId),                                   // "subject" = the user id
        exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME     // expiry time
    }));
    return `${header}.${payload}.${sign(header + "." + payload)}`;
}

// Checks a token. Returns the user id if it's valid, or null if not.
function readToken(token) {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    // 1. Is the signature correct?
    const expected = Buffer.from(sign(header + "." + payload));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    // 2. Has it expired?
    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString());
        if (data.exp < Date.now() / 1000) return null;
        return data.sub;
    } catch {
        return null; // payload wasn't valid JSON
    }
}

// Reads "Authorization: Bearer <token>" and finds that user in the database
async function findUserFromRequest(req) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return null;

    const userId = readToken(header.slice(7)); // the text after "Bearer "
    if (!userId || !ObjectId.isValid(userId)) return null;

    return users().findOne({ _id: new ObjectId(userId) });
}

// Use on routes that NEED a logged-in user (e.g. reporting an item).
// If the token is missing or fake, the request is stopped with 401.
async function requireAuth(req, res, next) {
    const user = await findUserFromRequest(req);
    if (!user) {
        return res.status(401).json({ error: "Please log in first." });
    }
    req.user = user; // the route can now use req.user
    next();
}

// Use on routes that work for everyone, but act differently when logged in.
// req.user is the user, or null for visitors.
async function optionalAuth(req, res, next) {
    req.user = await findUserFromRequest(req);
    next();
}

module.exports = { createToken, requireAuth, optionalAuth };
