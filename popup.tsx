import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle, Copy, Download, FileJson } from "lucide-react"

import { Button } from "@/components/ui/button"

import "globals.css"

function IndexPopup() {
  const [resultJSON, setResultJSON] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const extractSession = async () => {
    try {
      setLoading(true)
      setError("")
      setResultJSON("")

      // 1. Lấy tất cả Cookies của Google trước để xác minh trạng thái đăng nhập
      const domains = [".google.com", "notebooklm.google.com", ".youtube.com"]
      let allCookies: chrome.cookies.Cookie[] = []

      for (const domain of domains) {
        const cookies = await chrome.cookies.getAll({ domain })
        allCookies = [...allCookies, ...cookies]
      }

      // Lọc cookie trùng lặp
      const uniqueMap = new Map<string, chrome.cookies.Cookie>()
      allCookies.forEach((cookie) => {
        uniqueMap.set(`${cookie.name}-${cookie.domain}-${cookie.path}`, cookie)
      })
      const uniqueCookies = Array.from(uniqueMap.values())

      // Kiểm tra xem đã có cookie đăng nhập của Google chưa
      const hasAuth = uniqueCookies.some(
        (c) => c.name === "SID" || c.name === "HSID"
      )
      if (!hasAuth) {
        throw new Error(
          "Bạn chưa đăng nhập Google. Vui lòng mở tab mới, đăng nhập tài khoản Google và thử lại."
        )
      }

      // 2. Định vị tab NotebookLM chuẩn xác (Tránh lỗi dính URL của extension khác)
      let targetTabId: number | undefined

      // Lấy TẤT CẢ các tab thực sự đang mở bằng giao thức http/https của NotebookLM
      const nblmTabs = await chrome.tabs.query({ url: "*://notebooklm.google.com/*" })

      // Ưu tiên tab đang được active (nếu bạn đang trực tiếp đứng ở trang đó)
      const activeNblmTab = nblmTabs.find((t) => t.active)

      if (activeNblmTab?.id) {
        targetTabId = activeNblmTab.id
      } else if (nblmTabs.length > 0 && nblmTabs[0].id) {
        // Nếu không có tab active, lấy tab NotebookLM đầu tiên tìm được
        targetTabId = nblmTabs[0].id
      } else {
        // Nếu không có tab nào tồn tại, tự động tạo tab chạy ngầm
        const newTab = await chrome.tabs.create({
          url: "https://notebooklm.google.com/",
          active: false
        })
        targetTabId = newTab.id

        // Chờ tab tải xong hoàn toàn
        await new Promise<void>((resolve) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === targetTabId && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener)
              setTimeout(() => resolve(), 1500)
            }
          })
        })
      }

      if (!targetTabId) {
        throw new Error("Không thể định vị hoặc khởi tạo tab NotebookLM tự động.")
      }

      // Xác minh lại lần cuối xem tab mục tiêu có bị Extension khác chiếm quyền không
      const finalTab = await chrome.tabs.get(targetTabId)
      if (!finalTab.url || !finalTab.url.startsWith("http")) {
        throw new Error("Tab NotebookLM đã bị một Extension khác (VD: Trình đóng băng tab) chiếm quyền. Vui lòng mở thủ công.")
      }

      // Transform cookies to Playwright format
      const playwrightFormattedCookies = uniqueCookies.map((cookie) => {
        let sameSite = cookie.sameSite as string
        if (sameSite === "no_restriction") sameSite = "None"
        else if (sameSite === "unspecified") sameSite = "Lax"

        return {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expirationDate
            ? cookie.expirationDate
            : Date.now() / 1000 + 31536000,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: sameSite
        }
      })

      // 3. Extract LocalStorage
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
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

      // 3. Final JSON format
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
      setError(err.message || "Đã xảy ra lỗi khi trích xuất.")
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
    <div className="flex w-[400px] flex-col bg-background p-4 font-sans text-foreground">
      <div className="mb-4 flex items-center gap-2 border-b pb-3">
        <FileJson className="h-6 w-6 text-blue-600" />
        <h1 className="text-lg font-bold">NotebookLM Session Extractor</h1>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Hệ thống 1-Click Auto: Tự động kiểm tra đăng nhập & mở NotebookLM ngầm để lấy dữ liệu.</span>
        </div>
      </div>

      <Button
        onClick={extractSession}
        disabled={loading}
        className="mb-4 w-full bg-blue-600 text-white hover:bg-blue-700">
        {loading ? "Đang xử lý tự động..." : "1-Click Extract Session"}
      </Button>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {resultJSON && (
        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
          <label className="text-sm font-semibold text-gray-700">
            Kết quả (Preview):
          </label>
          <textarea
            readOnly
            value={resultJSON}
            className="h-32 w-full resize-none rounded-md border bg-muted p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-2 flex gap-2">
            <Button
              onClick={handleCopy}
              variant="outline"
              className="flex-1 gap-2">
              {copied ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Đã copy!" : "Copy Clipboard"}
            </Button>
            <Button
              onClick={handleDownload}
              variant="default"
              className="flex-1 gap-2 bg-gray-800 text-white hover:bg-gray-900">
              <Download className="h-4 w-4" />
              Download JSON
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default IndexPopup
