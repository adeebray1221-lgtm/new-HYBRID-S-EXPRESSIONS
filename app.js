/**
 * Hybrid's Expressions - Main Application JS
 * Firebase Authentication + Firestore
 *
 * Updates:
 * 1. Preserve the selected calendar date when displaying posts.
 * 2. Remove the reading-time metadata from the post detail page.
 */

// Firebase module functions
let firebaseModulePromise = null;
let authStateUnsubscribe = null;

let initializeFirebase, fetchPostsFromFirestore, addPostToFirestore;
let updatePostInFirestore, deletePostFromFirestore, updatePostLikes;
let isFirestoreReady, signInAdmin, signOutAdmin;
let onFirebaseAuthStateChanged;

function loadFirebaseFunctions() {
    if (!firebaseModulePromise) {
        firebaseModulePromise = import('./firebase.js')
            .then((m) => {
                initializeFirebase = m.initializeFirebase;
                fetchPostsFromFirestore = m.fetchPostsFromFirestore;
                addPostToFirestore = m.addPostToFirestore;
                updatePostInFirestore = m.updatePostInFirestore;
                deletePostFromFirestore = m.deletePostFromFirestore;
                updatePostLikes = m.updatePostLikes;
                isFirestoreReady = m.isFirestoreReady;
                signInAdmin = m.signInAdmin;
                signOutAdmin = m.signOutAdmin;
                onFirebaseAuthStateChanged = m.onFirebaseAuthStateChanged;

                return m;
            })
            .catch((error) => {
                firebaseModulePromise = null;
                throw error;
            });
    }

    return firebaseModulePromise;
}

// Global application state
const AppState = {
    posts: [],
    likedPosts: [],
    isAdminLoggedIn: false,
    currentView: 'home',
    activeFilter: 'all',
    activeLanguageFilter: 'all',
    searchQuery: '',
    uploadedImageBase64: null
};

const DEFAULT_POSTS = [];

function $(id) {
    return document.getElementById(id);
}

// Escape text inserted into HTML.
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

