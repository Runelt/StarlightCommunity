const express = require('express');
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { del } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
    console.warn('WARN: DATABASE_URL 환경변수가 설정되지 않았습니다');
}

const sql = neon(process.env.DATABASE_URL);

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    console.log('REQUEST:', req.method, req.url);
    next();
});

app.post('/api/blob-upload', async (req, res) => {
    try {
        const jsonResponse = await handleUpload({
            body: req.body,
            request: new Request('https://internal-request.local', {
                method: req.method,
                headers: new Headers(req.headers),
                body: JSON.stringify(req.body)
            }),
            onBeforeGenerateToken: async (pathname) => {
                return {
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
                    maximumSizeInBytes: 200 * 1024 * 1024 //200MB
                };
            }
        });

        res.json(jsonResponse);

    } catch (err) {
        console.error('Blob upload error:', err);
        res.status(400).json({
            error: err.message
        });
    }
});


function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

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

// 게시글 작성
app.post('/api/posts', async (req, res) => {
    const { title, content, author, mediaUrl: rawMediaUrl, mediaType: rawMediaType } = req.body;

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

    // Blob에 업로드된 형태 검증
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
                ${isNonEmptyString(author) ? author.trim() : '익명'},
                ${mediaUrl},
                ${mediaType}
            )
            returning id, title, content, author, media_url as "mediaUrl",
                      media_type as "mediaType", created_at as "createdAt"
        `;

        // 리다이렉트 대신 JSON으로 반환
        res.status(201).json({ ...newPost, comments: [] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '게시글 저장에 실패했습니다.' });
    }
});

app.put('/api/posts/:id', async (req, res) => {
    const { title, content } = req.body;

    if (title !== undefined && !isNonEmptyString(title)) {
        return res.status(400).json({ error: '제목을 입력해주세요.' });
    }
    if (content !== undefined && !isNonEmptyString(content)) {
        return res.status(400).json({ error: '내용을 입력해주세요.' });
    }

    try {
        const [existing] = await sql`select id from posts where id = ${req.params.id}`;
        if (!existing) return res.status(404).json({ error: 'Post not found' });

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

// 댓글
app.post('/api/posts/:id/comments', async (req, res) => {
    const { author, text } = req.body;

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
            values (${commentId}, ${req.params.id}, ${isNonEmptyString(author) ? author.trim() : '익명'}, ${text.trim()})
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

// DELETE
app.delete('/api/posts/:id', async (req, res) => {
    try {
        const [deleted] = await sql`
            delete from posts where id = ${req.params.id}
            returning media_url as "mediaUrl"
        `;
        if (!deleted) return res.status(404).json({ error: 'Post not found' });

        // Blob 스토리지
        if (deleted.mediaUrl) {
            try {
                await del(deleted.mediaUrl);
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

// 에러 처리
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
