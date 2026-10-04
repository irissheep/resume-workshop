import json, os, shutil, subprocess
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import pdfplumber
project = Path(__file__).resolve().parent.parent
pdf_dir = project / 'docs/qa/pdf'
out = project / 'docs/qa/rendered'
out.mkdir(parents=True, exist_ok=True)
poppler = shutil.which('pdftoppm')
if poppler is None:
    raise SystemExit('Install Poppler and add pdftoppm to PATH before running PDF verification.')
report = []
for pdf in sorted(pdf_dir.glob('*.pdf')):
    target = out / pdf.stem
    target.mkdir(exist_ok=True)
    subprocess.run([str(poppler), '-png', '-r', '96', str(pdf), str(target/'page')], check=True, capture_output=True)
    pictures = sorted(target.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
    bad = []
    with pdfplumber.open(pdf) as document:
        for i, page in enumerate(document.pages):
            for char in page.chars:
                if not char['text'].strip():
                    continue
                if char['x0'] < 33 or char['x1'] > page.width-33 or char['top'] < 30 or char['bottom'] > page.height-32:
                    bad.append({'page':i+1,'char':char['text'],'bbox':[round(char[k],1) for k in ('x0','top','x1','bottom')]})
    for begin in range(0,len(pictures),6):
        batch = pictures[begin:begin+6]
        sheet = Image.new('RGB',(960,480*((len(batch)+2)//3)), '#e6eae5')
        draw = ImageDraw.Draw(sheet)
        for offset, picture in enumerate(batch):
            with Image.open(picture) as image:
                thumb = ImageOps.contain(image,(304,432))
                x = (offset%3)*320 + (320-thumb.width)//2
                y = (offset//3)*480+27
                sheet.paste(thumb,(x,y))
                draw.text((x,y-20), pdf.stem+' / '+str(begin+offset+1),fill='#334c3c')
        sheet.save(out/(pdf.stem+'-contact-'+str(begin//6+1)+'.png'))
    report.append({'file':pdf.name,'pages':len(pictures),'outOfBoundsCharacters':bad})
(out/'visual-coordinates.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps([{'file':x['file'],'pages':x['pages'],'outOfBounds':len(x['outOfBoundsCharacters'])} for x in report],ensure_ascii=False))
