const diaryContainer = document.getElementById("diaryContainer");


async function deleteDairy(id){

    const result = confirm("日記を削除しますか？");

    if(!result){
        alert ("削除をキャンセルしました")
        return
    }

    await fetch(`/api/diary/${id}`,{
        method: "DELETE"
    });
    location.reload();
}
async function loadDiary() {

    const response  =  await fetch("/api/friends-diary", {
        credentials: "include"
    });

    const diaries = await response.json();

    console.log(diaries);

    if(!Array.isArray(diaries)){
        console.error("配列じゃない", diaries);
        return;
    }

    if (diaries.length === 0){

        diaryContainer.innerHTML = `
        <div class="empty-container">
            <h1 class="empty-Message">日記がないため表示することができません</h1> 
            <a class="atag-Message" href="./index.html">日記を作成する</a>
        </div>
        `;

        return
    }


    diaries.forEach((diary) => {

        const div = document.createElement("div");

        div.classList.add("diary-card");

        div.innerHTML = `
        <button onclick="deleteDairy(${diary.id})">
            削除
        </button>
        <h2>${diary.title}</h2>
        <p>${diary.content}</p>
        <small>${diary.date}</small>
        ${diary.image ? `<img src="/uploads/${diary.image}">` : ""}
        `;

        diaryContainer.prepend(div);
    });
}

loadDiary();

const darkmode = document.getElementById("darkmodeBtn");

darkmode.addEventListener("click", ()=>{

    document.body.classList.toggle("dark");

    if(document.body.classList.contains("dark")){
        darkmode.textContent = "ホワイトモード";
    }else{
        darkmode.textContent = "ダークモード";
    }

});

const darkMode = localStorage.getItem("darkmode");

if(darkMode === "true"){
    localStorage.setItem("darkmode",
    document.body.classList.contains("dark")
);
}

async function loadAuth() {

    const res = await fetch("/api/me",{
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
}