// Get a safe image URL or a default avatar.
function getStudentPhotoURL(photo, studentName) {
    const fallback =
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(studentName || 'writer')}`;

    if (typeof photo !== 'string' || !photo.trim()) {
        return fallback;
    }

    const value = photo.trim();

    if (
        /^https?:\/\//i.test(value) ||
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)
    ) {
        return value;
    }

    return fallback;
}

/* =========================================
   DATE HELPER
   ========================================= */

// Return a local YYYY-MM-DD string without UTC conversion.
function getLocalDateInputValue() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/* =========================================
   DATABASE INITIALIZATION
   ========================================= */

async function initDatabase() {
    try {
        await loadFirebaseFunctions();

        const ready = await initializeFirebase();

        if (!ready) {
            throw new Error(
                'Firebase initialization failed. Check firebase.js configuration.'
            );
        }

        const posts = await fetchPostsFromFirestore();

        AppState.posts = Array.isArray(posts) ? posts : [];

        console.log(
            `Loaded ${AppState.posts.length} posts from Firestore.`
        );

        if (typeof onFirebaseAuthStateChanged === 'function') {
            if (typeof authStateUnsubscribe === 'function') {
                authStateUnsubscribe();
            }

            authStateUnsubscribe =
                await onFirebaseAuthStateChanged((user) => {
                    AppState.isAdminLoggedIn = Boolean(user);

                    if (AppState.currentView === 'admin') {
                        renderAdminPanel();
                    }
                });
        }
    } catch (error) {
        console.error(
            'Error initializing Firebase/database:',
            error
        );

        AppState.posts = [...DEFAULT_POSTS];
    }

    // Likes are saved on this device.
    try {
        const saved = localStorage.getItem('liked_posts');

        AppState.likedPosts = saved ? JSON.parse(saved) : [];

        if (!Array.isArray(AppState.likedPosts)) {
            AppState.likedPosts = [];
        }
    } catch (error) {
        console.warn('Could not load saved likes:', error);
        AppState.likedPosts = [];
    }
}

function saveLikes() {
    try {
        localStorage.setItem(
            'liked_posts',
            JSON.stringify(AppState.likedPosts)
        );
    } catch (error) {
        console.warn(
            'Could not save liked posts locally:',
            error
        );
    }
}

/* =========================================
   ROUTING
   ========================================= */

function updateNavStyles(hash) {
    document
        .querySelectorAll('.nav-menu a, .admin-btn')
        .forEach((link) => link.classList.remove('active'));

    let id = null;

    if (hash === '#/home' || hash === '' || hash === '#/') {
        id = 'nav-home';
    } else if (hash === '#/poems') {
        id = 'nav-poems';
    } else if (hash === '#/stories') {
        id = 'nav-stories';
    } else if (hash === '#/writers') {
        id = 'nav-writers';
    } else if (hash.startsWith('#/admin')) {
        id = 'nav-admin';
    }

    if (id) {
        $(id)?.classList.add('active');
    }
}

function router() {
    const hash = window.location.hash || '#/home';

    updateNavStyles(hash);

    $('nav-menu-toggle-list')?.classList.remove('show');

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

        showView('view-details');
        renderPostDetail(hash.replace('#/post/', ''));

    } else if (hash === '#/admin') {
        AppState.currentView = 'admin';

        showView('view-admin');
        ensureAdminEmailField();
        renderAdminPanel();

    } else {
        window.location.hash = '#/home';
    }
}

function showView(viewId) {
    document
        .querySelectorAll('.app-view')
        .forEach((view) => view.classList.add('hidden'));

    const view = $(viewId);

    if (view) {
        view.classList.remove('hidden');

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

function resetFiltersUI(filter) {
    AppState.activeFilter = filter;

    document.querySelectorAll('.filter-tab').forEach((tab) => {
        tab.classList.toggle(
            'active',
            tab.dataset.filter === filter
        );
    });

    updateFeedTitle();
}

function resetLanguageUI(language) {
    AppState.activeLanguageFilter = language;

    document.querySelectorAll('.language-filter-btn').forEach((button) => {
        button.classList.toggle(
            'active',
            button.dataset.lang === language
        );
    });

    updateFeedTitle();
}

function updateFeedTitle() {
    const element = $('feed-title');

    if (!element) return;

    let title =
        AppState.activeFilter === 'all'
            ? 'Latest Poems & Stories'
            : AppState.activeFilter === 'poem'
                ? 'Beautiful Poems'
                : AppState.activeFilter === 'story'
                    ? 'Creative Stories'
                    : AppState.activeFilter === 'alumni'
                        ? 'Alumni Submissions'
                        : '';

    if (AppState.activeLanguageFilter === 'english') {
        title = title
            .replace('Latest', 'Latest English')
            .replace('Beautiful', 'English')
            .replace('Creative', 'English');
    }

    if (AppState.activeLanguageFilter === 'hindi') {
        title = title
            .replace('Latest', 'Latest Hindi')
            .replace('Beautiful', 'Hindi')
            .replace('Creative', 'Hindi');
    }

    element.textContent = title;
}

/* =========================================
   PUBLIC FEED
   ========================================= */

function renderFeedGrid() {
    const grid = $('posts-grid');
    const noResults = $('no-results');

    if (!grid || !noResults) return;

    grid.innerHTML = '';

    const sorted = [...AppState.posts].sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
    );

    const filtered = sorted.filter((post) => {
        const language = String(
            post.language || 'english'
        ).toLowerCase();

        const name = String(post.studentName || '');
        const title = String(post.title || '');

        const categoryMatch =
            AppState.activeFilter === 'all' ||
            (
                AppState.activeFilter === 'alumni' &&
                post.studentStatus === 'alumni'
            ) ||
            (
                AppState.activeFilter !== 'alumni' &&
                post.category === AppState.activeFilter
            );

        const languageMatch =
            AppState.activeLanguageFilter === 'all' ||
            language === AppState.activeLanguageFilter;

        const searchMatch =
            !AppState.searchQuery ||
            name.toLowerCase().includes(
                AppState.searchQuery.toLowerCase()
            ) ||
            title.toLowerCase().includes(
                AppState.searchQuery.toLowerCase()
            );

        return categoryMatch && languageMatch && searchMatch;
    });

    if (!filtered.length) {
        grid.classList.add('hidden');
        noResults.classList.remove('hidden');

        if ($('search-query-display')) {
            $('search-query-display').textContent =
                AppState.searchQuery || AppState.activeFilter;
        }

        return;
    }

    grid.classList.remove('hidden');
    noResults.classList.add('hidden');

    filtered.forEach((post) => {
        const id = escapeHTML(post.id);
        const title = escapeHTML(post.title || 'Untitled');
        const category = escapeHTML(post.category || 'writing');
        const name = escapeHTML(
            post.studentName || 'Unknown writer'
        );

        const photo = escapeHTML(
            getStudentPhotoURL(
                post.studentPhoto,
                post.studentName
            )
        );

        const likes = Math.max(
            0,
            Number(post.likes) || 0
        );

        const liked = AppState.likedPosts.includes(post.id);

        grid.insertAdjacentHTML('beforeend', `
            <article class="writing-card" data-id="${id}">
                <div class="card-body">
                    <span class="card-badge ${category}">${category}</span>
                    <h4 class="card-title">${title}</h4>

                    <div class="card-author" data-writer="${name}">
                        <img
                            src="${photo}"
                            alt="${name}"
                            class="author-photo"
                        >

                        <div class="author-details">
                            <span class="author-label">Written By</span>
                            <span class="author-name">${name}</span>
                        </div>
                    </div>

                    <div class="card-footer">
                        <span class="card-date">
                            <i class="fa-regular fa-clock"></i>
                            ${escapeHTML(formatDateString(post.date))}
                        </span>

                        <div
                            class="card-likes ${liked ? 'liked' : ''}"
                            data-id="${id}"
                        >
                            <i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i>
                            <span class="likes-count">${likes}</span>
                        </div>
                    </div>
                </div>
            </article>
        `);
    });

    grid.querySelectorAll('.writing-card').forEach((card) => {
        card.addEventListener('click', (event) => {
            const like = event.target.closest('.card-likes');

            if (like) {
                event.stopPropagation();

                toggleLikePost(like.dataset.id, like);
                return;
            }

            window.location.hash =
                `#/post/${card.dataset.id}`;
        });
    });
}

