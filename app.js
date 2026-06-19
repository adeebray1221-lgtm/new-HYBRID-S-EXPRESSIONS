/**
 * Hybrid's Expressions - Main Application JS
 * Manages State, Routing, UI Views, and Admin Capabilities.
 * Now with Firestore integration for persistent online data storage.
 */

// Import Firebase functions dynamically
let initializeFirebase, fetchPostsFromFirestore, addPostToFirestore, 
    updatePostInFirestore, deletePostFromFirestore, updatePostLikes, isFirestoreReady;

// Dynamically import Firebase functions
(async () => {
    try {
        const firebaseModule = await import('./firebase.js');
        initializeFirebase = firebaseModule.initializeFirebase;
        fetchPostsFromFirestore = firebaseModule.fetchPostsFromFirestore;
        addPostToFirestore = firebaseModule.addPostToFirestore;
        updatePostInFirestore = firebaseModule.updatePostInFirestore;
        deletePostFromFirestore = firebaseModule.deletePostFromFirestore;
        updatePostLikes = firebaseModule.updatePostLikes;
        isFirestoreReady = firebaseModule.isFirestoreReady;
    } catch (e) {
        console.error("Failed to import Firebase modules:", e);
    }
})();

// Global Application State
const AppState = {
    posts: [],
    likedPosts: [],
    isAdminLoggedIn: false,
    currentView: 'home',
    activeFilter: 'all',
    activeLanguageFilter: 'all',
    searchQuery: '',
    uploadedImageBase64: null,
};

// Default Initial Database (Empty for school)
const DEFAULT_POSTS = [];

/* 
   =========================================
   Database & Storage Helpers (Firestore)
   =========================================
*/

/**
 * Initialize database by fetching posts from Firestore
 * This replaces the old localStorage-based initDatabase function
 */
async function initDatabase() {
    try {
        // Initialize Firebase first
        const fbReady = await initializeFirebase();
        if (!fbReady) {
            console.error("Firebase initialization failed. Using empty database.");
            AppState.posts = [...DEFAULT_POSTS];
            return;
        }

        // Fetch posts from Firestore
        const posts = await fetchPostsFromFirestore();
        AppState.posts = posts;
        
        console.log(`✓ Loaded ${AppState.posts.length} posts from Firestore`);
    } catch (error) {
        console.error("✗ Error initializing database:", error);
        AppState.posts = [...DEFAULT_POSTS];
    }

    // Load liked posts tracking from localStorage (device-specific)
    const savedLikes = localStorage.getItem('liked_posts');
    if (savedLikes) {
        try {
            AppState.likedPosts = JSON.parse(savedLikes);
        } catch (e) {
            AppState.likedPosts = [];
        }
    }

    // Load admin passcode settings from localStorage
    const currentPass = localStorage.getItem('admin_passcode');
    if (!currentPass || currentPass === 'admin123') {
        localStorage.setItem('admin_passcode', 'arif@123.admin'); // Default password
    }

    // Check if session login is retained
    const sessionAuth = sessionStorage.getItem('admin_authenticated');
    if (sessionAuth === 'true') {
        AppState.isAdminLoggedIn = true;
    }
}

/**
 * Save liked posts list to localStorage (device-specific, not synced to Firestore)
 */
function saveLikes() {
    localStorage.setItem('liked_posts', JSON.stringify(AppState.likedPosts));
}


/* 
   =========================================
   Routing Logic
   =========================================
*/

// Set active navigation menu link styling
function updateNavStyles(hash) {
    // Remove active class from all links
    document.querySelectorAll('.nav-menu a, .admin-btn').forEach(link => {
        link.classList.remove('active');
    });

    // Match appropriate link
    if (hash === '#/home' || hash === '' || hash === '#/') {
        document.getElementById('nav-home').classList.add('active');
    } else if (hash === '#/poems') {
        document.getElementById('nav-poems').classList.add('active');
    } else if (hash === '#/stories') {
        document.getElementById('nav-stories').classList.add('active');
    } else if (hash === '#/writers') {
        document.getElementById('nav-writers').classList.add('active');
    } else if (hash.startsWith('#/admin')) {
        document.getElementById('nav-admin').classList.add('active');
    }
}

