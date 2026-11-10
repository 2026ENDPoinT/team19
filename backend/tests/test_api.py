import importlib
from dataclasses import replace
import io
import json
import os
import shutil
import subprocess
import sys
import textwrap
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


@pytest.fixture(params=['parts-test', 'clip-01', 'clip-01-b'])
def sample(request):
    from backend import stored_sample
    return stored_sample.SAMPLES[request.param]


def test_stored_sample_contract_and_validator(client, monkeypatch, sample, tmp_path):
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
    path = sample.directory / 'result.json'
    source = json.loads(path.read_text(encoding='utf-8'))
    response = client.get(f'/clips/{sample.clip_id}')
    assert response.status_code == 200, response.text
    clip = response.json()
    assert set(clip) == {'id', 'planId', 'status', 'error', 'result'}
    assert clip['id'] == sample.clip_id and clip['status'] == 'completed'
    assert clip['planId'] == f'plan_{sample.clip_id}'
    assert clip['error'] is None
    assert clip['result'] == {**source, 'audioUrl': f'/assets/{sample.audio_id}'}
    assert calls == [57]
    # BE/Codex: collection of test_extract.py legitimately imports the extractor
    # in pytest's interpreter. Measure this request's imports in a fresh process.
    script = textwrap.dedent('''
        import sys
        from unittest.mock import patch

        forbidden = {'pipeline.extract', 'pymupdf', 'fitz',
                     'pipeline.audio', 'pipeline.blueprint', 'openai', 'anthropic'}
        def guard_import(event, args):
            if event == 'import' and args[0].split('.')[0] in {'pymupdf', 'fitz', 'openai', 'anthropic'}:
                raise AssertionError('Unexpected import: ' + args[0])
            if event == 'import' and args[0] in forbidden:
                raise AssertionError('Unexpected import: ' + args[0])
        sys.addaudithook(guard_import)
        assert forbidden.isdisjoint(sys.modules)

        from fastapi.testclient import TestClient
        from backend.pipeline import Pipeline
        from backend.app import app, _executor

        try:
            with patch.object(Pipeline, '__init__',
                              side_effect=AssertionError('Stored sample must not generate')):
                with TestClient(app) as isolated_client:
                    response = isolated_client.get('/clips/' + sys.argv[1])
                    assert response.status_code == 200, response.text
                    assert response.json()['status'] == 'completed'
        finally:
            _executor.shutdown(wait=True)
        assert forbidden.isdisjoint(sys.modules), sorted(forbidden.intersection(sys.modules))
        print('Stored sample import boundary passed')
    ''')
    environment = os.environ.copy()
    environment.update(AI_MODE='sample', SAMPLE_MP4='0',
                       TEAM19_DATA_DIR=str(tmp_path / 'isolated-server'))
    isolated = subprocess.run([sys.executable, '-c', script, sample.clip_id],
                              cwd=Path(__file__).resolve().parents[2], env=environment,
                              capture_output=True, text=True, timeout=60)
    assert isolated.returncode == 0, isolated.stdout + isolated.stderr
    assert 'Stored sample import boundary passed' in isolated.stdout
    # Neither the sample JSON nor its relative file reference was changed on disk.
    assert json.loads(path.read_text(encoding='utf-8')) == source
    assert str(sample.directory) not in response.text
    module = importlib.import_module('backend.app')
    with module.conn() as db:
        assert db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] == 0
        assert db.execute('SELECT COUNT(*) FROM lectures').fetchone()[0] == 0
    if sample.clip_id != 'parts-test':
        assert source['blueprint'] == json.loads((sample.directory / 'blueprint.json').read_text(encoding='utf-8'))


def test_sample_audio_and_head(client, sample):
    data = (sample.directory / sample.audio_name).read_bytes()
    response = client.get(f'/assets/{sample.audio_id}')
    assert response.status_code == 200
    assert response.content == data
    assert response.headers['content-type'] == sample.media_type
    assert response.headers['accept-ranges'] == 'bytes'
    assert response.headers['content-disposition'].startswith('inline;')
    assert str(sample.directory) not in str(response.headers)
    response = client.head(f'/assets/{sample.audio_id}')
    assert response.status_code == 200 and not response.content
    assert int(response.headers['content-length']) == len(data)


