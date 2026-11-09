/* =========================================================
   Claim model - a message sent about an item
   ("This is mine" or "I found this")
   Shape of a claim in the "claims" collection:
   {
     _id:       ObjectId
     item:      ObjectId of the item
     fromUser:  ObjectId of the user who sent it
     fromName, fromEmail
     message:   text
     date:      Date
   }
   ========================================================= */

const { getDb } = require("../db");

// Shortcut to the claims collection
function claims() {
    return getDb().collection("claims");
}

// Returns an error message, or null if the message is fine
function checkMessage(message) {
    const text = String(message || "").trim();
    if (!text) return "Please write a message.";
    if (text.length > 1000) return "Message is too long (max 1000 characters).";
    return null;
}

module.exports = { claims, checkMessage };