// Router main function - listens to URL hash changes
function router() {
    const hash = window.location.hash || '#/home';
    updateNavStyles(hash);

    // Hide mobile menu on route change
    document.getElementById('nav-menu-toggle-list')?.classList.remove('show');

    // Route transitions
    if (hash === '#/home' || hash === '#/') {
        AppState.currentView = 'home';
        AppState.activeFilter = 'all';
        showView('view-home');
        resetFiltersUI('all');
        renderFeedGrid();
    } else if (hash === '#/poems') {
        AppState.currentView = 'home';
        AppState.activeFilter = 'poem';
        showView('view-home');
        resetFiltersUI('poem');
        renderFeedGrid();
    } else if (hash === '#/stories') {
        AppState.currentView = 'home';
        AppState.activeFilter = 'story';
        showView('view-home');
        resetFiltersUI('story');
        renderFeedGrid();
    } else if (hash === '#/writers') {
        AppState.currentView = 'writers';
        showView('view-writers');
        renderWritersDirectory();
    } else if (hash.startsWith('#/post/')) {
        AppState.currentView = 'details';
        const id = hash.replace('#/post/', '');
        showView('view-details');
        renderPostDetail(id);
    } else if (hash === '#/admin') {
        AppState.currentView = 'admin';
        showView('view-admin');
        renderAdminPanel();
    } else {
        // Fallback to home
        window.location.hash = '#/home';
    }
}

