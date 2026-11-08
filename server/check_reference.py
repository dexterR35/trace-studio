"""Check an exported reference ZIP against its image masks and preset dimensions."""
import io
import json
import sys
import zipfile
from pathlib import Path
from PIL import Image

def check(path):
 with zipfile.ZipFile(path) as bundle:
  assert bundle.testzip() is None
  names=set(bundle.namelist())
  for name in ['reference.json','project.pick.json','annotated-reference.png','reconstruction-prompt.txt','README.txt']:
   assert name in names,name
  data=json.loads(bundle.read('reference.json'));source_size=(data['image']['width'],data['image']['height'])
  parts=0;presets=0
  for subject in data['subjects']:
   mask=Image.open(io.BytesIO(bundle.read(subject['mask']['file']))).convert('L')
   assert mask.size==source_size
   box=mask.point(lambda value:255 if value>127 else 0).getbbox();bounds=subject['bounds_px']
   assert (box[0],box[1],box[2]-box[0],box[3]-box[1])==(bounds['x'],bounds['y'],bounds['width'],bounds['height'])
   folder=subject['mask']['file'].rsplit('/',1)[0]
   assert folder+'/cutout.png' in names and folder+'/outline.svg' in names
   for part in subject['parts']:
    assert part['mask_file'] in names
    assert part['outline_px']
    assert Image.open(io.BytesIO(bundle.read(part['mask_file']))).size==source_size
    parts+=1
   for size in data.get('export',{}).get('preset_sizes_px',[]):
    assert Image.open(io.BytesIO(bundle.read(f'{folder}/{size}px.png'))).size==(size,size)
    presets+=1
  project=json.loads(bundle.read('project.pick.json'))
  assert project['format']=='trace-pick-project' and project['maskEncoding']=='value-length-rle'
  return dict(archive=str(Path(path).resolve()),files=len(names),subjects=len(data['subjects']),parts=parts,presets=presets,source_size=source_size,mask_bounds_match=True,portable_project=True)

if __name__=='__main__':print(json.dumps(check(sys.argv[1]),indent=2))
