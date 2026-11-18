"""Real file and UI regression gates for the complete native/browser document runtime."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import xml.etree.ElementTree as ET
import zipfile


def document_metadata(path, label, author='User', creator=None, custom=None):
    """Read serialized properties independently of the editor's success response."""
    with zipfile.ZipFile(path) as package:
        app = ET.fromstring(package.read('docProps/app.xml'))
        core = ET.fromstring(package.read('docProps/core.xml'))
        assert app.findtext('{*}Application') == label
        assert core.findtext('{*}lastModifiedBy') == author
        assert core.findtext('{*}creator') == creator
        if custom:
            properties = ET.fromstring(package.read('docProps/custom.xml'))
            found = {entry.attrib['name']: ''.join(entry.itertext()) for entry in properties}
            assert all(found.get(name) == value for name, value in custom.items()), found


def pdf_metadata(reader, label, creator=None):
    assert reader.metadata.get('/Creator') == label
    assert reader.metadata.get('/Producer') == label
    assert reader.metadata.get('/Author') == creator


def odf_metadata(xml, label, creator, custom):
    root = ET.fromstring(xml)
    meta = 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0'
    assert root.findtext('.//{'+meta+'}generator') == label
    assert root.findtext('.//{'+meta+'}initial-creator') == creator
    properties = {entry.attrib['{'+meta+'}name']: ''.join(entry.itertext()) for entry in root.findall('.//{'+meta+'}user-defined')}
    assert all(properties.get(name) == value for name, value in custom.items()), properties


def additional_format_metadata(path, label, creator, custom):
    """Check actual serialized output, including ODF text independently of metadata."""
    extension = path.suffix.lower()
    if extension == '.rtf':
        assert ('{\\*\\generator '+label+';}').encode() in path.read_bytes()
    elif extension == '.tex':
        text = path.read_text(encoding='utf-8')
        assert text.startswith('% Written by '+label+'.\n')
        assert 'pdfauthor={'+creator+'}' in text
    else:
        if extension == '.fodt':
            content = path.read_bytes()
            odf_metadata(content, label, creator, custom)
        else:
            assert extension in {'.odt', '.ott'}
            with zipfile.ZipFile(path) as package:
                assert package.testzip() is None
                mime = 'application/vnd.oasis.opendocument.text'+('-template' if extension == '.ott' else '')
                assert package.read('mimetype').decode() == mime
                odf_metadata(package.read('meta.xml'), label, creator, custom)
                content = package.read('content.xml')
        body = ET.fromstring(content).find('.//{urn:oasis:names:tc:opendocument:xmlns:office:1.0}body')
        assert body is not None and label in ''.join(body.itertext()), 'ODF document text must survive export'