// Utility: Toggle views visibility
function showView(viewId) {
    document.querySelectorAll('.app-view').forEach(view => {
        view.classList.add('hidden');
    });
    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.classList.remove('hidden');
        // Scroll to top of window on route change
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Utility: Synchronize filter tabs UI based on router states
function resetFiltersUI(activeFilter) {
    AppState.activeFilter = activeFilter;
    document.querySelectorAll('.filter-tab').forEach(tab => {
        if (tab.dataset.filter === activeFilter) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    updateFeedTitle();
}

function resetLanguageUI(activeLanguage) {
    AppState.activeLanguageFilter = activeLanguage;
    document.querySelectorAll('.language-filter-btn').forEach(btn => {
        if (btn.dataset.lang === activeLanguage) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    updateFeedTitle();
}

function updateFeedTitle() {
    const titleElement = document.getElementById('feed-title');
    let title = '';

    if (AppState.activeFilter === 'all') {
        title = 'Latest Poems & Stories';
    } else if (AppState.activeFilter === 'poem') {
        title = 'Beautiful Poems';
    } else if (AppState.activeFilter === 'story') {
        title = 'Creative Stories';
    } else if (AppState.activeFilter === 'alumni') {
        title = 'Alumni Submissions';
    }

    if (AppState.activeLanguageFilter === 'english') {
        title = title.replace('Latest', 'Latest English').replace('Beautiful', 'English').replace('Creative', 'English');
    } else if (AppState.activeLanguageFilter === 'hindi') {
        title = title.replace('Latest', 'Latest Hindi').replace('Beautiful', 'Hindi').replace('Creative', 'Hindi');
    }

    titleElement.textContent = title;
}

/* 
   =========================================
   UI Rendering Components
   =========================================
*/

// Render the Home Feed Grid containing poems/stories
function renderFeedGrid() {
    const grid = document.getElementById('posts-grid');
    const noResults = document.getElementById('no-results');
    
    // Clear current grid
    grid.innerHTML = '';
    
    // Sort posts by date descending
    const sortedPosts = [...AppState.posts].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Filter posts
    const filteredPosts = sortedPosts.filter(post => {
        const postLanguage = post.language ? post.language.toLowerCase() : 'english';
        const matchesCategory = AppState.activeFilter === 'all'
            || (AppState.activeFilter === 'alumni' && post.studentStatus === 'alumni')
            || (AppState.activeFilter !== 'alumni' && post.category === AppState.activeFilter);
        const matchesLanguage = AppState.activeLanguageFilter === 'all' || postLanguage === AppState.activeLanguageFilter;
        const matchesSearch = AppState.searchQuery === '' || 
            post.studentName.toLowerCase().includes(AppState.searchQuery.toLowerCase()) ||
            post.title.toLowerCase().includes(AppState.searchQuery.toLowerCase());
        
        return matchesCategory && matchesLanguage && matchesSearch;
    });

    // Handle Empty States
    if (filteredPosts.length === 0) {
        grid.classList.add('hidden');
        noResults.classList.remove('hidden');
        document.getElementById('search-query-display').textContent = AppState.searchQuery || AppState.activeFilter;
        return;
    }

    grid.classList.remove('hidden');
    noResults.classList.add('hidden');

    // Generate HTML for each post
    filteredPosts.forEach(post => {
        const isLiked = AppState.likedPosts.includes(post.id);
        const cardHTML = `
            <article class="writing-card" data-id="${post.id}">
                <!-- Card content -->
                <div class="card-body">
                    <span class="card-badge ${post.category}">${post.category}</span>
                    <h4 class="card-title">${post.title}</h4>
                    
                    <!-- Author bio container -->
                    <div class="card-author" data-writer="${post.studentName}">
                        <img src="${post.studentPhoto || 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + post.studentName}" alt="${post.studentName}" class="author-photo">
                        <div class="author-details">
                            <span class="author-label">Written By</span>
                            <span class="author-name">${post.studentName}</span>
                        </div>
                    </div>
                    
                    <!-- Meta footer details -->
                    <div class="card-footer">
                        <span class="card-date"><i class="fa-regular fa-clock"></i> ${formatDateString(post.date)}</span>
                        <div class="card-likes ${isLiked ? 'liked' : ''}" data-id="${post.id}">
                            <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i>
                            <span class="likes-count">${post.likes}</span>
                        </div>
                    </div>
                </div>
            </article>
        `;
        grid.insertAdjacentHTML('beforeend', cardHTML);
    });

    // Add click listeners to cards
    document.querySelectorAll('.writing-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Check if user clicked the like icon to prevent routing
            if (e.target.closest('.card-likes')) {
                const likeContainer = e.target.closest('.card-likes');
                const postId = likeContainer.dataset.id;
                toggleLikePost(postId, likeContainer);
                e.stopPropagation();
                return;
            }
            // Route to detail page
            const id = card.dataset.id;
            window.location.hash = `#/post/${id}`;
        });
    });
}

// Helper: Return SVG icon tags for illustrations
function getIllustrationIcon(illustration) {
    switch(illustration) {
        case 'feather':
            return '<i class="fa-solid fa-feather"></i>';
        case 'treasure':
            return '<i class="fa-solid fa-gem"></i>';
        case 'mother':
            return '<i class="fa-solid fa-heart"></i>';
        case 'sparrow':
            return '<i class="fa-solid fa-crow"></i>';
        case 'book':
            return '<i class="fa-solid fa-book"></i>';
        default:
            return '<i class="fa-solid fa-feather-pointed"></i>';
    }
}

function formatStudentMeta(post) {
    const statusText = post.studentStatus === 'alumni' ? 'Alumni Student' : 'Current Student';
    const gradeText = post.studentGrade ? ` · ${post.studentGrade}` : '';
    return `${statusText}${gradeText}`;
}

// Render the details of a single story or poem
function renderPostDetail(id) {
    const post = AppState.posts.find(p => p.id === id);
    if (!post) {
        // Post not found, route home
        window.location.hash = '#/home';
        return;
    }

    // Set badges and metadata
    const categoryBadge = document.getElementById('detail-category-badge');
    categoryBadge.className = `badge ${post.category}`;
    categoryBadge.textContent = post.category;

    document.getElementById('detail-title').textContent = post.title;
    document.getElementById('detail-date').textContent = formatDateString(post.date);
    document.getElementById('detail-read-time').textContent = calculateReadTime(post.content);
    
    // Format content and apply layout styling (Poems are centered & styled differently)
    const contentBody = document.getElementById('detail-content');
    contentBody.textContent = post.content; // Render newlines appropriately via pre-line style
    if (post.category === 'poem') {
        contentBody.classList.add('poem-styling');
    } else {
        contentBody.classList.remove('poem-styling');
    }

    // Sidebar Student Profile Details
    const studentPhoto = document.getElementById('detail-student-photo');
    studentPhoto.src = post.studentPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${post.studentName}`;
    document.getElementById('detail-student-name').textContent = post.studentName;
    document.getElementById('detail-student-grade').textContent = formatStudentMeta(post);

    // Configure sidebar view all button
    const viewAllBtn = document.getElementById('detail-view-writer-btn');
    viewAllBtn.textContent = `All Writings by ${post.studentName.split(' ')[0]}`;
    viewAllBtn.onclick = () => {
        AppState.searchQuery = post.studentName;
        document.getElementById('search-input').value = post.studentName;
        window.location.hash = '#/home';
    };

    // Configure Detail Like Button
    const likeBtn = document.getElementById('detail-like-btn');
    const likesCountSpan = document.getElementById('detail-likes-count');
    
    likesCountSpan.textContent = post.likes;
    
    const isLiked = AppState.likedPosts.includes(post.id);
    if (isLiked) {
        likeBtn.classList.add('liked');
        likeBtn.querySelector('i').className = "fa-solid fa-heart";
    } else {
        likeBtn.classList.remove('liked');
        likeBtn.querySelector('i').className = "fa-regular fa-heart";
    }

    // Clear previous event listeners by cloning button
    const newLikeBtn = likeBtn.cloneNode(true);
    likeBtn.parentNode.replaceChild(newLikeBtn, likeBtn);

    newLikeBtn.addEventListener('click', () => {
        toggleLikePost(post.id, newLikeBtn, likesCountSpan);
    });
}

// Render Writers Directory List
function renderWritersDirectory() {
    const grid = document.getElementById('writers-grid');
    grid.innerHTML = '';

    // Group posts by studentName to calculate statistics and retrieve photos
    const writersMap = {};
    AppState.posts.forEach(post => {
        if (!writersMap[post.studentName]) {
            writersMap[post.studentName] = {
                name: post.studentName,
                grade: formatStudentMeta(post),
                photo: post.studentPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${post.studentName}`,
                writingCount: 0
            };
        }
        writersMap[post.studentName].writingCount++;
    });

    const writersList = Object.values(writersMap);

    writersList.forEach(writer => {
        const cardHTML = `
            <div class="writer-card" data-name="${writer.name}">
                <img src="${writer.photo}" alt="${writer.name}" class="writer-photo">
                <h3 class="writer-name">${writer.name}</h3>
                <p class="writer-grade">${writer.grade}</p>
                <span class="writer-stats-tag">${writer.writingCount} ${writer.writingCount === 1 ? 'Writing' : 'Writings'}</span>
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', cardHTML);
    });

    // Event listener: click author card to search their writings on home page
    document.querySelectorAll('.writer-card').forEach(card => {
        card.addEventListener('click', () => {
            const writerName = card.dataset.name;
            AppState.searchQuery = writerName;
            document.getElementById('search-input').value = writerName;
            window.location.hash = '#/home';
        });
    });
}

/* 
   =========================================
   Likes System
   =========================================
*/

// Toggle post like state and persist data
function toggleLikePost(id, element, siblingCountSpan) {
    const post = AppState.posts.find(p => p.id === id);
    if (!post) return;

    const likeIndex = AppState.likedPosts.indexOf(id);
    const isLiking = likeIndex === -1;

    if (isLiking) {
        // Add like
        AppState.likedPosts.push(id);
        post.likes++;
        
        // CSS feedback updates
        element.classList.add('liked');
        const heartIcon = element.querySelector('i');
        if (heartIcon) {
            heartIcon.className = "fa-solid fa-heart";
        }
    } else {
        // Remove like
        AppState.likedPosts.splice(likeIndex, 1);
        post.likes--;
        
        // CSS feedback updates
        element.classList.remove('liked');
        const heartIcon = element.querySelector('i');
        if (heartIcon) {
            heartIcon.className = "fa-regular fa-heart";
        }
    }

    // Update count labels
    if (siblingCountSpan) {
        siblingCountSpan.textContent = post.likes;
    } else {
        const innerCount = element.querySelector('.likes-count');
        if (innerCount) innerCount.textContent = post.likes;
    }

    // Persist likes count to Firestore
    updatePostLikes(id, post.likes)
        .catch((error) => {
            console.error("Error updating likes in Firestore:", error);
        });
    
    // Save liked posts tracking to localStorage (device-specific)
    saveLikes();
}

/* 
   =========================================
   Admin Panel Dashboard Logic
   =========================================
*/

// Toggle rendering logic between Authentication Form & Dashboard views
function renderAdminPanel() {
    const loginCard = document.getElementById('admin-login-card');
    const dashboardLayout = document.getElementById('admin-dashboard');

    if (AppState.isAdminLoggedIn) {
        loginCard.classList.add('hidden');
        dashboardLayout.classList.remove('hidden');
        
        // Populate inputs and load lists
        document.getElementById('post-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('admin-posts-count').textContent = AppState.posts.length;
        renderAdminPostsList();
    } else {
        loginCard.classList.remove('hidden');
        dashboardLayout.classList.add('hidden');
    }
}

// Render dynamic management lists inside the admin dashboard
function renderAdminPostsList() {
    const list = document.getElementById('admin-posts-list');
    list.innerHTML = '';

    // Sort descending by date
    const sortedPosts = [...AppState.posts].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedPosts.forEach(post => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="admin-post-title-meta">
                <span class="admin-post-item-title" data-id="${post.id}">${post.title}</span>
                <span class="admin-post-item-author">${post.studentName} &bull; ${post.category.toUpperCase()}</span>
            </div>
            <button class="btn-delete-post" data-id="${post.id}" title="Delete Post">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        list.appendChild(li);
    });

    // Attach click triggers on lists
    list.querySelectorAll('.admin-post-item-title').forEach(item => {
        item.addEventListener('click', () => {
            window.location.hash = `#/post/${item.dataset.id}`;
        });
    });

    list.querySelectorAll('.btn-delete-post').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.dataset.id;
            const post = AppState.posts.find(p => p.id === id);
            if (confirm(`Are you sure you want to delete "${post.title}" by ${post.studentName}?`)) {
                deletePost(id);
            }
        });
    });
}

