
/* =========================================================
   1. SETTINGS
   ========================================================= */

// Emails must end with one of these (change this to your university's real domain)
const ALLOWED_EMAIL_ENDINGS = [".edu", ".ac.uk", ".ac.ae", ".edu.au"];

const CATEGORIES = [
    "ID card", "Keys", "Electronics", "Wallet or purse",
    "Bag", "Clothing", "Books and stationery", "Other"
];

// Suggestions for the location box
const PLACES = [
    "Library", "Cafeteria", "Gym", "Main entrance",
    "Car park", "Lecture hall", "Computer lab", "Student lounge"
];

// Photos are shrunk to this size (in pixels) so uploads stay small and fast
const MAX_PHOTO_SIZE = 600;


/* =========================================================
   2. SMALL HELPER FUNCTIONS
   ========================================================= */

// Shortcut for document.getElementById
function byId(id) {
    return document.getElementById(id);
}

// Makes user text safe before putting it into HTML.
// Without this, someone could type <script> into an item name and break the page.
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Returns a date as "YYYY-MM-DD" (the format used by <input type="date">)
function dateString(daysAgo = 0) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

// Turns "2026-11-07" into something nicer like "7 Nov 2026"
function formatDate(text) {
    return new Date(text + "T00:00").toLocaleDateString(undefined, {
        day: "numeric", month: "short", year: "numeric"
    });
}

// Sort function: newest items first
function newestFirst(a, b) {
    // createdAt comes from the server as text like "2026-11-09T08:26:02.895Z", which sorts like a date
    return b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));
}


/* =========================================================
   3. TALKING TO THE SERVER (the API)
   The data now lives in MongoDB on the server, so we ask for it
   with fetch(). When you log in, the server gives us a "token".
   We send it with every request to prove who we are.
   localStorage now only keeps the token and the user's name.
   ========================================================= */

// Small helpers for localStorage. It can only store text, so we
// convert values to text with JSON.stringify and back with JSON.parse.
function load(key, fallback) {
    try {
        const text = localStorage.getItem(key);
        return text ? JSON.parse(text) : fallback;
    } catch (error) {
        return fallback;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.log("Could not save data:", error);
        return false;
    }
}

// The Week 1 prototype kept everything in localStorage. Remove that old data.
["findit_users", "findit_items", "findit_claims", "findit_currentUser"]
    .forEach((key) => localStorage.removeItem(key));

// The app's data
let token = load("findit_token", null);       // the login token (JWT) from the server
let currentUser = load("findit_user", null);  // { id, name, email } of who is logged in
let items = [];                               // all items, loaded from the server
let myClaims = [];                            // messages people sent about MY posts

// Sends a request to our API and returns the server's JSON answer.
// If the server says something went wrong, this throws an Error
// with the server's message (e.g. "Please choose a category.").
async function api(method, path, body) {
    const options = { method, headers: {} };
    if (token) {
        options.headers.Authorization = "Bearer " + token;
    }
    if (body) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch("/api" + path, options);
    } catch (error) {
        // fetch only fails like this when it can't reach the server at all
        throw new Error("Can't reach the server. Check your internet connection.");
    }

    const data = await response.json().catch(() => ({})); // {} if the answer wasn't JSON

    // 401 while we have a token means the token expired or is fake
    if (response.status === 401 && token) {
        logOut("Your session has ended. Please log in again.");
    }
    if (!response.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
    }
    return data;
}

// Ask the server for the latest list of items
async function loadItems() {
    items = await api("GET", "/items");
}

// Returns the logged-in user, or null if nobody is logged in
function getUser() {
    return currentUser;
}

// Remember (or forget, with null) who is logged in
function setLogin(newToken, user) {
    token = newToken;
    currentUser = user;
    save("findit_token", token);
    save("findit_user", currentUser);
}


/* =========================================================
   4. SWITCHING SCREENS
   ========================================================= */

// These screens need the user to be logged in
const LOGIN_REQUIRED = ["dashboard", "browse", "details", "report", "confirm", "myposts"];

