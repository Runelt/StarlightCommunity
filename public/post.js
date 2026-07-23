import { showToast } from './alert.js';

const postMeta = document.getElementById('post-meta');
const postTitle = document.getElementById('post-title');
const postContent = document.getElementById('post-content');
const postVideo = document.getElementById('post-video');
const postImage = document.getElementById('post-image');

const commentsListEl = document.getElementById('comments-list');
const commentFormWrap = document.getElementById('comment-form-wrap');
const commentInput = document.getElementById('comment-input');
const commentSubmitBtn = document.getElementById('comment-submit');

const deleteBtn = document.getElementById('deleteBtn');
const backBtn = document.getElementById('backBtn');

const params = new URLSearchParams(window.location.search);
const postId = params.get('id');

// HTML 특수문자 이스케이프 (XSS 방지)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

backBtn.addEventListener('click', () => window.history.back());

// 로그인 확인
let me = null;
async function loadMe() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        me = data.user;
    } catch {
        me = null;
    }
}

// 게시글 로드
let post = null;
async function fetchPost() {
    if (!postId) {
        showToast('게시글 ID가 없습니다.');
        return;
    }
    try {
        const res = await fetch(`/api/posts/${postId}`);
        if (!res.ok) throw new Error('게시글을 가져오는 데 실패했습니다.');
        post = await res.json();
        // 작성자 + 작성일
        const author = post.author || '익명';
        const createdAt = post.createdAt ? new Date(post.createdAt) : null;
        const dateText = createdAt && !isNaN(createdAt) ? createdAt.toLocaleString() : '';
        postMeta.textContent = dateText ? `${author} | ${dateText}` : author;
        postTitle.textContent = post.title;
        postContent.textContent = post.content;
        // 첨부 미디어 렌더링
        postImage.style.display = 'none';
        postVideo.style.display = 'none';

        if (post.mediaType === 'image' && post.mediaUrl) {
            postImage.src = post.mediaUrl;
            postImage.style.display = 'block';
        } else if (post.mediaType === 'video' && post.mediaUrl) {
            postVideo.src = post.mediaUrl;
            postVideo.style.display = 'block';
        }
        // 댓글 렌더링
        renderComments();
        // 로그인한 사용자만 댓글 작성 부분 표시
        commentFormWrap.style.display = me ? 'flex' : 'none';
        // 삭제 버튼 표시
        const canDelete = me && (me.username === post.author || me.role === 'admin');
        deleteBtn.style.display = canDelete ? 'inline-block' : 'none';
    } catch (err) {
        showToast(err.message);
    }
}

function renderComments() {
    commentsListEl.innerHTML = '';
    const comments = Array.isArray(post.comments) ? post.comments : [];
    if (comments.length === 0) {
        commentsListEl.innerHTML = '<p>등록된 댓글이 없습니다.</p>';
        return;
    }
    comments.forEach(c => {
        const el = document.createElement('div');
        el.className = 'comment';
        el.innerHTML = `<strong>${escapeHtml(c.author)}:</strong> ${escapeHtml(c.text)}`;
        commentsListEl.appendChild(el);
    });
}

// 댓글 작성
commentSubmitBtn.addEventListener('click', async () => {
    const text = commentInput.value.trim();
    if (!text) return showToast('댓글 내용을 입력하세요');
    if (!me) return showToast('로그인이 필요합니다');

    commentSubmitBtn.disabled = true;
    try {
        const res = await fetch(`/api/posts/${post.id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '댓글 작성 실패');
        post.comments = data.comments;
        commentInput.value = '';
        renderComments();
    } catch (err) {
        showToast(err.message);
    } finally {
        commentSubmitBtn.disabled = false;
    }
});

// Ctrl + Enter로 댓글 등록
commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commentSubmitBtn.click();
    }
});

// 게시글 삭제
deleteBtn.addEventListener('click', async () => {
    const confirmed = confirm('정말 삭제하시겠습니까?');
    if (!confirmed) return;

    deleteBtn.disabled = true;
    try {
        const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '삭제 실패');
        showToast('게시글이 삭제되었습니다!');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000); // toast가 사라진 후 이동
    } catch (err) {
        showToast(err.message);
        deleteBtn.disabled = false;
    }
});

await loadMe();
await fetchPost();