@pytest.mark.parametrize('range_value', ['bytes=0-43', 'bytes=44-', 'bytes=-64'])
def test_sample_audio_range(client, range_value, sample):
    data = (sample.directory / sample.audio_name).read_bytes()
    start, end = {'bytes=0-43': (0, 43), 'bytes=44-': (44, len(data) - 1),
                  'bytes=-64': (len(data) - 64, len(data) - 1)}[range_value]
    response = client.get(f'/assets/{sample.audio_id}', headers={'Range': range_value})
    assert response.status_code == 206
    assert response.content == data[start:end + 1]
    assert response.headers['content-range'] == f'bytes {start}-{end}/{len(data)}'
    assert int(response.headers['content-length']) == end - start + 1


def test_range_errors_and_if_range(client, sample):
    url = f'/assets/{sample.audio_id}'
    response = client.get(url)
    size = len(response.content)
    invalid = client.get(url, headers={'Range': f'bytes={size}-'})
    assert invalid.status_code == 416
    assert invalid.headers['content-range'] == f'bytes */{size}'
    assert client.get(url, headers={'Range': 'bytes=bad'}).status_code == 400
    partial = client.get(url, headers={
        'Range': 'bytes=0-43', 'If-Range': response.headers['etag']})
    assert partial.status_code == 206
    changed = client.get(url, headers={
        'Range': 'bytes=0-43', 'If-Range': '"outdated"'})
    assert changed.status_code == 200 and changed.content == response.content


def test_media_cors(client, sample):
    url = f'/assets/{sample.audio_id}'
    headers = {'Origin': 'http://localhost:5173', 'Range': 'bytes=0-43'}
    response = client.get(url, headers=headers)
    assert response.status_code == 206
    assert response.headers['access-control-allow-origin'] == headers['Origin']
    assert 'Content-Range' in response.headers['access-control-expose-headers']
    preflight = client.options(url, headers={
        'Origin': headers['Origin'], 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'range'})
    assert preflight.status_code == 200
    assert client.get(f'/clips/{sample.clip_id}', headers={'Origin': headers['Origin']}).headers[
        'access-control-allow-origin'] == headers['Origin']


@pytest.fixture()
def editable_sample(tmp_path, monkeypatch, sample):
    from backend import stored_sample
    destination = tmp_path / 'sample'
    destination.mkdir()
    for name in ('result.json', sample.audio_name):
        shutil.copyfile(sample.directory / name, destination / name)
    monkeypatch.setitem(stored_sample.SAMPLES, sample.clip_id, replace(sample, directory=destination))
    return destination


@pytest.mark.parametrize('fault,code', [
    ('blueprint', 'BLUEPRINT_INVALID'), ('captions', 'TTS_FAILED'),
    ('duration', 'SAMPLE_INVALID'), ('audio_path', 'SAMPLE_INVALID'),
    ('scene_id', 'TTS_FAILED'), ('line_index', 'TTS_FAILED'),
    ('order', 'TTS_FAILED'), ('overlap', 'TTS_FAILED'),
    ('past_end', 'TTS_FAILED'), ('extra_path', 'SAMPLE_INVALID')])
def test_invalid_sample_is_not_published(client, editable_sample, sample, fault, code):
    path = editable_sample / 'result.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    if fault == 'blueprint':
        data['blueprint']['scenes'][0]['actions'][0]['target'] = 'nonexistent'
    elif fault == 'captions':
        data['captions'][0]['text'] = 'wrong narration'
    elif fault == 'duration':
        data['durationSec'] += 10
    elif fault == 'audio_path':
        data['audioUrl'] = '../../private.wav'
    elif fault == 'scene_id':
        data['captions'][0]['sceneId'] = 'missing'
    elif fault == 'line_index':
        data['captions'][0]['lineIndex'] = 999
    elif fault == 'order':
        data['captions'][0], data['captions'][1] = data['captions'][1], data['captions'][0]
    elif fault == 'overlap':
        data['captions'][1]['startSec'] = data['captions'][0]['endSec'] - 0.1
    elif fault == 'past_end':
        data['captions'][-1]['endSec'] = data['durationSec'] + 1
    else:
        data['audioPath'] = str(editable_sample / sample.audio_name)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    response = client.get(f'/clips/{sample.clip_id}')
    assert response.status_code == 500
    assert response.json()['error']['code'] == code
    assert str(editable_sample) not in response.text
    assert client.get('/health').status_code == 200


def test_missing_or_corrupt_sample(client, editable_sample, sample):
    (editable_sample / sample.audio_name).unlink()
    assert client.get(f'/assets/{sample.audio_id}').status_code == 404
    response = client.get(f'/clips/{sample.clip_id}')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'SAMPLE_UNAVAILABLE'
    (editable_sample / 'result.json').write_text('invalid JSON', encoding='utf-8')
    assert client.get(f'/clips/{sample.clip_id}').status_code == 503
    (editable_sample / 'result.json').unlink()
    assert client.get(f'/clips/{sample.clip_id}').status_code == 503
    assert client.get('/health').status_code == 200