let selectedItemId = null;   // the item shown on the details screen
let previousScreen = "browse"; // where the "Back" button goes

async function showScreen(name) {
    // Not logged in? Send them to the login screen instead
    if (LOGIN_REQUIRED.includes(name) && !getUser()) {
        name = "login";
    }

    // Show the chosen screen, hide all the others
    document.querySelectorAll(".screen").forEach((screen) => {
        screen.hidden = screen.id !== "screen-" + name;
    });

    // Highlight the current page in the menu
    document.querySelectorAll(".nav-link[data-go]").forEach((link) => {
        link.classList.toggle("active", link.dataset.go === name);
    });

    window.scrollTo(0, 0);

    // Get the latest data from the server
    try {
        if (["home", "dashboard", "browse", "details", "myposts"].includes(name)) {
            await loadItems();
        }
        if (name === "myposts") {
            myClaims = await api("GET", "/claims");
        }
    } catch (error) {
        // Couldn't load: just draw the screen with the data we already have
        console.log("Could not load data:", error.message);
    }

    // We might have been logged out while waiting (expired token)
    if (LOGIN_REQUIRED.includes(name) && !getUser()) return;

    // Draw the screen
    if (name === "home") renderHome();
    if (name === "dashboard") renderDashboard();
    if (name === "browse") renderBrowse();
    if (name === "details") renderDetails();
    if (name === "myposts") renderMyPosts();
}

// Show the menu only when someone is logged in
function updateNav() {
    const loggedIn = Boolean(getUser());
    byId("mainNav").hidden = !loggedIn;
    byId("campusLabel").hidden = loggedIn;
    byId("startButton").textContent = loggedIn ? "Go to dashboard" : "Get started";
}

// Any element with data-go="screenName" opens that screen when clicked.
// Any element with data-view="itemId" opens that item's details.
document.addEventListener("click", (event) => {
    const goLink = event.target.closest("[data-go]");
    if (goLink) {
        if (goLink.dataset.go === "report") {
            openReportForm(goLink.dataset.type || "lost");
        } else {
            showScreen(goLink.dataset.go);
        }
        return;
    }

    const viewLink = event.target.closest("[data-view]");
    if (viewLink) {
        event.preventDefault(); // stop the link from jumping the page
        openItem(viewLink.dataset.view);
    }
});

function openItem(itemId) {
    // Remember which screen we came from, so "Back" returns there
    const visible = document.querySelector(".screen:not([hidden])");
    const from = visible.id.replace("screen-", "");
    if (from !== "details" && from !== "confirm") previousScreen = from;

    selectedItemId = itemId;
    showScreen("details");
}

byId("backButton").addEventListener("click", () => showScreen(previousScreen));


/* =========================================================
   5. SHARED PIECES OF HTML
   ========================================================= */

// Photo, or a grey box with the category name if there is no photo
function photoHtml(item) {
    if (item.photo) {
        // escapeHtml here too: the photo text comes from other users via the server
        return `<img src="${escapeHtml(item.photo)}" alt="Photo of ${escapeHtml(item.name)}">`;
    }
    return `<div class="card-photo-empty">${escapeHtml(item.category)}</div>`;
}

function badgesHtml(item) {
    let html = `<span class="badge badge-${item.type}">${item.type === "lost" ? "Lost" : "Found"}</span>`;
    if (item.status !== "open") {
        html += ` <span class="badge badge-status">${item.status}</span>`;
    }
    return html;
}

// One item "card" used on the dashboard and browse screens
function itemCardHtml(item) {
    return `
        <a class="card" href="#" data-view="${item.id}">
            ${photoHtml(item)}
            <div class="card-body">
                <div>${badgesHtml(item)}</div>
                <span class="card-title">${escapeHtml(item.name)}</span>
                <span class="card-meta">${escapeHtml(item.location)} &middot; ${formatDate(item.date)}</span>
            </div>
        </a>`;
}

function showCards(containerId, list, emptyText) {
    byId(containerId).innerHTML = list.length
        ? list.map(itemCardHtml).join("")
        : `<p class="empty">${emptyText}</p>`;
}

