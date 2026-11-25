"""Where the extraction scripts read and write.

MTLF_SRC: the course folder. MTLF_WORK: a scratch folder for text, converted PDFs and rendered pictures.
The JSON that build_course.py reads goes into course/data. Run order: extract.py, figures.py, stel.py, selftests.py.
Then build_course.py --figs $MTLF_WORK/fig copies the pictures into the site.
"""
import json
import os
import pathlib

SRC = os.environ.get('MTLF_SRC', '/mnt/user-data/uploads/MTLF-GENR-ACC - Metal Fabricator Fnd - ACCESS - 52360 - 11242026 - 1051 AM')
WORK = os.environ.get('MTLF_WORK', '/tmp/mtlf')
DATA = pathlib.Path(__file__).resolve().parent.parent / 'data'
# The fields of each picture that the course pages use
FIG_FIELDS = ('doc', 'page', 'file', 'w', 'h', 'title', 'below', 'above')


def publish(name, obj):
    """Writes course/data/<name>.json in the compact form the repo keeps."""
    (DATA / (name + '.json')).write_text(json.dumps(obj, separators=(',', ':')))
