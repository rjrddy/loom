"""Actual independent browser contexts, local relay, offline and concurrent draft proof."""
import argparse
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/results/browser'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--record', action='store_true')
    parser.add_argument('--probe-draft', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    receipts, errors = [], []
    with tempfile.TemporaryDirectory(prefix='loom-browser-') as temp, (OUT/'server.log').open('w') as log:
        child = subprocess.Popen(['node','dist-node/src/server.js'], cwd=ROOT,
            env={**os.environ,'PORT':'18111','LOOM_DB':str(Path(temp)/'loom.sqlite')},stdout=log,stderr=log)
        try:
            for _ in range(150):
                if child.poll() is not None:
                    raise RuntimeError((OUT/'server.log').read_text())
                try:
                    urllib.request.urlopen('http://127.0.0.1:18111/health',timeout=1).close()
                    break
                except OSError:
                    time.sleep(.1)
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=p.chromium.executable_path)
                contexts=[browser.new_context(viewport={'width':1600,'height':1100},**({'record_video_dir':str(OUT/'recording'),'record_video_size':{'width':1600,'height':1100}} if args.record and i==0 else {})) for i in range(2)]
                a,b=[context.new_page() for context in contexts]
                for page in [a,b]:
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.goto('http://127.0.0.1:18111')
                    expect(page.get_by_role('status')).to_contain_text('All changes acknowledged',timeout=20000)
                started=time.monotonic()
                initial=a.get_by_label('Shared document').input_value()
                a.get_by_label('Shared document').focus()
                b.get_by_label('Shared document').fill(initial+' REMOTE')
                b.get_by_role('heading',name='Good ideas need').click()
                expect(b.get_by_test_id('pending-count')).to_have_text('0')
                # A has not seen B's incoming words while focused. Its next keystroke must not delete them.
                a.wait_for_timeout(500)
                a.get_by_label('Shared document').fill(initial+' LOCAL')
                a.get_by_role('heading',name='Good ideas need').click()
                expect(a.get_by_test_id('pending-count')).to_have_text('0')
                a.wait_for_timeout(500)
                final=a.get_by_label('Shared document').input_value()
                assert 'REMOTE' in final and 'LOCAL' in final, final
                expect(b.get_by_label('Shared document')).to_have_value(final)
                receipts.append({'kind':'focused-draft-retains-unseen-remote-insertion'})
                if args.probe_draft:
                    print(json.dumps({'draft_probe':'pass','page_errors':errors}))
                    return
                a.screenshot(path=str(OUT/'desktop.png'),full_page=True)
                a.get_by_role('button',name='Go offline',exact=True).click()
                expect(a.get_by_role('status')).to_contain_text('offline')
                offline_base=a.get_by_label('Shared document').input_value()
                a.get_by_label('Shared document').fill(offline_base+' OFFLINE-A')
                a.get_by_role('heading',name='Good ideas need').click()
                assert int(a.get_by_test_id('pending-count').inner_text())>0
                b.get_by_label('Shared document').fill(final+' ONLINE-B')
                b.get_by_role('heading',name='Good ideas need').click()
                expect(b.get_by_test_id('pending-count')).to_have_text('0')
                # Block only WebSockets: the page can reload over HTTP while its transport is offline.
                blocked = {'value': True}
                def socket_route(ws):
                    remote = ws.connect_to_server()
                    ws.on_message(lambda message: remote.send(message) if not blocked['value'] else None)
                a.route_web_socket('**/sync', socket_route)
                print('stage: offline page reload', flush=True)
                a.reload(wait_until='domcontentloaded')
                expect(a.get_by_label('Shared document')).to_have_value(offline_base+' OFFLINE-A')
                assert int(a.get_by_test_id('pending-count').inner_text()) > 0
                receipts.append({'kind':'pending-offline-edits-survive-actual-page-reload'})
                blocked['value'] = False
                print('stage: restore WebSocket frames', flush=True)
                expect(a.get_by_test_id('pending-count')).to_have_text('0',timeout=15000)
                a.wait_for_timeout(500)
                merged=a.get_by_label('Shared document').input_value()
                assert 'OFFLINE-A' in merged and 'ONLINE-B' in merged,merged
                expect(b.get_by_label('Shared document')).to_have_value(merged)
                receipts.append({'kind':'actual-offline-edits-and-reconnect-converge'})
                print('stage: offline merge passed', flush=True)
                a.get_by_label('Selected thought').fill('A shared synthetic card')
                expect(a.get_by_test_id('pending-count')).to_have_text('0')
                expect(b.get_by_label('Selected thought')).to_have_value('A shared synthetic card')
                a.get_by_role('button',name='Set card color rose').click()
                expect(b.locator('[data-card="note-a"]')).to_have_class('note rose selected')
                receipts.append({'kind':'actual-LWW-card-update-propagates'})
                for width in [390,768,1024,1600]:
                    a.set_viewport_size({'width':width,'height':1000})
                    a.wait_for_timeout(100)
                    assert a.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
                    if width==390:a.screenshot(path=str(OUT/'mobile.png'),full_page=True)
                    receipts.append({'kind':'responsive','width':width,'no_overflow':True})
                a.get_by_role('button',name='The proof',exact=False).click()
                expect(a.get_by_role('heading',name='Shared state.')).to_be_visible()
                a.screenshot(path=str(OUT/'proof.png'),full_page=True)
                a.get_by_role('button',name='The table',exact=False).click()
                a.get_by_role('button',name='Workspace access').click()
                a.get_by_label('Bearer token').fill('local-view')
                a.get_by_role('button',name='Connect with token').click()
                expect(a.get_by_label('Shared document')).to_be_disabled()
                expect(a.get_by_role('button',name='Add a thought')).to_be_disabled()
                receipts.append({'kind':'actual-read-only-viewer'})
                a.get_by_role('button',name='Workspace access').click()
                a.get_by_label('Bearer token').fill('wrong-synthetic-token')
                a.get_by_role('button',name='Connect with token').click()
                expect(a.get_by_role('alert')).to_contain_text('hello_rejected')
                a.get_by_role('button',name='Workspace access').click()
                a.get_by_label('Bearer token').fill('local-edit')
                a.get_by_role('button',name='Connect with token').click()
                expect(a.get_by_role('status')).to_contain_text('All changes acknowledged')
                receipts.append({'kind':'bad-token-rejected-and-recovered'})
                step=0
                while args.record and time.monotonic()-started<92:
                    a.get_by_role('button',name='Go offline',exact=True).click()
                    text=a.get_by_label('Shared document').input_value()
                    a.get_by_label('Shared document').fill(text+f' / draft {step}')
                    a.get_by_role('heading',name='Good ideas need').click()
                    a.wait_for_timeout(900)
                    a.get_by_role('button',name='Reconnect',exact=True).click()
                    expect(a.get_by_test_id('pending-count')).to_have_text('0',timeout=15000)
                    expect(b.get_by_label('Shared document')).to_have_value(a.get_by_label('Shared document').input_value())
                    a.get_by_role('button',name='Set card color '+['rose','sky','mint','lemon'][step%4]).click()
                    a.wait_for_timeout(900)
                    receipts.append({'kind':'recorded-offline-merge','step':step})
                    step+=1
                a.get_by_role('button',name='Go offline',exact=True).focus()
                expect(a.get_by_role('button',name='Go offline',exact=True)).to_be_focused()
                assert not errors,errors
                elapsed=time.monotonic()-started
                video=a.video
                for context in contexts:context.close()
                if video:
                    video.save_as(str(OUT/'loom-demo.webm'));video.delete()
                browser.close()
                (OUT/'review.json').write_text(json.dumps({'elapsed_seconds':elapsed,'receipts':receipts,'page_errors':errors},indent=2)+'\n')
                print(json.dumps({'elapsed_seconds':elapsed,'receipts':len(receipts),'page_errors':errors}))
        finally:
            child.terminate();child.wait(timeout=15)


if __name__=='__main__':
    main()
