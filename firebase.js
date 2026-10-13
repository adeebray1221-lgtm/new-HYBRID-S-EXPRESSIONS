/**
 * Hybrid's Expressions
 * Firebase Configuration, Authentication & Firestore
 */

const FIREBASE_VERSION = "10.7.0";

const FIREBASE_APP_URL =
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;

const FIREBASE_FIRESTORE_URL =
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`;

const FIREBASE_AUTH_URL =
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;

// Configuration copied from your NEW Firebase Web App.
const firebaseConfig = {
    apiKey: "AIzaSyDxRPngR6pmMh1wwiyib99yo8-Lf5EkvX8",
    authDomain: "hybrid-s-expressions.firebaseapp.com",
    projectId: "hybrid-s-expressions",
    storageBucket: "hybrid-s-expressions.firebasestorage.app",
    messagingSenderId: "767855685696",
    appId: "1:767855685696:web:88a72200f1c7bb13876fa5",
    measurementId: "G-ZP3LSM14BJ"
};

// Firebase instances
let app = null;
let db = null;
let auth = null;
let firebaseReady = false;

// Cache imported Firebase modules.
let firebaseModulesPromise = null;

async function loadFirebaseModules() {
    if (!firebaseModulesPromise) {
        firebaseModulesPromise = Promise.all([
            import(FIREBASE_APP_URL),
            import(FIREBASE_FIRESTORE_URL),
            import(FIREBASE_AUTH_URL)
        ]).then(([appSDK, firestoreSDK, authSDK]) => ({
            appSDK,
            firestoreSDK,
            authSDK
        })).catch((error) => {
            firebaseModulesPromise = null;
            throw error;
        });
    }

    return firebaseModulesPromise;
}

/**
 * Initialize Firebase, Firestore and Authentication.
 * Safe to call more than once.
 */
async function initializeFirebase() {
    try {
        if (firebaseReady && app && db && auth) {
            return true;
        }

        const { appSDK, firestoreSDK, authSDK } =
            await loadFirebaseModules();

        const existingApp = appSDK.getApps().find(
            (item) => item.name === "[DEFAULT]"
        );

        // Never silently connect to a different Firebase project.
        if (
            existingApp &&
            existingApp.options.projectId !== firebaseConfig.projectId
        ) {
            throw new Error(
                `Incorrect Firebase project. Expected "${firebaseConfig.projectId}", ` +
                `but found "${existingApp.options.projectId}".`
            );
        }

        app = existingApp || appSDK.initializeApp(firebaseConfig);

        db = firestoreSDK.getFirestore(app);
        auth = authSDK.getAuth(app);

        firebaseReady = true;

        console.log(
            "Firebase initialized successfully:",
            firebaseConfig.projectId
        );

        return true;
    } catch (error) {
        firebaseReady = false;
        console.error("Firebase initialization failed:", error);
        return false;
    }
}

function ensureFirebaseReady() {
    if (!firebaseReady || !db || !auth) {
        throw new Error(
            "Firebase is not ready. Call initializeFirebase() first."
        );
    }
}

/**
 * Sign in using the admin account created in Firebase Console.
 */
async function signInAdmin(email, password) {
    if (!(await initializeFirebase())) {
        throw new Error(
            "Firebase initialization failed. Check your Firebase configuration."
        );
    }

    if (
        typeof email !== "string" ||
        !email.trim() ||
        typeof password !== "string" ||
        !password
    ) {
        throw new Error("Enter your admin email and password.");
    }

    const { authSDK } = await loadFirebaseModules();

    const result = await authSDK.signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
    );

    console.log("Firebase Authentication sign-in successful.");

    return result.user;
}

/**
 * Sign out the current Firebase user.
 */
async function signOutAdmin() {
    ensureFirebaseReady();

    const { authSDK } = await loadFirebaseModules();

    await authSDK.signOut(auth);

    console.log("Firebase user signed out.");
}

/**
 * Monitor authentication state.
 * Returns an unsubscribe function.
 */
async function onFirebaseAuthStateChanged(callback) {
    if (!(await initializeFirebase())) {
        throw new Error("Firebase initialization failed.");
    }

    if (typeof callback !== "function") {
        throw new Error("A valid authentication callback is required.");
    }

    const { authSDK } = await loadFirebaseModules();

    return authSDK.onAuthStateChanged(auth, callback);
}

/**
 * Return current Firebase user, or null.
 */
function getCurrentUser() {
    return auth ? auth.currentUser : null;
}

/**
 * Read posts from the Firestore posts collection.
 */
async function fetchPostsFromFirestore() {
    ensureFirebaseReady();

    const { firestoreSDK } = await loadFirebaseModules();

    const postsRef = firestoreSDK.collection(db, "posts");

    const postsQuery = firestoreSDK.query(
        postsRef,
        firestoreSDK.orderBy("date", "desc")
    );

    const snapshot = await firestoreSDK.getDocs(postsQuery);

    const posts = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data()
    }));

    console.log(`Loaded ${posts.length} posts from Firestore.`);

    return posts;
}

/**
 * Add a new post.
 * Firebase Authentication and Firestore Rules must authorize the user.
 */
async function addPostToFirestore(postData) {
    ensureFirebaseReady();

    if (!auth.currentUser) {
        throw new Error(
            "Please sign in with your admin account before publishing."
        );
    }

    if (!postData || typeof postData !== "object") {
        throw new Error("A valid post object is required.");
    }

    const { firestoreSDK } = await loadFirebaseModules();

    // Firestore generates the document ID.
    const { id: ignoredId, ...fields } = postData;

    const postToAdd = {
        ...fields,
        date: postData.date || new Date().toISOString(),
        likes: Number.isInteger(postData.likes)
            ? Math.max(0, postData.likes)
            : 0,
        createdAt: firestoreSDK.serverTimestamp()
    };

    const result = await firestoreSDK.addDoc(
        firestoreSDK.collection(db, "posts"),
        postToAdd
    );

    console.log("Post saved to Firestore:", result.id);

    return result.id;
}

/**
 * Update a post.
 */
async function updatePostInFirestore(postId, updateData) {
    ensureFirebaseReady();

    if (!auth.currentUser) {
        throw new Error(
            "Please sign in with your admin account before updating posts."
        );
    }

    if (!postId || !updateData || typeof updateData !== "object") {
        throw new Error("Post ID and update data are required.");
    }

    const { firestoreSDK } = await loadFirebaseModules();

    await firestoreSDK.updateDoc(
        firestoreSDK.doc(db, "posts", postId),
        updateData
    );

    console.log("Post updated:", postId);

    return true;
}

/**
 * Delete a post.
 */
async function deletePostFromFirestore(postId) {
    ensureFirebaseReady();

    if (!auth.currentUser) {
        throw new Error(
            "Please sign in with your admin account before deleting posts."
        );
    }

    if (!postId) {
        throw new Error("Post ID is required.");
    }

    const { firestoreSDK } = await loadFirebaseModules();

    await firestoreSDK.deleteDoc(
        firestoreSDK.doc(db, "posts", postId)
    );

    console.log("Post deleted:", postId);

    return true;
}

/**
 * Update likes.
 *
 * Firestore Security Rules must restrict this operation
 * to valid likes changes. This function itself does not grant access.
 */
async function updatePostLikes(postId, newLikesCount) {
    ensureFirebaseReady();

    if (!postId) {
        throw new Error("Post ID is required.");
    }

    if (
        !Number.isInteger(newLikesCount) ||
        newLikesCount < 0
    ) {
        throw new Error("Likes must be a non-negative integer.");
    }

    const { firestoreSDK } = await loadFirebaseModules();

    await firestoreSDK.updateDoc(
        firestoreSDK.doc(db, "posts", postId),
        { likes: newLikesCount }
    );

    return true;
}

/**
 * Check whether Firestore has initialized.
 */
function isFirestoreReady() {
    return firebaseReady && db !== null;
}

// Functions imported by app.js
export {
    initializeFirebase,
    fetchPostsFromFirestore,
    addPostToFirestore,
    updatePostInFirestore,
    deletePostFromFirestore,
    updatePostLikes,
    isFirestoreReady,
    signInAdmin,
    signOutAdmin,
    onFirebaseAuthStateChanged,
    getCurrentUser
};
