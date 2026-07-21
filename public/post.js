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

// 현재 사용자 (로컬 시뮬레이션용)
const currentUser = localStorage.getItem('currentUser');
const currentAdmin = localStorage.getItem('currentAdmin');

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

        // meta: 작성자(작게) + 작성일
        const author = post.author || '익명';
        const createdAt = post.createdAt ? new Date(post.createdAt) : null;
        const dateText = createdAt && !isNaN(createdAt) ? createdAt.toLocaleString() : '';
        postMeta.textContent = dateText ? `${author} | ${dateText}` : author;
        postTitle.textContent = post.title;
        postContent.textContent = post.content;

        // 첨부 미디어 렌더링
        // 참고: 백엔드 응답 형태를 확인하지 못해 mediaType/mediaUrl을 우선 사용하고,
        // 기존 post.video 필드(동영상 전용)도 함께 지원하도록 구성했습니다.
        // 실제 API가 다른 필드명을 쓴다면 이 부분을 그에 맞게 조정해야 합니다.
        postImage.style.display = 'none';
        postVideo.style.display = 'none';

        if (post.mediaType === 'image' && post.mediaUrl) {
            postImage.src = post.mediaUrl;
            postImage.style.display = 'block';
        } else if (post.mediaType === 'video' && post.mediaUrl) {
            postVideo.src = post.mediaUrl;
            postVideo.style.display = 'block';
        } else if (post.video) {
            postVideo.src = post.video;
            postVideo.style.display = 'block';
        }

        // 댓글 렌더링
        renderComments();

        // 댓글 작성 폼 표시(로그인한 사용자만)
        commentFormWrap.style.display = (currentUser || currentAdmin) ? 'flex' : 'none';

        // 삭제 버튼 표시: 작성자 또는 admin만
        // 주의: 이 표시 여부는 UI 편의를 위한 것일 뿐입니다.
        // 실제 삭제 권한은 서버가 세션/토큰을 기준으로 반드시 다시 검증해야 합니다.
        if ((currentUser && currentUser === post.author) || currentAdmin) {
            deleteBtn.style.display = 'inline-block';
        } else {
            deleteBtn.style.display = 'none';
        }
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
    if (!currentUser && !currentAdmin) return showToast('로그인이 필요합니다');

    const authorName = currentUser || currentAdmin || '익명';

    commentSubmitBtn.disabled = true;
    try {
        const res = await fetch(`/api/posts/${post.id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: authorName, text })
        });
        if (!res.ok) throw new Error('댓글 작성 실패');
        const updatedPost = await res.json();
        post.comments = updatedPost.comments;
        commentInput.value = '';
        renderComments();
    } catch (err) {
        showToast(err.message);
    } finally {
        commentSubmitBtn.disabled = false;
    }
});

// Ctrl/Cmd + Enter로 댓글 등록 (Enter는 줄바꿈으로 남겨둠)
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
        if (!res.ok) throw new Error('삭제 실패');
        showToast('게시글이 삭제되었습니다!');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000); // toast가 사라진 후 이동
    } catch (err) {
        showToast(err.message);
        deleteBtn.disabled = false;
    }
});

fetchPost();