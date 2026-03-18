import { useEffect, useState } from "react"

function IndexPopup() {
  const [isNotebookLM, setIsNotebookLM] = useState(false)
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null)
  const [resultJSON, setResultJSON] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        setCurrentTab(tab)
        if (tab?.url?.includes("notebooklm.google.com")) {
          setIsNotebookLM(true)
        } else {
          setIsNotebookLM(false)
        }
      })
    }
  }, [])

  const extractSession = async () => {
    try {
      setLoading(true)
      setError("")
      setResultJSON("")

      if (!isNotebookLM || !currentTab?.id) {
        throw new Error(
          "Vui lòng mở trang notebooklm.google.com và đăng nhập trước khi trích xuất."
        )
      }

      // 1. Extract Cookies
      const domains = [".google.com", "notebooklm.google.com", ".youtube.com"]
      let allCookies: chrome.cookies.Cookie[] = []

      for (const domain of domains) {
        const cookies = await chrome.cookies.getAll({ domain })
        allCookies = [...allCookies, ...cookies]
      }

      // Lọc trùng lặp (dựa trên tên, domain và path)
      const uniqueMap = new Map<string, chrome.cookies.Cookie>()
      allCookies.forEach((cookie) => {
        uniqueMap.set(`${cookie.name}-${cookie.domain}-${cookie.path}`, cookie)
      })
      const uniqueCookies = Array.from(uniqueMap.values())

      // Kiểm tra cookie xác thực của Google
      const hasAuth = uniqueCookies.some(
        (c) => c.name === "SID" || c.name === "HSID"
      )
      if (!hasAuth) {
        throw new Error(
          "Không tìm thấy thông tin đăng nhập Google. Hãy chắc chắn bạn đã đăng nhập."
        )
      }

      // Transform sang format Playwright
      const playwrightFormattedCookies = uniqueCookies.map((cookie) => {
        let sameSite = cookie.sameSite as string
        if (sameSite === "no_restriction") sameSite = "None"
        else if (sameSite === "unspecified") sameSite = "Lax"

        return {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          // CRITICAL: Đổi expirationDate thành expires.
          expires: cookie.expirationDate
            ? cookie.expirationDate
            : Date.now() / 1000 + 31536000,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: sameSite
        }
      })

      // 2. Extract LocalStorage via Script Injection
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
          const ls: { name: string; value: string }[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const name = localStorage.key(i)
            if (name) {
              const value = localStorage.getItem(name) || ""
              ls.push({ name, value })
            }
          }
          return ls
        }
      })

      const extractedLocalStorage = injectionResults[0]?.result || []

      // 3. Assemble Final Data
      const finalStorageState = {
        cookies: playwrightFormattedCookies,
        origins: [
          {
            origin: "https://notebooklm.google.com",
            localStorage: extractedLocalStorage
          }
        ]
      }

      setResultJSON(JSON.stringify(finalStorageState, null, 2))
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi trích xuất dữ liệu.")
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!resultJSON) return
    await navigator.clipboard.writeText(resultJSON)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!resultJSON) return
    const blob = new Blob([resultJSON], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "notebooklm_session.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{
        width: "360px",
        padding: "16px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: "#333",
        backgroundColor: "#fff"
      }}>
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid #eaeaea",
          paddingBottom: "12px",
          marginBottom: "16px"
        }}>
        <h1 style={{ fontSize: "18px", margin: 0, color: "#1a73e8" }}>
          NotebookLM Session Extractor
        </h1>
      </div>

      {/* Status */}
      <div style={{ marginBottom: "16px" }}>
        {isNotebookLM ? (
          <div
            style={{
              padding: "10px",
              backgroundColor: "#e6f4ea",
              color: "#137333",
              borderRadius: "6px",
              border: "1px solid #ceead6",
              fontSize: "13px"
            }}>
            ✓ Đang ở trang NotebookLM. Sẵn sàng trích xuất!
          </div>
        ) : (
          <div
            style={{
              padding: "10px",
              backgroundColor: "#fef7e0",
              color: "#b06000",
              borderRadius: "6px",
              border: "1px solid #feefc3",
              fontSize: "13px"
            }}>
            ⚠️ Vui lòng mở trang notebooklm.google.com để sử dụng.
          </div>
        )}
      </div>

      {/* Main Action Button */}
      <button
        onClick={extractSession}
        disabled={loading || !isNotebookLM}
        style={{
          width: "100%",
          padding: "10px",
          backgroundColor: !isNotebookLM ? "#8ab4f8" : "#1a73e8",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "14px",
          fontWeight: "bold",
          cursor: !isNotebookLM ? "not-allowed" : "pointer",
          marginBottom: "16px",
          transition: "background-color 0.2s"
        }}>
        {loading ? "Đang xử lý..." : "Extract Session"}
      </button>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#fce8e6",
            color: "#c5221f",
            borderRadius: "6px",
            border: "1px solid #fad2cf",
            fontSize: "13px",
            marginBottom: "16px"
          }}>
          {error}
        </div>
      )}

      {/* Result Area */}
      {resultJSON && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
          <label style={{ fontSize: "13px", fontWeight: "bold" }}>
            Kết quả (Preview):
          </label>
          <textarea
            readOnly
            value={resultJSON}
            style={{
              width: "100%",
              height: "120px",
              padding: "8px",
              fontSize: "12px",
              fontFamily: 'Consolas, "Courier New", monospace',
              borderRadius: "6px",
              border: "1px solid #dadce0",
              backgroundColor: "#f8f9fa",
              resize: "none",
              boxSizing: "border-box"
            }}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              onClick={handleCopy}
              style={{
                flex: 1,
                padding: "8px",
                backgroundColor: "#fff",
                border: "1px solid #dadce0",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                color: "#3c4043",
                fontWeight: 500
              }}>
              {copied ? "✓ Đã copy!" : "📋 Copy Clipboard"}
            </button>
            <button
              onClick={handleDownload}
              style={{
                flex: 1,
                padding: "8px",
                backgroundColor: "#3c4043",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500
              }}>
              📥 Download JSON
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default IndexPopup
