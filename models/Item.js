/* =========================================================
   Item model - one document per lost or found item
   Shape of an item in the "items" collection:
   {
     _id:         ObjectId
     type:        "lost" or "found"
     name, category, description, location
     date:        "YYYY-MM-DD"
     photo:       "data:image/jpeg;base64,..." or ""
     status:      "open", "claimed" or "returned"
     postedBy:    ObjectId of the user (null for sample items)
     posterName, posterEmail
     createdAt, updatedAt: Date
   }
   ========================================================= */

const { getDb } = require("../db");

const TYPES = ["lost", "found"];
const STATUSES = ["open", "claimed", "returned"];

// Same list as the frontend
const CATEGORIES = [
    "ID card", "Keys", "Electronics", "Wallet or purse",
    "Bag", "Clothing", "Books and stationery", "Other"
];

// Shortcut to the items collection
function items() {
    return getDb().collection("items");
}

// Checks the form data sent by the frontend.
// Returns { error: "message" } if something is wrong,
// or { item: {...} } with only the allowed, tidied-up fields.
function checkItem(data) {
    const item = {
        type: data.type,
        name: String(data.name || "").trim(),
        category: data.category,
        description: String(data.description || "").trim(),
        location: String(data.location || "").trim(),
        date: String(data.date || ""),
        photo: String(data.photo || "")
    };

    if (!TYPES.includes(item.type)) return { error: "Type must be lost or found." };
    if (!item.name || item.name.length > 100) return { error: "Please enter an item name (max 100 characters)." };
    if (!CATEGORIES.includes(item.category)) return { error: "Please choose a category." };
    if (item.description.length > 1000) return { error: "Description is too long (max 1000 characters)." };
    if (!item.location || item.location.length > 100) return { error: "Please enter a location (max 100 characters)." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return { error: "Please choose a date." };
    if (item.photo && !item.photo.startsWith("data:image/")) return { error: "Photo must be an image." };

    return { item };
}

module.exports = { items, checkItem, STATUSES };
