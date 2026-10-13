/**
 * Firebase Configuration & Firestore Integration
 * Hybrid's Expressions
 * New project: hybrid-s-expressions
 */

const FIREBASE_VERSION = "10.7.0";

const FIREBASE_APP_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;

const FIREBASE_FIRESTORE_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`;

const FIREBASE_AUTH_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;

// Configuration from the NEW Firebase project
const firebaseConfig = {
  apiKey: "AIzaSyDxRPngR6pmMh1wwiyib99yo8-LfSEkvX8",
  authDomain: "hybrid-s-expressions.firebaseapp.com",
  projectId: "hybrid-s-expressions",
  storageBucket: "hybrid-s-expressions.firebasestorage.app",
  messagingSenderId: "767855685696",
  appId: "1:767855685696:web:88a72200f1c7bb13876fa5",
  measurementId: "G-ZP3LSM14BJ"
};

// Global Firebase instances
let app = null;
let db = null;
let auth = null;
let firebaseReady = false;

/**
 * Initialize Firebase, Firestore and Authentication.
 * Call this once before using database functions.
 */
async function initializeFirebase() {
  try {
    if (firebaseReady && app && db && auth) {
      return true;
    }

    const [appSDK, firestoreSDK, authSDK] = await Promise.all([
      import(FIREBASE_APP_URL),
      import(FIREBASE_FIRESTORE_URL),
      import(FIREBASE_AUTH_URL)
    ]);

    // Reuse the default app, but never silently use the wrong project.
    const existingDefaultApp = appSDK
      .getApps()
      .find((existingApp) => existingApp.name === "[DEFAULT]");

    if (
      existingDefaultApp &&
      existingDefaultApp.options.projectId !== firebaseConfig.projectId
    ) {
      throw new Error(
        `Wrong Firebase project is already initialized: ${
          existingDefaultApp.options.projectId
        }. Expected ${firebaseConfig.projectId}.`
      );
    }

    app =
      existingDefaultApp || appSDK.initializeApp(firebaseConfig);

    db = firestoreSDK.getFirestore(app);
    auth = authSDK.getAuth(app);

    firebaseReady = true;

    console.log(
      "Firebase initialized:",
      firebaseConfig.projectId
    );

    return true;
  } catch (error) {
    firebaseReady = false;
    console.error("Firebase initialization failed:", error);
    return false;
  }
}

/**
 * Check that Firebase has been initialized.
 */
function ensureFirebaseReady() {
  if (!firebaseReady || !db || !auth) {
    throw new Error(
      "Firebase is not initialized. Call initializeFirebase() first."
    );
  }
}

/**
 * Require a signed-in user before attempting a post write.
 * Firestore Security Rules must still verify that the user is the admin.
 */
function ensureSignedIn(action) {
  ensureFirebaseReady();

  if (!auth.currentUser) {
    throw new Error(
      `Sign in with the admin account before attempting to ${action}.`
    );
  }
}

/**
 * Sign in the admin with Firebase Email/Password Authentication.
 */
async function signInAdmin(email, password) {
  ensureFirebaseReady();

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const { signInWithEmailAndPassword } =
    await import(FIREBASE_AUTH_URL);

  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );

  console.log("Firebase sign-in successful.");
  return credential.user;
}

/**
 * Sign out the current Firebase user.
 */
async function signOutAdmin() {
  ensureFirebaseReady();

  const { signOut } = await import(FIREBASE_AUTH_URL);
  await signOut(auth);

  console.log("Firebase sign-out successful.");
}

/**
 * Subscribe to Firebase Authentication state changes.
 * Returns a Promise that resolves to the unsubscribe function.
 */
async function onFirebaseAuthStateChanged(callback) {
  ensureFirebaseReady();

  if (typeof callback !== "function") {
    throw new Error("Authentication callback must be a function.");
  }

  const { onAuthStateChanged } =
    await import(FIREBASE_AUTH_URL);

  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current signed-in Firebase user, or null.
 */
function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

/**
 * Fetch published posts from the Firestore 'posts' collection.
 */
async function fetchPostsFromFirestore() {
  try {
    ensureFirebaseReady();

    const {
      collection,
      getDocs,
      query,
      orderBy
    } = await import(FIREBASE_FIRESTORE_URL);

    const postsRef = collection(db, "posts");
    const postsQuery = query(
      postsRef,
      orderBy("date", "desc")
    );

    const snapshot = await getDocs(postsQuery);

    const posts = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data()
    }));

    console.log(`Fetched ${posts.length} posts from Firestore.`);
    return posts;
  } catch (error) {
    console.error("Error fetching posts:", error);
    return [];
  }
}

/**
 * Add a post to Firestore.
 * The Firestore rules must authorize this user's UID.
 */
async function addPostToFirestore(postData) {
  try {
    ensureSignedIn("publish a post");

    if (!postData || typeof postData !== "object") {
      throw new Error("A valid post object is required.");
    }

    const {
      collection,
      addDoc,
      serverTimestamp
    } = await import(FIREBASE_FIRESTORE_URL);

    // Do not use a caller-supplied ID as the Firestore document ID.
    const { id: ignoredId, ...postFields } = postData;

    const postToAdd = {
      ...postFields,
      date: postData.date || new Date().toISOString(),
      likes: Number.isFinite(postData.likes)
        ? postData.likes
        : 0,
      createdAt: serverTimestamp()
    };

    const document = await addDoc(
      collection(db, "posts"),
      postToAdd
    );

    console.log("Post added:", document.id);
    return document.id;
  } catch (error) {
    console.error("Error adding post:", error);
    throw error;
  }
}

/**
 * Update an existing post.
 */
async function updatePostInFirestore(postId, updateData) {
  try {
    ensureSignedIn("update a post");

    if (!postId || !updateData) {
      throw new Error("Post ID and update data are required.");
    }

    const { doc, updateDoc } =
      await import(FIREBASE_FIRESTORE_URL);

    await updateDoc(doc(db, "posts", postId), updateData);

    console.log("Post updated:", postId);
    return true;
  } catch (error) {
    console.error("Error updating post:", error);
    throw error;
  }
}

/**
 * Delete a post.
 */
async function deletePostFromFirestore(postId) {
  try {
    ensureSignedIn("delete a post");

    if (!postId) {
      throw new Error("A post ID is required.");
    }

    const { doc, deleteDoc } =
      await import(FIREBASE_FIRESTORE_URL);

    await deleteDoc(doc(db, "posts", postId));

    console.log("Post deleted:", postId);
    return true;
  } catch (error) {
    console.error("Error deleting post:", error);
    throw error;
  }
}

/**
 * Update a post's likes count.
 * Public like functionality must be restricted by Firestore rules.
 */
async function updatePostLikes(postId, newLikesCount) {
  try {
    ensureFirebaseReady();

    if (!postId) {
      throw new Error("A post ID is required.");
    }

    if (
      !Number.isInteger(newLikesCount) ||
      newLikesCount < 0
    ) {
      throw new Error("Likes count must be a non-negative integer.");
    }

    const { doc, updateDoc } =
      await import(FIREBASE_FIRESTORE_URL);

    await updateDoc(doc(db, "posts", postId), {
      likes: newLikesCount
    });

    return true;
  } catch (error) {
    console.error("Error updating likes:", error);
    throw error;
  }
}

/**
 * Check whether Firestore has been initialized.
 */
function isFirestoreReady() {
  return firebaseReady && db !== null;
}

// Export functions for app.js
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
