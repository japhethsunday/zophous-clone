"""Free AI image/video generation with open models on Hugging Face ZeroGPU Spaces.

- Image: FLUX.1-schnell (Apache-2.0)          -> evalstate/flux1_schnell
- Video: FLUX still, then Wan 2.2 14B I2V     -> zerogpu-aoti/wan2-2-fp8da-aoti-faster (Apache-2.0)

Runs on shared free GPUs, so there is a daily quota and sometimes a queue. Set HF_TOKEN
(any free Hugging Face account) for a bigger quota than anonymous use.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

IMAGE_SPACE = os.environ.get("IMAGE_SPACE", "evalstate/flux1_schnell")
VIDEO_SPACE = os.environ.get("VIDEO_SPACE", "zerogpu-aoti/wan2-2-fp8da-aoti-faster")

SIZES = {"9:16": (576, 1024), "16:9": (1024, 576), "1:1": (768, 768)}


class QuotaError(RuntimeError):
    """Free GPU quota used up for now; worth retrying later."""


def _client(space: str):
    from gradio_client import Client

    token = os.environ.get("HF_TOKEN") or None
    return Client(space, hf_token=token, verbose=False)


def _wrap(e: Exception) -> Exception:
    msg = str(e)
    if "quota" in msg.lower() or "ZeroGPU" in msg:
        return QuotaError("free_gpu_quota_reached")
    return e


def make_image(prompt: str, aspect: str, dest_dir: str) -> str:
    w, h = SIZES.get(aspect, SIZES["9:16"])
    try:
        res = _client(IMAGE_SPACE).predict(prompt, 0, True, w, h, 4, api_name="/infer")
    except Exception as e:  # noqa: BLE001
        raise _wrap(e) from e
    path = res[0] if isinstance(res, (list, tuple)) else res
    if isinstance(path, dict):
        path = path.get("path")
    out = str(Path(dest_dir) / ("image" + Path(path).suffix))
    shutil.copy(path, out)
    return out


def make_video(prompt: str, aspect: str, seconds: float, dest_dir: str) -> tuple[str, str]:
    """Returns (video_path, first_frame_path)."""
    from gradio_client import handle_file

    still = make_image(prompt, aspect, dest_dir)
    try:
        res = _client(VIDEO_SPACE).predict(
            input_image=handle_file(still),
            prompt=prompt,
            duration_seconds=max(2.0, min(5.0, float(seconds))),
            steps=6,
            api_name="/generate_video",
        )
    except Exception as e:  # noqa: BLE001
        raise _wrap(e) from e
    first = res[0] if isinstance(res, (list, tuple)) else res
    path = first.get("video") if isinstance(first, dict) else first
    out = str(Path(dest_dir) / "video.mp4")
    shutil.copy(path, out)
    return out, still