function getIllustrationIcon(illustration) {
    switch (illustration) {
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
    const status =
        post.studentStatus === 'alumni'
            ? 'Alumni Student'
            : 'Current Student';

    const grade = post.studentGrade
        ? ` · ${post.studentGrade}`
        : '';

    return `${status}${grade}`;
}

/* =========================================
   POST DETAIL PAGE
   ========================================= */

function renderPostDetail(id) {
    const post = AppState.posts.find(
        (item) => item.id === id
    );

    if (!post) {
        if (AppState.posts.length) {
            window.location.hash = '#/home';
        }

        return;
    }

    const badge = $('detail-category-badge');

    if (badge) {
        badge.className = `badge ${post.category || ''}`;
        badge.textContent = post.category || '';
    }

    if ($('detail-title')) {
        $('detail-title').textContent = post.title || '';
    }

    if ($('detail-date')) {
        $('detail-date').textContent =
            formatDateString(post.date);
    }

    // UPDATE: Remove reading time and its metadata wrapper.
    // This does not change the post or its Firestore data.
    const readTimeElement = $('detail-read-time');

    if (readTimeElement) {
        const readTimeWrapper = readTimeElement.closest(
            '.meta-item, .detail-meta-item, .post-meta-item'
        );

        if (readTimeWrapper) {
            readTimeWrapper.remove();
        } else {
            readTimeElement.remove();
        }
    }

    if ($('detail-content')) {
        $('detail-content').textContent = post.content || '';

        $('detail-content').classList.toggle(
            'poem-styling',
            post.category === 'poem'
        );
    }

    if ($('detail-student-photo')) {
        $('detail-student-photo').src =
            getStudentPhotoURL(
                post.studentPhoto,
                post.studentName
            );
    }

    if ($('detail-student-name')) {
        $('detail-student-name').textContent =
            post.studentName || '';
    }

    if ($('detail-student-grade')) {
        $('detail-student-grade').textContent =
            formatStudentMeta(post);
    }

    const viewWriter = $('detail-view-writer-btn');

    if (viewWriter) {
        const writerName = String(
            post.studentName || 'this writer'
        ).trim();

        viewWriter.textContent =
            `View all works by ${writerName}`;

        viewWriter.onclick = () => {
            AppState.searchQuery = writerName;

            if ($('search-input')) {
                $('search-input').value = writerName;
            }

            window.location.hash = '#/home';
        };
    }

    const likeButton = $('detail-like-btn');

    if (likeButton) {
        const liked = AppState.likedPosts.includes(post.id);

        likeButton.classList.toggle('liked', liked);

        const icon = likeButton.querySelector('i');

        if (icon) {
            icon.className =
                `fa-${liked ? 'solid' : 'regular'} fa-heart`;
        }

        if ($('detail-likes-count')) {
            $('detail-likes-count').textContent =
                Math.max(0, Number(post.likes) || 0);
        }

        const clone = likeButton.cloneNode(true);

        likeButton.parentNode.replaceChild(clone, likeButton);

        clone.addEventListener('click', () => {
            toggleLikePost(
                post.id,
                clone,
                clone.querySelector('#detail-likes-count')
            );
        });
    }
}

/* =========================================
   WRITERS DIRECTORY
   ========================================= */

function renderWritersDirectory() {
    const grid = $('writers-grid');

    if (!grid) return;

    grid.innerHTML = '';

    const writers = {};

    AppState.posts.forEach((post) => {
        const name = String(
            post.studentName || 'Unknown writer'
        );

        if (!writers[name]) {
            writers[name] = {
                name,
                grade: formatStudentMeta(post),
                photo: getStudentPhotoURL(
                    post.studentPhoto,
                    name
                ),
                count: 0
            };
        }

        writers[name].count++;
    });

    Object.values(writers).forEach((writer) => {
        const name = escapeHTML(writer.name);
        const photo = escapeHTML(writer.photo);

        grid.insertAdjacentHTML('beforeend', `
            <div class="writer-card" data-name="${name}">
                <img
                    src="${photo}"
                    alt="${name}"
                    class="writer-photo"
                >

                <h3 class="writer-name">${name}</h3>

                <p class="writer-grade">
                    ${escapeHTML(writer.grade)}
                </p>

                <span class="writer-stats-tag">
                    ${writer.count}
                    ${writer.count === 1 ? 'Writing' : 'Writings'}
                </span>
            </div>
        `);
    });

    grid.querySelectorAll('.writer-card').forEach((card) => {
        card.addEventListener('click', () => {
            AppState.searchQuery = card.dataset.name || '';

            if ($('search-input')) {
                $('search-input').value = AppState.searchQuery;
            }

            window.location.hash = '#/home';
        });
    });
}

/* =========================================
   LIKES
   ========================================= */

async function toggleLikePost(id, element, countElement) {
    const post = AppState.posts.find(
        (item) => item.id === id
    );

    if (!post || !element) return;

    const oldLikes = Math.max(
        0,
        Number(post.likes) || 0
    );

    const oldLiked = AppState.likedPosts.includes(id);

    const newLikes = Math.max(
        0,
        oldLikes + (oldLiked ? -1 : 1)
    );

    if (oldLiked) {
        AppState.likedPosts =
            AppState.likedPosts.filter((item) => item !== id);
    } else {
        AppState.likedPosts.push(id);
    }

    post.likes = newLikes;

    element.classList.toggle('liked', !oldLiked);

    const icon = element.querySelector('i');

    if (icon) {
        icon.className =
            `fa-${oldLiked ? 'regular' : 'solid'} fa-heart`;
    }

    const label =
        countElement || element.querySelector('.likes-count');

    if (label) {
        label.textContent = newLikes;
    }

    saveLikes();

    try {
        await loadFirebaseFunctions();
        await updatePostLikes(id, newLikes);
    } catch (error) {
        console.error(
            'Error updating likes in Firestore:',
            error
        );

        post.likes = oldLikes;

        if (oldLiked && !AppState.likedPosts.includes(id)) {
            AppState.likedPosts.push(id);
        }

        if (!oldLiked) {
            AppState.likedPosts =
                AppState.likedPosts.filter((item) => item !== id);
        }

        saveLikes();

        if (AppState.currentView === 'details') {
            renderPostDetail(id);
        } else {
            renderFeedGrid();
        }
    }
}

/* =========================================
   ADMIN LOGIN
   ========================================= */

function ensureAdminEmailField() {
    const form = $('admin-login-form');
    const password = $('admin-passcode');

    if (!form || !password || $('admin-email')) {
        return;
    }

    const group = password.closest('.form-group');

    const oldLabel =
        form.querySelector('label[for="admin-passcode"]');

    if (oldLabel) {
        oldLabel.textContent = 'Firebase Password';
    }

    const emailGroup = document.createElement('div');

    emailGroup.className =
        group?.className || 'form-group';

    const label = document.createElement('label');

    label.htmlFor = 'admin-email';
    label.textContent = 'Admin Email';

    if (oldLabel?.className) {
        label.className = oldLabel.className;
    }

    const input = document.createElement('input');

    input.type = 'email';
    input.id = 'admin-email';
    input.name = 'admin-email';
    input.placeholder = 'Enter your admin email';
    input.autocomplete = 'username';
    input.required = true;
    input.className = password.className;

    emailGroup.append(label, input);

    if (group?.parentNode) {
        group.parentNode.insertBefore(emailGroup, group);
    } else {
        password.parentNode.insertBefore(emailGroup, password);
    }

    password.autocomplete = 'current-password';
    password.placeholder = 'Enter your Firebase password';
}

function updateLoginError(message) {
    const error = $('login-error');

    if (!error) return;

    error.textContent = message || '';
    error.classList.toggle('hidden', !message);
}

function renderAdminPanel() {
    const loginCard = $('admin-login-card');
    const dashboard = $('admin-dashboard');

    if (!loginCard || !dashboard) return;

    if (AppState.isAdminLoggedIn) {
        loginCard.classList.add('hidden');
        dashboard.classList.remove('hidden');

        const date = $('post-date');

        // UPDATE: Use the local calendar date instead of a UTC date.
        if (date && !date.value) {
            date.value = getLocalDateInputValue();
        }

        if ($('admin-posts-count')) {
            $('admin-posts-count').textContent =
                AppState.posts.length;
        }

        renderAdminPostsList();
    } else {
        loginCard.classList.remove('hidden');
        dashboard.classList.add('hidden');

        ensureAdminEmailField();
    }
}

function renderAdminPostsList() {
    const list = $('admin-posts-list');

    if (!list) return;

    list.innerHTML = '';

    const sorted = [...AppState.posts].sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
    );

    sorted.forEach((post) => {
        const li = document.createElement('li');

        li.innerHTML = `
            <div class="admin-post-title-meta">
                <span
                    class="admin-post-item-title"
                    data-id="${escapeHTML(post.id)}"
                >
                    ${escapeHTML(post.title || 'Untitled')}
                </span>

                <span class="admin-post-item-author">
                    ${escapeHTML(post.studentName || 'Unknown writer')}
                    &bull;
                    ${escapeHTML(
                        String(post.category || 'writing').toUpperCase()
                    )}
                </span>
            </div>

            <button
                class="btn-delete-post"
                data-id="${escapeHTML(post.id)}"
                title="Delete Post"
                type="button"
            >
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        list.appendChild(li);
    });

    list.querySelectorAll('.admin-post-item-title').forEach((item) => {
        item.addEventListener('click', () => {
            window.location.hash =
                `#/post/${item.dataset.id}`;
        });
    });

    list.querySelectorAll('.btn-delete-post').forEach((button) => {
        button.addEventListener('click', () => {
            const post = AppState.posts.find(
                (item) => item.id === button.dataset.id
            );

            if (
                post &&
                confirm(
                    `Are you sure you want to delete "${post.title}" by ${post.studentName}?`
                )
            ) {
                deletePost(post.id);
            }
        });
    });
}

