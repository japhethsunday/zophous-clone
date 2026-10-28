"""Cloudflare Workers AI adapter: request shape, offsets, JSON parsing and fallbacks (HTTP mocked)."""

import base64
import shutil
import subprocess

import pytest

from cloudnivo_worker import cloudflare_ai as cf
from cloudnivo_worker import llm, pipeline
from cloudnivo_worker.moments import Candidate, Word


class Resp:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def json(self):
        return self.body


@pytest.fixture
def on(monkeypatch):
    monkeypatch.setattr(cf, "ACCOUNT", "acct")
    monkeypatch.setattr(cf, "TOKEN", "tok")
    monkeypatch.setattr(cf, "CHUNK_SECONDS", 4)


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")
def test_transcribe_chunks_and_offsets_words(on, monkeypatch, tmp_path):
    wav = tmp_path / "a.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=duration=9", "-ar", "16000", str(wav)], check=True)
    sent = []

    def fake_post(url, json, headers, timeout):
        sent.append((url, headers, json))
        assert base64.b64decode(json["audio"])[:3] in (b"ID3", b"\xff\xfb", b"\xff\xf3") or len(json["audio"]) > 100
        return Resp({"success": True, "result": {"segments": [
            {"start": 0.5, "end": 1.5, "text": "hello there", "words": [{"word": "hello", "start": 0.5, "end": 0.9}, {"word": "there", "start": 1.0, "end": 1.5}]},
        ]}})

    monkeypatch.setattr(cf.requests, "post", fake_post)
    segs = cf.transcribe(str(wav), 9.0, offset=100.0)
    assert len(sent) == 3  # 9 s in 4 s chunks
    assert sent[0][0].endswith("/accounts/acct/ai/run/@cf/openai/whisper-large-v3-turbo")
    assert sent[0][1]["Authorization"] == "Bearer tok"
    assert [round(s.start, 2) for s in segs] == [100.5, 104.5, 108.5]
    assert segs[1].words[0].text == " hello" and round(segs[1].words[1].end, 2) == 105.5


def test_errors_raise_cloudflare_error(on, monkeypatch):
    monkeypatch.setattr(cf.requests, "post", lambda *a, **k: Resp({"success": False, "errors": [{"message": "daily limit"}]}, 429))
    with pytest.raises(cf.CloudflareError, match="429: daily limit"):
        cf.chat_json("x")


def test_chat_json_strips_fences(on, monkeypatch):
    monkeypatch.setattr(cf.requests, "post", lambda *a, **k: Resp({"success": True, "result": {"response": "```json\n{\"clips\": []}\n```"}}))
    assert cf.chat_json("x") == {"clips": []}


def test_ranking_uses_cloudflare_then_falls_back(on, monkeypatch):
    c = Candidate(0, 30, "some text", [Word(0, 1, "a")], score=50)
    monkeypatch.setattr(cf.requests, "post", lambda *a, **k: Resp({"success": True, "result": {"response": {
        "clips": [{"id": 0, "score": 90, "title": "Great hook", "hook": "claim", "tone": "direct", "reason": "Strong open."}]}}}))
    llm.rank_with_llm([c])
    assert c.title == "Great hook" and c.score == 78.0  # 0.7*90 + 0.3*50

    c2 = Candidate(0, 30, "x", [], score=50)
    monkeypatch.setattr(cf.requests, "post", lambda *a, **k: Resp({"success": False}, 500))
    monkeypatch.setattr(llm.requests, "post", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("no ollama")))
    llm.rank_with_llm([c2])
    assert c2.score == 50 and c2.title == ""  # heuristic kept


def test_pipeline_transcribe_falls_back_to_local(on, monkeypatch):
    monkeypatch.setattr(cf, "transcribe", lambda *a: (_ for _ in ()).throw(cf.CloudflareError("quota")))
    called = {}

    class FakeModel:
        def transcribe(self, wav, **kw):
            called["local"] = True
            return [], None

    monkeypatch.setattr(pipeline, "_model", lambda: FakeModel())
    assert pipeline.transcribe("x.wav", offset=0, duration=10) == []
    assert called["local"]


def test_disabled_without_secrets(monkeypatch):
    monkeypatch.setattr(cf, "ACCOUNT", "")
    assert not cf.enabled()