// Fill the category drop-downs and the location suggestions
CATEGORIES.forEach((category) => {
    byId("itemCategory").add(new Option(category, category));
    byId("filterCategory").add(new Option(category, category));
});
byId("placeList").innerHTML = PLACES.map((place) => `<option value="${place}">`).join("");


/* =========================================================
   6. HOME SCREEN (the Week 1 page)
   ========================================================= */

const button = byId("startButton");
const message = byId("message");

button.addEventListener("click", () => {
    message.textContent = "Welcome to FindIt!";
    showScreen(getUser() ? "dashboard" : "login");
});

function renderHome() {
    // Found items that are still waiting for their owner
    const waiting = items
        .filter((item) => item.type === "found" && item.status !== "returned")
        .sort(newestFirst);

    // Show the 4 newest in the yellow panel
    byId("homeItems").innerHTML = waiting.slice(0, 4).map((item) => `
        <li>
            <span class="item-name">${escapeHtml(item.name)}</span>
            <span class="item-place">${escapeHtml(item.location)}</span>
        </li>`).join("");

    // The big number: how many found items are waiting
    byId("itemCount").textContent = waiting.length;
}


/* =========================================================
   7. FEATURE 1 - REGISTER AND LOG IN
   ========================================================= */

let isRegistering = false;

// Switch the form between "Log in" and "Create account"
function setAuthMode(register) {
    isRegistering = register;
    byId("authTitle").textContent = register ? "Create account" : "Log in";
    byId("authSubmit").textContent = register ? "Create account" : "Log in";
    byId("authSwitchText").textContent = register ? "Already have an account?" : "No account yet?";
    byId("authSwitch").textContent = register ? "Log in" : "Create one";
    byId("nameField").hidden = !register;
    byId("authName").required = register;
    byId("authPassword").autocomplete = register ? "new-password" : "current-password";
    byId("authError").textContent = "";
}

byId("authSwitch").addEventListener("click", () => setAuthMode(!isRegistering));

// A quick check in the browser so the user gets instant feedback.
// The server checks again, because browser checks can be skipped.
function isUniversityEmail(email) {
    return ALLOWED_EMAIL_ENDINGS.some((ending) => email.endsWith(ending));
}

byId("authForm").addEventListener("submit", async (event) => {
    event.preventDefault(); // stop the browser from reloading the page

    const name = byId("authName").value.trim();
    const email = byId("authEmail").value.trim().toLowerCase();
    const password = byId("authPassword").value;
    const error = byId("authError");
    const submitButton = byId("authSubmit");

    if (!isUniversityEmail(email)) {
        error.textContent = "Please use your university email (ending in " + ALLOWED_EMAIL_ENDINGS.join(", ") + ").";
        return;
    }

    // The password is sent to the server, which hashes and checks it.
    // The server answers with a token and the user's details.
    submitButton.disabled = true; // stop double clicks while we wait
    try {
        const path = isRegistering ? "/auth/register" : "/auth/login";
        const result = await api("POST", path, { name, email, password });
        setLogin(result.token, result.user);
    } catch (problem) {
        error.textContent = problem.message; // e.g. "Email or password is not correct."
        return;
    } finally {
        submitButton.disabled = false;
    }

    // Logged in!
    byId("authForm").reset();
    setAuthMode(false);
    updateNav();
    showScreen("dashboard");
});

// Forget the token and go back to the home screen
function logOut(text) {
    setLogin(null, null);
    myClaims = [];
    // Delete the saved API data, so the next person on this device can't see it offline
    if ("caches" in window) caches.delete("findit-api-v1");
    message.textContent = text;
    updateNav();
    showScreen("home");
}

byId("logoutButton").addEventListener("click", () => logOut("You have logged out."));


/* =========================================================
   8. DASHBOARD
   ========================================================= */

