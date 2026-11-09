/* =========================================================
   routes/claims.js - "This is mine" / "I found this" messages
   All addresses here start with /api/claims (see server.js)
   ========================================================= */

const express = require("express");
const { ObjectId } = require("mongodb");
const { items } = require("../models/Item");
const { claims, checkMessage } = require("../models/Claim");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();


// POST /api/claims  { itemId, message } - send a message about an item
router.post("/", requireAuth, async (req, res) => {
    const itemId = String(req.body.itemId || "");
    const item = ObjectId.isValid(itemId) ? await items().findOne({ _id: new ObjectId(itemId) }) : null;
    if (!item) return res.status(404).json({ error: "Item not found." });

    const error = checkMessage(req.body.message);
    if (error) return res.status(400).json({ error });

    // The same rules as the frontend, but enforced here so they can't be skipped
    if (item.postedBy && item.postedBy.equals(req.user._id)) {
        return res.status(400).json({ error: "You can't send a message about your own post." });
    }
    if (item.status === "returned") {
        return res.status(400).json({ error: "This item has already been returned." });
    }
    const already = await claims().findOne({ item: item._id, fromUser: req.user._id });
    if (already) {
        return res.status(409).json({ error: "You have already sent a message about this item." });
    }

    await claims().insertOne({
        item: item._id,
        fromUser: req.user._id,
        fromName: req.user.name,
        fromEmail: req.user.email,
        message: String(req.body.message).trim(),
        date: new Date()
    });

    // The first message changes the item from "open" to "claimed"
    if (item.status === "open") {
        await items().updateOne({ _id: item._id }, { $set: { status: "claimed", updatedAt: new Date() } });
    }

    res.status(201).json({ ok: true });
});


// GET /api/claims - the messages people sent about MY posts (for "My posts")
router.get("/", requireAuth, async (req, res) => {
    // 1. Find the ids of the items I posted
    const myItems = await items().find({ postedBy: req.user._id }).project({ _id: 1 }).toArray();
    const myItemIds = myItems.map((item) => item._id);

    // 2. Find the messages about those items ($in = "is one of these")
    const list = await claims().find({ item: { $in: myItemIds } }).sort({ date: 1 }).toArray();

    res.json(list.map((claim) => ({
        id: claim._id,
        itemId: claim.item,
        fromName: claim.fromName,
        fromEmail: claim.fromEmail,
        message: claim.message,
        date: claim.date
    })));
});


module.exports = router;
