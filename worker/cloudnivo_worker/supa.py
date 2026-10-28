"""Tiny Supabase REST + Storage client (service role). Plain `requests`, no SDK."""

from __future__ import annotations

import os
from urllib.parse import quote

import requests


class Supa:
    def __init__(self, url: str | None = None, key: str | None = None, timeout: int = 60):
        self.url = (url or os.environ["SUPABASE_URL"]).rstrip("/")
        self.key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update({"apikey": self.key, "Authorization": f"Bearer {self.key}"})

    # ---------- database ----------
    def rpc(self, fn: str, args: dict):
        r = self.s.post(f"{self.url}/rest/v1/rpc/{fn}", json=args, timeout=self.timeout)
        r.raise_for_status()
        return r.json() if r.content else None

    def select(self, table: str, query: str):
        r = self.s.get(f"{self.url}/rest/v1/{table}?{query}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def insert(self, table: str, rows: list[dict] | dict, upsert_on: str | None = None):
        headers = {"Prefer": "return=representation"}
        params = ""
        if upsert_on:
            headers["Prefer"] += ",resolution=merge-duplicates"
            params = f"?on_conflict={upsert_on}"
        r = self.s.post(f"{self.url}/rest/v1/{table}{params}", json=rows, headers=headers, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def update(self, table: str, match: str, values: dict):
        r = self.s.patch(
            f"{self.url}/rest/v1/{table}?{match}", json=values,
            headers={"Prefer": "return=representation"}, timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()

    # ---------- storage ----------
    def download(self, bucket: str, path: str, dest: str, chunk: int = 1 << 20) -> None:
        url = f"{self.url}/storage/v1/object/authenticated/{bucket}/{quote(path)}"
        with self.s.get(url, stream=True, timeout=self.timeout) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for part in r.iter_content(chunk):
                    f.write(part)

    def upload(self, bucket: str, path: str, file_path: str, content_type: str) -> None:
        url = f"{self.url}/storage/v1/object/{bucket}/{quote(path)}"
        with open(file_path, "rb") as f:
            r = self.s.post(
                url, data=f, timeout=max(self.timeout, 600),
                headers={"Content-Type": content_type, "x-upsert": "true"},
            )
        r.raise_for_status()

    def try_download(self, bucket: str, path: str, dest: str) -> bool:
        """Download if the object exists; False on 400/404 instead of raising."""
        try:
            self.download(bucket, path, dest)
            return True
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code in (400, 404):
                return False
            raise

    def remove(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        r = self.s.delete(f"{self.url}/storage/v1/object/{bucket}", json={"prefixes": paths}, timeout=self.timeout)
        r.raise_for_status()