/* =========================================
   PUBLISH POSTS
   ========================================= */

async function publishNewPost(event) {
    event.preventDefault();

    if (!AppState.isAdminLoggedIn) {
        alert(
            'Please sign in with your Firebase admin account first.'
        );
        return;
    }

    const title = $('post-title')?.value.trim() || '';
    const category = $('post-category')?.value || 'poem';
    const language = $('post-language')?.value || 'english';
    const studentName = $('student-name')?.value.trim() || '';
    const studentStatus = $('student-status')?.value || 'current';
    const studentGrade = $('student-grade')?.value || '';
    const content = $('post-content')?.value || '';

    // UPDATE: Fall back to the local calendar date.
    const date =
        $('post-date')?.value ||
        getLocalDateInputValue();

    const likes = Math.max(
        0,
        parseInt($('post-likes')?.value, 10) || 0
    );

    const source =
        document.querySelector('.image-tab-btn.active')
            ?.dataset.source || 'avatar';

    let studentPhoto = '';

    if (source === 'avatar') {
        const choice =
            document.querySelector(
                'input[name="student-avatar"]:checked'
            )?.value || 'avatar1';

        const seeds = {
            avatar1: 'Aarav',
            avatar2: 'Ananya',
            avatar3: 'Riya',
            avatar4: 'Vihaan',
            avatar5: 'Kabir',
            avatar6: 'Myra'
        };

        studentPhoto =
            `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seeds[choice] || 'Aarav')}`;

    } else if (source === 'upload') {
        studentPhoto =
            AppState.uploadedImageBase64 ||
            getStudentPhotoURL('', studentName);

    } else if (source === 'url') {
        studentPhoto = getStudentPhotoURL(
            $('student-photo-url')?.value || '',
            studentName
        );
    }

    if (!title || !studentName || !content.trim()) {
        alert(
            'Please fill in the title, student name, and content.'
        );
        return;
    }

    const newPost = {
        title,
        category,
        language,
        studentName,
        studentStatus,
        studentGrade,
        studentPhoto,
        illustration: category === 'story' ? 'treasure' : 'feather',
        date,
        likes,
        content
    };

    try {
        await loadFirebaseFunctions();

        const id = await addPostToFirestore(newPost);

        AppState.posts.unshift({
            ...newPost,
            id
        });

        $('publish-form')?.reset();

        AppState.uploadedImageBase64 = null;

        if ($('file-upload-name')) {
            $('file-upload-name').textContent = 'No file selected';
        }

        switchImageTab('avatar');

        renderAdminPanel();
        renderFeedGrid();

        alert('Congratulations! Post published successfully.');

    } catch (error) {
        console.error('Error publishing post:', error);

        alert(
            `Failed to publish post.\n\n${error.code || 'Error'}: ${error.message || 'Please try again.'}`
        );
    }
}

