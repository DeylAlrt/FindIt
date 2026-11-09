/* =========================================================
   FindIt - server.js
   This is the BACKEND. It does three jobs:
   1. Serves the frontend files in the "public" folder
   2. Answers API requests at /api/... (added in later steps)
   3. Connects to the MongoDB database
   ========================================================= */

// Load the settings from the .env file (MONGODB_URI, JWT_SECRET, PORT).
// loadEnvFile is built into Node.js, so no extra package is needed.
// On Vercel there is no .env file - the settings come from the
// Vercel dashboard instead - so only load the file if it exists.
try {
    process.loadEnvFile();
} catch {
    // no .env file (e.g. on Vercel) - that's fine
}

const path = require("path");
const express = require("express");

const { connectToDatabase, getDb } = require("./db");
const { items } = require("./models/Item");

const app = express();
const PORT = process.env.PORT || 3000;


/* =========================================================
   1. MIDDLEWARE (code that runs on every request)
   ========================================================= */

// Read JSON sent by the frontend. The limit is 2mb because
// items can include a photo (a resized JPEG stored as text).
app.use(express.json({ limit: "2mb" }));

// Serve index.html, style.css, app.js, icons etc. from /public
app.use(express.static(path.join(__dirname, "public")));

// Make sure the database is connected before any /api request runs.
// (On Vercel the server starts fresh often, so we connect on demand.)
app.use("/api", async (req, res, next) => {
    try {
        await ready();
        next();
    } catch (error) {
        next(error);
    }
});


/* =========================================================
   2. API ROUTES
   ========================================================= */

// A simple test route so we can check the server is alive.
// Visit http://localhost:3000/api/health in the browser.
app.get("/api/health", async (req, res) => {
    // "ping" asks MongoDB to reply, which proves the connection works
    await getDb().command({ ping: 1 });
    res.json({ ok: true, database: "connected" });
});

// Register, log in, "who am I?"  ->  /api/auth/...
app.use("/api/auth", require("./routes/auth"));

// Report, browse, edit, delete items  ->  /api/items/...
app.use("/api/items", require("./routes/items"));

// Messages about items  ->  /api/claims/...
app.use("/api/claims", require("./routes/claims"));

// Any other /api address that doesn't exist gets a JSON error
app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found" });
});

// If any route crashes, send a tidy error instead of crashing the server.
// (Express 5 sends errors from async routes here automatically.)
app.use((err, req, res, next) => {
    // The request was bigger than the 2mb limit (usually a huge photo)
    if (err.type === "entity.too.large") {
        return res.status(413).json({ error: "That is too big to upload. Try a smaller photo." });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server" });
});


/* =========================================================
   3. SAMPLE DATA: if the sample items are missing, add them
      so the app isn't empty the first time it runs
   ========================================================= */

const SAMPLE_EMAIL = "reception@findit.edu"; // sample items are "posted" by this

// Returns a date as "YYYY-MM-DD", a number of days ago
function dateString(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().slice(0, 10);
}

async function seedItems() {
    const count = await items().countDocuments({ posterEmail: SAMPLE_EMAIL });
    if (count > 0) return; // the sample items are already there, so do nothing

    // [type, name, category, location, days ago, description, photo]
    // The photos are in public/images/samples (see CREDITS.txt there)
    const samples = [
        ["found", "Black leather wallet", "Wallet or purse", "Library, 2nd floor", 0, "Found under a desk near the windows.", "wallet.jpg"],
        ["found", "Student ID card", "ID card", "Cafeteria", 0, "Left on a table at lunch time.", "id-card.svg"],
        ["found", "USB-C laptop charger", "Electronics", "Room 204", 1, "White USB-C power adapter still plugged into the wall.", "charger.jpg"],
        ["found", "Blue umbrella", "Other", "Gym entrance", 2, "Small blue folding umbrella with a black handle.", "umbrella.jpg"],
        ["lost", "Car keys with blue keyring", "Keys", "Car park", 1, "Three keys on a ring with a blue tag.", "car-keys.jpg"]
    ];

    const now = new Date();
    await items().insertMany(samples.map((sample) => ({
        type: sample[0],
        name: sample[1],
        category: sample[2],
        location: sample[3],
        date: dateString(sample[4]),
        description: sample[5],
        photo: "/images/samples/" + sample[6],
        status: "open",
        postedBy: null, // sample items have no real account
        posterName: "FindIt Reception",
        posterEmail: SAMPLE_EMAIL,
        createdAt: now,
        updatedAt: now
    })));
    console.log("Added sample items to the database");
}


/* =========================================================
   4. START: connect to the database, then start listening
   ========================================================= */

// Connect + add sample data only once, and share that work with
// every request. If it fails, the next request tries again.
let readyPromise = null;
function ready() {
    if (!readyPromise) {
        readyPromise = (async () => {
            await connectToDatabase();
            await seedItems();
        })().catch((error) => {
            readyPromise = null;
            throw error;
        });
    }
    return readyPromise;
}

async function start() {
    try {
        await ready();

        app.listen(PORT, () => {
            console.log(`FindIt is running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Could not connect to MongoDB:", error.message);
        process.exit(1); // stop the program because the app can't work without the database
    }
}

// On your computer: start the server normally.
// On Vercel: Vercel runs the app itself, so we just hand it over.
if (!process.env.VERCEL) {
    start();
}

module.exports = app;
