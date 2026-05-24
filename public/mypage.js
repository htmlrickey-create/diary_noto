async function loadMyPage() {

    const res = await fetch("/api/mypage",{
        credentials: "include"
    });

    if(!res.ok){
        location.href = "./login_register.html";
        return
    }

    const data = await res.json();

    // 👤 ユーザー情報
    document.getElementById("username").textContent =
        data.user?.username || "";
    document.getElementById("email").textContent =
        data.user?.email || "未設定";

    const friendCountEl = document.getElementById("friendCount");
    if (friendCountEl) friendCountEl.textContent = data.friendCount || 0;

    const postCountEl = document.getElementById("postCount");
    if (postCountEl) postCountEl.textContent = data.postCount || 0;

    // ✏️ プロフィール編集フォーム
    const editUsername = document.getElementById("editUsername");
    const editEmail = document.getElementById("editEmail");

    if (editUsername) editUsername.value = data.user?.username || "";
    if (editEmail) editEmail.value = data.user?.email || "";
    // 📝 投稿一覧
    const diaryList = document.getElementById("diaryList");
    if (!diaryList) return;
    diaryList.innerHTML = "";

    (data.diaries|| []).forEach(d => {

        const div = document.createElement("div");
        div.classList.add("diary-card");

        div.innerHTML = `
            <h3>${d.title}</h3>
            <p>${d.content}</p>
            <small>${d.date}</small>
        `;

        diaryList.appendChild(div);
    });
}

// 👇 プロフィール編集フォーム表示
function toggleEditBox(){

    const editBox = document.getElementById("editBox");

    editBox.classList.toggle("show");
}

async function logout() {
    await fetch("/logout", { method: "POST" });
    location.href = "/login_register.html";
}

async function updateProfile() {

    const username = document.getElementById("editUsername").value;
    const email = document.getElementById("editEmail").value;

const res = await fetch("/api/profile", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        username,
        email
    }),
    credentials: "include"
});

if (!res.ok) {
    alert("更新失敗");
    return;
}

const data = await res.json();

    alert(data.message);

    // 保存後閉じる
    document.getElementById("editBox").classList.remove("show");

    // 画面更新
    loadMyPage();
}

loadMyPage();