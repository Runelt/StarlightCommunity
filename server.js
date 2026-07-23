const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { del } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob/client');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
    console.warn('경고: DATABASE_URL 환경변수가 설정되지 않았습니다. (vercel env pull .env.local 실행 확인)');
}
if (!process.env.JWT_SECRET) {
    console.warn('경고: JWT_SECRET 환경변수가 설정되지 않았습니다. 배포 전에 반드시 설정하세요.');
}

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';
const COOKIE_NAME = 'session';

// 미들웨어
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function signToken(user) {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
    });
}

// 로그인 여부 쿠키 조회용
function attachUser(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
        req.user = null;
        return next();
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { id: payload.sub, username: payload.username, role: payload.role };
    } catch {
        req.user = null;
    }
    next();
}
app.use(attachUser);

// 로그인 요구 미들웨어
function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
}

function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

function isValidUsername(v) {
    return typeof v === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(v);
}

// 회원가입
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    if (!isValidUsername(username)) {
        return res.status(400).json({ error: '아이디는 영문/숫자/밑줄 3~20자여야 합니다.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    }

    try {
        const [existing] = await sql`select id from users where username = ${username}`;
        if (existing) {
            return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID();
        const [user] = await sql`
            insert into users (id, username, password_hash, role)
            values (${id}, ${username}, ${passwordHash}, 'user')
            returning id, username, role
        `;

        const token = signToken(user);
        setAuthCookie(res, token);
        res.status(201).json({ username: user.username, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '회원가입에 실패했습니다.' });
    }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
    const { username, password, asAdmin } = req.body;

    if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
        return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    try {
        const [user] = await sql`select id, username, password_hash, role from users where username = ${username}`;
        if (!user) {
            return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatches) {
            return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });
        }

        if (asAdmin && user.role !== 'admin') {
            return res.status(403).json({ error: '관리자 계정이 아닙니다.' });
        }

        const token = signToken(user);
        setAuthCookie(res, token);
        res.json({ username: user.username, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '로그인에 실패했습니다.' });
    }
});

// 로그아웃
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ message: 'Logged out' });
});

// 로그인 상태 조회
app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user ? { username: req.user.username, role: req.user.role } : null });
});

// 업로드 토큰 발급
app.post('/blob-upload', requireAuth, async (req, res) => {
    try {
        const jsonResponse = await handleUpload({
            body: req.body,
            request: new Request('https://internal-request.local', {
                method: req.method,
                headers: new Headers(req.headers),
                body: JSON.stringify(req.body)
            }),
            onBeforeGenerateToken: async (pathname) => ({
                allowedContentTypes: [
                    'image/jpeg',
                    'image/png',
                    'image/gif',
                    'image/webp',
                    'video/mp4',
                    'video/webm',
                    'video/quicktime'
                ],
                addRandomSuffix: true,
                maximumSizeInBytes: 200 * 1024 * 1024
            })
        });
        res.json(jsonResponse);
    } catch (err) {
        console.error('BLOB ERROR:', err);
        res.status(400).json({
            error: err.message
        });
    }
});

// GET 전체
app.get('/api/posts', async (req, res) => {
    try {
        const rows = await sql`
            select id, title, content, author, media_url as "mediaUrl",
                   media_type as "mediaType", created_at as "createdAt"
            from posts
            order by created_at desc
        `;
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '게시글을 가져오는 데 실패했습니다.' });
    }
});

// GET post.html
app.get('/api/posts/:id', async (req, res) => {
    try {
        const [post] = await sql`
            select id, title, content, author, media_url as "mediaUrl",
                   media_type as "mediaType", created_at as "createdAt", updated_at as "updatedAt"
            from posts where id = ${req.params.id}
        `;
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const comments = await sql`
            select id, author, text, created_at as "createdAt"
            from comments where post_id = ${req.params.id}
            order by created_at asc
        `;
        res.json({ ...post, comments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '게시글을 가져오는 데 실패했습니다.' });
    }
});

