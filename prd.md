# 📄 PRD: NOTEBOOKLM SESSION EXTRACTOR (CHROME EXTENSION)

## 1. MỤC TIÊU DỰ ÁN (OBJECTIVE)
Xây dựng một Chrome Extension đơn giản bằng framework **Plasmo (React + TailwindCSS)**. 
Nhiệm vụ duy nhất của Extension này là trích xuất toàn bộ Cookies và LocalStorage từ trang NotebookLM của Google, sau đó chuyển đổi (transform) sang đúng định dạng `storage_state.json` của công cụ Playwright và cho phép người dùng Copy/Download.

## 2. CÔNG NGHỆ SỬ DỤNG (TECH STACK)
*   **Framework:** Plasmo (`npm create plasmo`)
*   **UI Library:** React 18
*   **Styling:** TailwindCSS
*   **Chrome APIs:** `chrome.cookies`, `chrome.scripting`, `chrome.tabs`

## 3. GIAO DIỆN NGƯỜI DÙNG (UI/UX)
Giao diện là một Popup nhỏ khi click vào icon của Extension.
*   **Header:** Logo/Tên "NotebookLM Session Extractor".
*   **Trạng thái (Status):** Hiển thị đang ở đúng trang `notebooklm.google.com` hay không.
*   **Nút chức năng chính:**
    *   Nút **"Extract Session"** (Màu xanh nổi bật).
*   **Khu vực kết quả (Sau khi Extract thành công):**
    *   Một ô Textarea (Read-only) hiển thị preview chuỗi JSON (khoảng 5-10 dòng đầu).
    *   Nút **"Copy to Clipboard"** (Bấm vào copy toàn bộ chuỗi JSON).
    *   Nút **"Download JSON"** (Tải xuống máy tính file tên `notebooklm_session.json`).

## 4. LOGIC KỸ THUẬT CỐT LÕI (CORE LOGIC)

AI Code Generator cần đặc biệt chú ý 3 function dưới đây để đảm bảo data khớp 100% với thư viện `notebooklm-py`.

### 4.1. Khai báo quyền (`manifest.json` / Plasmo config)
Cần các quyền sau trong file cấu hình của Plasmo:
```json
"permissions": ["cookies", "activeTab", "scripting"],
"host_permissions": [
  "*://*.google.com/*",
  "*://*.youtube.com/*"
]
```

### 4.2. Logic lấy và Transform Cookies (Quan trọng nhất)
Playwright yêu cầu object cookie có key là `expires` thay vì `expirationDate` của Chrome API.

```javascript
// Hàm mẫu yêu cầu AI viết
async function getPlaywrightCookies() {
  const domains = [".google.com", "notebooklm.google.com", ".youtube.com"];
  let allCookies = [];

  // Lấy cookies từ các domain
  for (const domain of domains) {
    const cookies = await chrome.cookies.getAll({ domain });
    allCookies = [...allCookies, ...cookies];
  }

  // Lọc trùng lặp (giữ lại cookie của .google.com nếu trùng tên)
  const uniqueCookies = filterUniqueCookies(allCookies);

  // Transform sang format Playwright
  return uniqueCookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    // CRITICAL: Đổi expirationDate thành expires. Nếu là session cookie (ko có hạn), set 1 năm sau.
    expires: cookie.expirationDate ? cookie.expirationDate : (Date.now() / 1000 + 31536000),
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite === "no_restriction" ? "None" : (cookie.sameSite === "unspecified" ? "Lax" : cookie.sameSite)
  }));
}
```

### 4.3. Logic lấy LocalStorage (Thông qua Content Script / Inject)
Để file JSON giống Playwright 100%, cần lấy thêm LocalStorage của trang NotebookLM hiện tại.

```javascript
// Hàm mẫu yêu cầu AI viết
async function getNotebookLMLocalStorage(tabId) {
  // Dùng chrome.scripting.executeScript tiêm vào tab hiện tại
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      const ls = [];
      for (let i = 0; i < localStorage.length; i++) {
        const name = localStorage.key(i);
        const value = localStorage.getItem(name);
        ls.push({ name, value });
      }
      return ls;
    }
  });
  
  return results[0].result; // Trả về mảng [{name: "...", value: "..."}]
}
```

### 4.4. Đóng gói dữ liệu cuối cùng (Final JSON Format)
Đầu ra cuối cùng để cho vào nút Copy/Download phải có cấu trúc chính xác như sau:
```javascript
const finalStorageState = {
  cookies: playwrightFormattedCookies,
  origins: [
    {
      origin: "https://notebooklm.google.com",
      localStorage: extractedLocalStorage
    }
  ]
};
```

## 5. YÊU CẦU XỬ LÝ LỖI (ERROR HANDLING)
*   Nếu người dùng bấm "Extract" khi đang ở trang khác (không phải `notebooklm.google.com`), hiển thị cảnh báo: *"Vui lòng mở trang notebooklm.google.com và đăng nhập trước khi trích xuất."*
*   Nếu mảng `cookies` trả về không chứa các cookie bắt buộc như `SID`, `HSID`, hiển thị cảnh báo: *"Không tìm thấy thông tin đăng nhập Google. Hãy chắc chắn bạn đã đăng nhập."*
