"""Build a portable single-file demo and starter archive, without hosting metadata."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
dist = root / 'dist'
out = root / 'outputs'
out.mkdir(exist_ok=True)
html = (dist / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + (dist / 'style.css').read_text(encoding='utf-8') + '\n</style>')
for name in ['data.js', 'product.js', 'app.js']:
    script = (dist / name).read_text(encoding='utf-8').replace('</script', '<\\/script')
    html = html.replace(f'<script src="{name}"></script>', '<script>\n' + script + '\n</script>')
demo = root / 'demo.html'
demo.write_text(html, encoding='utf-8')
archive = out / '拾问-AI产品经理项目起步包.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(demo, '拾问项目包/拾问-离线演示.html')
    for filename, label in [('README.txt', '先读我.txt'), ('test-cases.json', '20题与标准答案.json'), ('corpus.json', '文档元数据与原文.json'), ('starter-prompt.txt', '起步提示词.txt')]:
        z.write(root / filename, '拾问项目包/' + label)
    for f in sorted((root / 'documents').glob('*.txt')):
        z.write(f, '拾问项目包/资料库/' + f.name)
    for f in sorted(dist.iterdir()):
        if f.is_file(): z.write(f, '拾问项目包/网页源码/' + f.name)
print(f'Generated: {demo.name} and outputs/{archive.name}')