// POST 작성
app.post('/api/posts', requireAuth, async (req, res) => {
    const { title, content, mediaUrl: rawMediaUrl, mediaType: rawMediaType } = req.body;

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

    if (isNonEmptyString(rawMediaUrl)) {
        if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//.test(rawMediaUrl)) {
            return res.status(400).json({ error: '유효하지 않은 첨부 파일 URL입니다.' });
        }
        if (rawMediaType !== 'image' && rawMediaType !== 'video') {
            return res.status(400).json({ error: '유효하지 않은 첨부 파일 형식입니다.' });
        }
        mediaUrl = rawMediaUrl;
        mediaType = rawMediaType;
    }

    try {
        const id = crypto.randomUUID();
        const [newPost] = await sql`
            insert into posts (id, title, content, author, media_url, media_type)
            values (
                ${id},
                ${title.trim()},
                ${content.trim()},
                ${req.user.username},
                ${mediaUrl},
                ${mediaType}
            )
            returning id, title, content, author, media_url as "mediaUrl",
                      media_type as "mediaType", created_at as "createdAt"
        `;
        res.status(201).json({ ...newPost, comments: [] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '게시글 저장에 실패했습니다.' });
    }
});

// PUT 수정
app.put('/api/posts/:id', requireAuth, async (req, res) => {
    const { title, content } = req.body;

    if (title !== undefined && !isNonEmptyString(title)) {
        return res.status(400).json({ error: '제목을 입력해주세요.' });
    }
    if (content !== undefined && !isNonEmptyString(content)) {
        return res.status(400).json({ error: '내용을 입력해주세요.' });
    }

    try {
        const [existing] = await sql`select id, author from posts where id = ${req.params.id}`;
        if (!existing) return res.status(404).json({ error: 'Post not found' });

        if (existing.author !== req.user.username && req.user.role !== 'admin') {
            return res.status(403).json({ error: '본인 글만 수정할 수 있습니다.' });
        }

        const [updated] = await sql`
            update posts
            set title = coalesce(${title !== undefined ? title.trim() : null}, title),
                content = coalesce(${content !== undefined ? content.trim() : null}, content),
                updated_at = now()
            where id = ${req.params.id}
            returning id, title, content, author, media_url as "mediaUrl",
                      media_type as "mediaType", created_at as "createdAt", updated_at as "updatedAt"
        `;
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '게시글 저장에 실패했습니다.' });
    }
});

// POST 댓글 추가
app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
    const { text } = req.body;

    if (!isNonEmptyString(text)) {
        return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }
    if (text.length > 1000) {
        return res.status(400).json({ error: '댓글은 1000자를 넘을 수 없습니다.' });
    }

    try {
        const [post] = await sql`
            select id, title, content, author, media_url as "mediaUrl",
                   media_type as "mediaType", created_at as "createdAt"
            from posts where id = ${req.params.id}
        `;
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const commentId = crypto.randomUUID();
        await sql`
            insert into comments (id, post_id, author, text)
            values (${commentId}, ${req.params.id}, ${req.user.username}, ${text.trim()})
        `;

        const comments = await sql`
            select id, author, text, created_at as "createdAt"
            from comments where post_id = ${req.params.id}
            order by created_at asc
        `;

        res.status(201).json({ ...post, comments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '댓글 저장에 실패했습니다.' });
    }
});

// 삭제 로직
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
    try {
        const [existing] = await sql`select author, media_url as "mediaUrl" from posts where id = ${req.params.id}`;
        if (!existing) return res.status(404).json({ error: 'Post not found' });

        if (existing.author !== req.user.username && req.user.role !== 'admin') {
            return res.status(403).json({ error: '본인 글만 삭제할 수 있습니다.' });
        }

        await sql`delete from posts where id = ${req.params.id}`;

        if (existing.mediaUrl) {
            try {
                await del(existing.mediaUrl);
            } catch (blobErr) {
                console.error('Blob 파일 삭제 실패:', blobErr);
            }
        }

        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '삭제에 실패했습니다.' });
    }
});

// API 경로 404 처리
app.use('/api', (req, res) => {
    console.log('API NOT FOUND:', req.method, req.url);
    res.status(404).json({
        error: 'API route missing',
        method: req.method,
        url: req.url
    });
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
    if (err) {
        console.error(err);
        return res.status(400).json({ error: err.message || '요청을 처리할 수 없습니다.' });
    }
    next();
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;
