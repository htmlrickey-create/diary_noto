const form = document.getElementById("diaryForm");
const titleInput = document.getElementById("titleInput");
const contentInput = document.getElementById("contentInput");
const imageInput = document.getElementById("imageInput");
const daysInput = document.getElementById("daysInput");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData();

    formData.append("title", titleInput.value);
    formData.append("content", contentInput.value);
    formData.append("date", daysInput.value);

    if (imageInput.files[0]) {
        formData.append("image", imageInput.files[0]);
    }

    const res = await fetch("/api/diary", {
        method: "POST",
        body: formData
    });

    if (res.status === 401) {
        alert("ログインしてください");
        window.location.href = "/login_register.html";
        return;
    }

    const data = await res.json();

    alert("作成が完了しました！");

    // フォームリセット
    form.reset();

    location.reload();
});

async function loadAuth() {

    const res = await fetch("/me",{
        credentials: "include"
    });
    const data = await res.json();

    // 上部表示
    const auth = document.getElementById("auth");

    if (auth) {
        if (data.loggedIn) {
            auth.innerHTML = `<p>ようこそ ${data.username}</p>`;
        } else {
            auth.innerHTML = `<a href="/login_register.html">ログイン/新規登録</a>`;
        }
    }

    // フレンドボタン
    const friendBtn = document.getElementById("friendBtn");

    if (friendBtn) {
        friendBtn.style.display = data.loggedIn ? "inline-block" : "none";
    }
}

loadAuth();
