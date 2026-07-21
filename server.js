const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 업로드 디렉토리 설정
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// multer 설정: 원본 확장자를 유지한 랜덤 파일명 + 이미지/동영상만 허용 + 용량 제한
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        // 원본 파일명은 신뢰하지 않고 확장자만 취해서 랜덤 이름과 조합 (경로 조작 방지)
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${crypto.randomUUID()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 파일당 최대 100MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('사진 또는 동영상 파일만 업로드할 수 있습니다.'));
        }
    }
});

// 미들웨어
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// posts.json 로딩
const POSTS_FILE = path.join(__dirname, 'posts.json');
let posts = [];
try {
    posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
} catch {
    posts = [];
}

// posts.json 저장 (실패 시 false 반환)
function savePosts() {
    try {
        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        return true;
    } catch (err) {
        console.error('posts.json 저장 실패:', err);
        return false;
    }
}

// 입력값 기본 검증 헬퍼
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

// GET 전체
app.get('/api/posts', (req, res) => {
    res.json(posts);
});

// GET 상세
app.get('/api/posts/:id', (req, res) => {
    const post = posts.find(p => String(p.id) === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
});

// POST 작성 (사진/동영상 업로드 가능)
app.post('/api/posts', upload.single('media'), (req, res) => {
    const { title, content, author } = req.body;

    if (!isNonEmptyString(title) || !isNonEmptyString(content)) {
        return res.status(400).json({ error: '제목과 내용을 모두 입력해주세요.' });
    }
    if (title.length > 200) {
        return res.status(400).json({ error: '제목은 200자를 넘을 수 없습니다.' });
    }
    if (content.length > 20000) {
        return res.status(400).json({ error: '내용은 20000자를 넘을 수 없습니다.' });
    }

    let mediaUrl = null;
    let mediaType = null;
    if (req.file) {
        mediaUrl = `/uploads/${req.file.filename}`;
        mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    }

    const newPost = {
        id: crypto.randomUUID(),
        title: title.trim(),
        content: content.trim(),
        author: isNonEmptyString(author) ? author.trim() : '익명',
        mediaUrl,
        mediaType,
        createdAt: new Date().toISOString(),
        comments: []
    };

    posts.unshift(newPost);
    if (!savePosts()) {
        return res.status(500).json({ error: '게시글 저장에 실패했습니다.' });
    }

    // AJAX(fetch)로 호출하는 클라이언트이므로 리다이렉트 대신 생성된 게시글을 JSON으로 반환
    res.status(201).json(newPost);
});

// PUT 수정 (제목/내용만 — 댓글은 아래 전용 엔드포인트 사용)
// 주의: 이 서버는 아직 실제 로그인 세션이 없어서, 요청자가 실제 작성자인지
// 서버가 검증할 방법이 없습니다. 운영 환경에 배포하기 전에 세션/토큰 기반
// 인증을 추가해서 아래 로직에 작성자 확인을 반드시 넣어야 합니다.
app.put('/api/posts/:id', (req, res) => {
    const index = posts.findIndex(p => String(p.id) === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Post not found' });

    const { title, content } = req.body;

    if (title !== undefined) {
        if (!isNonEmptyString(title)) return res.status(400).json({ error: '제목을 입력해주세요.' });
        posts[index].title = title.trim();
    }
    if (content !== undefined) {
        if (!isNonEmptyString(content)) return res.status(400).json({ error: '내용을 입력해주세요.' });
        posts[index].content = content.trim();
    }

    posts[index].updatedAt = new Date().toISOString();
    if (!savePosts()) {
        return res.status(500).json({ error: '게시글 저장에 실패했습니다.' });
    }
    res.json(posts[index]);
});

// POST 댓글 추가 (댓글 하나만 서버에서 안전하게 추가 — 배열 전체 덮어쓰기 방식은 제거)
app.post('/api/posts/:id/comments', (req, res) => {
    const index = posts.findIndex(p => String(p.id) === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Post not found' });

    const { author, text } = req.body;
    if (!isNonEmptyString(text)) {
        return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }
    if (text.length > 1000) {
        return res.status(400).json({ error: '댓글은 1000자를 넘을 수 없습니다.' });
    }

    const newComment = {
        id: crypto.randomUUID(),
        author: isNonEmptyString(author) ? author.trim() : '익명',
        text: text.trim(),
        createdAt: new Date().toISOString()
    };

    if (!Array.isArray(posts[index].comments)) posts[index].comments = [];
    posts[index].comments.push(newComment);

    if (!savePosts()) {
        return res.status(500).json({ error: '댓글 저장에 실패했습니다.' });
    }
    res.status(201).json(posts[index]);
});

// DELETE
// 주의: PUT과 마찬가지로 실제 작성자 검증은 서버 세션이 갖춰진 뒤에 추가해야 합니다.
app.delete('/api/posts/:id', (req, res) => {
    const initialLength = posts.length;
    posts = posts.filter(p => String(p.id) !== req.params.id);

    if (posts.length === initialLength)
        return res.status(404).json({ error: 'Post not found' });

    if (!savePosts()) {
        return res.status(500).json({ error: '삭제 내용을 저장하지 못했습니다.' });
    }
    res.json({ message: 'Deleted' });
});

// API 경로 404 처리
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// 에러 처리 미들웨어 (multer 파일 검증/용량 초과 등)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `업로드 오류: ${err.message}` });
    }
    if (err) {
        console.error(err);
        return res.status(400).json({ error: err.message || '요청을 처리할 수 없습니다.' });
    }
    next();
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));