function renderDashboard() {
    const user = getUser();
    byId("userName").textContent = user.name.split(" ")[0]; // first name only

    byId("statOpen").textContent = items.filter((item) => item.status !== "returned").length;
    byId("statMine").textContent = items.filter((item) => item.isMine).length; // isMine comes from the server
    byId("statReturned").textContent = items.filter((item) => item.status === "returned").length;

    const recent = items
        .filter((item) => item.status !== "returned")
        .sort(newestFirst)
        .slice(0, 6);
    showCards("recentItems", recent, "Nothing has been posted yet.");
}


/* =========================================================
   9. FEATURE 3 - BROWSE AND SEARCH WITH FILTERS
   ========================================================= */

function renderBrowse() {
    // Build the "Place" drop-down from the locations used in posts
    const placeSelect = byId("filterLocation");
    const chosenPlace = placeSelect.value;
    const places = [...new Set(items.map((item) => item.location))].sort();
    placeSelect.innerHTML = '<option value="">All places</option>';
    places.forEach((place) => placeSelect.add(new Option(place, place)));
    placeSelect.value = places.includes(chosenPlace) ? chosenPlace : "";

    // Read what the user chose in each filter
    const text = byId("searchText").value.trim().toLowerCase();
    const type = byId("filterType").value;
    const category = byId("filterCategory").value;
    const place = placeSelect.value;
    const fromDate = byId("filterDate").value;
    const showReturned = byId("filterShowReturned").checked;

    // Keep only the items that match every filter
    const results = items.filter((item) => {
        if (!showReturned && item.status === "returned") return false;
        if (type && item.type !== type) return false;
        if (category && item.category !== category) return false;
        if (place && item.location !== place) return false;
        if (fromDate && item.date < fromDate) return false; // "YYYY-MM-DD" text sorts like a date
        if (text) {
            const searchable = `${item.name} ${item.description} ${item.location} ${item.category}`.toLowerCase();
            if (!searchable.includes(text)) return false;
        }
        return true;
    }).sort(newestFirst);

    byId("resultCount").textContent = results.length + (results.length === 1 ? " item found" : " items found");
    showCards("browseResults", results, "No items match your search. Try removing a filter.");
}

// Update the results every time a filter changes
["searchText", "filterType", "filterCategory", "filterLocation", "filterDate", "filterShowReturned"]
    .forEach((id) => byId(id).addEventListener("input", renderBrowse));


/* =========================================================
   10. FEATURE 4 - ITEM DETAILS, CLAIM AND CONTACT
   ========================================================= */

function renderDetails() {
    const item = items.find((i) => i.id === selectedItemId);
    if (!item) {
        showScreen("browse");
        return;
    }
    // The server tells us if this is our own post
    const isMine = item.isMine;

    // Email link that opens the user's email app with a subject already filled in
    const subject = encodeURIComponent("FindIt: " + item.name);
    const contactLink = isMine ? "" :
        `<a class="btn-link" href="mailto:${escapeHtml(item.posterEmail)}?subject=${subject}">Email ${escapeHtml(item.posterName)}</a>`;

    byId("detailsContent").innerHTML = `
        <div class="details">
            ${photoHtml(item)}
            <div>
                ${badgesHtml(item)}
                <h2 class="page-title">${escapeHtml(item.name)}</h2>
                <p>${escapeHtml(item.description || "No description.")}</p>
                <dl class="details-list">
                    <dt>Category</dt><dd>${escapeHtml(item.category)}</dd>
                    <dt>Location</dt><dd>${escapeHtml(item.location)}</dd>
                    <dt>Date</dt><dd>${formatDate(item.date)}</dd>
                    <dt>Posted by</dt><dd>${escapeHtml(item.posterName)}</dd>
                </dl>
                ${contactLink}
            </div>
        </div>`;

    // Decide whether to show the claim form
    const alreadyClaimed = item.claimedByMe; // also from the server
    byId("claimError").textContent = "";
    const note = byId("detailsNote");
    const claimForm = byId("claimForm");

    claimForm.hidden = true;
    if (isMine) {
        note.textContent = "This is your post. You can edit it or mark it as returned in My posts.";
    } else if (item.status === "returned") {
        note.textContent = "This item has already been returned to its owner.";
    } else if (alreadyClaimed) {
        note.textContent = "You have already sent a message about this item. The person who posted it will contact you.";
    } else {
        note.textContent = "";
        claimForm.hidden = false;
        // A found item is claimed by its owner; a lost item is answered by a finder
        byId("claimTitle").textContent = item.type === "found" ? "This is mine" : "I found this";
    }
}

