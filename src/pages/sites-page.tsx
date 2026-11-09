import { Button } from "@base-ui/react/button";
import { FolderOpen, LogIn, RefreshCw } from "lucide-react";
import { api, type PluginList } from "../lib/api";
import { button, Card, PageHeader } from "../components/ui";

export function SitesPage({ list, connected, reload, onError }: {
  list: PluginList;
  connected: boolean;
  reload: () => void;
  onError: (e: string) => void;
}) {
  return (
    <>
      <PageHeader
        title="網站與登入"
        description="每個網站是一個外掛腳本。登入會在你的瀏覽器開啟該網站，請自行完成登入。"
        actions={
          <div className="flex gap-2">
            <Button className={button.outline} onClick={reload}>
              <RefreshCw className="size-4" />
              重新載入
            </Button>
            <Button className={button.outline} onClick={() => api.openPluginDir().catch((e) => onError(String(e)))}>
              <FolderOpen className="size-4" />
              開啟外掛資料夾
            </Button>
          </div>
        }
      />

      {list.errors.length > 0 && (
        <Card className="mb-4 border-red-200 dark:border-red-900" title="載入失敗的外掛">
          <ul className="list-disc pl-5 text-sm text-red-600">
            {list.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-950">
            <tr>
              <th className="px-4 py-2.5 font-medium">網站</th>
              <th className="px-4 py-2.5 font-medium">搜尋網址</th>
              <th className="px-4 py-2.5 font-medium">分頁</th>
              <th className="px-4 py-2.5 font-medium">檔案</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {list.plugins.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">{p.id}</div>
                </td>
                <td className="max-w-80 truncate px-4 py-3 font-mono text-xs text-zinc-500" title={p.search}>
                  {p.search}
                </td>
                <td className="px-4 py-3 text-zinc-500">{p.search.includes("{page}") ? "支援" : "單頁"}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{p.file}</td>
                <td className="px-4 py-3 text-right">
                  {p.login && (
                    <Button
                      className={button.outline}
                      disabled={!connected}
                      onClick={() => api.openInBrowser(p.login!).catch((e) => onError(String(e)))}
                    >
                      <LogIn className="size-4" />
                      登入
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        外掛資料夾：<span className="font-mono">{list.dir}</span>
      </p>
    </>
  );
}
