"""Validator fixtures only; these do not qualify an application runtime."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from xml.sax.saxutils import escape
import zipfile

spec = importlib.util.spec_from_file_location('word_runtime_verifier', Path(__file__).with_name('verify-product-wordcraft.py'))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class SerializedOutputChecks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='word-output-verifier-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.label = 'Fixture Documents'
        self.creator = 'Existing creator'
        self.custom = {'Project author': 'Existing <author> & team'}

    def odf(self, extension, *, label=None, creator=None, custom=True, body=True, mime=None):
        label = self.label if label is None else label
        creator = self.creator if creator is None else creator
        metadata = '<meta:generator>'+escape(label)+'</meta:generator><meta:initial-creator>'+escape(creator)+'</meta:initial-creator>'
        if custom:
            metadata += '<meta:user-defined meta:name="Project author">'+escape(self.custom['Project author'])+'</meta:user-defined>'
        prefix = '<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">'
        content = '<office:body><office:text><text:p>'+escape(self.label if body else 'Unrelated text')+'</text:p></office:text></office:body>'
        path = self.root/('fixture.'+extension)
        if extension == 'fodt':
            path.write_text(prefix+'<office:meta>'+metadata+'</office:meta>'+content+'</office:document>', encoding='utf-8')
        else:
            with zipfile.ZipFile(path,'w') as package:
                package.writestr('mimetype', mime or 'application/vnd.oasis.opendocument.text'+('-template' if extension == 'ott' else ''))
                package.writestr('meta.xml',prefix+'<office:meta>'+metadata+'</office:meta></office:document>')
                package.writestr('content.xml',prefix+content+'</office:document>')
        return path

    def check(self, path):
        verify.additional_format_metadata(path,self.label,self.creator,self.custom)

    def test_intermediate_undo_requires_real_body_text_and_bold_state(self):
        path = self.root/'state.docx'
        for marker, expected in [('',False),('<w:b/>',True),('<w:b w:val="0"/>',False)]:
            with zipfile.ZipFile(path,'w') as package:
                package.writestr('word/document.xml',
                    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                    '<w:body><w:p><w:r><w:rPr>'+marker+'</w:rPr><w:t>'+escape(self.label)+
                    '</w:t></w:r></w:p></w:body></w:document>')
            verify.document_body(path,self.label,bold=expected)
            with self.assertRaises(AssertionError):
                verify.document_body(path,self.label,bold=not expected)
            with self.assertRaises(AssertionError):
                verify.document_body(path,'Absent document text',bold=expected)

    def test_empty_bold_runs_do_not_qualify_plain_text_and_mixed_text_does_not_qualify_whole_selection(self):
        path = self.root/'mixed.docx'
        for content, expected in [
            ('<w:r><w:rPr><w:b/></w:rPr></w:r><w:r><w:t>'+escape(self.label)+'</w:t></w:r>',False),
            ('<w:r/><w:r><w:rPr><w:b/></w:rPr><w:t>'+escape(self.label)+'</w:t></w:r>',True)]:
            with zipfile.ZipFile(path,'w') as package:
                package.writestr('word/document.xml',
                    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                    '<w:body><w:p>'+content+'</w:p></w:body></w:document>')
            verify.document_body(path,self.label,bold=expected)
            with self.assertRaises(AssertionError):
                verify.document_body(path,self.label,bold=not expected)
        with zipfile.ZipFile(path,'w') as package:
            package.writestr('word/document.xml',
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>'+escape(self.label[:3])+'</w:t>'
                '</w:r><w:r><w:t>'+escape(self.label[3:])+'</w:t></w:r></w:p></w:body></w:document>')
        for expected in [False,True]:
            with self.assertRaises(AssertionError):
                verify.document_body(path,self.label,bold=expected)

    def test_odf_preserves_generator_creator_custom_text_and_real_container_type(self):
        for extension in ['odt','ott','fodt']:
            with self.subTest(extension=extension):
                self.check(self.odf(extension))
                for mutation in [{'label':'Wrong generator'},{'creator':'Changed creator'},{'custom':False},{'body':False}]:
                    with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                        self.check(self.odf(extension,**mutation))
                if extension != 'fodt':
                    with self.assertRaises(AssertionError):
                        self.check(self.odf(extension,mime='application/zip'))

    def test_metadata_only_and_malformed_containers_cannot_qualify_document_text(self):
        for extension in ['odt','ott','fodt']:
            path=self.odf(extension,body=False)
            with self.subTest(extension=extension), self.assertRaises(AssertionError):
                self.check(path)
            path.write_bytes(b'not an ODF document')
            with self.assertRaises((zipfile.BadZipFile,verify.ET.ParseError)):
                self.check(path)

    def test_rtf_and_latex_require_actual_generator_and_serialized_tex_author(self):
        rtf=self.root/'fixture.rtf'
        rtf.write_text('{\\rtf1{\\*\\generator '+self.label+';}Actual text}',encoding='utf-8')
        self.check(rtf)
        rtf.write_text('{\\rtf1{\\*\\generator Another app;}Actual text}',encoding='utf-8')
        with self.assertRaises(AssertionError):
            self.check(rtf)
        tex=self.root/'fixture.tex'
        tex.write_text('% Written by '+self.label+'.\n\\hypersetup{pdfauthor={'+self.creator+'}}\nActual text',encoding='utf-8')
        self.check(tex)
        for text in ['% Written by Another app.\n\\hypersetup{pdfauthor={'+self.creator+'}}',
                     '% Written by '+self.label+'.\n\\hypersetup{pdfauthor={Changed creator}}']:
            tex.write_text(text,encoding='utf-8')
            with self.assertRaises(AssertionError):
                self.check(tex)


if __name__ == '__main__':
    unittest.main()
