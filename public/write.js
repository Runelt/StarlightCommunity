import { showToast } from './alert.js';
import { upload } from 'https://esm.sh/@vercel/blob@1.0.0/client';

const postForm = document.getElementById('writeForm');
const cancelBtn = document.getElementById('cancelBtn');
const fileInput = document.getElementById('fileInput');
const fileLabel = document.querySelector('.custom-file-label');
const fileHint = document.getElementById('fileHint');
const authorInput = document.getElementById('write-author-input');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');

const DEFAULT_HINT = '사진 또는 동영상 선택';
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

    const submitBtn = postForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
        const title = document.getElementById('title-input').value;
        const content = document.getElementById('content-input').value;
        const author = authorInput.value;
        const file = fileInput.files[0];

        let mediaUrl = null;
        let mediaType = null;

        if (file) {
            fileHint.textContent = `업로드 중... ${file.name}`;
            const blob = await upload(file.name, file, {
                access: 'public',
                handleUploadUrl: '/api/blob-upload',
                onUploadProgress: (progress) => {
                    fileHint.textContent = `업로드 중... ${Math.round(progress.percentage)}%`;
                }
            });
            mediaUrl = blob.url;
            mediaType = file.type.startsWith('image/') ? 'image' : 'video';
            fileHint.textContent = file.name;
        }

        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, author, mediaUrl, mediaType })
        });

        if (res.ok) {
            showToast('게시글이 등록되었습니다!');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000); // toast가 사라진 후 이동
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(`게시글 등록 실패: ${data.error || '알 수 없는 오류'}`);
        }
    } catch (err) {
        console.error(err);
        showToast('오류가 발생했습니다');
    } finally {
        submitBtn.disabled = false;
    }
});
