import { showToast } from './alert.js';

const postsEl = document.getElementById('posts');
const paginationEl = document.getElementById('pagination');
const writeBtn = document.getElementById('writeBtn');
const loginBtn = document.getElementById('login');

let posts = [];
let currentPage = 1;
const postsPerPage = 5;

// 게시글 불러오기
async function fetchPosts() {
    postsEl.innerHTML = '<div class="loading-state">게시글을 불러오는 중...</div>';
    try {
        const res = await fetch('/api/posts');
        if (!res.ok) throw new Error('게시글을 가져오는 데 실패했습니다.');
        posts = await res.json();
        renderPage(currentPage);
    } catch (err) {
        postsEl.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-state';
        errorDiv.textContent = err.message;
        postsEl.appendChild(errorDiv);
        paginationEl.innerHTML = '';
    }
}

// 특정 페이지 렌더링
function renderPage(page) {
    postsEl.innerHTML = '';
    const start = (page - 1) * postsPerPage;
    const end = start + postsPerPage;
    const pagePosts = posts.slice(start, end);

    if (pagePosts.length === 0) {
        postsEl.innerHTML = '<div class="empty-state">등록된 게시글이 없습니다.</div>';
        paginationEl.innerHTML = '';
        return;
    }

    pagePosts.forEach(post => {
        const div = document.createElement('div');
        div.className = 'post';

        const h3 = document.createElement('h3');
        const a = document.createElement('a');
        a.href = `view-post.html?id=${encodeURIComponent(post.id)}`;
        // textContent를 사용해 제목에 악성 스크립트가 포함되어 있어도
        // 그대로 실행되지 않고 문자열로만 표시되도록 처리 (XSS 방지)
        a.textContent = post.title;
        h3.appendChild(a);

        const p = document.createElement('p');
        const content = post.content ?? '';
        p.textContent = content.length > 100 ? content.substring(0, 100) + '...' : content;

        div.appendChild(h3);
        div.appendChild(p);
        postsEl.appendChild(div);
    });

    renderPagination();
}

// 페이지네이션 렌더링
function renderPagination() {
    paginationEl.innerHTML = '';
    const pageCount = Math.ceil(posts.length / postsPerPage);
    for (let i = 1; i <= pageCount; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = (i === currentPage) ? 'active' : '';
        btn.setAttribute('aria-label', `${i}페이지로 이동`);
        btn.addEventListener('click', () => {
            currentPage = i;
            renderPage(currentPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        paginationEl.appendChild(btn);
    }
}

// 로그인 상태 확인 및 버튼 업데이트
function checkLoginStatus() {
    const currentUser = localStorage.getItem('currentUser');
    const currentAdmin = localStorage.getItem('currentAdmin');

    if (currentUser || currentAdmin) {
        loginBtn.textContent = '로그아웃';
    } else {
        loginBtn.textContent = '로그인';
    }
}

// 로그인 버튼 클릭
loginBtn.addEventListener('click', () => {
    const currentUser = localStorage.getItem('currentUser');
    const currentAdmin = localStorage.getItem('currentAdmin');

    if (currentUser || currentAdmin) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentAdmin');
        showToast('로그아웃 되었습니다');
        checkLoginStatus();
    } else {
        window.location.href = 'login.html';
    }
});

// 글쓰기 버튼 클릭
writeBtn.addEventListener('click', () => {
    const currentUser = localStorage.getItem('currentUser');
    const currentAdmin = localStorage.getItem('currentAdmin');

    if (!currentUser && !currentAdmin) {
        showToast('로그인이 필요합니다');
    } else {
        window.location.href = 'write.html';
    }
});

// 초기 실행
checkLoginStatus();
fetchPosts();
