from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import yt_dlp

from ..sanitize import sanitize_text
from ..youtube import extract_video_id


def _proxy_url(proxy_port: str = "") -> str:
    if proxy_port.strip():
        return f"http://127.0.0.1:{proxy_port.strip()}"
    return os.getenv("HTTP_PROXY") or os.getenv("http_proxy") or ""


def _ydl_base(cookie_path: Path, proxy_port: str = "") -> dict[str, Any]:
    opts: dict[str, Any] = {
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }
    if cookie_path.exists() and cookie_path.stat().st_size > 0:
        opts["cookiefile"] = str(cookie_path)
    proxy = _proxy_url(proxy_port)
    if proxy:
        opts["proxy"] = proxy
    return opts


def _session_path(workfolder: Path, info: dict[str, Any]) -> Path:
    uploader = sanitize_text(str(info.get("uploader") or "unknown"))
    title = sanitize_text(str(info.get("title") or "untitled"))
    video_id = str(info.get("id") or extract_video_id(str(info.get("webpage_url") or "")))
    return workfolder / uploader / f"{title}__{video_id}"


def download_youtube(url: str, workfolder: Path, cookie_path: Path, proxy_port: str = "") -> tuple[Path, dict[str, Any]]:
    video_id = extract_video_id(url)
    info_opts = _ydl_base(cookie_path, proxy_port)
    with yt_dlp.YoutubeDL(info_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if str(info.get("id", video_id)) != video_id:
        raise ValueError("The resolved video id does not match the submitted URL.")

    session = _session_path(workfolder, info)
    media_dir = session / "media"
    metadata_dir = session / "metadata"
    media_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    video_file = media_dir / "video_source.mp4"
    metadata_file = metadata_dir / "ytdlp_info.json"
    metadata_file.write_text(json.dumps(ydl.sanitize_info(info), ensure_ascii=False, indent=2), encoding="utf-8")

    if video_file.exists() and video_file.stat().st_size > 0:
        return session, info

    download_opts = {
        **_ydl_base(cookie_path, proxy_port),
        "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "merge_output_format": "mp4",
        "outtmpl": str(video_file),
        "retries": 3,
        "fragment_retries": 3,
    }
    with yt_dlp.YoutubeDL(download_opts) as ydl:
        ydl.download([url])

    if not video_file.exists() or video_file.stat().st_size == 0:
        raise RuntimeError("yt-dlp finished without producing media/video_source.mp4")

    return session, info