/* =========================================
   DELETE POSTS
   ========================================= */

async function deletePost(id) {
    if (!AppState.isAdminLoggedIn) {
        alert(
            'Please sign in with your Firebase admin account first.'
        );
        return;
    }

    try {
        await loadFirebaseFunctions();

        await deletePostFromFirestore(id);

        AppState.posts = AppState.posts.filter(
            (post) => post.id !== id
        );

        AppState.likedPosts =
            AppState.likedPosts.filter(
                (postId) => postId !== id
            );

        saveLikes();

        renderAdminPanel();
        renderFeedGrid();

    } catch (error) {
        console.error('Error deleting post:', error);

        alert(
            `Failed to delete post.\n\n${error.code || 'Error'}: ${error.message || 'Please try again.'}`
        );
    }
}

/* =========================================
   IMAGE UPLOAD
   ========================================= */

function switchImageTab(source) {
    document.querySelectorAll('.image-tab-btn').forEach((button) => {
        button.classList.toggle(
            'active',
            button.dataset.source === source
        );
    });

    document.querySelectorAll('.image-input-field').forEach((field) => {
        field.classList.toggle(
            'hidden',
            field.id !== `source-${source}`
        );
    });
}

function handleStudentPhotoUpload(event) {
    const file = event.target.files?.[0];
    const label = $('file-upload-name');

    if (!file) {
        if (label) {
            label.textContent = 'No file selected';
        }

        AppState.uploadedImageBase64 = null;
        return;
    }

    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        event.target.value = '';
        return;
    }

    if (file.size > 500 * 1024) {
        alert(
            'This image is too large for the current Firestore upload method. ' +
            'Choose an image under 500 KB; Firebase Storage can be added later.'
        );

        event.target.value = '';
        AppState.uploadedImageBase64 = null;
        return;
    }

    if (label) {
        label.textContent = file.name;
    }

    const reader = new FileReader();

    reader.onload = (eventResult) => {
        AppState.uploadedImageBase64 =
            eventResult.target.result;
    };

    reader.onerror = () => {
        AppState.uploadedImageBase64 = null;

        if (label) {
            label.textContent = 'Could not read image';
        }

        alert('Could not read the selected image.');
    };

    reader.readAsDataURL(file);
}

