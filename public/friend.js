// ユーザー検索
async function searchUser() {

    const username =
        document.getElementById("searchUsername").value;

    const res =
        await fetch(`/api/user/search?username=${username}`);

    const user = await res.json();

    const result =
        document.getElementById("result");

    if (!user || user.error) {

        result.innerHTML =
            "<p>ユーザーが見つかりません</p>";

        return;
    }

    result.innerHTML = `
        <div class="user-card">

            <p>${user.username}</p>

            <button onclick="addFriend(${user.id})">
                申請送信
            </button>

        </div>
    `;
}

// フレンド申請
async function addFriend(friendId) {

    const res = await fetch("/api/friend", {
        credentials: "include",
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            friendId
        })
    });

    const data = await res.json();

    alert(data.message);
}

// 申請一覧取得
async function loadRequests() {

    const res =
        await fetch("/api/friend/request");

    const requests = await res.json();

    const requestList =
        document.getElementById("requestList");

    requestList.innerHTML = "";

    requests.forEach(r => {

        requestList.innerHTML += `
            <div class="user-card">

                <p>${r.username}</p>

                <button onclick="
                    acceptRequest(
                        ${r.id},
                        ${r.sender_id}
                    )
                ">
                    承認
                </button>

            </div>
        `;
    });
}

// 承認
async function acceptRequest(requestId, senderId) {

    const res = await fetch(
        "/api/friend/accept",
        {
            method: "POST",

            headers: {
                "Content-Type":"application/json"
            },

            body: JSON.stringify({
                requestId,
                senderId
            })
        }
    );

    const data = await res.json();

    alert(data.message);

    loadRequests();
    loadFriends();
}

// フレンド一覧取得
async function loadFriends() {

    const res =
        await fetch("/api/friends");

    const friends = await res.json();

    const friendList =
        document.getElementById("friendList");

    friendList.innerHTML = "";

    friends.forEach(f => {

        friendList.innerHTML += `
            <div class="user-card">

                <p>${f.username}</p>

            </div>
        `;
    });
}

loadRequests();
loadFriends();