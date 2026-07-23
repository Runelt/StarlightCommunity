import { showToast } from './alert.js';

// 상단 탭
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = {
    login: document.getElementById('login-tab'),
    register: document.getElementById('register-tab'),
    admin: document.getElementById('admin-tab')
};

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab === 'home') {
            window.location.href = 'index.html';
            return;
        }
        tabBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        Object.keys(tabContents).forEach(k => tabContents[k].style.display = 'none');
        tabContents[tab].style.display = 'block';
    });
});

// 쿠키 로그인 처리
async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청을 처리할 수 없습니다.');
    return data;
}

function setButtonsDisabled(disabled) {
    [loginBtn, registerBtn, adminLoginBtn].forEach(btn => {
        if (btn) btn.disabled = disabled;
    });
}

// 로그인 처리
async function handleLogin(isAdmin = false) {
    const username = document.getElementById(isAdmin ? 'admin-username' : 'username')?.value.trim();
    const password = document.getElementById(isAdmin ? 'admin-password' : 'password')?.value.trim();

    if (!username || !password) {
        showToast('아이디와 비밀번호를 모두 입력해주세요');
        return;
    }

    setButtonsDisabled(true);
    try {
        const user = await postJson('/api/auth/login', { username, password, asAdmin: isAdmin });
        showToast(isAdmin ? '관리자 로그인 성공' : `환영합니다, ${user.username}님`);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000); // toast가 사라진 후 이동
    } catch (err) {
        showToast(err.message);
    } finally {
        setButtonsDisabled(false);
    }
}

// 회원가입 처리
async function handleRegister() {
    const username = document.getElementById('register-username')?.value.trim();
    const password = document.getElementById('register-password')?.value;
    const passwordConfirm = document.getElementById('register-password-confirm')?.value;

    if (!username || !password || !passwordConfirm) {
        showToast('모든 항목을 입력해주세요');
        return;
    }
    if (password !== passwordConfirm) {
        showToast('비밀번호가 일치하지 않습니다');
        return;
    }

    setButtonsDisabled(true);
    try {
        const user = await postJson('/api/auth/register', { username, password });
        showToast(`가입 완료! 환영합니다, ${user.username}님`);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000); // toast가 사라진 후 이동
    } catch (err) {
        showToast(err.message);
    } finally {
        setButtonsDisabled(false);
    }
}

// 버튼 로직
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const adminLoginBtn = document.getElementById('admin-login-btn');

if (loginBtn) loginBtn.addEventListener('click', () => handleLogin(false));
if (registerBtn) registerBtn.addEventListener('click', () => handleRegister());
if (adminLoginBtn) adminLoginBtn.addEventListener('click', () => handleLogin(true));

// Enter 키 로직
['username', 'password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin(false);
    });
});
['admin-username', 'admin-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin(true);
    });
});
['register-username', 'register-password', 'register-password-confirm'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRegister();
    });
});
