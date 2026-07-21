// 알림창
export function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "custom-toast";
    toast.innerText = message;

    document.getElementById("custom-toast-container").appendChild(toast);

    // 4초 뒤 제거
    setTimeout(() => {
        toast.remove();
    }, 4000);
}