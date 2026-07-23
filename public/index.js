import { showToast } from './alert.js';

const postsEl = document.getElementById('posts');
const paginationEl = document.getElementById('pagination');
const writeBtn = document.getElementById('writeBtn');
const loginBtn = document.getElementById('login');

let posts = [];
let currentPage = 1;
const postsPerPage = 5;
let me = null; // 로그인 상태

// HTML 특수문자 이스케이프 (XSS 방지)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 게시글 불러오기
async function fetchPosts() {
    try {
        const res = await fetch('/api/posts');
        if (!res.ok) throw new Error('게시글을 가져오는 데 실패했습니다.');
        posts = await res.json();
        renderPage(currentPage);
    } catch (err) {
        postsEl.innerHTML = `<p style="color:red;">${escapeHtml(err.message)}</p>`;
    }
}

// 특정 페이지 렌더링
function renderPage(page) {
    postsEl.innerHTML = '';
    const start = (page - 1) * postsPerPage;
    const end = start + postsPerPage;
    const pagePosts = posts.slice(start, end);

    if (pagePosts.length === 0) {
        postsEl.innerHTML = '<p>등록된 게시글이 없습니다.</p>';
        paginationEl.innerHTML = '';
        return;
    }

    pagePosts.forEach(post => {
        const div = document.createElement('div');
        div.className = 'post';

        const preview = post.content.length > 100
            ? post.content.substring(0, 100) + '...'
            : post.content;

        div.innerHTML = `
            <h3><a href="post.html?id=${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a></h3>
            <p>${escapeHtml(preview)}</p>
        `;
        postsEl.appendChild(div);
    });

    renderPagination();
}

// 페이지네이션
function renderPagination() {
    paginationEl.innerHTML = '';
    const pageCount = Math.ceil(posts.length / postsPerPage);
    for (let i = 1; i <= pageCount; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = i;
        btn.className = (i === currentPage) ? 'active' : '';
        btn.setAttribute('aria-current', i === currentPage ? 'page' : 'false');
        btn.addEventListener('click', () => {
            currentPage = i;
            renderPage(currentPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        paginationEl.appendChild(btn);
    }
}

// 로그인 상태 확인
async function loadLoginStatus() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        me = data.user;
    } catch {
        me = null;
    }
    loginBtn.textContent = me ? '로그아웃' : '로그인';
}

// 로그인 버튼 로직
loginBtn.addEventListener('click', async () => {
    if (me) {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
        }
        me = null;
        loginBtn.textContent = '로그인';
        showToast('로그아웃 되었습니다');
    } else {
        window.location.href = 'login.html';
    }
});

// 글쓰기 버튼 로직
writeBtn.addEventListener('click', () => {
    if (!me) {
        showToast('로그인이 필요합니다');
    } else {
        window.location.href = 'write.html';
    }
});

await loadLoginStatus();
fetchPosts();