// Create & Publish a new Student submission
function publishNewPost(event) {
    event.preventDefault();

    const title = document.getElementById('post-title').value;
    const category = document.getElementById('post-category').value;
    const postLanguage = document.getElementById('post-language')?.value || 'english';
    const studentName = document.getElementById('student-name').value;
    const studentStatus = document.getElementById('student-status').value;
    const studentGrade = document.getElementById('student-grade').value;
    const content = document.getElementById('post-content').value;
    const date = document.getElementById('post-date').value;
    const initialLikes = parseInt(document.getElementById('post-likes').value) || 0;

    // Student Photo source selection resolution
    let studentPhoto = '';
    const activeTabSource = document.querySelector('.image-tab-btn.active').dataset.source;

    if (activeTabSource === 'avatar') {
        const selectedAvatar = document.querySelector('input[name="student-avatar"]:checked').value;
        const seedMap = {
            avatar1: 'Aarav',
            avatar2: 'Ananya',
            avatar3: 'Riya',
            avatar4: 'Vihaan',
            avatar5: 'Kabir',
            avatar6: 'Myra'
        };
        studentPhoto = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seedMap[selectedAvatar]}`;
    } else if (activeTabSource === 'upload') {
        studentPhoto = AppState.uploadedImageBase64 || `https://api.dicebear.com/7.x/adventurer/svg?seed=${studentName}`;
    } else if (activeTabSource === 'url') {
        studentPhoto = document.getElementById('student-photo-url').value || `https://api.dicebear.com/7.x/adventurer/svg?seed=${studentName}`;
    }

    // Default illustration based on category to avoid one shared generic style for all posts
    const illustration = category === 'story' ? 'treasure' : 'feather';

    const newPost = {
        title,
        category,
        language: postLanguage,
        studentName,
        studentStatus,
        studentGrade,
        studentPhoto,
        illustration,
        date,
        likes: initialLikes,
        content
    };

    // Add to Firestore
    addPostToFirestore(newPost)
        .then((docId) => {
            // Add the post to AppState with the Firestore-generated ID
            const postWithId = {
                ...newPost,
                id: docId
            };
            AppState.posts.unshift(postWithId);

            // Reset UI and form states
            document.getElementById('publish-form').reset();
            AppState.uploadedImageBase64 = null;
            document.getElementById('file-upload-name').textContent = "No file selected";
            
            // Switch to avatar selection defaults
            switchImageTab('avatar');
            
            // Refresh Dashboards lists
            renderAdminPanel();
            alert("Congratulations! Post published successfully.");
        })
        .catch((error) => {
            console.error("Error publishing post:", error);
            alert("Failed to publish post. Please try again.");
        });
}