def native(args):
    from PIL import Image, ImageStat
    from pypdf import PdfReader
    root = Path(__file__).resolve().parent
    package = args.package.absolute()
    manifest = json.loads((package/'build-manifest.json').read_text())
    product = manifest['product']
    output = args.output.absolute()
    output.mkdir(parents=True, exist_ok=True)
    profile = output/'profile'
    profile.mkdir(exist_ok=True)
    label = args.label
    env = {key: value for key, value in os.environ.items() if key.upper() in
           {'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'LOCALAPPDATA'}}
    env.update(WORDCRAFT_PROFILE_DIR=str(profile), APPDATA=str(profile), USERPROFILE=str(profile), WORDCRAFT_REGION='en-US')
    pins = profile/'versions.json'
    pins.write_text(json.dumps({'apps': {'wordcraft': {'Pinned': manifest['version']}}})+'\n')
    env['CRAFT_VERSIONS_FILE'] = str(pins)
    cli = package/'wordcraft-cli.exe'

    def command(*args):
        result = subprocess.run([str(cli), *map(str, args)], env=env, capture_output=True, timeout=120)
        if result.returncode:
            raise AssertionError(result.stderr.decode(errors='replace')[-1800:])
        return result.stdout

    def package_intact():
        expected = set(manifest['files']) | {'build-manifest.json'}
        actual = {path.relative_to(package).as_posix() for path in package.rglob('*') if path.is_file()}
        assert actual == expected
        for name, data in manifest['files'].items():
            content = (package/name).read_bytes()
            assert len(content) == data['bytes'] and sha256(content).hexdigest() == data['sha256'], name

    package_intact()
    commands = json.loads(command('commands', '--json'))
    baseline = json.loads((root/'product-build-recipes/wordcraft-commands.json').read_text())
    baseline_ids = set(baseline)
    actual_ids = {item['id'] for item in commands}
    assert actual_ids.issuperset(baseline_ids), sorted(baseline_ids-actual_ids)
    text = label + '\nCreated and edited with the genuine native document engine.'
    docx = output/'native-created.docx'
    script = {'commands': [{'command': 'file.new'}, {'command': 'text.insert', 'params': {'text': text}},
                          'select.all', 'format.bold', 'edit.undo', 'edit.redo'], 'save': [str(docx)]}
    (output/'create.json').write_text(json.dumps(script)+'\n')
    command('run', '--script', output/'create.json')
    assert label in command('text', docx).decode()
    namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with zipfile.ZipFile(docx) as container:
        assert container.testzip() is None
        xml = ET.fromstring(container.read('word/document.xml'))
        assert label in ''.join(xml.itertext())
        assert xml.findall('.//w:rPr/w:b', namespace), 'Bold formatting must survive DOCX export'
    document_metadata(docx, label)
    pdf = output/'native-created.pdf'
    png = output/'native-created.png'
    command('convert', docx, pdf, '--strict')
    command('render', docx, png, '--strict')
    reader = PdfReader(pdf)
    assert label in '\n'.join(page.extract_text() or '' for page in reader.pages)
    pdf_metadata(reader, label)
    # Use genuine application commands to set an explicit author and document
    # properties, then reopen and save through the actual engine.
    authored = output/'native-explicit-author.docx'
    custom = {'Project author': 'Existing <author> & team'}
    authored_script = {'commands': [{'command':'file.open','params':{'path':str(docx)}},
        {'command':'file.options','params':{'author':'Ana Lee','initials':'AL'}},
        {'command':'file.properties','params':{'author':'Existing creator','custom':custom}}], 'save':[str(authored)]}
    (output/'author.json').write_text(json.dumps(authored_script)+'\n')
    command('run','--script',output/'author.json')
    document_metadata(authored, label, 'Ana Lee', 'Existing creator', custom)
    authored_pdf = output/'native-explicit-author.pdf'
    command('convert',authored,authored_pdf,'--strict')
    pdf_metadata(PdfReader(authored_pdf), label, 'Existing creator')
    # Exercise the real additional writers. RTF/TeX have their original format
    # limits; ODF retains its supported author and custom-property metadata.
    for extension in ['rtf', 'tex', 'odt', 'ott', 'fodt']:
        exported = output/('native-explicit-author.'+extension)
        command('convert', authored, exported)
        assert label in command('text', exported).decode(), extension
        additional_format_metadata(exported, label, 'Existing creator', custom)
    with Image.open(png) as image:
        image.load()
        assert image.width > 100 and image.height > 100
        assert max(ImageStat.Stat(image.convert('RGB')).stddev) > 2

    with socket.socket() as reserve:
        reserve.bind(('127.0.0.1', 0))
        port = reserve.getsockname()[1]
    native_log = (output/'native.log').open('wb')
    app = subprocess.Popen([str(package/'wordcraft.exe'), '--control', str(port), str(docx)],
                           env=env, stdout=native_log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
    key_file = profile/f'control-key.local-{port}'
    try:
        deadline = time.monotonic()+90
        while not key_file.is_file():
            assert app.poll() is None, 'Native GUI exited before its control channel started'
            assert time.monotonic()<deadline, 'Native GUI control startup timed out'
            time.sleep(.1)
        key = key_file.read_text().strip()
        assert len(key) == 64
        counter = 0
        def rpc(method, params=None):
            nonlocal counter
            counter += 1
            with socket.create_connection(('127.0.0.1', port), timeout=30) as connection:
                connection.sendall((json.dumps({'id': counter, 'key': key, 'method': method, 'params': params or {}})+'\n').encode())
                reply = json.loads(connection.makefile('rb').readline())
            assert reply.get('ok'), (method, reply.get('error'))
            return reply.get('result')
        inspect = rpc('document.inspect')
        assert label in json.dumps(inspect, ensure_ascii=False)
        deadline = time.monotonic()+30
        while not rpc('ui.inspect').get('pages'):
            assert time.monotonic()<deadline, 'Native document did not render'
            time.sleep(.1)
        rpc('ui.focus')
        deadline = time.monotonic()+20
        while not rpc('ui.inspect').get('focused'):
            assert time.monotonic()<deadline, 'Native canvas did not obtain keyboard focus'
            time.sleep(.1)
        rpc('engine.execute', {'command': 'caret.docEnd', 'params': {}})
        (output/'ui-before-type.json').write_text(json.dumps(rpc('ui.inspect'), indent=2)+'\n')
        rpc('ui.key', {'key':'Enter'})
        deadline = time.monotonic()+20
        while not rpc('ui.inspect').get('dirty'):
            assert time.monotonic()<deadline, 'Native Enter key did not edit document'
            time.sleep(.1)
        rpc('ui.text', {'text': 'Edited in the actual native window.'})
        deadline = time.monotonic()+20
        while 'Edited in the actual native window.' not in json.dumps(rpc('document.inspect'), ensure_ascii=False):
            if time.monotonic()>=deadline:
                (output/'ui-type-failure.json').write_text(json.dumps(rpc('ui.inspect'), indent=2)+'\n')
                rpc('ui.screenshot', {'path':str(output/'ui-type-failure.png')})
                raise AssertionError('Native typed text did not appear')
            time.sleep(.1)
        edited = output/'native-gui-edited.docx'
        rpc('engine.execute', {'command': 'file.saveAs', 'params': {'path': str(edited)}})
        deadline = time.monotonic()+20
        while not edited.is_file():
            assert time.monotonic()<deadline
            time.sleep(.1)
        assert 'Edited in the actual native window.' in command('text', edited).decode()
        rpc('engine.execute', {'command': 'file.closeDocument', 'params': {'force': True}})
        rpc('engine.execute', {'command': 'file.open', 'params': {'path': str(edited)}})
        assert 'Edited in the actual native window.' in json.dumps(rpc('document.inspect'), ensure_ascii=False)
        rpc('ui.resize', {'width': 1100, 'height': 800})
        screenshot = output/'native-window.png'
        rpc('ui.screenshot', {'path': str(screenshot)})
        with Image.open(screenshot) as image:
            image.load()
            assert image.width > 500 and image.height > 300
        powershell = str(Path(os.environ['SYSTEMROOT'])/'System32/WindowsPowerShell/v1.0/powershell.exe')
        properties_env = dict(env, WORD_VARIANT_PID=str(app.pid), WORD_VARIANT_EXE=str(package/'wordcraft.exe'))
        properties = json.loads(subprocess.check_output([powershell, '-NoProfile', '-NonInteractive', '-Command',
            '@{title=(Get-Process -Id $env:WORD_VARIANT_PID).MainWindowTitle;product=(Get-Item -LiteralPath $env:WORD_VARIANT_EXE).VersionInfo.ProductName} | ConvertTo-Json'], env=properties_env))
        assert label in properties['title'] and properties['product'] == label, properties
        (output/'ui-inspect.json').write_text(json.dumps(rpc('ui.inspect'), indent=2)+'\n')
        rpc('app.quit')
        app.wait(timeout=30)
    finally:
        if app.poll() is None:
            app.terminate()
            app.wait(timeout=30)
        native_log.close()
        if key_file.exists() and app.poll() is not None:
            key_file.unlink()
    package_intact()
    files = {}
    for path in [docx, pdf, png, output/'native-gui-edited.docx', output/'native-window.png']:
        data = path.read_bytes()
        files[path.name] = {'bytes': len(data), 'sha256': sha256(data).hexdigest()}
    result = {'ok': True, 'product': product, 'source': manifest['source'], 'preservedBaselineCommands': len(baseline_ids),
              'candidateCommands': len(actual_ids), 'cliDocxBoldUndoRedoReopen': True, 'independentPdfTextAndPngDecode': True,
              'actualGuiEditSaveReopen': True, 'actualGuiTitle': properties['title'], 'peProductName': properties['product'],
              'productGeneratorMetadata': True, 'neutralNewSessionAuthor': True, 'explicitAuthorAndCustomPropertiesPreserved': True,
              'genuineAdditionalFormatExportReopen': ['rtf', 'tex', 'odt', 'ott', 'fodt'], 'independentOdfMetadata':True,
              'texCompilation':'Not covered by this gate',
              'packageBytesUnchanged': True, 'files': files}
    (output/'result.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))


def web(args):
    from functools import partial
    import http.server
    import threading
    from PIL import Image, ImageStat
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
    from zipfile import ZipFile
    root = Path(__file__).resolve().parent
    package = args.package.absolute()
    output = args.output.absolute()
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((package/'build-manifest.json').read_text())
    product = manifest['product']
    label = args.label
    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm':'application/wasm', '.js':'text/javascript'}
        def log_message(self, *arguments):
            pass
        def end_headers(self):
            self.send_header('Cross-Origin-Opener-Policy','same-origin')
            self.send_header('Cross-Origin-Embedder-Policy','require-corp')
            super().end_headers()
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(package)))
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}/'
    origin = url.rstrip('/')
    try:
        baseline=set(json.loads((root/'product-build-recipes/wordcraft-commands.json').read_text()))
        # This is an interoperability test fixture, not an editor. The unchanged full Word WASM
        # application implements every edit and serialization. The fixture is the storage client
        # of the original same-origin craft-web-host contract used by the actual intranet adapter.
        host='''<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe id="editor" src="./?host=parent&control&webgl"></iframe><script>
        const editor=document.getElementById('editor'); window.saved=[];window.ready=null;window.failed=null;
        addEventListener('message',event=>{if(event.source!==editor.contentWindow||event.origin!==location.origin)return;
         const m=event.data;if(m?.type==='wordcraft:ready')window.ready=m;
         if(m?.type==='wordcraft:failed')window.failed=m;
         if(m?.type==='wordcraft:save')window.saved.push(m);});
        window.bytesOf=m=>m.bytes instanceof Uint8Array?m.bytes:m.bytes instanceof ArrayBuffer?new Uint8Array(m.bytes):Array.isArray(m.bytes)?Uint8Array.from(m.bytes):(()=>{throw Error('Unsupported genuine save byte transport')})();
        window.downloadSaved=index=>{const m=saved[index],blob=new Blob([bytesOf(m)]),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=m.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
        </script></body></html>'''
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=str(args.chromium),
               args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            try:
                context=browser.new_context(accept_downloads=True,viewport={'width':1200,'height':850})
                context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
                context.route(origin+'/qa-host.html',lambda route:route.fulfill(status=200,content_type='text/html',body=host))
                page=context.new_page()
                errors,failures=[],[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('response',lambda response:failures.append({'status':response.status,'url':response.url}) if response.status>=400 else None)
                def open_editor():
                    page.goto(url+'qa-host.html',timeout=120000)
                    page.wait_for_function('window.ready!==null||window.failed!==null',timeout=120000)
                    assert page.evaluate('window.failed') is None
                    frame=page.locator('#editor').element_handle().content_frame()
                    frame.wait_for_function('window.wordcraft?.execute && !document.getElementById("wordcraft_loading")',timeout=120000)
                    return frame
                editor=open_editor()
                commands=editor.evaluate('async () => await wordcraft.commands()')
                actual={item['id'] for item in commands}
                assert actual.issuperset(baseline),sorted(baseline-actual)
                editor.evaluate(r'''async label=>{await wordcraft.execute('file.new');
                  await wordcraft.execute('text.insert',{text:label+'\nBrowser document round-trip.',paragraphs:true});
                  await wordcraft.execute('select.all');await wordcraft.execute('format.bold');
                  await wordcraft.execute('edit.undo');await wordcraft.execute('edit.redo');}''',label)
                def save(command,name):
                    before=page.evaluate('saved.length')
                    editor.evaluate('async ({command,name})=>await wordcraft.execute(command,{path:name})',{'command':command,'name':name})
                    page.wait_for_function('({before,name})=>saved.length>before && saved[before].name===name',arg={'before':before,'name':name},timeout=60000)
                    source=bytes(page.evaluate('index=>Array.from(bytesOf(saved[index]))',before))
                    with page.expect_download(timeout=30000) as download:
                        page.evaluate('index=>downloadSaved(index)',before)
                    destination=output/name
                    download.value.save_as(destination)
                    assert destination.read_bytes()==source,'Downloaded host document must match genuine editor bytes'
                    return destination
                docx=save('file.saveAs','browser-created.docx')
                with ZipFile(docx) as package:
                    assert package.testzip() is None
                    document=ET.fromstring(package.read('word/document.xml'))
                    assert label in ''.join(document.itertext()) and document.find('.//{*}rPr/{*}b') is not None
                document_metadata(docx, label)
                pdf=save('file.exportPdf','browser-created.pdf')
                png=save('file.exportPng','browser-created.png')
                reader = PdfReader(pdf)
                assert label in '\n'.join(p.extract_text() or '' for p in reader.pages)
                pdf_metadata(reader, label)
                with Image.open(png) as image:
                    image.load()
                    assert image.width>100 and max(ImageStat.Stat(image.convert('RGB')).stddev)>2
                editor=open_editor()
                editor.evaluate('async()=>await wordcraft.execute("file.new")')
                assert not editor.evaluate('async label=>{const r=await wordcraft.docInspect();return (r.result??r).blocks.some(b=>b.type==="paragraph"&&b.text?.includes(label))}',label)
                page.evaluate('bytes=>editor.contentWindow.postMessage({type:"wordcraft:open",name:"browser-created.docx",bytes:new Uint8Array(bytes)},location.origin)',list(docx.read_bytes()))
                editor.wait_for_function('async label=>{try{const r=await wordcraft.docInspect();return (r.result??r).blocks.some(b=>b.type==="paragraph"&&b.text?.includes(label))}catch{return false}}',arg=label,timeout=30000)
                editor.evaluate('''async()=>{
                  await wordcraft.execute('file.options',{author:'Ana Lee',initials:'AL'});
                  await wordcraft.execute('file.properties',{author:'Existing creator',custom:{'Project author':'Existing <author> & team'}});
                }''')
                authored=save('file.saveAs','browser-explicit-author.docx')
                document_metadata(authored,label,'Ana Lee','Existing creator',{'Project author':'Existing <author> & team'})
                authored_pdf=save('file.exportPdf','browser-explicit-author.pdf')
                pdf_metadata(PdfReader(authored_pdf),label,'Existing creator')
                additional=[]
                for extension in ['rtf','tex','odt','ott','fodt']:
                    exported=save('file.saveAs','browser-explicit-author.'+extension)
                    additional_format_metadata(exported,label,'Existing creator',{'Project author':'Existing <author> & team'})
                    additional.append(exported)
                reopened=[]
                for exported in additional:
                    editor=open_editor()
                    editor.evaluate('async()=>await wordcraft.execute("file.new")')
                    assert not editor.evaluate('async label=>{const r=await wordcraft.docInspect();return (r.result??r).blocks.some(b=>b.type==="paragraph"&&b.text?.includes(label))}',label)
                    page.evaluate('({bytes,name})=>editor.contentWindow.postMessage({type:"wordcraft:open",name,bytes:new Uint8Array(bytes)},location.origin)',
                                  {'bytes':list(exported.read_bytes()),'name':exported.name})
                    editor.wait_for_function('async label=>{try{const r=await wordcraft.docInspect();return (r.result??r).blocks.some(b=>b.type==="paragraph"&&b.text?.includes(label))}catch{return false}}',arg=label,timeout=30000)
                    if exported.suffix in {'.odt','.ott','.fodt'}:
                        editor.evaluate('async()=>await wordcraft.execute("file.options",{author:"Ana Lee",initials:"AL"})')
                        imported=save('file.saveAs','browser-reopened-'+exported.suffix[1:]+'.docx')
                        document_metadata(imported,label,'Ana Lee','Existing creator',{'Project author':'Existing <author> & team'})
                        reopened.append(imported)
                title=editor.evaluate('document.title')
                assert label in title,title
                page.screenshot(path=str(output/'browser-window.png'))
                assert not errors and not failures,{'pageErrors':errors,'httpFailures':failures}
                package=args.package.absolute()
                manifest=json.loads((package/'build-manifest.json').read_text())
                assert {p.relative_to(package).as_posix() for p in package.rglob('*') if p.is_file()}==set(manifest['files'])|{'build-manifest.json'}
                for name,meta in manifest['files'].items():
                    payload=(package/name).read_bytes()
                    assert len(payload)==meta['bytes'] and sha256(payload).hexdigest()==meta['sha256'],name
                files={p.name:{'bytes':p.stat().st_size,'sha256':sha256(p.read_bytes()).hexdigest()} for p in [docx,pdf,png,authored,authored_pdf,*additional,*reopened,output/'browser-window.png']}
                result={'ok':True,'product':product,'source':manifest['source'],'applicationMode':'Original same-origin craft-web-host contract; full genuine WASM editor',
                  'preservedBaselineCommands':len(baseline),'candidateCommands':len(actual),'actualCreateEditUndoRedoExportDownloadReloadReopen':True,
                  'downloadedBytesExactlyMatchGenuineHostSaveBytes':True,'independentDocxXmlPdfTextPngDecode':True,'actualTitle':title,
                  'productGeneratorMetadata':True,'neutralNewSessionAuthor':True,'explicitAuthorAndCustomPropertiesPreserved':True,
                  'genuineAdditionalFormatExportReopen':['rtf','tex','odt','ott','fodt'],'independentOdfMetadataAndText':True,
                  'odfReopenAndResavePreservesCreatorCustomMetadata':True,
                  'latexAuthorImport':'Original reader does not reconstruct pdfauthor; serialized author and actual body reopen checked',
                  'packageUnchanged':True,'pageErrors':errors,'httpFailures':failures,'standaloneNativeBrowserSavePicker':'Outside this host-mode regression gate',
                  'files':files}
                (output/'result.json').write_text(json.dumps(result,indent=2)+'\n')
                print(json.dumps(result))
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind',choices=['native','web'],required=True)
    parser.add_argument('--package',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--label',required=True)
    parser.add_argument('--chromium',type=Path)
    args=parser.parse_args()
    if args.kind=='web' and not args.chromium:
        parser.error('The full browser gate requires an existing Chromium executable')
    (native if args.kind=='native' else web)(args)


if __name__=='__main__':
    main()
