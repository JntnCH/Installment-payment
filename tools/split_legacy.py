from pathlib import Path
import re

source = Path('/home/ubuntu/upload/index.html').read_text(encoding='utf-8')
head, body = source.split('<body', 1)
body_attrs, body_content = body.split('>', 1)
body_content, _ = body_content.split('</body>', 1)

style_match = re.search(r'<style>(.*?)</style>', head, re.S)
if not style_match:
    raise SystemExit('Original inline style block not found')
style = style_match.group(1).strip() + '\n'
head_without_style = head[:style_match.start()] + head[style_match.end():]

scripts = re.findall(r'<script>(.*?)</script>', body_content, re.S)
if not scripts:
    raise SystemExit('Original body script block not found')
legacy_js = scripts[-1].strip() + '\n'
body_without_script = body_content[:body_content.rfind('<script>')] + body_content[body_content.rfind('</script>') + len('</script>'):]

head_without_style = head_without_style.replace('</head>', '    <link rel="stylesheet" href="/src/legacy.css">\n  </head>')
body_without_script = body_without_script.replace('</body>', '')
body_without_script += '    <script src="/src/legacy.js"></script>\n'

html = head_without_style + '<body' + body_attrs + '>' + body_without_script + '</body>\n</html>\n'

Path('/home/ubuntu/Installment-payment/client/index.html').write_text(html, encoding='utf-8')
Path('/home/ubuntu/Installment-payment/client/src/legacy.css').write_text(style, encoding='utf-8')
Path('/home/ubuntu/Installment-payment/client/src/legacy.js').write_text(legacy_js, encoding='utf-8')
print('generated client/index.html, client/src/legacy.css, client/src/legacy.js')
