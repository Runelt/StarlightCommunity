import { showToast } from './alert.js';

const postForm = document.getElementById('writeForm');
const cancelBtn = document.getElementById('cancelBtn');
const fileInput = document.getElementById('fileInput');
const fileLabel = document.querySelector('.custom-file-label');
const fileHint = document.getElementById('fileHint');
const authorInput = document.getElementById('write-author-input');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');

const DEFAULT_HINT = '사진 또는 동영상 파일 (선택)';
let previewObjectUrl = null;

function clearPreview() {
    imagePreview.style.display = 'none';
    videoPreview.style.display = 'none';
    imagePreview.removeAttribute('src');
    videoPreview.removeAttribute('src');
    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
    }
}

fileLabel.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    clearPreview();

    const file = fileInput.files[0];
    if (!file) {
        fileHint.textContent = DEFAULT_HINT;
        return;
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        showToast('사진 또는 동영상 파일만 업로드할 수 있습니다');
        fileInput.value = '';
        fileHint.textContent = DEFAULT_HINT;
        return;
    }

    fileHint.textContent = file.name;
    previewObjectUrl = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
        imagePreview.src = previewObjectUrl;
        imagePreview.style.display = 'block';
    } else {
        videoPreview.src = previewObjectUrl;
        videoPreview.style.display = 'block';
    }
});

cancelBtn.addEventListener('click', () => window.location.href = 'index.html');

// 페이지 로드 시 작성자 값을 셋팅
function setAuthorField() {
    const currentUser = localStorage.getItem('currentUser');
    const currentAdmin = localStorage.getItem('currentAdmin');
    const who = currentUser || currentAdmin || '';
    if (authorInput) authorInput.value = who;
}
setAuthorField();

// 제출
postForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 로그인 여부 확인
    const currentUser = localStorage.getItem('currentUser');
    const currentAdmin = localStorage.getItem('currentAdmin');
    if (!currentUser && !currentAdmin) {
        showToast('로그인이 필요합니다');
        return;
    }

    const formData = new FormData(postForm);
    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            body: formData
        });

        // 서버가 redirect 한다면 fetch가 200을 반환. 간단하게 성공 판단
        if (res.ok || res.redirected) {
            showToast('게시글이 등록되었습니다!');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000); // toast가 사라진 후 이동
        } else {
            const text = await res.text();
            showToast(`게시글 등록 실패: ${text}`);
        }
    } catch (err) {
        console.error(err);
        showToast('오류가 발생했습니다');
    }
});