byId("claimForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = getUser();
    const item = items.find((i) => i.id === selectedItemId);

    // Send the message to the server. The server saves it and
    // changes the item from "open" to "claimed".
    try {
        await api("POST", "/claims", {
            itemId: item.id,
            message: byId("claimMessage").value.trim()
        });
    } catch (problem) {
        byId("claimError").textContent = problem.message;
        return;
    }

    byId("claimForm").reset();

    showConfirmation(
        "Message sent",
        `${item.posterName} will see your message in their posts and can email you at ${user.email}.`,
        item.id
    );
});


/* =========================================================
   11. FEATURE 2 - REPORT AN ITEM (also used for editing)
   ========================================================= */

let editingItemId = null;   // null = new post, otherwise the id of the post being edited
let chosenPhoto = "";       // the photo as text (a "data URL")

// Open the form, either empty (new post) or filled in (editing)
function openReportForm(type, item = null) {
    const form = byId("reportForm");
    form.reset();
    byId("reportError").textContent = "";
    byId("itemDate").max = dateString(); // can't lose something in the future
    editingItemId = item ? item.id : null;
    chosenPhoto = item ? item.photo : "";

    if (item) {
        form.elements.type.value = item.type;
        byId("itemName").value = item.name;
        byId("itemCategory").value = item.category;
        byId("itemDescription").value = item.description;
        byId("itemLocation").value = item.location;
        byId("itemDate").value = item.date;
    } else {
        form.elements.type.value = type;
        byId("itemDate").value = dateString();
    }

    byId("reportTitle").textContent = item ? "Edit your post" : "Report an item";
    byId("reportSubmit").textContent = item ? "Save changes" : "Post item";
    showPhotoPreview();
    showScreen("report");
}

function showPhotoPreview() {
    const preview = byId("photoPreview");
    preview.src = chosenPhoto;
    preview.hidden = !chosenPhoto;
}

// Shrink a photo so it is small enough to save, and turn it into text
function resizePhoto(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(1, MAX_PHOTO_SIZE / Math.max(image.width, image.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(image.src);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
    });
}

byId("itemPhoto").addEventListener("change", async () => {
    const file = byId("itemPhoto").files[0];
    if (!file) return;
    try {
        chosenPhoto = await resizePhoto(file);
        byId("reportError").textContent = "";
    } catch (error) {
        chosenPhoto = "";
        byId("reportError").textContent = "That file could not be opened as a photo.";
    }
    showPhotoPreview();
});

byId("reportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = byId("reportForm");
    const submitButton = byId("reportSubmit");

    // Collect what the user typed
    const details = {
        type: form.elements.type.value,
        name: byId("itemName").value.trim(),
        category: byId("itemCategory").value,
        description: byId("itemDescription").value.trim(),
        location: byId("itemLocation").value.trim(),
        date: byId("itemDate").value,
        photo: chosenPhoto
    };

    // Send it to the server: PUT to change an existing post, POST for a new one.
    // The server checks the details and answers with the saved item.
    let item;
    submitButton.disabled = true; // stop double posts while we wait
    try {
        if (editingItemId) {
            item = await api("PUT", "/items/" + editingItemId, details);
        } else {
            item = await api("POST", "/items", details);
        }
    } catch (problem) {
        byId("reportError").textContent = problem.message;
        return;
    } finally {
        submitButton.disabled = false;
    }

    showConfirmation(
        editingItemId ? "Changes saved" : "Item posted",
        editingItemId
            ? "Your post has been updated."
            : `Your ${item.type} item is now visible to everyone on FindIt.`,
        item.id
    );
});


/* =========================================================
   12. CONFIRMATION SCREEN
   ========================================================= */

