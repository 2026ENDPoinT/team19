"""Temporary DB only; no real AI or user data."""
import os
import sys
from pathlib import Path
from test_api import client, pdf_bytes, wait_job


def test_indexes_preserve_data_and_are_used(client):
    m = sys.modules['backend.app']
    with m.conn() as db:
        db.execute("INSERT INTO assets(id,path,mime) VALUES('keep','kept-path','image/png')")
    m.setup()
    m.setup()
    with m.conn() as db:
        assert db.execute("SELECT path FROM assets WHERE id='keep'").fetchone()[0] == 'kept-path'
        for sql, index in [("SELECT id FROM assets WHERE path=?",'idx_assets_path'), ("SELECT id FROM jobs WHERE target_id=?",'idx_jobs_target_id'), ("SELECT id FROM clips WHERE outline_id=?",'idx_clips_outline_id')]:
            plan = ' '.join(str(tuple(r)) for r in db.execute('EXPLAIN QUERY PLAN '+sql, ('x',)))
            assert index in plan


def test_asset_prefix_is_literal_and_excludes_siblings(client):
    m = sys.modules['backend.app']
    folder = m.ROOT / 'lectures' / 'a_%[test]'
    paths = [folder/'pages'/'1.png', folder/'other.png', folder.with_name(folder.name+'-sibling')/'1.png', m.ROOT/'lectures'/'a_Xtest'/'1.png']
    with m.conn() as db:
        for i, path in enumerate(paths):
            db.execute('INSERT INTO assets(id,path,mime) VALUES(?,?,?)',(str(i),str(path.resolve()),'image/png'))
        assert {r['id'] for r in m.assets_under(db, folder)} == {'0','1'}
        prefix=str(folder.resolve())+os.sep
        plan=' '.join(str(tuple(r)) for r in db.execute('EXPLAIN QUERY PLAN SELECT id,path FROM assets WHERE path>=? AND path<?',(prefix,prefix+chr(0x10ffff))))
        assert 'idx_assets_path' in plan


def test_reprepare_replaces_page_assets_and_keeps_other_assets(client):
    m = sys.modules['backend.app']
    ticket=client.post('/lectures',files={'file':('test.pdf',pdf_bytes(),'application/pdf')}).json()
    assert wait_job(client,ticket['jobId'])['status']=='completed'
    lid=ticket['lectureId']
    with m.conn() as db:
        page=dict(db.execute('SELECT * FROM pages WHERE lecture_id=? ORDER BY number',(lid,)).fetchone())
        job=dict(db.execute('SELECT * FROM jobs WHERE id=?',(ticket['jobId'],)).fetchone())
        db.execute("INSERT INTO assets(id,path,mime) VALUES('other',?,'audio/mpeg')",(str(m.ROOT/'clips'/'other'/'audio.mp3'),))
    class Pipe:
        def extract_pdf(self,*args):
            return {'pageCount':1,'pages':[{'number':1,'text':'again','imagePath':page['image_path']}]}
        def describe_pages(self,pages):
            return {'pages':[], 'usage':[]}
    for _ in range(2):
        with m.conn() as db:
            job['id'] = m.job_create(db, 'prepare', lid, ticket['jobId'])
        m.do_prepare(job,Pipe())
        with m.conn() as db:
            assert len(m.assets_under(db,m.ROOT/'lectures'/lid/'pages'))==1
            assert db.execute('SELECT COUNT(*) FROM pages WHERE lecture_id=?',(lid,)).fetchone()[0]==1
            assert db.execute("SELECT id FROM assets WHERE id='other'").fetchone()