/* =========================================
   DATABASE BACKUP AND IMPORT
   ========================================= */

function exportDatabase() {
    const data =
        'data:application/json;charset=utf-8,' +
        encodeURIComponent(
            JSON.stringify(AppState.posts, null, 4)
        );

    const link = document.createElement('a');

    link.href = data;

    link.download =
        `hybrids_writers_backup_${new Date().toISOString().split('T')[0]}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function importDatabase(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
        const imported = JSON.parse(await file.text());

        if (!Array.isArray(imported)) {
            throw new Error(
                'File must contain a JSON array of writings.'
            );
        }

        if (
            imported.length &&
            (!imported[0].id || !imported[0].title)
        ) {
            throw new Error(
                'The imported entries do not have the expected structure.'
            );
        }

        if (
            !confirm(
                `Import ${imported.length} records? Existing IDs will be updated and new entries will be added.`
            )
        ) {
            return;
        }

        if (!AppState.isAdminLoggedIn) {
            throw new Error(
                'Sign in with the Firebase admin account first.'
            );
        }

        await loadFirebaseFunctions();

        const existingIds = new Set(
            AppState.posts.map((post) => post.id)
        );

        for (const item of imported) {
            const { id, ...data } = item;

            if (id && existingIds.has(id)) {
                await updatePostInFirestore(id, data);
            } else {
                const newId = await addPostToFirestore(data);
                existingIds.add(newId);
            }
        }

        AppState.posts = await fetchPostsFromFirestore();

        renderAdminPanel();
        renderFeedGrid();

        alert('Import completed.');

    } catch (error) {
        console.error('Database import failed:', error);

        alert(
            `Import failed: ${error.message || 'Check the JSON file and try again.'}`
        );

    } finally {
        event.target.value = '';
    }
}

/* =========================================
   APPLICATION STARTUP
   ========================================= */

document.addEventListener('DOMContentLoaded', async () => {
    if ($('current-year')) {
        $('current-year').textContent =
            new Date().getFullYear();
    }

    await initDatabase();

    window.addEventListener('hashchange', router);

    window.addEventListener('beforeunload', () => {
        if (typeof authStateUnsubscribe === 'function') {
            authStateUnsubscribe();
        }
    });

    router();

    const searchInput = $('search-input');

    const runSearch = () => {
        if (!searchInput) return;

        AppState.searchQuery =
            searchInput.value.trim();

        if (
            !['#/home', '#/', ''].includes(
                window.location.hash
            )
        ) {
            window.location.hash = '#/home';
        } else {
            renderFeedGrid();
        }
    };

    $('search-btn')?.addEventListener('click', runSearch);

    searchInput?.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            runSearch();
        }
    });

    $('reset-search-btn')?.addEventListener('click', () => {
        if (searchInput) {
            searchInput.value = '';
        }

        AppState.searchQuery = '';

        renderFeedGrid();
    });

    // Category filters.
    document.querySelectorAll('.filter-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            resetFiltersUI(tab.dataset.filter);
            renderFeedGrid();
        });
    });

    // Language filters.
    document.querySelectorAll('.language-filter-btn').forEach((button) => {
        button.addEventListener('click', () => {
            resetLanguageUI(button.dataset.lang);
            renderFeedGrid();
        });
    });

    // Firebase Email/Password login.
    const loginForm = $('admin-login-form');

    if (loginForm) {
        ensureAdminEmailField();

        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const email =
                $('admin-email')?.value.trim() || '';

            const password =
                $('admin-passcode')?.value || '';

            updateLoginError('');

            try {
                await loadFirebaseFunctions();

                if (typeof signInAdmin !== 'function') {
                    throw new Error(
                        'Firebase Authentication is unavailable. Check firebase.js.'
                    );
                }

                await signInAdmin(email, password);

                AppState.isAdminLoggedIn = true;

                loginForm.reset();

                renderAdminPanel();

            } catch (error) {
                console.error('Admin login failed:', error);

                const invalid = [
                    'auth/invalid-credential',
                    'auth/invalid-login-credentials',
                    'auth/user-not-found',
                    'auth/wrong-password',
                    'auth/invalid-email'
                ];

                if (invalid.includes(error.code)) {
                    updateLoginError('Incorrect email or password.');

                } else if (error.code === 'auth/too-many-requests') {
                    updateLoginError(
                        'Too many attempts. Wait a while and try again.'
                    );

                } else {
                    updateLoginError(
                        error.message || 'Login failed. Please try again.'
                    );
                }
            }
        });
    }

    // Firebase logout.
    $('admin-logout-btn')?.addEventListener('click', async () => {
        try {
            await loadFirebaseFunctions();

            await signOutAdmin();

            AppState.isAdminLoggedIn = false;

            renderAdminPanel();

        } catch (error) {
            console.error('Logout failed:', error);

            alert(
                `Logout failed: ${error.message || 'Please try again.'}`
            );
        }
    });

    // Password management is handled by Firebase.
    $('change-passcode-form')?.addEventListener('submit', (event) => {
        event.preventDefault();

        alert(
            'Admin password is managed by Firebase Authentication. ' +
            'Use Firebase Console > Authentication > Users to manage or reset it.'
        );

        event.currentTarget.reset();
    });

    // Image tabs.
    document.querySelectorAll('.image-tab-btn').forEach((button) => {
        button.addEventListener('click', () => {
            switchImageTab(button.dataset.source);
        });
    });

    $('student-photo-file')?.addEventListener(
        'change',
        handleStudentPhotoUpload
    );

    // Publish posts.
    $('publish-form')?.addEventListener(
        'submit',
        publishNewPost
    );

    // Database backup and import.
    $('db-export-btn')?.addEventListener(
        'click',
        exportDatabase
    );

    $('db-import-file')?.addEventListener(
        'change',
        importDatabase
    );

    // This only executes if an administrator explicitly confirms deletion.
    $('db-reset-btn')?.addEventListener('click', async () => {
        if (!AppState.isAdminLoggedIn) {
            alert(
                'Please sign in with the Firebase admin account first.'
            );
            return;
        }

        if (!confirm(
            'WARNING: This permanently deletes all posts from the current Firestore database. ' +
            'This cannot be undone. Continue?'
        )) {
            return;
        }

        try {
            await loadFirebaseFunctions();

            await Promise.all(
                AppState.posts.map((post) =>
                    deletePostFromFirestore(post.id)
                )
            );

            AppState.posts = [...DEFAULT_POSTS];

            renderAdminPanel();
            renderFeedGrid();

            alert('Posts deleted from Firestore.');

        } catch (error) {
            console.error('Error clearing database:', error);

            alert(
                `Could not clear database: ${error.message || 'Please try again.'}`
            );
        }
    });

    // Mobile navigation.
    const menuToggle = $('menuToggle');
    const navMenu = document.querySelector('.nav-menu');

    menuToggle?.addEventListener('click', () => {
        if (!navMenu) return;

        navMenu.classList.toggle('show');

        const icon = menuToggle.querySelector('i');

        if (icon) {
            icon.className =
                navMenu.classList.contains('show')
                    ? 'fa-solid fa-xmark'
                    : 'fa-solid fa-bars';
        }
    });

    router();
});

/* =========================================
   UTILITIES
   ========================================= */

// UPDATE: Display the calendar date as saved, without UTC shifts.
function formatDateString(dateStr) {
    if (!dateStr) return '';

    const raw = String(dateStr).trim();

    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    // Preserve YYYY-MM-DD from date input and ISO date strings.
    const match = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/
    );

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        const validMonth = month >= 1 && month <= 12;

        const daysInMonth = validMonth
            ? new Date(Date.UTC(year, month, 0)).getUTCDate()
            : 0;

        if (
            day >= 1 &&
            day <= daysInMonth
        ) {
            return `${day} ${months[month - 1]} ${year}`;
        }
    }

    // Fallback for previously saved dates in other formats.
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
        return raw;
    }

    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function calculateReadTime(text) {
    if (!text) return '1 min read';

    const words = String(text)
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;

    return `${Math.max(1, Math.ceil(words / 200))} min read`;
}