@pytest.mark.parametrize('fault', ['garbage', 'truncated'])
def test_corrupt_audio_is_not_published(client, editable_sample, sample, fault):
    path = editable_sample / sample.audio_name
    path.write_bytes(b'not audio' if fault == 'garbage' else path.read_bytes()[:1000])
    response = client.get(f'/clips/{sample.clip_id}')
    assert response.status_code == 500
    assert response.json()['error']['code'] == 'SAMPLE_INVALID'
    assert str(editable_sample) not in response.text
    audio = client.get(f'/assets/{sample.audio_id}')
    assert audio.status_code == 500
    assert audio.json()['error']['code'] == 'SAMPLE_INVALID'
    assert str(editable_sample) not in audio.text
    other = 'parts-test' if sample.clip_id == 'clip-01' else 'clip-01'
    assert client.get(f'/clips/{other}').status_code == 200
    assert client.get('/health').status_code == 200


@pytest.mark.parametrize('fault', ['decoder_missing', 'decoder_timeout'])
def test_mp3_decoder_failure_is_contained(client, monkeypatch, fault):
    from backend import stored_sample

    def failed_decoder(*args, **kwargs):
        if fault == 'decoder_missing':
            raise RuntimeError('Decoder unavailable at C:/private/ffmpeg.exe')
        raise subprocess.TimeoutExpired('C:/private/ffmpeg.exe', 15)

    monkeypatch.setattr(stored_sample, 'get_ffmpeg_exe', failed_decoder)
    response = client.get('/clips/clip-01')
    assert response.status_code == 500
    assert response.json()['error']['code'] == 'SAMPLE_INVALID'
    assert 'private' not in response.text
    assert client.get('/clips/parts-test').status_code == 200
    assert client.get('/health').status_code == 200


def test_sample_result_id_and_duration_come_from_file(client, editable_sample, sample):
    path = editable_sample / 'result.json'
    source = json.loads(path.read_text(encoding='utf-8'))
    source['resultId'] = 'new-result-revision'
    source['durationSec'] += 0.02  # Within encoding/rounding tolerance.
    path.write_text(json.dumps(source, ensure_ascii=False), encoding='utf-8')
    response = client.get(f'/clips/{sample.clip_id}')
    assert response.status_code == 200, response.text
    assert response.json()['id'] == sample.clip_id
    assert response.json()['result'] == {**source, 'audioUrl': f'/assets/{sample.audio_id}'}


@pytest.mark.parametrize('result_id', ['', '   ', None, 123, []])
def test_invalid_result_id(client, editable_sample, sample, result_id):
    path = editable_sample / 'result.json'
    source = json.loads(path.read_text(encoding='utf-8'))
    source['resultId'] = result_id
    path.write_text(json.dumps(source, ensure_ascii=False), encoding='utf-8')
    response = client.get(f'/clips/{sample.clip_id}')
    assert response.status_code == 500
    assert response.json()['error']['code'] == 'SAMPLE_INVALID'


def test_audio_from_other_sample_is_rejected(client, editable_sample, sample):
    from backend import stored_sample
    other_id = 'clip-01-b' if sample.clip_id == 'clip-01' else 'clip-01'
    other = stored_sample.SAMPLES[other_id]
    shutil.copyfile(other.directory / other.audio_name, editable_sample / sample.audio_name)
    response = client.get(f'/clips/{sample.clip_id}')
    assert response.status_code == 500
    assert response.json()['error']['code'] == 'SAMPLE_INVALID'
    assert client.get(f'/clips/{other_id}').status_code == 200


@pytest.mark.parametrize('route', [
    '/clips/clip-01-b-extra', '/assets/clip-01-b-audio-extra',
    '/clips/alt-terra', '/assets/audio.mp3',
    '/clips/clip-01%5C..%5Calt-terra', '/assets/..%5C..%5Cprivate.mp3',
])
def test_unregistered_sample_paths_are_not_public(client, route):
    response = client.get(route)
    assert response.status_code == 404
    assert response.json()['error']['code'] in ('CLIP_NOT_FOUND', 'ASSET_NOT_FOUND')


def test_not_found_contract(client):
    for route, code in (('/clips/unknown', 'CLIP_NOT_FOUND'),
                        ('/assets/unknown', 'ASSET_NOT_FOUND')):
        response = client.get(route)
        assert response.status_code == 404
        assert response.json()['error']['code'] == code
        assert response.json()['error']['retryable'] is False