// Delete a student post from Firestore
function deletePost(id) {
    // Remove from Firestore
    deletePostFromFirestore(id)
        .then(() => {
            // Remove from AppState
            AppState.posts = AppState.posts.filter(p => p.id !== id);
            
            // Clean liked indices if deleted
            const likeIdx = AppState.likedPosts.indexOf(id);
            if (likeIdx !== -1) {
                AppState.likedPosts.splice(likeIdx, 1);
                saveLikes();
            }

            renderAdminPanel();
        })
        .catch((error) => {
            console.error("Error deleting post:", error);
            alert("Failed to delete post. Please try again.");
        });
}

// Switch student photo selection method panels
function switchImageTab(source) {
    document.querySelectorAll('.image-tab-btn').forEach(btn => {
        if (btn.dataset.source === source) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.image-input-field').forEach(field => {
        if (field.id === `source-${source}`) {
            field.classList.remove('hidden');
        } else {
            field.classList.add('hidden');
        }
    });
}

// Convert uploaded picture files into base64 storage URL formats
function handleStudentPhotoUpload(e) {
    const file = e.target.files[0];
    const displayLabel = document.getElementById('file-upload-name');
    
    if (!file) {
        displayLabel.textContent = "No file selected";
        AppState.uploadedImageBase64 = null;
        return;
    }

    displayLabel.textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(event) {
        AppState.uploadedImageBase64 = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Download local system writing data backup JSON files
function exportDatabase() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(AppState.posts, null, 4));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "hybrids_writers_backup_" + new Date().toISOString().split('T')[0] + ".json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Upload JSON database restores
function importDatabase(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const importedData = JSON.parse(event.target.result);
            if (Array.isArray(importedData)) {
                // Perform quick verification of fields in first item
                if (importedData.length > 0 && (!importedData[0].id || !importedData[0].title)) {
                    throw new Error("Invalid structure formats inside import database entries.");
                }

                if (confirm(`Do you want to import ${importedData.length} records? This will merge them with existing entries.`)) {
                    // Merge duplicates avoiding same IDs
                    const existingIds = AppState.posts.map(p => p.id);
                    const newPostsToAdd = [];
                    
                    importedData.forEach(item => {
                        if (!existingIds.includes(item.id)) {
                            newPostsToAdd.push(item);
                        } else {
                            // For existing IDs, update them in Firestore
                            const { id, ...updateData } = item;
                            updatePostInFirestore(id, updateData).catch(err => {
                                console.error(`Error updating post ${id}:`, err);
                            });
                        }
                    });

                    // Add new posts to Firestore
                    if (newPostsToAdd.length > 0) {
                        newPostsToAdd.forEach(post => {
                            const { id, ...postData } = post;
                            addPostToFirestore(postData).then(docId => {
                                AppState.posts.push({ ...postData, id: docId });
                            }).catch(err => {
                                console.error("Error adding post to Firestore:", err);
                            });
                        });
                    }

                    renderAdminPanel();
                    alert("Import successful! Your database entries are being synced to Firestore.");
                }
            } else {
                alert("Incorrect database formats! File must contain a JSON array of writings.");
            }
        } catch (error) {
            alert("Failed to read import backup files: " + error.message);
        }
    };
    reader.readAsText(file);
}

