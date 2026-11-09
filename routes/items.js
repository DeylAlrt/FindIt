/* =========================================================
   routes/items.js - report, browse, edit, delete items
   All addresses here start with /api/items (see server.js)
   ========================================================= */

const express = require("express");
const { ObjectId } = require("mongodb");
const { items, checkItem } = require("../models/Item");
const { claims } = require("../models/Claim");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();


/* ---------- Helper functions ---------- */

// Did this user post this item?
function isOwner(item, user) {
    return Boolean(user && item.postedBy && item.postedBy.equals(user._id));
}

// Finds an item by its id. Returns null if the id is not valid or not found.
async function findItem(id) {
    if (!ObjectId.isValid(id)) return null;
    return items().findOne({ _id: new ObjectId(id) });
}

// The ids of the items this user has already sent a message about
async function itemsClaimedBy(user) {
    if (!user) return new Set();
    const myClaims = await claims().find({ fromUser: user._id }).toArray();
    return new Set(myClaims.map((claim) => String(claim.item)));
}

// Turns a database item into what we send to the browser:
// - "_id" becomes "id"
// - the poster's email is only shown to logged-in users (privacy)
// - isMine and claimedByMe tell the frontend which buttons to show
function toPublic(item, user, claimedIds) {
    const { _id, postedBy, posterEmail, ...rest } = item;
    return {
        id: _id,
        ...rest,
        posterEmail: user ? posterEmail : "",
        isMine: isOwner(item, user),
        claimedByMe: claimedIds.has(String(_id))
    };
}

// Used by edit / delete / returned: finds the item and checks the
// logged-in user posted it. Sends an error and returns null if not.
async function findMyItem(req, res) {
    const item = await findItem(req.params.id);
    if (!item) {
        res.status(404).json({ error: "Item not found." });
        return null;
    }
    if (!isOwner(item, req.user)) {
        // 403 = "Forbidden": you are logged in, but this isn't yours
        res.status(403).json({ error: "You can only change your own posts." });
        return null;
    }
    return item;
}


/* ---------- Routes ---------- */

// GET /api/items - every item, newest first (anyone can browse)
router.get("/", optionalAuth, async (req, res) => {
    const list = await items().find().sort({ createdAt: -1 }).toArray();
    const claimedIds = await itemsClaimedBy(req.user);
    res.json(list.map((item) => toPublic(item, req.user, claimedIds)));
});

// GET /api/items/:id - one item
router.get("/:id", optionalAuth, async (req, res) => {
    const item = await findItem(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found." });
    const claimedIds = await itemsClaimedBy(req.user);
    res.json(toPublic(item, req.user, claimedIds));
});

// POST /api/items - report a new lost or found item (must be logged in)
router.post("/", requireAuth, async (req, res) => {
    const { error, item } = checkItem(req.body);
    if (error) return res.status(400).json({ error });

    const now = new Date();
    const newItem = {
        ...item,
        status: "open",
        // These come from the token, NOT from the form, so nobody can post as someone else
        postedBy: req.user._id,
        posterName: req.user.name,
        posterEmail: req.user.email,
        createdAt: now,
        updatedAt: now
    };
    const result = await items().insertOne(newItem);
    newItem._id = result.insertedId;

    res.status(201).json(toPublic(newItem, req.user, new Set()));
});

// PUT /api/items/:id - edit your own post
router.put("/:id", requireAuth, async (req, res) => {
    const item = await findMyItem(req, res);
    if (!item) return; // error already sent

    const { error, item: changes } = checkItem(req.body);
    if (error) return res.status(400).json({ error });

    await items().updateOne({ _id: item._id }, { $set: { ...changes, updatedAt: new Date() } });
    res.json(toPublic({ ...item, ...changes }, req.user, new Set()));
});

// PATCH /api/items/:id/returned - mark your own post as returned
router.patch("/:id/returned", requireAuth, async (req, res) => {
    const item = await findMyItem(req, res);
    if (!item) return;

    await items().updateOne({ _id: item._id }, { $set: { status: "returned", updatedAt: new Date() } });
    res.json({ ok: true });
});

// DELETE /api/items/:id - delete your own post (and its messages)
router.delete("/:id", requireAuth, async (req, res) => {
    const item = await findMyItem(req, res);
    if (!item) return;

    await items().deleteOne({ _id: item._id });
    await claims().deleteMany({ item: item._id });
    res.json({ ok: true });
});


module.exports = router;
