import pytest

from backend.app.youtube import extract_video_id, is_bilibili_url, is_youtube_url


def test_extract_video_id_from_watch_url():
    assert extract_video_id("https://www.youtube.com/watch?v=abcdefghijk&t=12s") == "abcdefghijk"


def test_extract_video_id_from_shorts_url():
    assert extract_video_id("https://youtube.com/shorts/abcdefghijk?feature=share") == "abcdefghijk"


def test_rejects_playlist_only_url():
    assert not is_youtube_url("https://www.youtube.com/playlist?list=123")


def test_extract_video_id_from_bilibili_url():
    assert extract_video_id("https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=test") == "BV1xx411c7mD"


def test_is_bilibili_url():
    assert is_bilibili_url("https://www.bilibili.com/video/BV1xx411c7mD")
    assert not is_bilibili_url("https://www.youtube.com/watch?v=abcdefghijk")


def test_extract_video_id_rejects_unknown():
    with pytest.raises(ValueError):
        extract_video_id("https://example.com/video/123")

