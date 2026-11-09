/* =========================================================
   db.js - connects to MongoDB using the official MongoDB driver
   Other files call getDb() to reach the database.
   ========================================================= */

const { MongoClient } = require("mongodb");

let db = null; // filled in once we are connected

async function connectToDatabase() {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();

    // client.db() with no name uses the database in the address ("findit")
    db = client.db();

    // A unique index means MongoDB itself refuses two users with the same email
    await db.collection("users").createIndex({ email: 1 }, { unique: true });

    console.log("Connected to MongoDB");
}

function getDb() {
    return db;
}

module.exports = { connectToDatabase, getDb };