/* 
   =========================================
   Standard Initialization Event Wiring
   =========================================
*/

// Set footer dates dynamically
document.getElementById('current-year').textContent = new Date().getFullYear();

// Initialize application lifecycle handlers
window.addEventListener('DOMContentLoaded', async () => {
    // Initialize database and Firestore
    await initDatabase();
    
    // Setup URL Router Listener
    window.addEventListener('hashchange', router);
    
    // Setup dynamic hash execution
    router();

    // Bind Search Forms
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    const triggerSearch = () => {
        AppState.searchQuery = searchInput.value.trim();
        // Force navigate home if not already
        if (window.location.hash !== '#/home' && window.location.hash !== '#/' && window.location.hash !== '') {
            window.location.hash = '#/home';
        } else {
            renderFeedGrid();
        }
    };

    searchBtn.addEventListener('click', triggerSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerSearch();
    });

    // Reset search
    document.getElementById('reset-search-btn').addEventListener('click', () => {
        searchInput.value = '';
        AppState.searchQuery = '';
        renderFeedGrid();
    });

    // Bind Category Filter tabs clicks
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            AppState.activeFilter = tab.dataset.filter;
            resetFiltersUI(AppState.activeFilter);
            renderFeedGrid();
        });
    });

    // Bind Language Filter tabs clicks
    document.querySelectorAll('.language-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.language-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.activeLanguageFilter = btn.dataset.lang;
            resetLanguageUI(AppState.activeLanguageFilter);
            renderFeedGrid();
        });
    });

    // Bind Admin login
    const loginForm = document.getElementById('admin-login-form');
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputPasscode = document.getElementById('admin-passcode').value;
        const storedPasscode = localStorage.getItem('admin_passcode');
        const loginError = document.getElementById('login-error');

        if (inputPasscode === storedPasscode) {
            AppState.isAdminLoggedIn = true;
            sessionStorage.setItem('admin_authenticated', 'true');
            loginError.classList.add('hidden');
            loginForm.reset();
            renderAdminPanel();
        } else {
            loginError.classList.remove('hidden');
        }
    });

    // Bind Admin Log Out
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
        AppState.isAdminLoggedIn = false;
        sessionStorage.removeItem('admin_authenticated');
        renderAdminPanel();
    });

    // Bind Change Passcode Forms
    document.getElementById('change-passcode-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const newCode = document.getElementById('new-passcode').value;
        if (newCode.length < 4) {
            alert("Passcode must be at least 4 characters.");
            return;
        }
        localStorage.setItem('admin_passcode', newCode);
        alert("Success! Access passcode changed.");
        document.getElementById('change-passcode-form').reset();
    });

    // Bind Admin Image Tab Triggers
    document.querySelectorAll('.image-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchImageTab(btn.dataset.source);
        });
    });

    // Bind admin image upload reader
    document.getElementById('student-photo-file').addEventListener('change', handleStudentPhotoUpload);

    // Bind admin publish submissions forms
    document.getElementById('publish-form').addEventListener('submit', publishNewPost);

    // Bind Admin Database Backup buttons
    document.getElementById('db-export-btn').addEventListener('click', exportDatabase);
    document.getElementById('db-import-file').addEventListener('change', importDatabase);
    
    // Bind restore default database values
    document.getElementById('db-reset-btn').addEventListener('click', () => {
        if (confirm("WARNING: This will completely delete all posts from Firestore and replace with empty state. This cannot be undone. Continue?")) {
            // Delete all posts from Firestore
            Promise.all(AppState.posts.map(post => deletePostFromFirestore(post.id)))
                .then(() => {
                    AppState.posts = [...DEFAULT_POSTS];
                    renderAdminPanel();
                    alert("Database cleared from Firestore. All submissions have been deleted.");
                })
                .catch((error) => {
                    console.error("Error clearing database:", error);
                    alert("Error clearing database. Please try again.");
                });
        }
    });

    // Mobile Hamburger Toggle
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.querySelector('.nav-menu');
    menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('show');
        const menuIcon = menuToggle.querySelector('i');
        if (navMenu.classList.contains('show')) {
            menuIcon.className = "fa-solid fa-xmark";
        } else {
            menuIcon.className = "fa-solid fa-bars";
        }
    });
});

/* 
   =========================================
   Utility Helpers
   =========================================
*/

// Format date strings into user-friendly layouts e.g. "18 May 2024"
function formatDateString(dateStr) {
    if (!dateStr) return '';
    const dateObj = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Quick validation check
    if (isNaN(dateObj.getTime())) {
        return dateStr;
    }
    
    const day = dateObj.getDate();
    const month = months[dateObj.getMonth()];
    const year = dateObj.getFullYear();
    
    return `${day} ${month} ${year}`;
}

// Calculate standard text read times dynamically based on words count
function calculateReadTime(text) {
    if (!text) return '1 min read';
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return `${minutes} min read`;
}
