#!/usr/bin/env python3
"""把本地目录同步到 R2 桶 posewear-assets（图片分发，绑定域名 pwimg.0vo.pro）。

用法：
  python3 scripts/sync-r2.py <本地目录> [--workers 8] [--journal 路径]

- 对象键 = 相对目录路径；同名对象会更新，客户端通过 ETag 重新验证。
- 断点续传：journal 记录目标账号、桶、对象键与内容摘要，重跑自动跳过；失败键记到 <journal>.fail。
- 凭据：环境变量 CLOUDFLARE_API_TOKEN（需 R2 编辑权限），或本机 wrangler 登录态
  （自动读 ~/.config/.wrangler/config/default.toml 的 oauth_token，约 1 小时过期需刷新）。
- 账号：环境变量 CLOUDFLARE_ACCOUNT_ID，缺省用本项目账号。
- 并发别开太高（>8 容易触发 Cloudflare 429）；只补增量时先 diff 再传，别全量重传。

缩略图（t/）与原图（o/）走 R2；中图（m/、i/）是主站同源文件，不进 R2。
"""
import argparse, hashlib, json, os, re, sys, time, threading, concurrent.futures as cf
from urllib.parse import quote

try:
    import requests
except ImportError:
    sys.exit("需要 requests：pip install requests")

ACCT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "afe9843ff43f538bb81b8ba44ea7891c")
BUCKET = os.environ.get("POSEWEAR_R2_BUCKET", "posewear-assets")
TOML = os.path.expanduser("~/.config/.wrangler/config/default.toml")
CT = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
      ".json": "application/json", ".txt": "text/plain"}
CC = "public, max-age=31536000, immutable"


def get_token():
    tok = os.environ.get("CLOUDFLARE_API_TOKEN")
    if tok:
        return tok
    txt = open(TOML).read()
    return re.search(r'oauth_token\s*=\s*"([^"]+)"', txt).group(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root')
    parser.add_argument('--workers', type=int, choices=range(1, 9), default=8)
    parser.add_argument('--journal')
    args = parser.parse_args()
    root, workers = args.root, args.workers
    if not os.path.isdir(root): parser.error('Directory does not exist')
    journal_path = os.path.abspath(args.journal or os.path.join(root, ".r2-journal"))
    fail_path = journal_path + ".fail"
    done = {}
    legacy = set()
    if os.path.isfile(journal_path):
        with open(journal_path) as rows:
            for row in rows:
                row = row.strip()
                if not row: continue
                try:
                    account, bucket, key, digest = json.loads(row)
                except (ValueError, TypeError):
                    legacy.add(row)  # 旧格式 journal 只有对象键，表示已上传成功
                    continue
                if account == ACCT and bucket == BUCKET: done[key] = digest
    keys = []
    for dp, _, fns in os.walk(root):
        for fn in fns:
            file = os.path.join(dp, fn)
            if os.path.abspath(file) not in (journal_path, fail_path) and not fn.startswith('.r2-journal'):
                keys.append(os.path.relpath(file, root).replace(os.sep, "/"))
    if not keys: return
    token = [None, 0]
    tlock = threading.Lock()
    tls = threading.local()

    def tok():
        with tlock:
            if token[0] is None or (time.time() - token[1] > 600 and not os.environ.get("CLOUDFLARE_API_TOKEN")):
                token[0], token[1] = get_token(), time.time()
            return token[0]

    def sess():
        if not hasattr(tls, "s"):
            tls.s = requests.Session()
        return tls.s

    jf = open(journal_path, "a")
    ff = open(fail_path, "a")
    jlock = threading.Lock()
    stats = {"ok": 0, "fail": 0, "skipped": 0}

    def put_one(rel):
        with open(os.path.join(root, rel), "rb") as source: data = source.read()
        digest = hashlib.sha256(data).hexdigest()
        if done.get(rel) == digest or rel in legacy:
            with jlock: stats["skipped"] += 1
            return
        url = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/r2/buckets/{BUCKET}/objects/{quote(rel)}"
        ext = os.path.splitext(rel)[1].lower()
        headers = {"Content-Type": CT.get(ext, "application/octet-stream"),
                   "Cache-Control": CC, "Authorization": "Bearer " + tok()}
        delay, last = 1.0, None
        for _ in range(7):
            try:
                r = sess().put(url, data=data, headers=headers, timeout=120)
                if r.status_code == 200:
                    with jlock:
                        jf.write(json.dumps([ACCT, BUCKET, rel, digest]) + "\n"); jf.flush(); stats["ok"] += 1
                    return
                last = f"{r.status_code} {r.text[:120]}"
                if r.status_code == 429:
                    time.sleep(delay * 4)
            except Exception as e:
                last = repr(e)
            time.sleep(delay); delay = min(delay * 2, 30)
        with jlock:
            ff.write(rel + "\t" + str(last) + "\n"); ff.flush(); stats["fail"] += 1

    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(put_one, keys))
    jf.close()
    ff.close()
    print(f"完成：跳过 {stats['skipped']}，ok {stats['ok']}，fail {stats['fail']}，用时 {time.time() - t0:.0f}s")
    if stats["fail"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