function showConfirmation(title, text, itemId) {
    byId("confirmTitle").textContent = title;
    byId("confirmText").textContent = text;
    selectedItemId = itemId;
    previousScreen = "dashboard";
    showScreen("confirm");
}

byId("confirmView").addEventListener("click", () => showScreen("details"));


/* =========================================================
   13. FEATURE 5 - MY POSTS (edit, delete, mark as returned)
   ========================================================= */

function renderMyPosts() {
    const myItems = items.filter((item) => item.isMine).sort(newestFirst);
    const list = byId("myPostsList");

    if (myItems.length === 0) {
        list.innerHTML = '<p class="empty">You have not posted anything yet.</p>';
        return;
    }

    list.innerHTML = myItems.map((item) => {
        // Messages other users sent about this item
        const itemClaims = myClaims.filter((c) => c.itemId === item.id);
        const claimsHtml = itemClaims.length
            ? `<ul class="post-claims">${itemClaims.map((c) => `
                <li><strong>${escapeHtml(c.fromName)}</strong>
                    (<a href="mailto:${escapeHtml(c.fromEmail)}">${escapeHtml(c.fromEmail)}</a>):
                    ${escapeHtml(c.message)}</li>`).join("")}</ul>`
            : '<p class="card-meta">No messages yet.</p>';

        return `
            <article class="post">
                ${photoHtml(item)}
                <div>
                    ${badgesHtml(item)}
                    <h3 class="post-title">${escapeHtml(item.name)}</h3>
                    <p class="card-meta">${escapeHtml(item.location)} &middot; ${formatDate(item.date)}</p>
                    ${claimsHtml}
                    <div class="actions">
                        <button class="btn-small" data-view="${item.id}">View</button>
                        <button class="btn-small btn-ghost" data-action="edit" data-id="${item.id}">Edit</button>
                        ${item.status !== "returned"
                            ? `<button class="btn-small btn-ghost" data-action="returned" data-id="${item.id}">Mark as returned</button>`
                            : ""}
                        <button class="btn-small btn-danger" data-action="delete" data-id="${item.id}">Delete</button>
                    </div>
                </div>
            </article>`;
    }).join("");
}

// One click listener for all the buttons in the list ("event delegation")
byId("myPostsList").addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const item = items.find((i) => i.id === actionButton.dataset.id);
    const action = actionButton.dataset.action;

    if (action === "edit") {
        openReportForm(item.type, item);
        return;
    }

    try {
        if (action === "returned") {
            await api("PATCH", `/items/${item.id}/returned`);
        }
        if (action === "delete") {
            if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
            await api("DELETE", "/items/" + item.id); // the server also deletes its messages
        }
    } catch (problem) {
        alert(problem.message);
        return;
    }

    showScreen("myposts"); // load the new data from the server and redraw
});


/* =========================================================
   14. START THE APP
   ========================================================= */

updateNav();
showScreen("home");

// If we saved a token last time, ask the server if it's still valid.
// (If it isn't, api() gets a 401 and logs us out automatically.
//  If we're offline, we just keep the saved user for now.)
if (token) {
    api("GET", "/auth/me")
        .then((result) => {
            currentUser = result.user;
            save("findit_user", currentUser);
            updateNav();
        })
        .catch(() => {});
}


/* =========================================================
   15. OFFLINE BANNER
   The browser fires "online" and "offline" events when the
   connection changes. navigator.onLine says if we're online now.
   ========================================================= */

function updateOfflineBanner() {
    byId("offlineBanner").hidden = navigator.onLine;
}

window.addEventListener("offline", updateOfflineBanner);

window.addEventListener("online", () => {
    updateOfflineBanner();
    // Back online: reload the current screen so it shows fresh data
    const visible = document.querySelector(".screen:not([hidden])");
    showScreen(visible.id.replace("screen-", ""));
});

updateOfflineBanner();


/* =========================================================
   16. REGISTER THE SERVICE WORKER (only if the browser supports it)
   ========================================================= */

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("service-worker.js")
        .then(() => console.log("Service Worker registered"))
        .catch((error) => console.log("Service Worker registration failed:", error));
}
