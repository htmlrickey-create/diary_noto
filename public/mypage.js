async function loadMyPage() {

    try {
        const res = await fetch("/api/mypage", {
            credentials: "include"
        });

        if (!res.ok) {
            location.href = "./login_register.html";
            return;
        }

        const data = await res.json();

        // ユーザー情報
        const usernameEl = document.getElementById("username");
        const emailEl = document.getElementById("email");

        if (usernameEl) usernameEl.textContent = data.user?.username ?? "";
        if (emailEl) emailEl.textContent = data.user?.email ?? "未設定";

        const friendCountEl = document.getElementById("friendCount");
        if (friendCountEl) friendCountEl.textContent = data.friendCount ?? 0;

        const postCountEl = document.getElementById("postCount");
        if (postCountEl) postCountEl.textContent = data.postCount ?? 0;

        // 編集フォーム
        const editUsername = document.getElementById("editUsername");
        const editEmail = document.getElementById("editEmail");

        if (editUsername) editUsername.value = data.user?.username ?? "";
        if (editEmail) editEmail.value = data.user?.email ?? "";

        // 投稿一覧
        const diaryList = document.getElementById("diaryList");
        if (!diaryList) return;

        diaryList.innerHTML = "";

        (data.diaries ?? []).forEach(d => {

            const div = document.createElement("div");
            div.classList.add("diary-card");

            div.innerHTML = `
                <h3>${escapeHTML(d.title ?? "")}</h3>
                <p>${escapeHTML(d.content ?? "")}</p>
                <small>${escapeHTML(d.date ?? "")}</small>
            `;

            diaryList.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        alert("データ取得に失敗しました");
    }
}


// HTML対策（重要）
function escapeHTML(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}


// プロフィール編集表示
function toggleEditBox() {
    const editBox = document.getElementById("editBox");
    if (!editBox) return;
    editBox.classList.toggle("show");
}


// ログアウト
async function logout() {
    try {
        const res = await fetch("/logout", {
            method: "POST",
            credentials: "include"
        });

        if (!res.ok) {
            alert("ログアウト失敗");
            return;
        }

        location.href = "/login_register.html";

    } catch (err) {
        alert("通信エラー");
    }
}


// プロフィール更新
async function updateProfile() {

    const username = document.getElementById("editUsername")?.value?.trim();
    const email = document.getElementById("editEmail")?.value?.trim();

    if (!username || !email) {
        alert("空欄があります");
        return;
    }

    try {
        const res = await fetch("/api/profile", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email }),
            credentials: "include"
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "更新失敗");
            return;
        }

        alert(data.message || "更新しました");

        document.getElementById("editBox")?.classList.remove("show");

        loadMyPage();

    } catch (err) {
        alert("通信エラー");
    }
}

loadMyPage();