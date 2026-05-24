async function loadMyPage() {

    const res = await fetch("/api/mypage",{
        credentials: "include"
    });
    const data = await res.json();

    if (!data.user) {
        alert("ログインしてください");
        location.href = "/login_register.html";
        return;
    }

    // 👤 ユーザー情報
    document.getElementById("username").textContent = data.user.username;
    document.getElementById("email").textContent = data.user.email;

    // 👥 フレンド数
    document.getElementById("friendCount").textContent =
    data.friendCount;

    // 📊 投稿数
    document.getElementById("postCount").textContent = data.postCount;

    // ✏️ プロフィール編集フォーム
    document.getElementById("editUsername").value = data.user.username;
    document.getElementById("editEmail").value = data.user.email;

    // 📝 投稿一覧
    const diaryList = document.getElementById("diaryList");
    diaryList.innerHTML = "";

    data.diaries.forEach(d => {

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
        })
    });

    const data = await res.json();

    alert(data.message);

    // 保存後閉じる
    document.getElementById("editBox").classList.remove("show");

    // 画面更新
    loadMyPage();
}

loadMyPage();