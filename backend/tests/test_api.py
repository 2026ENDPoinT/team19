import importlib
import io
import json
import shutil
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


def pdf_bytes():
    # Generate real text PDFs without importing the Windows-blocked MuPDF DLL.
    writer = PdfWriter()
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                             NameObject('/Subtype'): NameObject('/Type1'),
                             NameObject('/BaseFont'): NameObject('/Helvetica')})
    for text in ("Quick sort uses a pivot. Divide the array into two parts.",
                 "The pivot separates values that are smaller and larger."):
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject('/Resources')] = DictionaryObject({
            NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        stream = DecodedStreamObject()
        stream.set_data(f'BT /F1 12 Tf 50 730 Td ({text}) Tj ET'.encode('ascii'))
        page[NameObject('/Contents')] = stream
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TEAM19_DATA_DIR", str(tmp_path / 'server'))
    monkeypatch.setenv("AI_MODE", "sample")
    monkeypatch.setenv("SAMPLE_MP4", "1")
    if "backend.app" in sys.modules:
        module = sys.modules["backend.app"]
        module._executor.shutdown(wait=True)
        module = importlib.reload(module)
    else:
        module = importlib.import_module("backend.app")
    try:
        with TestClient(module.app) as c:
            yield c
    finally:
        module._executor.shutdown(wait=True)


def wait_job(client, job_id, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = client.get(f"/jobs/{job_id}").json()
        if result["status"] in ("completed", "failed"):
            return result
        time.sleep(.04)
    raise AssertionError("Job timed out")


def test_full_flow(client):
    status = client.get('/health')
    assert status.status_code == 200
    uploaded = client.post('/lectures', files={'file': ('sample.pdf', pdf_bytes(), 'application/pdf')})
    assert uploaded.status_code == 202, uploaded.text
    lecture_id = uploaded.json()['lectureId']
    assert wait_job(client, uploaded.json()['jobId'])['status'] == 'completed'
    lecture = client.get(f'/lectures/{lecture_id}').json()
    assert lecture['status'] == 'ready'
    assert lecture['pageCount'] == 2
    image = client.get(lecture['pages'][0]['imageUrl'])
    assert image.status_code == 200 and image.content.startswith(b'\x89PNG')

    started = client.post(f'/lectures/{lecture_id}/outlines', json={'mode': 'review'})
    assert started.status_code == 202
    job_id = started.json()['jobId']
    assert wait_job(client, job_id)['status'] == 'completed'
    outlined = client.get(f'/lectures/{lecture_id}/outlines/review')
    assert outlined.status_code == 200
    clips = outlined.json()['clips']
    assert len(clips) == 2
    for c in clips:
        assert wait_job(client, c['jobId'], timeout=35)['status'] == 'completed'
    clip = client.get(f"/clips/{clips[0]['id']}").json()
    assert clip['status'] == 'completed'
    result = clip['result']
    assert result['blueprint']['scenes'][0]['sourcePages'] == [1]
    assert result['captions'][0]['text'] == result['blueprint']['scenes'][0]['lines'][0]
    assert result['sample'] is True
    assert client.get(result['audioUrl']).status_code == 200
    assert client.get(result['previewVideoUrl']).content[4:8] == b'ftyp'
    duplicated = client.post(f'/lectures/{lecture_id}/outlines', json={'mode': 'review'})
    assert duplicated.status_code == 200 and duplicated.json()['reused'] is True
    assert client.post(f"/jobs/{clips[0]['jobId']}/retry").status_code == 409
    # Completed rows and original PDF remain readable after DB setup runs again.
    module = importlib.import_module('backend.app')
    module.setup()
    assert client.get(f"/clips/{clips[0]['id']}").json() == clip
    with module.conn() as db:
        lecture_row = db.execute('SELECT * FROM lectures WHERE id=?', (lecture_id,)).fetchone()
        assert Path(lecture_row['pdf_path']).read_bytes() == pdf_bytes()
        page = db.execute('SELECT text FROM pages WHERE lecture_id=? AND number=1', (lecture_id,)).fetchone()
        assert 'Quick sort uses a pivot' in page['text']


def test_bad_upload_and_mode(client):
    assert client.post('/lectures', files={'file': ('x.txt', b'a', 'text/plain')}).status_code == 415
    assert client.post('/lectures', files={'file': ('x.pdf', b'not a pdf', 'application/pdf')}).status_code == 422
    assert client.get('/clips/missing').status_code == 404
    assert client.get('/assets/not-real').status_code == 404


def test_pdf_no_text_fails_outline(client):
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    output = io.BytesIO()
    writer.write(output)
    uploaded = client.post('/lectures', files={'file': ('blank.pdf', output.getvalue(), 'application/pdf')}).json()
    assert wait_job(client, uploaded['jobId'])['status'] == 'completed'
    resp = client.post(f"/lectures/{uploaded['lectureId']}/outlines", json={'mode': 'review'}).json()
    j = wait_job(client, resp['jobId'])
    assert j['status'] == 'failed'
    assert j['error']['code'] == 'PDF_NO_TEXT'


def test_stored_sample_contract_and_validator(client, monkeypatch):
    import pipeline.validate as validator
    from backend import stored_sample
    from backend.pipeline import Pipeline
    calls = []
    original = validator.validate_blueprint

    def validate(blueprint, page_count):
        calls.append(page_count)
        return original(blueprint, page_count)

    def paid_or_generated_call(*args, **kwargs):
        pytest.fail('Stored sample must not instantiate the generation pipeline')

    monkeypatch.setattr(validator, 'validate_blueprint', validate)
    monkeypatch.setattr(Pipeline, '__init__', paid_or_generated_call)
    source = json.loads((stored_sample.SAMPLE_DIR / 'result.json').read_text(encoding='utf-8'))
    response = client.get('/clips/parts-test')
    assert response.status_code == 200, response.text
    clip = response.json()
    assert set(clip) == {'id', 'planId', 'status', 'error', 'result'}
    assert clip['id'] == 'parts-test' and clip['status'] == 'completed'
    assert clip['error'] is None
    assert clip['result'] == {**source, 'audioUrl': '/assets/parts-test-audio'}
    assert calls == [57]
    assert 'pipeline.extract' not in sys.modules and 'fitz' not in sys.modules
    # Neither the sample JSON nor its relative file reference was changed on disk.
    assert json.loads((stored_sample.SAMPLE_DIR / 'result.json').read_text(encoding='utf-8')) == source


def test_sample_audio_and_head(client):
    from backend import stored_sample
    data = (stored_sample.SAMPLE_DIR / 'audio.wav').read_bytes()
    response = client.get('/assets/parts-test-audio')
    assert response.status_code == 200
    assert response.content == data
    assert response.headers['content-type'] == 'audio/wav'
    assert response.headers['accept-ranges'] == 'bytes'
    assert response.headers['content-disposition'].startswith('inline;')
    response = client.head('/assets/parts-test-audio')
    assert response.status_code == 200 and not response.content
    assert int(response.headers['content-length']) == len(data)


@pytest.mark.parametrize('range_value', ['bytes=0-43', 'bytes=44-', 'bytes=-64'])
def test_sample_audio_range(client, range_value):
    from backend import stored_sample
    data = (stored_sample.SAMPLE_DIR / 'audio.wav').read_bytes()
    start, end = {'bytes=0-43': (0, 43), 'bytes=44-': (44, len(data) - 1),
                  'bytes=-64': (len(data) - 64, len(data) - 1)}[range_value]
    response = client.get('/assets/parts-test-audio', headers={'Range': range_value})
    assert response.status_code == 206
    assert response.content == data[start:end + 1]
    assert response.headers['content-range'] == f'bytes {start}-{end}/{len(data)}'
    assert int(response.headers['content-length']) == end - start + 1


def test_range_errors_and_if_range(client):
    response = client.get('/assets/parts-test-audio')
    size = len(response.content)
    invalid = client.get('/assets/parts-test-audio', headers={'Range': f'bytes={size}-'})
    assert invalid.status_code == 416
    assert invalid.headers['content-range'] == f'bytes */{size}'
    assert client.get('/assets/parts-test-audio', headers={'Range': 'bytes=bad'}).status_code == 400
    partial = client.get('/assets/parts-test-audio', headers={
        'Range': 'bytes=0-43', 'If-Range': response.headers['etag']})
    assert partial.status_code == 206
    changed = client.get('/assets/parts-test-audio', headers={
        'Range': 'bytes=0-43', 'If-Range': '"outdated"'})
    assert changed.status_code == 200 and changed.content == response.content


def test_media_cors(client):
    headers = {'Origin': 'http://localhost:5173', 'Range': 'bytes=0-43'}
    response = client.get('/assets/parts-test-audio', headers=headers)
    assert response.status_code == 206
    assert response.headers['access-control-allow-origin'] == headers['Origin']
    assert 'Content-Range' in response.headers['access-control-expose-headers']
    preflight = client.options('/assets/parts-test-audio', headers={
        'Origin': headers['Origin'], 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'range'})
    assert preflight.status_code == 200
    assert client.get('/clips/parts-test', headers={'Origin': headers['Origin']}).headers[
        'access-control-allow-origin'] == headers['Origin']


@pytest.fixture()
def editable_sample(tmp_path, monkeypatch):
    from backend import stored_sample
    source = stored_sample.SAMPLE_DIR
    destination = tmp_path / 'sample'
    destination.mkdir()
    for name in ('result.json', 'audio.wav'):
        shutil.copyfile(source / name, destination / name)
    monkeypatch.setattr(stored_sample, 'SAMPLE_DIR', destination)
    return destination


@pytest.mark.parametrize('fault,code', [
    ('blueprint', 'BLUEPRINT_INVALID'), ('captions', 'TTS_FAILED'),
    ('duration', 'SAMPLE_INVALID'), ('audio_path', 'SAMPLE_INVALID')])
def test_invalid_sample_is_not_published(client, editable_sample, fault, code):
    path = editable_sample / 'result.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    if fault == 'blueprint':
        data['blueprint']['scenes'][0]['actions'][0]['target'] = 'nonexistent'
    elif fault == 'captions':
        data['captions'][0]['text'] = 'wrong narration'
    elif fault == 'duration':
        data['durationSec'] += 10
    else:
        data['audioUrl'] = '../../private.wav'
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    response = client.get('/clips/parts-test')
    assert response.status_code == 500
    assert response.json()['error']['code'] == code
    assert str(editable_sample) not in response.text


def test_missing_or_corrupt_sample(client, editable_sample):
    (editable_sample / 'audio.wav').unlink()
    assert client.get('/assets/parts-test-audio').status_code == 404
    response = client.get('/clips/parts-test')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'SAMPLE_UNAVAILABLE'
    (editable_sample / 'result.json').write_text('invalid JSON', encoding='utf-8')
    assert client.get('/clips/parts-test').status_code == 503


def test_not_found_contract(client):
    for route, code in (('/clips/unknown', 'CLIP_NOT_FOUND'),
                        ('/assets/unknown', 'ASSET_NOT_FOUND')):
        response = client.get(route)
        assert response.status_code == 404
        assert response.json()['error']['code'] == code
        assert response.json()['error']['retryable'] is False
