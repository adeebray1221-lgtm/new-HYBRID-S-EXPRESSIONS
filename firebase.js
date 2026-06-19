/**
 * Firebase Configuration & Firestore Integration
 * Handles all database operations for Hybrid's Expressions
 */

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyCxtu47Hx2GYj-3qUl99uXYfc5bPCnBIqI",
    authDomain: "hybrids-expressions.firebaseapp.com",
    projectId: "hybrids-expressions",
    storageBucket: "hybrids-expressions.firebasestorage.app",
    messagingSenderId: "207245868674",
    appId: "1:207245868674:web:e35917f15f3177ebecfe9b",
    measurementId: "G-G4FTBB5JC3"
};

// Global Firebase instances
let db = null;
let firebaseReady = false;

/**
 * Initialize Firebase and Firestore
 * Must be called once at application startup
 */
async function initializeFirebase() {
    try {
        // Dynamically import Firebase modules from CDN
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        
        // Initialize Firestore
        db = getFirestore(app);
        firebaseReady = true;
        
        console.log("✓ Firebase and Firestore initialized successfully");
        return true;
    } catch (error) {
        console.error("✗ Failed to initialize Firebase:", error);
        return false;
    }
}

/**
 * Fetch all posts from Firestore 'posts' collection
 * Returns array of post objects
 */
async function fetchPostsFromFirestore() {
    try {
        if (!firebaseReady || !db) {
            throw new Error("Firebase not initialized");
        }

        const { collection, getDocs, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const posts = [];
        querySnapshot.forEach((doc) => {
            posts.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`✓ Fetched ${posts.length} posts from Firestore`);
        return posts;
    } catch (error) {
        console.error("✗ Error fetching posts from Firestore:", error);
        return [];
    }
}

/**
 * Add a new post to Firestore 'posts' collection
 * @param {Object} postData - Post object with all required fields
 * @returns {Promise<string>} Document ID of the new post
 */
async function addPostToFirestore(postData) {
    try {
        if (!firebaseReady || !db) {
            throw new Error("Firebase not initialized");
        }

        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        // Remove the id field if it exists (Firestore will generate its own)
        const { id, ...dataWithoutId } = postData;
        
        // Ensure date is properly formatted and likes are initialized
        const postToAdd = {
            ...dataWithoutId,
            date: postData.date || new Date().toISOString(),
            likes: postData.likes || 0,
            createdAt: serverTimestamp()
        };

        const postsRef = collection(db, 'posts');
        const docRef = await addDoc(postsRef, postToAdd);
        
        console.log(`✓ Post added to Firestore with ID: ${docRef.id}`);
        return docRef.id;
    } catch (error) {
        console.error("✗ Error adding post to Firestore:", error);
        throw error;
    }
}

/**
 * Update an existing post in Firestore
 * @param {string} postId - Document ID
 * @param {Object} updateData - Fields to update
 */
async function updatePostInFirestore(postId, updateData) {
    try {
        if (!firebaseReady || !db) {
            throw new Error("Firebase not initialized");
        }

        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, updateData);
        
        console.log(`✓ Post ${postId} updated in Firestore`);
        return true;
    } catch (error) {
        console.error("✗ Error updating post in Firestore:", error);
        throw error;
    }
}

/**
 * Delete a post from Firestore
 * @param {string} postId - Document ID to delete
 */
async function deletePostFromFirestore(postId) {
    try {
        if (!firebaseReady || !db) {
            throw new Error("Firebase not initialized");
        }

        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const postRef = doc(db, 'posts', postId);
        await deleteDoc(postRef);
        
        console.log(`✓ Post ${postId} deleted from Firestore`);
        return true;
    } catch (error) {
        console.error("✗ Error deleting post from Firestore:", error);
        throw error;
    }
}

/**
 * Update likes count for a specific post
 * @param {string} postId - Document ID
 * @param {number} newLikesCount - New likes count
 */
async function updatePostLikes(postId, newLikesCount) {
    try {
        if (!firebaseReady || !db) {
            throw new Error("Firebase not initialized");
        }

        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, { likes: newLikesCount });
        
        return true;
    } catch (error) {
        console.error("✗ Error updating likes:", error);
        throw error;
    }
}

/**
 * Check if Firestore is ready
 */
function isFirestoreReady() {
    return firebaseReady && db !== null;
}

// Export functions for use in app.js
export {
    initializeFirebase,
    fetchPostsFromFirestore,
    addPostToFirestore,
    updatePostInFirestore,
    deletePostFromFirestore,
    updatePostLikes,
    isFirestoreReady
};
