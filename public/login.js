import { showToast } from './alert.js';

// 탭 버튼과 내용
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = {
    login: document.getElementById('login-tab'),
    admin: document.getElementById('admin-tab')
};

// 탭 버튼 클릭 이벤트
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');

        // '홈' 탭은 별도 패널 없이 바로 이동
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

// 기본 관리자 계정
// 주의: 관리자 계정을 클라이언트 코드에 하드코딩하는 것은 보안상 안전하지 않습니다.
// 실제 서비스에서는 반드시 서버에서 인증을 검증해야 합니다.
const adminAccount = { username: 'admin', password: 'admin123' };

// Gist URL (테스트 시 CORS 문제 주의)
// 주의: 공개 Gist에서 평문 비밀번호를 그대로 fetch해서 클라이언트에서 비교하는 방식은
// 네트워크 요청만 열어봐도 전체 회원의 비밀번호가 노출되는 심각한 보안 취약점입니다.
// 실제 서비스에서는 반드시 서버 API를 통해 인증해야 합니다.
const usersGistUrl = 'https://gist.githubusercontent.com/Runelt/7d391bd9279f03ddf247b71c4a3f8f23/raw/dcb863e008245520aa11ceeb43388f2c398b7935/users.json';

// 유저 데이터 가져오기
async function fetchUsers() {
    try {
        const response = await fetch(usersGistUrl);
        const data = await response.json();
        if (data && Array.isArray(data.users)) {
            return data.users;
        } else {
            console.warn('유저 데이터가 users 키 아래에 없습니다.');
            return [];
        }
    } catch (error) {
        console.error('유저 데이터를 가져오는 중 오류 발생:', error);
        return [];
    }
}

// 로그인 처리
async function handleLogin(isAdmin = false) {
    const username = document.getElementById(isAdmin ? 'admin-username' : 'username')?.value.trim();
    const password = document.getElementById(isAdmin ? 'admin-password' : 'password')?.value.trim();

    if (!username || !password) {
        showToast('아이디와 비밀번호를 모두 입력해주세요');
        return;
    }

    if (isAdmin) {
        if (username === adminAccount.username && password === adminAccount.password) {
            localStorage.setItem('currentAdmin', username);
            showToast(`관리자 로그인 성공`);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000); // toast가 사라진 후 이동
        } else {
            showToast('관리자 아이디 또는 비밀번호가 틀렸습니다');
        }
    } else {
        const users = await fetchUsers();
        const user = users.find(u => u.username === username && u.password === password);

        if (user) {
            localStorage.setItem('currentUser', username);
            showToast(`환영합니다, ${username}님`);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000); // toast가 사라진 후 이동
        } else {
            showToast('아이디 또는 비밀번호가 틀렸습니다');
        }
    }
}

// 버튼 이벤트 등록
const loginBtn = document.getElementById('login-btn');
const adminLoginBtn = document.getElementById('admin-login-btn');
const signupBtn = document.getElementById('signup');

if (loginBtn) loginBtn.addEventListener('click', () => handleLogin(false));
if (adminLoginBtn) adminLoginBtn.addEventListener('click', () => handleLogin(true));
if (signupBtn) signupBtn.addEventListener('click', () => showToast('회원가입은 디스코드로 문의해주세요'));

// Enter 키로 로그인 (input에 포커스된 상태에서 Enter 입력 시 로그인 시도)
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